# Fidelity Import Smoke Test

This checklist validates end-to-end Fidelity import behavior in a deployed environment.

| # | Action | Expected result |
|---|---|---|
| 1 | `GET /api/imports/adapters` | Response includes `{ name: "fidelity", displayName: "Fidelity" }` |
| 2 | Upload fixture `History_for_Account_T12345678-8.csv` on `/imports` with adapter `fidelity` | Preview loads and displays row count and status badge breakdown |
| 3 | Inspect option rows in preview | `Underlying`, `Open/Close`, `Qty`, and `Asset Class` are populated; no `UNKNOWN` badges for standard rows |
| 4 | Commit import | Response shows non-zero `inserted.executions` |
| 5 | Navigate to `/trade-records?tab=executions` | Fidelity executions are visible and account ID is shown correctly |
| 6 | Navigate to `/positions` | Open options from fixture are visible with correct expiration and strike |
| 7 | Re-upload and commit fixture `History_for_Account_T12345678-8.csv` | `inserted.executions = 0` and `skippedDuplicates.executions` equals first commit execution inserts |
| 8 | Upload fixture `History_for_Account_T12345678-9.csv` | Assignment rows (DAL, INTC) import without errors and both option-close and equity-delivery rows are present |

## Pass Criteria

- All 8 steps pass.
- No browser console errors occur during the workflow.
