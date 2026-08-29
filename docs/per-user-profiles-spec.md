# Spec: Per-user profiles for the KapMan app family (identity-keyed auto-saved views)

**Status:** Revision 5 — Revision 4 approved with two material amendments
(identity-change guard for stale tabs; separation of canonical profile hydration
from applied account scope) plus synchronous journal-before-keepalive ordering.
Operator decisions in §0 are FIXED. Approved: newer-version write policy (render
defaults read-only, `writable: false`, writes rejected 409) and tunables (debounce
~1.5 s, retry backoff 2 s→60 s, 3 CAS attempts, schema bounds as in §2d).
Implementation begins only on the operator's explicit "execute".
**Repo (first implementation):** kapman-tradelog (Next.js 14 App Router, Prisma 5.14,
Postgres, Cloudflare Access in front, direct-to-main workflow per AGENTS.md; migrations
ride every deploy; deploys separately authorized).
**Goal:** settings follow the person, not the browser — Victor
(victor.kapella@kapmancapital.com) sees Victor's view, Ron
(ron.nyman@kapmancapital.com, already in the Access policy) sees Ron's — with a
convention every KapMan app can copy (next: Kapman Polygon Viewer).

## 0. Fixed decisions (operator-approved — unchanged)

1. **Preferences, not permissions.** Any Cloudflare-authenticated human sees all data;
   profiles change only the presented view. No per-user data restriction now or implied.
2. **App-wide seed defaults for new/unknown users:** account selection =
   `18528700SCHW` (Kapman SCHW live), range = Kapman Start. (Range is already the
   app default today; only the account default changes from "all accounts".)
3. **Start fresh:** no migration of existing browser-localStorage settings into
   profiles. First load after ship = seed defaults until a user changes something.
4. **Auto-save, last-settings-win.** Every profile-scoped change persists
   automatically (debounced); whatever the user last did IS their profile. No
   explicit save action, no dirty indicator. A single optional "Reset view to app
   defaults" action is the escape hatch.
5. **Profile-scoped settings (maximal-practical set):** account selection, range,
   dashboard widget layout + which widgets are active, KPI strip layout, table column
   visibility. NOT profile-scoped: table filters/sorts (stay sessionStorage-ephemeral),
   positions/quotes device cache (stays localStorage), drawer/sheet UI state.
6. **Sync:** last-write-wins per logical settings key (leaf level, see §2d); no live
   cross-device sync.
7. **Per-app independence:** each app owns its own profile store; no shared/central
   profile service and no cross-app setting coupling.
8. **No admin surface.** Users touch only their own profile. On any profile-fetch
   failure the app silently falls back to the last-known cached profile for the SAME
   identity, else seed defaults.
9. **Dev fallback identity:** when the Cloudflare gate is bypassed (local dev, Docker,
   tests), identity is the fixed string `dev@local`.

## 1. Current state (verified against the code)

- **Identity is verified server-side and then discarded.** `src/middleware.ts` has
  four early-return branches, each currently a bare `NextResponse.next()`: (1) Access
  not configured → allow (local dev/tests/compose), (2) `/api/health` exempt,
  (3) valid `Authorization: Bearer` on `/api/*` (`bearerTokenOk`,
  `src/lib/auth/bearer.ts`), (4) verified CF Access JWT (`verifyAccessJwt`,
  `src/lib/auth/access-jwt.ts` → `{ email, isServiceToken }`; service tokens carry
  `common_name`). No branch strips or sets any identity header today, and the email
  is not normalized anywhere.
- **The root layout is a server component with `export const dynamic =
  "force-dynamic"`** (`src/app/layout.tsx`), mounting the client `RootShell`
  (`src/components/root-shell.tsx`), which nests
  `AccountFilterContextProvider > RangeFilterProvider > TopbarSheetProvider >
  ShellContent`.
