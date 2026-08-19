# Crown Production Scan Entry App

Built 17 Aug 2026 (Project Plan A1.1 / A1.2), against the schema and correction/reversal mechanism already proven in `Sub-projects/Database Management System/Proof of Concept/`.

## What's here

- `app.py` — the actual application. Pure Python standard library (`http.server`, `sqlite3`) — no packages to install, no internet access needed to run it. That was deliberate: Jain has decided this layer will not get remote access to the on-prem server, so whatever gets deployed has to be simple enough to run and troubleshoot by hand, and self-contained enough not to depend on internet access the server may not have.
- `crown_production_prototype.db` — a copy of the proven prototype database (illustrative sample data, not real Arihant production numbers).
- `DEPLOYMENT_RUNBOOK.md` — step-by-step instructions for Jain (or anyone on-ground) to actually run this on the server. Written for someone with no particular technical background.

## What it does

- **Operator flow**: look up a lot (typed lot ID today, standing in for a barcode scan), select a stage (Machine Shop or IST Inspection — the pilot scope), enter OK/reject quantities. The database itself refuses an entry where OK + reject exceeds what was received — tested and confirmed.
- **Correction flow**: if a lot already has an entry at that stage, the operator can request a correction instead of a fresh entry. It sits Pending with zero effect on reported numbers.
- **Supervisor flow**: a separate `/supervisor` view lists pending corrections with approve/reject buttons. Approving updates what's reported; the original entry is never edited or deleted — tested and confirmed the raw row stays untouched while the "effective" numbers change.

This is the same correction/reversal mechanism already demonstrated in `demo_correction.py`, now reachable through an actual screen instead of a script.

## What's been tested

Ran the full loop against a copy of the real prototype database: existing entry → correction requested (no effect) → supervisor approves → effective view updates → raw `stage_events` row confirmed unchanged. Also confirmed the database rejects an over-limit entry (OK + reject > received) outright. Test data was not left in the working database.

## What this is not yet

- Not connected to real barcode hardware — lot IDs are typed/selected, not scanned. That's a later step once the pilot's device approach (phone-camera vs. dedicated scanner) is settled.
- No login/access control yet — reachable by anyone who can reach the server's address on the local network. The named-access-list decision (Project RAID Log, Project Plan A1.7) is a separate step.
- Not deployed anywhere yet — this folder is the package; `DEPLOYMENT_RUNBOOK.md` is what turns it into something running on the actual server.
