# Sprint v9.0-S1.5 — Open Positions Snapshot Refactor

**Goal:** Eliminate all on-demand recomputation of open positions and market quotes from the widget/API request path. Replace with a persistent, timestamped `PositionSnapshot` that widgets read from. Computation only runs on explicit user action or import commit.

**Duration estimate:** 4–5 focused solo-dev days  
**Risk:** Medium — touches Prisma schema, reconciliation API, NLV hook, and openPositionsStore. No queue infra required (Next.js API route job, Prisma + PostgreSQL).  
**Prerequisite:** v9.0-S1 regression mitigations from the performance report should be in place before this sprint ships to production (AbortController fix, parallel option quotes in reconciliation route). S1.5 supersedes both of those in the reconciliation path permanently.

---

## Context

v9.0-S1 introduced two patterns that made the app unusable:

1. `GET /api/overview/reconciliation` recomputes open positions from the full execution corpus on every request, then serially awaits one HTTP call per option leg for quotes. Observed: 17–20s responses.
2. `useNetLiquidationValue` fires per-account fetches on every mount with no AbortController.

This sprint implements the correct long-term fix: compute once, store a snapshot, read cheaply.

---

## Architecture after this sprint

```
Trigger (import commit | refresh button | page open)
    └─► POST /api/positions/snapshot/compute
            ├─ computeOpenPositions(executions, matchedLots, adjustments)
            ├─ getEquityQuotes(symbols)          ← batched, one call
            ├─ getOptionQuotes(legs)             ← batched via Schwab MCP
            └─ prisma.positionSnapshot.create(...)

Widgets (ReconciliationWidget, AccountBalancesWidget, OpenPositionsPanel)
    └─► GET /api/positions/snapshot?accountIds=...
            └─ prisma.positionSnapshot.findFirst(...)  ← single row read, <50ms
```

Widgets never call `computeOpenPositions()`. They never call quote APIs. They read the snapshot and display `snapshotAt` as "as of HH:MM" so the user knows data freshness.

---

## Ticket list

### KM-130 — Prisma schema: add PositionSnapshot table

**Files:** `prisma/schema.prisma`, `prisma/migrations/`  
**Effort:** 0.5 days

Add the following model:

```prisma
model PositionSnapshot {
  id          String   @id @default(cuid())
  accountIds  String   // JSON array of internal account IDs in scope
  snapshotAt  DateTime @default(now())
  status      PositionSnapshotStatus @default(PENDING)
  errorMessage String?

  // Computed fields (stored as JSON)
  positionsJson      String  // OpenPosition[] with netQty, costBasis, mark, instrumentKey
  unrealizedPnl      Decimal?
  realizedPnl        Decimal?
  cashAdjustments    Decimal?
  manualAdjustments  Decimal?
  currentNlv         Decimal?
  startingCapital    Decimal?
  totalGain          Decimal?
  unexplainedDelta   Decimal?

  createdAt   DateTime @default(now())

  @@index([snapshotAt(sort: Desc)])
}

enum PositionSnapshotStatus {
  PENDING
  COMPLETE
  FAILED
}
```

**Notes:**
- `accountIds` stored as JSON string — no FK to Account, snapshot is a point-in-time record and accounts may change.
- `positionsJson` stores the full `OpenPosition[]` array including the fetched mark price per position. This is the data `openPositionsStore` currently computes and holds in memory.
- No TTL column needed — widgets always read the latest `COMPLETE` row for the given account scope. Old snapshots can be pruned by a maintenance query.
- Run `prisma migrate dev --name add-position-snapshot` after editing schema.

**Acceptance:** `prisma db push` succeeds; `prisma studio` shows the new table.

---

### KM-131 — Batched options quote helper

**Files:** `src/lib/mcp/market-data.ts`  
**Effort:** 0.5 days  
**Depends on:** nothing (standalone)

The current `getOptionQuote()` is called serially in a `for...of` loop inside `computeUnrealizedPnl()`. Replace with a batch variant that uses the Schwab MCP server's options chain endpoint to fetch multiple legs in one call.

```typescript
// New function signature to add
export async function getOptionQuotesBatch(
  legs: Array<{
    underlyingSymbol: string;
    strike: number;
    expirationDate: string; // YYYY-MM-DD
    optionType: string;     // "CALL" | "PUT"
  }>
): Promise<Map<string, number | null>>  // key: instrumentKey, value: mark price
```

