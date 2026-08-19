**Update 18 Aug 2026 (v3 redesign): REDEPLOYED WITH NAV SHELL, AUTO-CALC LOST, CHARTS,
AND ISSUE REPORTING.** Per Jain's UX/product review request, the app was substantially
redesigned and redeployed:

1. **Lost quantity is now auto-calculated** (Received − OK − Reject) on both the stage
   entry form and the correction form — operators no longer type it in. As a side effect,
   this closes the previously-noted CHECK-constraint gap: since Lost is always derived,
   `OK + Reject + Lost` now always exactly equals `Received` whenever the `OK + Reject <=
   Received` guard passes, so the database's original two-column constraint is sufficient
   again.
2. **"Look up a lot" renamed to "Search a lot"** throughout.
3. **New Management Reports page** (`/reports`) — stage-wise reject/loss rates aggregated
   across all lots (not just one), with a bar chart and a numbers table, plus a rollup of
   open issues. This is the "which step is causing problems" view for decision-making.
4. **Persistent left-sidebar navigation** (dark sidebar, green header, card-based content —
   styled after the Quality Inspect reference app Jain shared) replaces the old
   single-flow page-to-page links. Five destinations: Search a Lot, Correct an Entry,
   Report an Issue, Management Reports, Supervisor Review.
5. **Lot detail page** now leads with a bar chart (Received/OK/Reject/Lost per stage) and
   a numbers table, with the existing per-stage entry/correction cards below.
6. **New "Report an Issue" feature** (`/report-issue`) — a lightweight, lot/stage-optional
   issue log (description, severity, reported-by) with a simple list and a Mark Resolved
   action, backed by a new `issue_reports` D1 table (plain `CREATE TABLE`, no foreign keys,
   to avoid the FK/DROP-TABLE migration issue seen earlier in this project).

Deployed via the same chunked-typing method as the original deployment (Cloudflare's
Monaco editor doesn't support a reliable programmatic paste). One bug was caught and
fixed during verification: the Chart.js CDN `<script>` tag was originally placed at the
end of `<body>`, after the inline chart-instantiation scripts that reference it, causing
a `Chart is not defined` error. Fixed by moving the CDN script tag into `<head>` on both
page shells, then redeployed. Full end-to-end verification passed on the live URL: chart
rendering, Management Reports aggregation, Report an Issue (submit + mark resolved), and
the auto-calc Lost field (tested with Received=100, OK=95, Reject=3 → Lost correctly
computed and stored as 2). All test data was cleaned up afterward.

Live at **https://crown-scan-poc.animesh-best.workers.dev/** — PIN `REDACTED`, current Worker
version `cdfd66a2 (Active)`.

---

**Earlier update, 18 Aug 2026: DEPLOYED AND LIVE (v2).** Using the connected Chrome
browser, the Worker was created (`crown-scan-poc`), the full v2 code was pasted in, the
D1 database was bound as `DB`, and the app was smoke-tested end to end (PIN login, lot
lookup against real D1 data, a correction request, and supervisor approval — the test
correction was deleted afterward to leave the demo data as found). The UI was also
restyled to Arihant's green brand color (`#1E7B34`) per Jain's request, replacing the
original navy theme. Everything below this point is the original pre-deployment runbook,
kept for reference.

# Deploying the Crown Scan Entry app to Cloudflare — 5-minute manual step

**Updated 18 Aug 2026:** the D1 schema and `worker.js` were revised per Jain's handwritten
process map — every stage now records OK/Reject/**Lost** quantities plus a structured
operator ID + name, and the stages table models the full granular Crown flow (through
Chamfer/Tapping/2nd Inspection/Polishing, then a route fork with/without Plating). Nothing
was deployed yet at the time of the first version of this runbook, so there's no live
Worker to update — this file and `worker.js` are simply current as of this revision.

**Known gap, carried forward transparently:** the D1 `stage_events` table's CHECK constraint
still only enforces `qty_ok + qty_reject <= qty_received` (it doesn't yet include `qty_lost`)
— two attempts to recreate the table with the fuller three-way constraint were blocked by D1
rejecting `PRAGMA foreign_keys = OFF` (needed to work around a dependent foreign key), so the
migration was done via `ALTER TABLE ADD COLUMN` instead, which can't touch an existing CHECK
constraint. The Worker's own code (`handleEntry`) checks OK+Reject+Lost against Received
before every insert, so the pilot app itself is still protected — the gap is only that a
direct database write bypassing the Worker wouldn't be caught by the database itself. Worth
knowing before this leaves proof-of-concept status.

## Where things stand

- **D1 database**: live and fully loaded. Name `crown-production-poc`, ID `154493c4-9b48-4693-a16e-af2ca420c11e`, region APAC (Singapore). Schema and all sample data (84 lots, 472 stage events, vendor dispatch, dispatch orders, the one proven correction record) are in it — same illustrative dataset as the local proof of concept, not real Arihant numbers.
- **Worker code**: written and syntax-checked — `worker.js` in this folder. It implements the same lot lookup / entry / correction / supervisor-approval flow as the on-prem app, running against that D1 database, behind a shared PIN (`REDACTED`) since this will be a public URL and the named-access list isn't built yet.
- **What's missing**: actually publishing this code to Cloudflare. There's no tool available to me that can push a Worker script directly — Cloudflare's own deployment path (the `wrangler` command-line tool) needs to run somewhere already logged into your Cloudflare account, which my sandbox isn't. The one thing I can't do myself here is click "Deploy" on your account.

Two ways to close this last gap — pick whichever is easier:

## Option A — Let me drive it for you (fastest)

Install the "Claude for Chrome" browser extension and connect it (I can walk you through this in chat). Once it's connected, I can open your Cloudflare dashboard myself, paste the code in, and bind the database — you'd just watch and approve.

## Option B — Do it yourself, 5 minutes, no coding

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**.
2. Give it a name, e.g. `crown-scan-poc` → click **Deploy** (this publishes a placeholder "Hello World" — that's expected).
3. Click **Edit code** (opens the online editor).
4. Select all the existing placeholder code and delete it. Open `worker.js` from this folder, copy its entire contents, and paste it in.
5. Click **Save and deploy** (or **Deploy**, depending on the editor version).
6. Go to the Worker's **Settings** → **Bindings** (or **Variables and Bindings**) → **Add binding** → **D1 database**.
   - Variable name: `DB` (must be exactly this — the code refers to `env.DB`)
   - D1 database: select `crown-production-poc`
   - Save.
7. Your Worker's URL will be shown at the top of its page, something like `https://crown-scan-poc.<your-subdomain>.workers.dev`. Open it — you should see a PIN prompt. Enter `REDACTED`.

That's it — no further steps needed. Send me the URL once it's live and I'll run through the operator → correction → supervisor-approval flow to confirm everything works end to end, the same way I tested the local version.

## What this is and isn't

This is still a proof of concept on illustrative sample data — same caveat as the on-prem version. The PIN gate is a placeholder, not real access control; before any real pilot, the named-access-list decision (Project Plan A1.7) still needs to happen. Data physically lives in Cloudflare's Singapore (APAC) region per their infrastructure — worth knowing if data residency becomes a factor in the eventual cloud-vs-on-prem full-rollout decision.
