# Crown Production Barcode / Lot Tracking System

Code and deployment runbooks for Arihant Technomac's Crown Production barcode/QR
lot-tracking pilot. Backup/record-keeping copy — internal business planning
documents (project plan, RAID log, P&L impact, board deck) are intentionally
not included here.

## Contents

- **`crown-scan-poc/`** — the main scan-entry app (Cloudflare Worker + D1
  database). Lot lookup, stage entry, correction/supervisor-approval workflow,
  Management Reports, and a Report-an-Issue log.
- **`crown-quality-scan/`** — a separate, minimal QR-scan app for ground-level
  Machine Shop / 1st Inspection operators. Shares the same D1 database as
  `crown-scan-poc`.
- **`scan-entry-app-prototype/`** — the earlier local Python/SQLite proof of
  concept that preceded the Cloudflare apps, kept for reference.

Each subfolder has its own `DEPLOYMENT_RUNBOOK.md` with the exact steps to
redeploy that app to Cloudflare Workers + D1.

## Note on the PIN

Both live apps are gated by a shared PIN. **The real PIN has been redacted**
from the code and runbooks in this repo (replaced with a placeholder) so this
copy is safe to share without exposing access to the live pilot deployment.
Set your own PIN in the `PIN` constant near the top of each `worker.js`
before deploying.

## Status

Pilot build (Phase 1) for Machine Shop → 1st/IST Inspection. All data in the
live pilot D1 database is illustrative/synthetic, not real production
numbers. See the project's internal Project Plan / RAID Log for full status
and open decisions (not included in this repo).