**Implementation notes:**
- If the Schwab MCP endpoint supports multi-symbol option chain queries, use it. Collect all unique underlying symbols, fetch chains per underlying, then resolve individual legs from the response.
- If you need to fall back to individual calls, at minimum wrap them in `Promise.all()` instead of serial `await` — this alone reduces option quote latency from `sum(N)` to `max(N)`.
- Return `null` for any leg where the quote is unavailable. The snapshot job should record those positions with `mark: null` and flag the snapshot as partially priced rather than failing completely.
- Keep `getOptionQuote()` for backward compatibility during the transition.

**Acceptance:** Unit test with 3 option legs confirms one underlying chain fetch (or parallel, not serial) and correct mark resolution.

---

### KM-132 — Snapshot compute job: POST /api/positions/snapshot/compute

**Files:** `src/app/api/positions/snapshot/compute/route.ts` (new)  
**Effort:** 1 day  
**Depends on:** KM-130, KM-131

This is the only place in the codebase that calls `computeOpenPositions()` and the quote APIs after this sprint. Everything else reads from the DB.

```typescript
// POST /api/positions/snapshot/compute
// Body: { accountIds?: string[] }  — empty = all accounts
export async function POST(request: Request): Promise<Response>
```

**Job steps (in order):**

1. Parse `accountIds` from request body. If empty, use all accounts.
2. Create a `PositionSnapshot` row with `status: PENDING`. Return its `id` immediately in the response so the caller can poll for completion — do not block.
3. Kick off the computation asynchronously (do not `await` before returning):
   - Load executions, matched lots, adjustments scoped to `accountIds` (same queries as the old reconciliation route).
   - Call `computeOpenPositions(executions, matchedLots, adjustments)`.
   - Separate positions by `assetClass`. Call `getEquityQuotes(symbols)` once. Call `getOptionQuotesBatch(legs)` once.
   - Compute `unrealizedPnl` from marked positions.
   - Load `startingCapital`, `currentNlv` from `DailyAccountSnapshot` (existing logic).
   - Compute all reconciliation fields.
   - `prisma.positionSnapshot.update({ where: { id }, data: { status: COMPLETE, positionsJson: JSON.stringify(positions), unrealizedPnl, ... } })`.
4. If any step throws, catch and write `status: FAILED, errorMessage: error.message`.

**Response shape:**
```json
{ "data": { "snapshotId": "clxxx...", "status": "PENDING" } }
```

**Notes:**
- Step 3 runs as a floating Promise. Next.js will not cancel it when the response is sent. This is acceptable for a solo-dev app on a single server process. If you later move to serverless, you will need a queue (pg-boss is a good fit with Postgres already in place).
- Add a `NEXT_PUBLIC_DEBUG_PERF=1` log at each sub-step with timing and row counts.
- Do not add auth to this route in S1.5 — it's an internal API. Add rate limiting in a follow-on sprint if this becomes user-accessible.

**Acceptance:** `curl -X POST /api/positions/snapshot/compute` returns `snapshotId` in under 200ms. Polling the read endpoint (KM-133) eventually returns `COMPLETE` with populated fields.

---

### KM-133 — Snapshot read endpoint: GET /api/positions/snapshot

**Files:** `src/app/api/positions/snapshot/route.ts` (new)  
**Effort:** 0.5 days  
**Depends on:** KM-130

```typescript
// GET /api/positions/snapshot?accountIds=id1,id2&snapshotId=optional
export async function GET(request: Request): Promise<Response>
```

**Behavior:**
- If `snapshotId` provided: return that specific snapshot (for polling after compute trigger).
- Otherwise: find the latest `COMPLETE` snapshot whose `accountIds` JSON matches the requested scope. Exact match on sorted account ID array.
- If no snapshot exists: return `{ data: null, meta: { snapshotExists: false } }`. Widgets use this to show "No snapshot — click Refresh."
- If latest snapshot is `PENDING`: return it with status so widgets can show a loading indicator without triggering another compute.