- **The repo already has a monotonic-revision CAS convention:** `Account.dataRevision
  BigInt @default(0)` (#339), bumped via `dataRevision: { increment: 1 }`
  (`src/lib/accounts/data-revision.ts`), serialized to the API as a string via
  `serializeDataRevision`. The profile store reuses this idiom.
- **All view settings are per-browser today:**
  - `AccountFilterContext`: localStorage `kapman-tradelog.selected-accounts.v1`
    (INTERNAL account cuids). It exposes `toExternalAccountId` (internal→external)
    publicly; the `internalByExternal` map exists but is private. Its
    `setSelectedAccounts` all-accounts fallback WRITES the fallback to storage, and
    the first-load restore drops stale ids then falls back to all accounts. Its
    effect also triggers `openPositionsStore.hydrate(selectedAccounts)`, gated on
    `accountsLoading` and a non-empty selection (#338 stale-scope fix) — the
    hydration barrier in §2f must preserve those semantics.
  - `RangeFilterContext`: localStorage `kapman_range_filter`. `computePresetRange`
    stores COMPUTED dates for presets, but `applyRangeToSearchParams` recomputes
    non-custom presets at query time, so runtime derivation already exists.
  - Dashboard (`src/app/dashboard/page.tsx`): page-local `useState` +
    localStorage `kapman_dashboard_layout` (array of `{ widgetId, colSpan }`,
    colSpan clamped 1–3) and `kapman_kpi_layout` (array of KPI id strings).
    `sanitizeStoredWidgetLayout` / `sanitizeStoredLayout` both return the DEFAULT
    layout whenever the filtered result is empty — an intentionally emptied layout
    cannot currently round-trip.
  - `useDataTableState` (`src/components/data-table/useDataTableState.ts`):
    ONE sessionStorage payload `kapman_table_filters_<tableName>` containing
    `{ filters, sort, hiddenColumns }`.
  - localStorage `kapman_positions_<accountId>` is a device cache — out of scope.
- **PWA (#340) is manifest/meta only — no service worker.** An offline cold start
  cannot render the app shell at all, so any rendered page has passed middleware and
  carries server-provided identity.

## 2. Architecture

### 2a. Identity propagation (middleware — sanitize, then forward)

Headers: `x-kapman-user` (trusted, middleware-written) and
`x-kapman-expected-user` (client-written guard, §2e — untrusted by design).
Constants and helpers live in a new edge-safe module `src/lib/auth/identity.ts`:

- `PROFILE_IDENTITY_HEADER = "x-kapman-user"`
- `PROFILE_EXPECTED_IDENTITY_HEADER = "x-kapman-expected-user"`
- `DEV_IDENTITY = "dev@local"`
- `normalizeIdentity(raw: string): string | null` → `trim().toLowerCase()`, null if
  empty after trim. Used before header propagation, database addressing, and cache
  addressing — one normalization, all consumers.
- `getProfileIdentity(request: Request): string | null` → reads the TRUSTED header,
  re-normalizes (defense in depth), returns null if absent/empty. Route handlers
  read identity ONLY through this; no email ever comes from query params or bodies.

Middleware flow (replaces the current body of `middleware()`):

```ts
const headers = new Headers(request.headers);
headers.delete(PROFILE_IDENTITY_HEADER);          // FIRST, before ANY allow path
const forward = () => NextResponse.next({ request: { headers } });

const access = accessConfig();
if (!access) {                                    // dev / tests / compose
  headers.set(PROFILE_IDENTITY_HEADER, DEV_IDENTITY);
  return forward();
}
if (request.nextUrl.pathname === HEALTH_PATH) return forward();   // no identity
if (bearerTokenOk(...)) return forward();                          // no identity
const identity = await verifyAccessJwt(...);
if (!identity) return unauthorized();
if (!identity.isServiceToken) {
  const email = normalizeIdentity(identity.email);
  if (email) headers.set(PROFILE_IDENTITY_HEADER, email);
}
return forward();
```

Rules this encodes:
- The inbound `x-kapman-user` is deleted before evaluating ANY allow path; every
  `NextResponse.next()` forwards the sanitized request headers via
  `NextResponse.next({ request: { headers } })`. Setting a response header is not
  used and not sufficient — the forwarded REQUEST headers are what route handlers
  and the server-rendered layout read.
- `x-kapman-user` is set only for (a) a normalized verified-human email, or (b)
  `dev@local` when Access is unconfigured. It is absent for health checks, bearer
  (machine API) callers, and Cloudflare service-token identities.
- `x-kapman-expected-user` is NOT stripped and NOT interpreted by middleware — it
  is deliberately client-controlled and is only ever compared against the trusted
  identity in the profile routes (§2e). Spoofing it can only cause a rejection,
  never mis-addressing.
- Spoof tests cover every early branch — in particular a request with a VALID
  bearer token AND a forged `x-kapman-user` must reach routes with no trusted
  identity header.
- The existing #336 access-jwt test suite must keep passing unmodified.

### 2b. Client identity bootstrap (independent of the profile DB)

`src/app/layout.tsx` (server component, already `force-dynamic`) reads
`headers().get("x-kapman-user")` — trustworthy because middleware sanitized it —
and passes it as a prop: `<RootShell identity={identity}>`. RootShell hands it to
`ProfileProvider`.

- Identity for cache and journal addressing therefore never depends on
  `/api/profile` or the database being reachable.
- The bootstrapped identity is a SNAPSHOT taken at page render. The shared
  Cloudflare Access session can later switch users underneath an open tab; the
  identity-change guard in §2e detects that before any cross-user write.
- If the prop is null/empty (defensive only — every rendered page passed either the
  dev branch or the human-JWT branch), the profile system is DISABLED for the
  session: seed defaults, no cache or journal read/write, no autosave, no
  legacy-key cleanup. Never another user's cache or journal.

### 2c. Storage (Prisma, additive migration)

```prisma
model UserProfile {
  email     String   @id
  settings  Json
  revision  BigInt   @default(0)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("user_profiles")
}
```

- `email` is the normalized (trimmed, lowercased) identity from §2a.
- One row per email, created lazily on first write. No user registry, no allowlist —
  Cloudflare Access IS the allowlist.
- `revision` is the optimistic-concurrency token (§2e), following the
  `Account.dataRevision` idiom from #339; serialized to the API as a string
  (reuse/mirror `serializeDataRevision`).
- `settings` is one versioned JSON document (§2d).

### 2d. Settings document: canonical schema, leaf conflict units, limits

```ts
type DashboardWidgetColSpan = 1 | 2 | 3;

interface ProfileWidgetItem { widgetId: string; colSpan: DashboardWidgetColSpan; }

interface ProfileSettingsV1 {
  version: 1;
  accounts: {
    /** EXTERNAL account ids (e.g. "18528700SCHW"), NOT internal cuids — profiles
     *  must survive DB rebuilds/reseeds where cuids change. */
    selected: string[];
  };
  range: { preset: RangePreset; startDate: string | null; endDate: string | null };
  dashboard: {
    widgets: ProfileWidgetItem[] | null;  // null = built-in layout; [] = intentionally empty
    kpis: string[] | null;                // null = built-in layout; [] = intentionally empty
  };
  tables: {
    /** tableName -> hidden column ids. Filters and sorts deliberately excluded —
     *  ephemeral by design (decision 5). */
    hiddenColumns: Record<string, string[]>;
  };
}

const DEFAULT_PROFILE: ProfileSettingsV1 = {
  version: 1,
  accounts: { selected: ["18528700SCHW"] },
  range: { preset: "kapman-start", startDate: null, endDate: null },
  dashboard: { widgets: null, kpis: null },
  tables: { hiddenColumns: {} },
};
```

**Leaf conflict units.** Merge, patch, and last-write-wins operate independently on:

1. `accounts`
2. `range`
3. `dashboard.widgets`
4. `dashboard.kpis`
5. `tables.hiddenColumns[tableName]` — one leaf PER TABLE

A widget-layout patch must not carry or replace KPI state; a visibility change for
the executions table must not carry or replace positions-table state.

**Canonical invariants (enforced by zod on every write; the stored document always
satisfies them):**

- `version` is server-controlled, always `1` for now.
- Range: non-`custom` preset ⇒ `startDate` and `endDate` are BOTH null; `custom` ⇒
  both are valid `YYYY-MM-DD` and `startDate <= endDate`. Computed daily windows
  (e.g. Kapman Start → today) exist only in runtime/query derivation — the existing
  `applyRangeToSearchParams` recompute path — never in the stored document.
- `null` vs `[]` for `dashboard.widgets` / `dashboard.kpis`: null = use the app's
  built-in layout; `[]` = the user intentionally removed every widget/KPI. Both
  round-trip.
- `tables.hiddenColumns` never stores empty arrays — an entry whose array becomes
  empty is removed from the canonical document.
- All zod object schemas are `.strict()` — unknown keys are rejected.
- No duplicates: within `accounts.selected`, within `widgets` (by `widgetId`),
  within `kpis`, within each hidden-columns array.
- Bounds (approved): `accounts.selected` ≤ 64 entries; `widgets` ≤ 64; `kpis` ≤ 64;
  `hiddenColumns` ≤ 32 table entries, each ≤ 128 column ids; every id/tableName a
  non-empty trimmed string ≤ 128 chars.
- The server validates SHAPE and bounds only — it does not know widget/KPI/column
  registries. The client sanitizes against registries at render time (§2f) without
  writing the sanitized result back.

**Size limit:** 64 KiB, measured as UTF-8 byte length (`Buffer.byteLength`) of
(a) the raw PUT request body BEFORE `JSON.parse`, and (b) the final merged
canonical document before persisting. Either failing → 413.

### 2e. API (two routes, identity-only addressing, identity-change guard, atomic leaf-merge writes)

Both handlers: `export const dynamic = "force-dynamic"`;
`Cache-Control: private, no-store` on every response; database addressing ONLY
from `getProfileIdentity(request)` (the trusted middleware header) — no identity →
403 (this is what service tokens and bearer callers hit). Standard envelopes from
`types/api.ts`: success `{ data: ... }`, errors
`{ error: { code, message, details } }`.

Error codes: `FORBIDDEN` (403), `VALIDATION_ERROR` (400),
`PAYLOAD_TOO_LARGE` (413), `CONFLICT` (409, CAS retries exhausted — client treats
as retryable), `UNSUPPORTED_PROFILE_VERSION` (409, stored document is newer than
this app understands — client stops autosaving), `IDENTITY_CHANGED` (409, the
expected-identity guard did not match — client reloads, §2f).

**Identity-change guard (every GET and PUT).** The client sends its bootstrapped
identity (§2b) on every profile request as `x-kapman-expected-user`. The route:

- continues to address the database EXCLUSIVELY with the trusted middleware
  `x-kapman-user` identity — the client value is NEVER used for profile lookup,
  addressing, or authorization;
- normalizes the guard and compares it with the trusted identity BEFORE any read
  or write; a missing or mismatched guard → 409 `IDENTITY_CHANGED` with no
  database access performed;
- exists because an old tab can stay open while the shared Cloudflare Access
  session switches users (Victor → Ron): middleware would authenticate that tab's
  later autosave as Ron while its ProfileProvider still holds Victor's state.
  The guard makes such a request fail closed instead of writing Victor's pending
  settings into Ron's profile.

"No client-supplied email" is thus refined: a client-supplied identity is
accepted ONLY as a mismatch guard whose sole possible effect is rejection —
never as an addressing or authorization input.

**GET `/api/profile`** → `{ data: ProfileGetResponse }` (after the guard check):

```ts
interface ProfileGetResponse {
  email: string;
  settings: ProfileSettingsV1;   // canonical stored doc, or DEFAULT_PROFILE
  isDefault: boolean;            // true iff no USABLE stored document backs `settings`
  writable: boolean;             // false iff stored version is newer than the app supports
  revision: string;              // BigInt as string; "0" when no row
  updatedAt: string | null;      // ISO; null when no row
}
```

| Stored state | settings | isDefault | writable | revision/updatedAt |
|---|---|---|---|---|
| No row | defaults | true | true | "0" / null |
| Valid v1 row | stored | false | true | row's |
| Row that equals defaults (e.g. after Reset) | stored | **false** (isDefault means "nothing usable stored", not "equals defaults") | true | row's |
| Malformed row (fails v1 schema, or garbage version that is not a number > 1) | defaults | true | true | row's |
| Version > 1 (written by a newer app) | defaults | true | **false** | row's |

**Newer-version policy (approved):** a version > 1 document is rendered as
read-only defaults (`writable: false`); PUTs against it return 409
`UNSUPPORTED_PROFILE_VERSION`; the stored document is never merged into and never
overwritten. No migration machinery until a v2 schema actually exists.

**PUT `/api/profile`** — body `{ patch: ProfilePatchV1 }` (after the guard check):

```ts
interface ProfilePatchV1 {
  accounts?: { selected: string[] };
  range?: ProfileSettingsV1["range"];
  dashboard?: {                     // at least one key required if present
    widgets?: ProfileWidgetItem[] | null;
    kpis?: string[] | null;
  };
  tables?: {                        // at least one entry required if present
    hiddenColumns: Record<string, string[] | null>;  // null or [] deletes the entry
  };
}
```

- Strict partial schema: unknown keys anywhere → 400. A patch containing zero
  leaves (empty object, empty `dashboard`, empty `hiddenColumns`) → 400.
- Raw-body byte cap checked before `JSON.parse` (413).

**Atomic merge — optimistic compare-and-swap, no raw SQL, bounded retry (3 attempts,
approved):**

1. `findUnique` by email → `{ settings, revision }` or null.
2. Determine merge base: valid v1 stored doc → that doc; missing or malformed row →
   `DEFAULT_PROFILE`; stored version > 1 → **409 `UNSUPPORTED_PROFILE_VERSION`,
   never merged into, never overwritten**.
3. Apply the patch at leaf granularity: `accounts` / `range` /
   `dashboard.widgets` / `dashboard.kpis` replace individually and only when
   present in the patch; each `tables.hiddenColumns[tableName]` entry replaces (or
   deletes, for null/empty) only that entry. Untouched leaves come from the base
   verbatim.
4. Canonicalize (version=1, range invariant, strip empty hidden-column entries),
   validate the merged doc, enforce the merged-doc byte cap (413).
5. Persist:
   - No row: `create({ email, settings: merged })` (revision defaults to 0). A
     concurrent-create unique-key violation (Prisma P2002) → go to 1 and retry.
   - Row: `updateMany({ where: { email, revision: read.revision }, data:
     { settings: merged, revision: { increment: 1 } } })`. `count === 0` (someone
     else won) → go to 1 and retry with a fresh read.
6. Retries exhausted → 409 `CONFLICT`.

Response: `{ data: { settings, revision, updatedAt } }` — the full canonical
merged document as the SERVER now holds it (re-read after update for exact
`revision`/`updatedAt`). Client-side use of this body is strictly limited (§2f):
the in-memory autosave state confirms only the per-leaf values it sent; the UI is
never live-hydrated from unrelated leaves in the response (decision 6 — no live
cross-device sync); the body's only consumers are the identity-keyed fallback
cache (where its extra freshness is a feature) and observability.

Because concurrent PUTs to DIFFERENT leaves each re-read-merge-CAS, both survive —
this is the deterministic concurrency test in §4.

No DELETE in v1: "Reset view to app defaults" is a client-side edit of every leaf
(§2f, including delete-entries for every stored table-visibility leaf), flowing
through the normal autosave path.

**`types/api.ts` additions:** `ProfileSettingsV1`, `ProfileWidgetItem`,
`ProfilePatchV1`, `ProfileGetResponse`, `ProfilePutResponse`,
`ProfileGetApiResponse = ApiDetailResponse<ProfileGetResponse> | ApiErrorResponse`,
`ProfilePutApiResponse = ApiDetailResponse<ProfilePutResponse> | ApiErrorResponse`.

### 2f. Client: ProfileProvider, two-stage hydration barrier, autosave state machine

**Ownership (one-way).** `ProfileProvider` is the canonical in-browser profile
store. New nesting in `RootShell`:

```
<ProfileProvider identity={identity}>        // from the server layout, §2b
  <AccountFilterContextProvider>             // mounted only after profile resolution
    <RangeFilterProvider>                    // mounted only after account scope hydrated
      <TopbarSheetProvider>
        <ShellContent> ...
```

Child contexts, dashboard state, and table hooks CONSUME profile state passed down
and REPORT user-originated changes upward through callbacks. ProfileProvider never
consumes hooks belonging to providers beneath it.

**Legacy storage removal (not just key deletion).** All localStorage reads AND
writes are removed from `AccountFilterContext`
(`kapman-tradelog.selected-accounts.v1`), `RangeFilterContext`
(`kapman_range_filter`), and the dashboard page (`kapman_dashboard_layout`,
`kapman_kpi_layout`). On first load with a known identity, ProfileProvider deletes
those four keys (decision 3). The dashboard page's page-local layout/kpiLayout
state and its localStorage effects are refactored to consume/update the profile
authority (via a context value ProfileProvider supplies).

**Identity-keyed fallback cache.** localStorage key
`kapman-tradelog.profile-cache.v1.<normalizedEmail>` holding a versioned envelope:

```ts
interface ProfileCacheEnvelopeV1 {
  cacheVersion: 1;
  identity: string;               // normalized email, verified on read
  writable: boolean;              // preserved from the last successful GET
  revision: string;
  updatedAt: string | null;
  settings: ProfileSettingsV1;    // validated with the SAME zod schema as server data
  cachedAt: string;
}
```

- Written after every successful GET (including a `writable: false` GET — that
  state is cached), and after every acknowledged PUT — in the PUT case with the
  FULL canonical server-returned settings/revision/updatedAt (and
  `writable: true`, since the PUT succeeded), not the client's local view,
  because the server document may contain newer changes to OTHER leaves made from
  another device. (Those newer values reach the cache without being live-applied
  to the running UI — decision 6.)
- Read ONLY when the profile GET fails AND the trusted identity is known; the
  envelope is used only if `envelope.identity === current normalized identity` AND
  its settings pass the v1 schema. Otherwise: seed defaults.
- **A cache restore carries `writable` forward: restoring an envelope with
  `writable: false` keeps autosave disabled for the session**, so the fallback
  path cannot violate the approved read-only-newer-version policy.
- Identity missing (defensive) or offline-without-identity: defaults — never
  another user's cache. A browser shared by Victor and Ron holds two separate keys
  and can never cross-serve them.

**Identity-change handling (guard rejection).** Every profile GET/PUT carries the
bootstrapped identity as `x-kapman-expected-user` (§2e). On a 409
`IDENTITY_CHANGED` response (the Access session now authenticates a DIFFERENT
user than this tab was rendered for), the client:

1. STOPS autosave immediately (no further PUTs, no keepalive flushes);
2. synchronously journals the current dirty desired values under the ORIGINAL
   bootstrapped identity's journal key;
3. forces a full page reload (`window.location.reload()`).

After the reload, the server-rendered layout bootstraps the NEW identity and a
fresh profile session begins for it. Identity-keyed isolation guarantees the old
user's journal is NOT replayed into the new user — it sits untouched under the
old identity's key until that user is back. A guard rejection on the bootstrap
GET (session switched between SSR and the fetch) follows the same reload path;
the reload re-renders with the new identity, so this cannot loop.

**Two-stage hydration barrier.** No data-fetching descendant may mount, and no
autosave may fire, before BOTH stages complete. The full sequence:

```
1. profile resolution   (GET /api/profile → success | identity-verified cache | defaults)
2. mount AccountFilterContextProvider
3. fetch /api/accounts  (the provider's own initial load)
4. on SUCCESS only: reconcile desired EXTERNAL ids → applied INTERNAL ids
   (drop stale; none resolve, or zero accounts exist → all-accounts runtime
   fallback, which for zero accounts is the empty applied selection of an
   empty system — a successful zero-account response still completes this step)
5. applyResolvedAccountScope(internalIds) — sets the APPLIED selection and marks
   accountScopeHydrated = true; NOT a user edit, nothing dirtied, nothing
   reported upward, and ProfileProvider's canonical profile state untouched
6. mount remaining descendants (RangeFilterProvider, TopbarSheetProvider,
   ShellContent, pages); openPositionsStore.hydrate runs at the applied scope
```

- **Stage 1 (profile):** until resolution, `ProfileProvider` renders the existing
  `LoadingSkeleton` shell and mounts nothing beneath it.
- **Stage 2 (account scope):** `ProfileProvider` then mounts
  `AccountFilterContextProvider` (it must mount for its `/api/accounts` fetch to
  run). The account provider itself WITHHOLDS its data-fetching descendants —
  rendering the loading shell — until the initial `/api/accounts` request
  SUCCEEDS and the retained desired external selection has been reconciled to an
  applied internal selection. It exposes an explicit
  `accountScopeHydrated: boolean` on its context value and an
  `onAccountScopeHydrated` callback to ProfileProvider.
- **Accounts-fetch ERROR does NOT open the barrier.** With no account list,
  `availableAccounts` and the applied selection would both be empty, and an empty
  account filter means "all accounts" to the data APIs — mounting pages then
  would query a scope the user never chose. Instead: scope-sensitive descendants
  stay unmounted, and the shell renders an account-loading error state with a
  Retry action (wired to the existing `reloadAccounts`).
  `accountScopeHydrated` is marked only after a SUCCESSFUL accounts response has
  been reconciled — including a successful response containing zero accounts.
- `ShellContent`, `RangeFilterProvider`, dashboard pages, table hooks,
  `openPositionsStore` hydration, and every other scope-sensitive consumer mount
  only after `accountScopeHydrated` is true — so no dashboard/data request and no
  positions-store hydration can ever run against an empty or transient
  all-accounts scope that the profile selection would immediately replace
  (preserving and extending the #338 stale-scope guarantee). This is a tested
  invariant.
- Sequencing cost: the profile GET and accounts GET are serialized (one extra
  small round trip behind the skeleton). Accepted for correctness.

**Two distinct hydration operations — canonical vs applied.**

- `applyHydrated(key, value)` is reserved EXCLUSIVELY for canonical persisted
  profile leaves (`accounts` external ids, `range`, `dashboard.widgets`,
  `dashboard.kpis`, `tables.hiddenColumns.*`): it sets
  desired = confirmedWritten = value in ProfileProvider and NEVER marks a key
  dirty. The confirmed-written baseline is initialized from the canonical
  hydrated profile.
- `applyResolvedAccountScope(internalIds)` is a SEPARATE operation for the
  runtime result of reconciliation (or the all-accounts fallback): it updates
  ONLY `AccountFilterContext`'s applied internal selection and marks
  `accountScopeHydrated`. It does NOT modify ProfileProvider's
  desired/confirmedWritten values, does NOT emit a user change, and does NOT
  trigger autosave — reconciled internal ids and fallbacks must never overwrite
  the retained canonical EXTERNAL selection (tested: reconciliation and fallback
  leave the external desired/confirmedWritten selection byte-for-byte
  unchanged).

Initial hydration produces ZERO PUT requests (tested).

**Account reconciliation (external ↔ internal).**

- `AccountFilterContext` gains an exposed, supported external→internal
  reconciliation path (promoting the currently-private `internalByExternal` map).
- ProfileProvider RETAINS the desired external ids from the profile at all times.
  While accounts are loading/unavailable, nothing is dropped.
- After `/api/accounts` loads successfully (and on every successful reload):
  resolve desired external ids → internal ids, drop stale ones for the APPLIED
  selection only. If none resolve (deleted ids, dev DB without the seed account,
  zero accounts), the applied runtime selection falls back to all available
  accounts.
- The runtime fallback is NOT a user edit: it flows through
  `applyResolvedAccountScope`, never reports upward, never marks `accounts`
  dirty, and never overwrites the stored desired selection — a later reload
  where the desired ids exist again reconciles from the retained desired ids,
  not from the fallback.
- A user-originated `setSelectedAccounts` reports the applied selection upward as
  EXTERNAL ids (via the existing `toExternalAccountId`), marking the `accounts`
  leaf dirty.

**Range.** `RangeFilterProvider` receives its initial state from the profile
(canonical form; non-custom presets expand to runtime windows via the existing
`computePresetRange` at use time) and reports canonical form upward on
`setPreset` / `setCustomRange`: non-custom ⇒ `{ preset, startDate: null,
endDate: null }`; custom ⇒ the picked dates.

**Dashboard layouts.** The dashboard page consumes `dashboard.widgets` /
`dashboard.kpis` from the profile authority. `null` renders the built-in defaults
(`buildDefaultWidgetLayout()` / `DEFAULT_KPI_LAYOUT`); `[]` renders an empty
layout. The sanitizers change accordingly: invalid input (non-array, or a
non-empty array whose entries are all unknown ids) → built-in defaults; a
genuinely stored `[]` → empty. Sanitization is display-only — it never writes the
sanitized result back to the profile. Widget/KPI edits (add, remove, reorder,
resize) report the full new layout upward, dirtying only `dashboard.widgets` or
`dashboard.kpis` respectively — a widget edit never carries KPI state and vice
versa.

**Hidden columns — one authority.** `useDataTableState` in profile mode:

- sessionStorage (`kapman_table_filters_<tableName>`) persists `{ filters, sort }`
  ONLY. It neither reads nor writes `hiddenColumns` there; a stale `hiddenColumns`
  field left in an existing session payload is ignored.
- Initial hidden columns come from the hydrated profile's
  `tables.hiddenColumns[tableName]`, sanitized against the current table's columns
  for display (persisted value untouched).
- Initialization applies exactly once per (identity, profile hydration
  generation); the hydration barrier guarantees the profile is resolved before any
  table mounts, and the once-only guard prevents a later profile re-application
  from overwriting a user edit.
- A visibility edit calls `onHiddenColumnsChange(tableName, ids)`, dirtying only
  the `tables.hiddenColumns[tableName]` leaf. Two independently mounted tables
  each patch their own leaf and cannot clobber one another (tested).

**Autosave state machine (per leaf key K).** State: `desired[K]`,
`confirmedWritten[K]` (the client's best knowledge of what the server holds for
K), per-key generation counter `gen[K]`, dirty set, per-key `mustConfirm[K]`
uncertain-delivery flag, ONE in-flight request slot (writes are serialized),
backoff state. Every PUT carries the expected-identity guard (§2e).

- USER EDIT: `desired[K] = v; gen[K]++`; mark K dirty; (re)start a trailing
  debounce (~1.5 s, approved).
- FLUSH (debounce fire, retry timer, or backgrounding): if a request is in
  flight, set a flush-requested flag and return. Drop any dirty K where
  `deepEqual(desired[K], confirmedWritten[K])` **AND `mustConfirm[K]` is unset**
  (no-op suppression; while `mustConfirm[K]` is set, the current desired value is
  NEVER suppressed merely because it equals the older confirmed baseline — the
  server may hold something else). If nothing remains, done. Otherwise snapshot
  `sentGen[K] = gen[K]` and `sentValue[K] = desired[K]` for each dirty K, build
  one PUT patch covering exactly those leaves, send it.
- SUCCESS: for EVERY successfully sent leaf K, **always set
  `confirmedWritten[K] = sentValue[K]`, regardless of whether its generation is
  still current** — the server now holds sentValue, and the baseline must say so.
  Generation equality controls only dirtiness: if `gen[K] === sentGen[K]`, clear
  dirty, clear `mustConfirm[K]`, and clear K's pending-journal entry (journaled
  generation ≤ the acknowledged one); otherwise K was edited during flight — it
  STAYS dirty and a follow-up flush is scheduled (and because
  `confirmedWritten[K]` is now the in-flight value, a revert to the pre-flight
  value is correctly seen as a difference and sent — a revert can never be
  swallowed by suppression). The in-memory state confirms ONLY the sent leaves;
  unrelated leaf values in the PUT response are NOT applied to the running UI
  (decision 6). The full server-returned canonical document is written to the
  identity-keyed fallback cache. Reset backoff; honor flush-requested.
- FAILURE (network error, 5xx, timeout, terminated keepalive, 409 `CONFLICT`):
  the request was DISPATCHED, so the server may have committed it without the
  client seeing the ack — **set `mustConfirm[K] = true` for every sent leaf**.
  Sent keys stay dirty; retry automatically with bounded exponential backoff
  (2 s, 4 s, 8 s … cap 60 s, approved) even if no further edit occurs. Retries
  REBUILD the patch from current `desired` — the failed payload is never resent,
  so a stale failure structurally cannot retry over a newer value; and because
  `mustConfirm` suspends no-op suppression, a user revert to the old confirmed
  value after an ambiguous failure is still transmitted. A user edit during
  backoff collapses the wait to the normal debounce.
- `mustConfirm[K]` is cleared only by (a) a successful PUT acknowledging the
  current desired generation of K, or (b) a fresh GET whose settings leaf
  deep-equals the current/journaled desired value for K (the server provably
  already holds it — no redundant PUT needed).
- 409 `UNSUPPORTED_PROFILE_VERSION`: disable autosave for the session (matches
  GET/cache `writable: false`); the UI keeps working on in-memory state.
- 409 `IDENTITY_CHANGED`: identity-change handling above — stop autosave,
  journal under the original identity, force reload. The rejected write touched
  nothing server-side.
- RESET ("Reset view to app defaults", in the dashboard Customize area + the #340
  mobile overflow pattern): sets `desired` for `accounts`, `range`,
  `dashboard.widgets`, and `dashboard.kpis` to their defaults via the normal
  USER-EDIT path (gen++ each), **and issues a delete-edit
  (`desired = null` → patch entry `null`) for EVERY table-visibility leaf the
  provider knows about — the union of table keys in the hydrated canonical
  document and any leaves edited since — including tables not currently
  mounted.** (An empty `hiddenColumns` patch is invalid and cannot express this
  reset; if no table leaves exist, the `tables` section is simply omitted from
  the reset patch.) Serialization of writes orders Reset after any in-flight
  request, and the generation bumps supersede all queued older values.
- Durability is defined by the server 200 acknowledgement — not by the debounce
  timer expiring, and not by a backgrounding flush having been attempted. Per
  decision 4 there is no dirty indicator; persistent PUT failure may surface at
  most a single quiet inline note near Customize.

**Backgrounding: best-effort flush + identity-keyed pending journal.** On
`pagehide` / `visibilitychange`→hidden (important for iPhone standalone
suspension):

- **No request in flight:** FIRST write the pending journal synchronously (the
  page may be killed at any instant after these handlers run; the journal write
  must not race the network call), THEN build the current dirty patch and send
  it as ONE PUT via `fetch(..., { keepalive: true })` occupying the normal
  serialized request slot (the keepalive body limit ~64 KiB matches the document
  cap), setting `mustConfirm = true` on the sent leaves (the response may never
  arrive). If the page survives and the response arrives, it is processed
  exactly like any SUCCESS/FAILURE above.
- **Request already in flight:** do NOT launch a concurrent keepalive — a newer
  request could commit before the older in-flight one and then be overwritten by
  it. Synchronously write the pending journal only; the in-flight request may
  still complete on its own, and its ack (if it arrives) clears the matching
  journal entries.
- **Pending journal:** localStorage key
  `kapman-tradelog.profile-pending.v1.<normalizedEmail>`:

  ```ts
  interface ProfilePendingJournalV1 {
    journalVersion: 1;
    identity: string;                       // normalized email, verified on read
    entries: Record<string, {
      value: unknown;                       // current desired value for the leaf
      gen: number;
      mustConfirm: boolean;                 // uncertainty persisted across relaunch
      editedAt: string;
    }>;
    // key = leaf id: "accounts" | "range" | "dashboard.widgets" |
    //       "dashboard.kpis" | "tables.hiddenColumns.<tableName>"
  }
  ```

  It holds the current UNACKNOWLEDGED desired state (and delivery uncertainty)
  of dirty leaves at the moment of writing. A journal entry is cleared only when
  an acknowledgement for a generation ≥ that entry's generation arrives, or by
  the GET-equality rule below; when all entries clear, the key is deleted.
- **Restore on resume/relaunch (same browser):** after profile resolution and
  before autosave enables, if a journal exists for the CURRENT identity and its
  entries validate against the leaf schemas:
  - **`writable: false` (from the GET or the restored cache): the journal is
    DISCARDED (key deleted), never restored and never transmitted** — a v1
    pending edit has no meaning against a newer-version document, and replaying
    it later would be stale. This keeps the fallback path inside the approved
    read-only policy.
  - Otherwise, per entry: if the freshly fetched server settings leaf
    deep-equals the journaled desired value → the server already has it; clear
    the entry WITHOUT a redundant PUT. If it differs → re-apply the journaled
    value as this browser's desired value (dirty, fresh generation,
    `mustConfirm` carried over, journal updated) and flush through the normal
    machine. Under last-settings-win this browser's last unacknowledged action
    is a legitimate newest edit. If profile resolution came from cache/defaults
    (no fresh GET), the equality shortcut is unavailable — entries restore as
    dirty with `mustConfirm` set.
  - A journal belonging to a DIFFERENT identity is NEVER applied (and left
    untouched under its own key); invalid entries are discarded.
- **Honest durability semantics:** after a server acknowledgement, the change
  appears on any other device's next load. Backgrounding triggers only a
  best-effort flush; an edit the server never received cannot be seen by a
  different device — but the SAME browser restores and retries it on
  resume/relaunch via the journal. No guaranteed cross-device durability from
  pagehide alone.

**Failure behavior summary:** GET fails → identity-verified cache (carrying its
`writable` state), else defaults; render normally, no banner. PUT fails →
automatic backoff retries with delivery-uncertainty tracking as above;
unacknowledged edits additionally survive same-browser termination via the
pending journal. Guard mismatch → journal under the original identity + reload.

### 2g. Reuse for the app family

The kit is a CONVENTION, not a drop-in file set: (1) the sanitize-then-forward
identity middleware pattern + `identity.ts` helper, (2) the `UserProfile` model
with revision CAS, (3) the profile route module (patch schema + identity guard +
leaf merge), (4) `ProfileProvider` with the two-stage hydration barrier, autosave
machine, and pending journal, (5) a per-app strict settings schema + defaults. In
THIS repo, wiring it up necessarily touches: middleware, Prisma schema + one
additive migration, the new route + lib modules, `types/api.ts`, the root layout
+ `RootShell`, both filter contexts, the dashboard page, `useDataTableState`, the
layout sanitizers, and tests. Extract a real shared package only when a third app
appears.

**Open item (operator):** Kapman Polygon Viewer's stack is unconfirmed. If it is a
Next.js app with its own Postgres behind the same Access team, the convention
applies directly; if it has no database, give it its own one-table store rather
than calling another app's API (fixed decision 7). Resolve before implementing
app #2; does not block tradelog.

## 3. Security notes

- Inbound `x-kapman-user` is deleted before ANY allow path is evaluated, and every
  forward path re-sends sanitized request headers — the only writer is the
  middleware, post-verification. Spoof tests cover all four branches, including
  bearer-authenticated requests carrying a forged header.
- Profile routes address the database exclusively via the trusted middleware
  identity. A client-supplied identity (`x-kapman-expected-user`) is accepted
  ONLY as a mismatch guard whose sole possible effect is rejection
  (`IDENTITY_CHANGED`) — never as an addressing or authorization input. The
  guard closes the stale-tab race where a shared Access session switches users
  under an open tab: without it, that tab's autosave would write the old user's
  pending settings into the new user's profile.
- Service tokens and bearer callers have no trusted identity header → 403 on
  profile routes only; every other route is unaffected.
- The fallback cache AND the pending journal are keyed by and verified against the
  trusted identity bootstrapped from the server-rendered layout — a shared browser
  cannot serve one user the other's cached view, and cannot replay one user's
  pending edits into the other's profile (the identity-change reload path
  journals under the ORIGINAL identity, so post-reload the new user never
  inherits it); an unknown identity yields defaults and touches neither store.
- Identity normalization (`trim().toLowerCase()`) is applied identically at header
  set, guard comparison, DB addressing, and cache/journal addressing, so
  case/whitespace variants of the same email cannot fork profiles.
- PII stored: two work emails in a single-tenant DB. No new exposure.
- The middleware change touches the #336 auth path: the existing access-jwt test
  suite must pass unmodified; new tests cover stripping, per-branch propagation,
  and the dev-bypass identity.

## 4. Test plan

**Middleware** (extend existing suite; #336 tests untouched):
- Forged inbound `x-kapman-user` stripped on: dev-bypass branch, health branch,
  valid-bearer branch, verified-human branch, unauthorized (401) path.
- Header set to normalized email (mixed-case/whitespace input) for verified
  humans; `dev@local` when Access unconfigured; ABSENT for health, bearer, and
  service-token identities.
- Forwarding uses `NextResponse.next({ request: { headers } })` (assert the
  forwarded request headers, not response headers).

**Route tests:**
- GET: no row / valid row / row equal to defaults (isDefault false) / malformed
  row (defaults, writable true) / version>1 row (defaults, writable false) / 403
  without trusted identity header / `private, no-store` cache header present.
- **Identity guard:** GET and PUT with a missing or mismatched
  `x-kapman-expected-user` → 409 `IDENTITY_CHANGED` with NO database read or
  write performed; the guard value is never used for lookup (a matching guard
  with a spoofed value cannot address another row — addressing is always the
  trusted header). Stale-tab scenario: a tab bootstrapped as Victor whose
  requests middleware now authenticates as Ron → GET and PUT both reject, Ron's
  row remains untouched.
- PUT: single-leaf patch preserves all other leaves byte-for-byte;
  `dashboard.widgets`-only patch leaves `kpis` untouched and vice versa;
  per-table hiddenColumns patch leaves other tables untouched; null/[] deletes a
  hiddenColumns entry; lazy create from defaults; concurrent-create P2002 retried;
  empty patch 400; unknown keys 400; duplicate ids 400; range invariant violations
  400; raw-body > 64 KiB 413; merged-doc > 64 KiB 413; version>1 stored doc → 409
  UNSUPPORTED_PROFILE_VERSION and the stored doc is NOT modified; 403 without
  trusted identity.
- **Deterministic concurrency:** with an injected store stub, interleave two PUTs
  to different leaves so the second read happens before the first write commits —
  first `updateMany` CAS returns count 0, retry re-reads and re-merges — assert
  BOTH leaf values survive in the final document and revision advanced twice.
  Plus: retries-exhausted → 409 CONFLICT.

**Provider/client tests** (jsdom per-file pragma, per #340 conventions):
- **Two-stage barrier:** with the profile and accounts fetches pending, assert NO
  dashboard/data requests fire and `openPositionsStore.hydrate` is not called;
  after successful reconciliation, requests run at the applied profile-derived
  scope — never an empty or transient all-accounts scope; an accounts-fetch
  ERROR keeps scope-sensitive descendants unmounted and renders the shell-level
  error with Retry (barrier stays closed); a Retry that succeeds then opens the
  barrier; a SUCCESSFUL response with zero accounts opens the barrier.
- **Canonical-vs-applied separation:** `applyResolvedAccountScope` updates only
  the applied internal selection and marks `accountScopeHydrated` without any
  user-change report or autosave; reconciliation AND the all-accounts fallback
  leave ProfileProvider's external desired/confirmedWritten selection
  byte-for-byte unchanged.
- Hydration: server profile applied to accounts (external→internal, stale ids
  dropped, none-resolve → all-accounts runtime fallback), range, layouts, hidden
  columns; ZERO PUTs during initial hydration; the runtime account fallback does
  not dirty or overwrite the retained desired selection; later successful
  account reload with the ids restored re-applies the desired selection.
- **Identity change:** on 409 `IDENTITY_CHANGED`, autosave stops, dirty values
  are journaled synchronously under the ORIGINAL identity's key, and a full
  reload is forced; after a reload that bootstraps the new identity, the old
  identity's journal is not restored and Ron's profile session starts clean.
- Fallback chain: GET fails → same-identity cache used (including its `writable`
  state — a `writable: false` cache restore keeps autosave disabled);
  different-identity or schema-invalid cache ignored → defaults; identity absent
  → defaults, no cache or journal read/write.
- Autosave machine: edit during flight stays dirty and re-flushes; failure then
  automatic backoff retry with NO further edit; retry sends current desired (never
  the stale failed payload); multi-key coalescing into one patch; no-op
  suppression against `confirmedWritten`; reset during an in-flight write is
  ordered after it and supersedes queued values.
- **Acknowledgement/revert correctness (deterministic):**
  - B in flight, user reverts to A, B succeeds → `confirmedWritten` becomes B,
    K stays dirty, and A is sent in the follow-up flush (the revert is never
    suppressed).
  - B dispatched, response lost (ambiguous failure), user reverts to A →
    `mustConfirm` is set, so A is still sent despite equalling the old baseline.
  - Relaunch where the fresh GET already deep-equals the journaled desired value
    → journal entry clears WITHOUT a redundant PUT.
  - Relaunch where the fresh GET differs → the journaled desired value is sent.
- PUT response handling: a response containing newer values for UNRELATED leaves
  does not mutate the running UI state; the fallback cache receives the full
  server-returned document; only sent leaves are confirmed.
- **Backgrounding/journal:** pagehide with NO request in flight → the journal is
  written synchronously BEFORE exactly one keepalive PUT with the dirty patch
  (`mustConfirm` set on sent leaves); pagehide DURING an in-flight request → NO
  second request, journal written synchronously; reload with a same-identity
  journal → entries restored per the GET-equality rule; a different-identity
  journal → never applied; journal entries cleared on matching-generation ack;
  **journal DISCARDED (not restored, not transmitted) when the session is
  `writable: false`** from GET or cache.
- **Reset scope:** with saved hidden columns for several tables that are NOT
  currently mounted, invoking Reset from the dashboard emits delete entries for
  EVERY stored table key; after the flush the canonical document's
  `tables.hiddenColumns` is `{}`.
- Legacy keys: reads/writes removed (code-level), and the four legacy keys deleted
  on first load with identity.
- Hidden columns: sessionStorage round-trips `{filters, sort}` only; stale
  `hiddenColumns` in an old session payload ignored; two mounted tables edit
  visibility without clobbering each other; filters/sorts remain
  session-ephemeral.
- Empty layouts: remove the last widget and the last KPI → `[]` persists, survives
  reload as empty (not resurrected to defaults); `null` still yields built-ins.
- Profile-failure isolation: simulate a failing `/api/profile` (or a
  prisma-throwing profile query) while `/api/accounts` and data routes stay
  healthy — the app renders normally on cache/defaults. (Replaces the old
  "kill the DB" test, which would break every route at once and prove nothing
  about profile fallback.)

**Manual:** Victor and Ron diverge views in different browsers; after each change
is server-acknowledged it appears on the other device-class on next load
(including iPhone standalone). A shared browser switching between the two
identities shows each their own view, including on the offline-fallback path; an
old tab left open across the identity switch reloads into the new user's session
instead of writing into their profile. iPhone standalone: change a setting and
immediately background the app — the best-effort flush usually persists it; if
not, relaunching the SAME browser restores and retries the change (journal), and
it appears elsewhere once acknowledged. No cross-device claim is made for
unacknowledged edits.

**Gates:** typecheck · lint · test · build · docker smoke (per AGENTS.md),
issue-first workflow, migration rides the next authorized deploy (additive: one
CREATE TABLE).

## 5. Acceptance criteria

- [ ] Fresh browser, any authenticated user, no saved profile: lands on Kapman
      SCHW 18528700 + Kapman Start; `isDefault: true`.
- [ ] Change accounts/range/widget layout/KPI layout/hidden columns → persisted
      after the debounce and server ack; after acknowledgement the same view
      appears on any other device's next load (including iPhone standalone). No
      explicit save anywhere in the UI.
- [ ] Acknowledgement correctness: a successful PUT always updates the
      confirmed-written baseline to the sent values; a revert made during an
      in-flight write is subsequently transmitted (never lost to no-op
      suppression); after an ambiguous delivery, a revert to the old value is
      still transmitted (`mustConfirm`); a relaunch GET matching the journaled
      value clears the journal without a redundant PUT.
- [ ] Identity-change safety: a stale tab whose Access session now authenticates
      a different user is rejected with `IDENTITY_CHANGED` on GET and PUT before
      any database access, the new user's row is untouched, the old user's dirty
      values are journaled under the old identity, and the tab reloads into the
      new user's session; the old journal is never replayed into the new user.
      Client identity is accepted only as a mismatch guard — never for
      addressing or authorization.
- [ ] Backgrounding: the pending journal is written synchronously before the
      best-effort keepalive flush (never a concurrent request over an in-flight
      write); unacknowledged changes are journaled per-identity with their
      uncertainty state and restored + retried on the same browser's next
      launch. Cross-device visibility is claimed only after server
      acknowledgement.
- [ ] Victor's and Ron's profiles are fully isolated — server-side (trusted
      middleware identity is the only addressing input; spoofed inbound
      `x-kapman-user` ignored on every middleware branch, including
      bearer-authenticated requests) AND client-side (fallback cache and pending
      journal are identity-keyed and identity-verified; a shared browser can
      never serve one user the other's cache or replay the other's pending
      edits).
- [ ] Leaf isolation under concurrency: simultaneous writes to different leaves
      (including widgets vs KPIs, and different tables' hidden columns) both
      survive, via CAS with retry.
- [ ] Two-stage hydration: no data request and no openPositionsStore hydration
      ever runs at an empty or transient all-accounts scope; the barrier opens
      only after a SUCCESSFUL accounts response (zero accounts included) has been
      reconciled — an accounts-fetch error keeps pages unmounted behind a
      shell-level error with Retry; initial hydration issues zero PUTs;
      `applyHydrated` (canonical leaves) and `applyResolvedAccountScope`
      (applied scope) are distinct — reconciliation and fallback leave the
      retained external desired/confirmed selection byte-for-byte unchanged and
      never mark a key dirty.
- [ ] Autosave recovers from transient failures without user action; an edit made
      during an in-flight write is never lost; a stale failed payload is never
      retried over a newer value.
- [ ] A successful PUT confirms only the sent leaves; unrelated leaf values in
      the response never mutate the running UI; the fallback cache receives the
      full canonical server document.
- [ ] `[]` widget/KPI layouts persist and round-trip as intentionally empty;
      `null` renders built-in defaults.
- [ ] A v1 client never overwrites a newer-version stored document (renders
      defaults read-only; writes rejected 409) — including via the fallback
      path: the cache preserves `writable: false` and keeps autosave disabled,
      and a pending journal is discarded rather than restored or transmitted
      while `writable: false`.
- [ ] Reset-to-defaults restores and persists the seed view — including deleting
      EVERY stored table-visibility leaf, mounted or not — correctly ordered
      after any in-flight write.
- [ ] Table filters/sorts remain session-ephemeral; positions cache untouched;
      hidden columns have exactly one authority (the profile).
- [ ] Profile-endpoint failure (isolated) degrades silently to same-identity
      cache, then defaults, while data routes keep working; PUT failures retry
      quietly.
- [ ] Machine/API-token callers are unaffected (403 only on profile routes).
- [ ] Local dev works with `dev@local`; existing #336 auth tests pass unmodified.
- [ ] Profile routes are dynamically rendered with `private, no-store`; all
      contracts live in `types/api.ts` with standard envelopes.
- [ ] All gates green; additive migration only.

## 6. Open items for the operator (do not block review)

1. Kapman Polygon Viewer stack details (framework, DB, same Access team?) — needed
   only before implementing app #2 (§2g).

## 7. Workflow note

`docs/per-user-profiles-spec.md` stays UNCOMMITTED until the operator says
"execute". At that point, per AGENTS.md: create the GitHub implementation issue
FIRST, before any further repository changes; the finalized spec is then included
with the implementation work under that issue's direct-to-main workflow (full
validation gates before push; the additive `user_profiles` migration rides the
next separately-authorized deploy).
