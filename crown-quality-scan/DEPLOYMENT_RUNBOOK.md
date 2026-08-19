# Deploying Crown Quality Scan (the operator QR-entry app)

**Status as of 18 Aug 2026: live and tested.** Deployed as its own Cloudflare
Worker at **https://crown-quality-scan.animesh-best.workers.dev/**, bound to
the same `crown-production-poc` D1 database as `crown-scan-poc`. Tested end
to end: PIN sign-in, station selection, manual Lot ID lookup (both a fresh
lot and one already recorded for that station — the duplicate guard correctly
showed the "already recorded" message instead of a form), a full entry
submission with auto-calculated Lost pieces (verified against the database,
then removed as test data), and the `/labels` QR-label page. Camera-based QR
scanning itself couldn't be exercised by this browser automation (no camera
hardware), but the manual-entry path exercises the same lookup/submit code.

The rest of this document is kept as a reference for how the deployment was
done and what to do if the Worker ever needs to be redeployed from scratch.

## What this app is

A second, separate Cloudflare Worker — its own URL, nothing linking to it from
the existing `crown-scan-poc` site or vice versa — built for ground-level
machine-shop and inspection operators. It is deliberately minimal: scan a
lot's QR code (or type the Lot ID if the camera won't cooperate), see the
lot's Model/Finish/Plating/Laser-marking numbers filled in automatically, type
OK and Rejected piece counts, pick a rejection reason if any, add a comment,
enter an Operator ID, submit. Lost pieces are calculated automatically, never
typed — same rule as the redesigned `crown-scan-poc` app.

It shares the same D1 database (`crown-production-poc`) as `crown-scan-poc`,
so every entry made here immediately shows up in that app's Search a Lot,
Management Reports, and the Correct an Entry / Supervisor Review workflow —
no separate reporting system to maintain. One schema change was made to
support it: a nullable `comments` column was added to `stage_events` via
`ALTER TABLE ADD COLUMN` (done already, live in the database).

It reuses the same shared pilot PIN (`REDACTED`) as `crown-scan-poc`, entered once
per device — the cookie persists for a year, so a station tablet is set up
once and an operator never sees the PIN screen again.

Reviewed before build by a combined product-manager + senior-developer pass;
its feedback (atomic duplicate-entry guard, an always-visible station banner
with deliberate-only switching, equal prominence for manual Lot ID entry
alongside the camera scanner, a required-reason-before-submit guard, and an
auto-counting-down confirmation screen) is built into the code below, flagged
inline with `// REVIEW:` comments.

## Where things stand

- **Code**: written, reviewed, deployed — `worker.js` in this folder matches
  what's live.
- **Database**: bound — same `crown-production-poc` D1 database as the other
  app, with the `comments` column added.
- **Live URL**: https://crown-quality-scan.animesh-best.workers.dev/
- **Tested**: sign-in, station switching, lot lookup, duplicate-guard,
  entry submission with auto-calculated Lost, and the `/labels` page. See the
  status note at the top for details.

Cloudflare's online code editor has no paste support, so the ~700-line file
had to be typed in via simulated keystrokes — a slow, occasionally fragile
process (a few browser-tab freezes and one accidental navigation happened
along the way, all recovered from). If this Worker ever needs to be rebuilt
from scratch, the steps below still apply.

## Option A — Let Claude finish it

Just ask and Claude will create the Worker, type in the code, bind the
database, and test it end to end, the same way this one was deployed.

## Option B — Do it yourself, ~5 minutes, no coding

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it something like `crown-quality-scan` → **Deploy** (publishes a placeholder — expected).
3. Click **Edit code**.
4. Select all the placeholder code, delete it. Open `worker.js` from this folder, copy everything, paste it in.
5. **Save and deploy**.
6. Go to **Settings** → **Bindings** → **Add binding** → **D1 database**.
   - Variable name: `DB` (must match exactly — the code refers to `env.DB`)
   - D1 database: `crown-production-poc` (the same one `crown-scan-poc` uses)
   - Save.
7. Your Worker's URL appears at the top, something like `https://crown-quality-scan.<your-subdomain>.workers.dev`. Open it, enter PIN `REDACTED` once.

Send the URL back and Claude will test the scan → auto-fill → submit flow end
to end and clean up any test data, same as before.

## What goes in the QR code

Each lot's printed QR label should encode a full URL, not just the Lot ID:

```
https://<your-worker-url>/?lot=<LOT_ID>
```

Example: `https://crown-quality-scan.animesh-best.workers.dev/?lot=LOT-20260815-0084`

Two reasons for the full URL rather than a bare ID: (1) any phone's stock
camera app can scan it and show a tappable link — no need to even open this
app first or use its in-page scanner; and (2) the in-page scanner (a free,
open-source library, `html5-qrcode`) still also reads it correctly, since the
app extracts the `lot` parameter either way. The `/labels` page in this same
app (office/supervisor use, not part of the operator flow) generates and
prints this QR for any Lot ID on demand, using another free open-source
library (`qrcode`) — no paid barcode-generation service needed.

The QR is generated once per lot, at whatever point the lot's traveler
card/label gets printed — it does not need to be regenerated as the lot moves
through stages, since the app looks up the model/finish/plating/laser-marking
numbers live from the database every time it's scanned, rather than baking
them into the code. This also means a lot scanned early (before its finishing
or plating number is assigned) correctly shows "Not defined" for those fields
at that point, and will show the real numbers once assigned and scanned again
later — nothing needs reprinting.

## What this is and isn't

Same caveats as `crown-scan-poc`: illustrative data, not real Arihant
production numbers yet; the PIN is a shared placeholder, not real
per-operator access control (Project Plan A1.7 still open); hosted on
Cloudflare (cloud), same open hosting-location question logged as RAID Log
Decision #37/Action #39. Also new to this app specifically: Operator ID is
free text, not validated against a roster of real operator codes — fine for
a pilot, but worth tightening (a dropdown of known operator codes) before any
real rollout, since a shared device makes free-text IDs easy to mistype or
leave stale between users.