**Response shape:**
```typescript
{
  data: {
    id: string;
    snapshotAt: string;         // ISO timestamp
    status: "PENDING" | "COMPLETE" | "FAILED";
    errorMessage?: string;
    positions: OpenPosition[];  // parsed from positionsJson
    unrealizedPnl: string;
    realizedPnl: string;
    cashAdjustments: string;
    manualAdjustments: string;
    currentNlv: string;
    startingCapital: string;
    totalGain: string;
    unexplainedDelta: string;
  } | null;
  meta: { snapshotExists: boolean; snapshotAge?: number; }  // age in seconds
}
```

**Acceptance:** Returns correct latest snapshot for a given account scope. Returns null when no snapshot exists.

---

### KM-134 — Refactor ReconciliationWidget to read snapshot

**Files:** `src/components/widgets/ReconciliationWidget.tsx`, `src/app/api/overview/reconciliation/route.ts`  
**Effort:** 0.5 days  
**Depends on:** KM-133

**Changes to `ReconciliationWidget.tsx`:**
- Replace `fetch('/api/overview/reconciliation?...')` with `fetch('/api/positions/snapshot?...')`.
- Add AbortController (fixes the S1 regression as a side effect).
- If `data === null`: show "No snapshot available" + a "Compute now" button that calls `POST /api/positions/snapshot/compute` then polls.
- Show `snapshotAt` as "as of HH:MM" below the widget title. If `meta.snapshotAge > 3600`, show an amber stale indicator.
- Show a spinner if `status === "PENDING"` (polling every 2s via `setInterval`, cleared on unmount).

**Changes to `route.ts` (reconciliation):**
- Keep the route but gut the computation. Return a redirect or a deprecation note pointing to `/api/positions/snapshot`. Alternatively, make it a thin wrapper that calls the snapshot read endpoint internally. Do not delete it — other consumers may depend on it.
- The serial option quote loop and full corpus load are fully removed from this path.

**Acceptance:** ReconciliationWidget renders in under 200ms when a snapshot exists. Shows stale indicator correctly. Does not fire any quote API calls.

---

### KM-135 — Refactor useNetLiquidationValue to read snapshot

**Files:** `src/hooks/useNetLiquidationValue.ts`, `src/components/widgets/AccountBalancesWidget.tsx`  
**Effort:** 1 day  
**Depends on:** KM-133

This is the most structurally significant change in the sprint.

**Current behavior:**
- One hook instance per account. Each fires two fetches: `overview/summary` and `accounts/starting-capital`. Then reads from `openPositionsStore` for marks.
- `AccountBalancesWidget` remounts all rows on refresh by changing the `key` prop.

**Target behavior:**
- `AccountBalancesWidget` fetches the snapshot once for all selected accounts (single `GET /api/positions/snapshot?accountIds=...`).
- Passes per-account data down as props to `AccountBalanceRow`.
- `useNetLiquidationValue` is refactored to accept pre-fetched snapshot data as a prop, or is eliminated entirely and replaced with derived values in the parent.
- `openPositionsStore.hydrate()` is updated to hydrate from the snapshot's `positionsJson` rather than from the raw executions API. This preserves the existing `useSyncExternalStore` subscription pattern in case other parts of the app use it.

**Key changes:**
```typescript
// AccountBalancesWidget.tsx — fetch once, not per row
const { data: snapshot } = usePositionSnapshot(selectedAccounts);

// AccountBalanceRow — receives derived values, no fetches
function AccountBalanceRow({ accountId, snapshotData }: { 
  accountId: string; 
  snapshotData: AccountSnapshotSlice | null;
}) { ... }
```

**Refresh button behavior:**
- Calls `POST /api/positions/snapshot/compute` for the selected accounts.
- Shows a "Computing..." state while `status === PENDING`.
- Polls `GET /api/positions/snapshot?snapshotId=...` every 2s until `COMPLETE`.
- Re-renders rows from new snapshot data.
- Does NOT remount rows via key change. Rows update from new props.

**Acceptance:** With 3 accounts selected, exactly 1 snapshot fetch fires on mount (not 6). Refresh button correctly triggers compute and updates all rows when complete.

---

### KM-136 — Auto-trigger snapshot on import commit

**Files:** `src/app/api/imports/[id]/commit/route.ts`  
**Effort:** 0.25 days  
**Depends on:** KM-132

After a successful commit, fire-and-forget a snapshot compute for the affected account:

