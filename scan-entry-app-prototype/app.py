"""
Crown Production scan-entry app (Project Plan A1.1 / A1.2).

Pure Python standard library -- no pip install needed (http.server + sqlite3, both
built in). Deliberate: the on-prem server may have no internet access, so this must
run with nothing beyond whatever Python already ships with.

Talks directly to crown_production_prototype.db using the exact schema already proven
in Proof of Concept (stage_events, stage_event_corrections, stage_events_effective) --
no new tables, no redesign.

Pilot scope: Machine Shop and IST Inspection only, per M0.4.
Correction workflow: supervisor approval required, per Jain's 17 Aug 2026 decision --
operators can request a correction, only a supervisor can approve or reject it.

Run:    python app.py            (Python 3.7+, nothing else needed)
Open:   http://localhost:5000    (or http://<server-ip>:5000 from another device on
        the same network, once deployed -- see DEPLOYMENT_RUNBOOK.md in this folder)
"""
import sqlite3
import datetime
import os
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "crown_production_prototype.db")
PILOT_STAGES = ["Machine Shop", "IST Inspection"]
PORT = 5000

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def now():
    return datetime.datetime.now().isoformat(timespec="seconds")

def esc(s):
    return html.escape(str(s))

PAGE_HEAD = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crown Production -- Scan Entry</title>
<style>
body{font-family:Arial,sans-serif;background:#f4f6f8;margin:0;padding:20px;color:#222;max-width:640px;margin:0 auto;}
h1{color:#1F4E78;font-size:20px;margin-bottom:4px;}
.sub{color:#595959;font-size:13px;margin-top:0;margin-bottom:20px;}
.card{background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:16px;margin-bottom:16px;}
label{display:block;font-size:13px;color:#595959;margin-bottom:4px;margin-top:10px;}
input,select{width:100%;box-sizing:border-box;padding:8px;font-size:15px;border:1px solid #ccc;border-radius:4px;}
button{width:100%;padding:10px;font-size:15px;background:#1F4E78;color:#fff;border:none;border-radius:4px;margin-top:14px;cursor:pointer;}
button.secondary{background:#fff;color:#1F4E78;border:1px solid #1F4E78;}
button.danger{background:#fff;color:#9C0006;border:1px solid #9C0006;}
.warn{background:#FAEEDA;border:1px solid #854F0B;color:#854F0B;padding:10px 12px;border-radius:6px;font-size:13px;margin-top:10px;}
.err{background:#FCEBEB;border:1px solid #A32D2D;color:#A32D2D;padding:10px 12px;border-radius:6px;font-size:13px;margin-top:10px;}
a{color:#1F4E78;}
.nav{display:flex;gap:8px;margin-bottom:16px;}
.nav a{flex:1;text-align:center;padding:8px;border:1px solid #1F4E78;border-radius:4px;text-decoration:none;font-size:13px;}
</style></head><body>
<h1>Crown Production -- Scan Entry</h1>
<p class="sub">Proof of concept, illustrative sample data only -- not connected to real Arihant production.</p>
<div class="nav"><a href="/">Operator</a><a href="/supervisor">Supervisor</a></div>
"""
PAGE_TAIL = "</body></html>"

def page_index():
    db = get_db()
    lots = db.execute("SELECT lot_id FROM lots ORDER BY created_at DESC LIMIT 15").fetchall()
    db.close()
    opts = "".join(f'<option value="{esc(l["lot_id"])}">{esc(l["lot_id"])}</option>' for l in lots)
    stage_opts = "".join(f'<option value="{esc(s)}">{esc(s)}</option>' for s in PILOT_STAGES)
    body = f"""
    <div class="card">
      <form method="get" action="/lot">
        <label>Scan lot barcode (simulated -- select or type a lot ID)</label>
        <input list="lotlist" name="lot_id" placeholder="LOT-20260801-0001" required>
        <datalist id="lotlist">{opts}</datalist>
        <label>Stage</label>
        <select name="stage">{stage_opts}</select>
        <button type="submit">Look up lot</button>
      </form>
    </div>"""
    return PAGE_HEAD + body + PAGE_TAIL

def page_lot(qs):
    db = get_db()
    lot_id = (qs.get("lot_id", [""])[0]).strip()
    stage = qs.get("stage", [PILOT_STAGES[0]])[0]
    lot = db.execute("SELECT * FROM lots WHERE lot_id = ?", (lot_id,)).fetchone()
    if not lot:
        db.close()
        return PAGE_HEAD + f'<div class="err">Lot {esc(lot_id)} not found.</div><p><a href="/">Back</a></p>' + PAGE_TAIL

    stage_row = db.execute("SELECT stage_id FROM stages WHERE stage_name = ?", (stage,)).fetchone()
    existing = db.execute(
        "SELECT * FROM stage_events_effective WHERE lot_id = ? AND stage_id = ?", (lot_id, stage_row["stage_id"])
    ).fetchone()
    pending = db.execute(
        """SELECT c.* FROM stage_event_corrections c
           JOIN stage_events se ON se.event_id = c.original_event_id
           WHERE se.lot_id = ? AND se.stage_id = ? AND c.status = 'Pending'""",
        (lot_id, stage_row["stage_id"])
    ).fetchone()
    db.close()

    if not existing:
        body = f"""
        <div class="card">
          <p><b>{esc(lot_id)}</b> &middot; {esc(stage)}</p>
          <form method="post" action="/entry">
            <input type="hidden" name="lot_id" value="{esc(lot_id)}">
            <input type="hidden" name="stage" value="{esc(stage)}">
            <label>Received qty</label>
            <input type="number" name="qty_received" min="0" required>
            <label>OK qty</label>
            <input type="number" name="qty_ok" min="0" value="0" required>
            <label>Reject qty</label>
            <input type="number" name="qty_reject" min="0" value="0" required>
            <button type="submit">Submit entry</button>
          </form>
        </div>"""
    elif pending:
        body = f"""
        <div class="card">
          <p><b>{esc(lot_id)}</b> &middot; {esc(stage)}</p>
          <p>Recorded: OK {existing['effective_qty_ok']} / reject {existing['effective_qty_reject']}</p>
          <div class="warn">Correction requested (event #{pending['original_event_id']}), pending supervisor approval.
          Requested: OK {pending['corrected_qty_ok']} / reject {pending['corrected_qty_reject']}. Reported numbers
          unchanged until approved.</div>
        </div>"""
    else:
        amended_note = " (corrected)" if existing["was_amended"] else ""
        body = f"""
        <div class="card">
          <p><b>{esc(lot_id)}</b> &middot; {esc(stage)}</p>
          <p>Recorded: OK {existing['effective_qty_ok']} / reject {existing['effective_qty_reject']}{amended_note}</p>
          <form method="get" action="/correct">
            <input type="hidden" name="event_id" value="{existing['event_id']}">
            <button type="submit" class="secondary">Request correction</button>
          </form>
        </div>"""
    return PAGE_HEAD + body + PAGE_TAIL

def do_entry(form):
    db = get_db()
    lot_id = form["lot_id"][0]
    stage = form["stage"][0]
    qty_received = int(form["qty_received"][0])
    qty_ok = int(form["qty_ok"][0])
    qty_reject = int(form["qty_reject"][0])
    stage_row = db.execute("SELECT stage_id FROM stages WHERE stage_name = ?", (stage,)).fetchone()
    try:
        db.execute(
            """INSERT INTO stage_events (lot_id, stage_id, qty_received, qty_ok, qty_reject, operator, event_timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (lot_id, stage_row["stage_id"], qty_received, qty_ok, qty_reject, "operator-poc", now())
        )
        db.commit()
    except sqlite3.IntegrityError as e:
        db.close()
        return None, PAGE_HEAD + f'<div class="err">Rejected by the database: {esc(e)}. OK + reject can\'t exceed received.</div><p><a href="/">Back</a></p>' + PAGE_TAIL
    db.close()
    return f"/lot?lot_id={lot_id}&stage={stage}", None

def page_correct_form(qs):
    db = get_db()
    event_id = qs.get("event_id", [""])[0]
    ev = db.execute("SELECT * FROM stage_events_effective WHERE event_id = ?", (event_id,)).fetchone()
    db.close()
    return PAGE_HEAD + f"""
    <div class="card">
      <p>Request correction -- event #{esc(event_id)}</p>
      <form method="post" action="/correct">
        <input type="hidden" name="event_id" value="{esc(event_id)}">
        <label>Corrected OK qty</label>
        <input type="number" name="qty_ok" value="{ev['effective_qty_ok']}" required>
        <label>Corrected reject qty</label>
        <input type="number" name="qty_reject" value="{ev['effective_qty_reject']}" required>
        <label>Reason</label>
        <input type="text" name="reason" placeholder="Size out of tolerance" required>
        <button type="submit">Send for supervisor approval</button>
      </form>
    </div>""" + PAGE_TAIL

def do_correct(form):
    db = get_db()
    event_id = form["event_id"][0]
    qty_ok = int(form["qty_ok"][0])
    qty_reject = int(form["qty_reject"][0])
    reason = form["reason"][0]
    db.execute(
        """INSERT INTO stage_event_corrections
           (original_event_id, correction_type, corrected_qty_ok, corrected_qty_reject, reason, requested_by, requested_at)
           VALUES (?, 'Amendment', ?, ?, ?, ?, ?)""",
        (event_id, qty_ok, qty_reject, reason, "operator-poc", now())
    )
    db.commit()
    ev = db.execute("SELECT lot_id, stage_id FROM stage_events WHERE event_id = ?", (event_id,)).fetchone()
    stage_name = db.execute("SELECT stage_name FROM stages WHERE stage_id = ?", (ev["stage_id"],)).fetchone()["stage_name"]
    db.close()
    return f"/lot?lot_id={ev['lot_id']}&stage={stage_name}"

def page_supervisor():
    db = get_db()
    pending = db.execute(
        """SELECT c.correction_id, c.original_event_id, c.corrected_qty_ok, c.corrected_qty_reject, c.reason,
                  se.lot_id, s.stage_name, se.qty_ok AS orig_ok, se.qty_reject AS orig_reject
           FROM stage_event_corrections c
           JOIN stage_events se ON se.event_id = c.original_event_id
           JOIN stages s ON s.stage_id = se.stage_id
           WHERE c.status = 'Pending'
           ORDER BY c.requested_at"""
    ).fetchall()
    db.close()
    if not pending:
        body = '<div class="card">Nothing waiting on approval.</div>'
    else:
        rows = ""
        for p in pending:
            rows += f"""
            <div class="card">
              <p><b>{esc(p['lot_id'])}</b> &middot; {esc(p['stage_name'])}</p>
              <p>Current: OK {p['orig_ok']} / reject {p['orig_reject']} &rarr; requested: OK {p['corrected_qty_ok']} / reject {p['corrected_qty_reject']}</p>
              <p style="font-size:13px;color:#595959;">Reason: {esc(p['reason'])}</p>
              <div style="display:flex;gap:8px;">
                <form method="post" action="/approve/{p['correction_id']}" style="flex:1;"><button type="submit">Approve</button></form>
                <form method="post" action="/reject/{p['correction_id']}" style="flex:1;"><button type="submit" class="danger">Reject</button></form>
              </div>
            </div>"""
        body = rows
    return PAGE_HEAD + body + PAGE_TAIL

def do_resolve(correction_id, status):
    db = get_db()
    db.execute(
        "UPDATE stage_event_corrections SET status=?, approved_by=?, resolved_at=? WHERE correction_id=?",
        (status, "supervisor-poc", now(), correction_id)
    )
    db.commit()
    db.close()

class Handler(BaseHTTPRequestHandler):
    def _send(self, body, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _redirect(self, location):
        self.send_response(303)
        self.send_header("Location", location)
        self.end_headers()

    def log_message(self, fmt, *args):
        pass  # keep console quiet; swap for real logging before production use

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        if parsed.path == "/":
            self._send(page_index())
        elif parsed.path == "/lot":
            self._send(page_lot(qs))
        elif parsed.path == "/correct":
            self._send(page_correct_form(qs))
        elif parsed.path == "/supervisor":
            self._send(page_supervisor())
        else:
            self._send(PAGE_HEAD + '<div class="err">Not found.</div>' + PAGE_TAIL, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        form = parse_qs(body)
        parsed = urlparse(self.path)
        if parsed.path == "/entry":
            location, err_page = do_entry(form)
            self._send(err_page) if err_page else self._redirect(location)
        elif parsed.path == "/correct":
            self._redirect(do_correct(form))
        elif parsed.path.startswith("/approve/"):
            do_resolve(int(parsed.path.split("/")[-1]), "Approved")
            self._redirect("/supervisor")
        elif parsed.path.startswith("/reject/"):
            do_resolve(int(parsed.path.split("/")[-1]), "Rejected")
            self._redirect("/supervisor")
        else:
            self._send(PAGE_HEAD + '<div class="err">Not found.</div>' + PAGE_TAIL, 404)

if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Crown Production scan-entry app running at http://0.0.0.0:{PORT}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()
