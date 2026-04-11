Phase 1 complete — issues KM-031 through KM-035 done — typecheck clean — tests pass
Phase 2 complete — issues KM-032 through KM-006 done — typecheck clean — tests pass
Phase 3 complete — issues KM-028 through KM-027 done — typecheck clean — tests pass
@dnd-kit/core added for dashboard widget drag-and-drop (KM-007).
Phase 4 complete — issues KM-007 through KM-024 done — typecheck clean — tests pass
Phase 5 complete — issues KM-005 through KM-030 done — typecheck clean — tests pass
Assumption: open positions are grouped by account + instrument key to avoid cross-account netting collisions.
Assumption: dashboard edit controls are rendered within the dashboard content area (not topbar) while preserving required edit/add/remove/persist behavior.
@modelcontextprotocol/sdk added to support MCP-backed market data tool calls without app-managed Schwab OAuth tokens.
v7.2 bugfix exception: FIFO matched-lot realized P&L normalization updated for option contract multiplier (×100), with downstream rebuild support via `npm run rebuild:pnl`.
v7.2 documentation added: `docs/kapman_build_spec_v7_2.md` (manual override features + P&L normalization/story fixes).