```typescript
// At the end of the commit handler, after successful response:
void fetch('/api/positions/snapshot/compute', {
  method: 'POST',
  body: JSON.stringify({ accountIds: [import.accountId] }),
  headers: { 'Content-Type': 'application/json' },
}).catch(() => {}); // silent — snapshot is best-effort on commit
```

This means that by the time the user navigates to the dashboard after an import, the snapshot is likely already computed or in progress.

**Acceptance:** Committing an import triggers a new snapshot for the affected account. Dashboard shows fresh data without requiring a manual refresh.

---

### KM-137 — Snapshot staleness UX and shared hook

**Files:** `src/hooks/usePositionSnapshot.ts` (new), update all consuming widgets  
**Effort:** 0.25 days  
**Depends on:** KM-134, KM-135

Extract common snapshot fetch + poll logic into a reusable hook so `ReconciliationWidget` and `AccountBalancesWidget` don't duplicate it.

```typescript
export function usePositionSnapshot(accountIds: string[]): {
  snapshot: PositionSnapshotResponse | null;
  loading: boolean;
  stale: boolean;         // true if snapshotAge > STALE_THRESHOLD_SECONDS
  computing: boolean;     // true if status === PENDING
  error: string | null;
  triggerCompute: () => void;
}
```

**Staleness threshold:** 3600 seconds (1 hour) as a constant. Make it a named export so it's easy to find and adjust.

**Acceptance:** Both widgets use `usePositionSnapshot`. No duplicated fetch/poll logic. Stale state shows correctly in both.

---

## Ticket summary

| Ticket | Description | Effort | Depends on |
|--------|-------------|--------|------------|
| KM-130 | Prisma schema — PositionSnapshot table | 0.5d | — |
| KM-131 | Batched options quote helper | 0.5d | — |
| KM-132 | POST /api/positions/snapshot/compute | 1.0d | KM-130, KM-131 |
| KM-133 | GET /api/positions/snapshot | 0.5d | KM-130 |
| KM-134 | ReconciliationWidget — read snapshot | 0.5d | KM-133 |
| KM-135 | useNetLiquidationValue — read snapshot | 1.0d | KM-133 |
| KM-136 | Auto-trigger on import commit | 0.25d | KM-132 |
| KM-137 | Shared usePositionSnapshot hook + stale UX | 0.25d | KM-134, KM-135 |
| **Total** | | **4.5 days** | |

---

## What this sprint does NOT change

These are explicitly out of scope for S1.5 to keep the blast radius contained:

- `fetchAllPages` eager loading in table panels (executions, matched lots, setups, imports) — this remains broken. Fix in S1.6 with server-side pagination.
- `useDataTableState` client-side filter/sort over full row sets — follow-on.
- `GET /api/accounts` write side-effect from `ensureAccountDefaults` — low priority, separate ticket.
- Authentication or rate limiting on the new snapshot endpoints.
- Scheduled/automatic snapshot refresh (e.g., every N minutes) — deliberate. Keep snapshot creation user-controlled for now.

---

## Testing checklist before merge

- [ ] `prisma migrate dev` runs cleanly on a fresh DB
- [ ] `POST /api/positions/snapshot/compute` with no body returns snapshotId < 200ms
- [ ] Snapshot eventually reaches `COMPLETE` status with correct field values
- [ ] `GET /api/positions/snapshot` returns null when no snapshot exists
- [ ] ReconciliationWidget renders reconciliation data without calling quote APIs (confirm via network tab — no calls to `getOptionQuote` or `getEquityQuotes` on widget mount)
- [ ] AccountBalancesWidget fires exactly 1 snapshot fetch for 3 selected accounts (not 6)
- [ ] Refresh button triggers compute and updates all rows when complete
- [ ] Import commit triggers a new snapshot for the affected account
- [ ] Stale indicator appears when snapshot is older than 1 hour
- [ ] AbortController: changing account filter mid-compute does not leave orphaned compute jobs stacking up (snapshot rows with PENDING status will exist but are harmless)

---

## Follow-on sprint S1.6 (not in this sprint)

- Server-side pagination for executions, matched lots, setups, imports tables — eliminates `fetchAllPages`
- `ensureAccountDefaults` moved out of GET /api/accounts
- Snapshot pruning job — delete COMPLETE snapshots older than 7 days
- Consider pg-boss or BullMQ if moving to serverless/edge
