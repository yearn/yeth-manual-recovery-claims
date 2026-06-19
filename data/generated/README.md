# Generated Data

This directory contains generated outputs from the extraction and export scripts.

Expected files include:

- `unclaimed-claims.<block>.json`
- `unclaimed-claims.<block>.csv`
- `unclaimed-claims.latest.json`
- `unclaimed-claims.latest.csv`
- `manual-claims.csv`

Generated files must be produced by the repository scripts and committed when they change. CI runs `npm run export:ledger` followed by `git diff --exit-code`, so pull requests that change the ledger must include the updated generated CSV.
