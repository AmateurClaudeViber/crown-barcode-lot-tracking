// Crown Quality Scan — Operator/Inspector entry app (Cloudflare Worker)
// Built 18 Aug 2026 per Jain's request: a SEPARATE app (own URL, not linked from
// crown-scan-poc's navigation) for ground-level, unskilled machine-shop and
// inspection operators to log OK / Rejected / Lost piece counts by scanning a
// QR code, on phone / tablet / laptop browsers, at zero added cost.
//
// Reviewed by a combined PM + senior web developer pass before build; changes
// made in response to that review are flagged inline with "REVIEW:" comments.
//
// Shares the SAME D1 database (crown-production-poc) as crown-scan-poc, so
// entries made here automatically show up in the existing Search a Lot,
// Management Reports, Correct an Entry and Supervisor Review pages — no new
// tables needed except one nullable `comments` column added to `stage_events`.
//
// Data here is the same illustrative/synthetic sample set used across this
// pilot — not real Arihant production numbers.

const STAGES = [
  { id: 1, name: "Machine Shop" },
  { id: 2, name: "1st Inspection" },
];

const PIN = "REDACTED_SET_YOUR_OWN_PIN"; // same shared pilot PIN as crown-scan-poc, for one-time device setup (redacted for public/shared repo)
const COOKIE_NAME = "crowninsp";

const REASONS = [
  "Dimension / size out of tolerance",
  "Surface defect / scratch",
  "Crack / damage",
  "Material defect",
  "Machine / tooling issue",
  "Other",
];

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function safeJSON(x) {
  return JSON.stringify(x).replace(/</g, "\\u003c");
}

function isAuthed(request) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.split(";").some((c) => c.trim() === `${COOKIE_NAME}=${PIN}`);
}

// Large-type, high-contrast CSS tuned for shop-floor use on shared phones/tablets.
// REVIEW: bigger tap targets, equal prominence for scan vs manual entry, an
// always-visible stage banner, and a required reason-before-submit guard were
// all called out by the review pass and are reflected here.
const CSS = `
  * { box-sizing:border-box; -webkit-tap-highlight-color: rgba(30,123,52,0.25); }
  html,body { margin:0; padding:0; background:#f2f8f3; font-family:Arial,Helvetica,sans-serif; color:#1e2b22; }
  body { padding-bottom:40px; }
  header.topbar { background:#1E7B34; color:#fff; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; }
  header.topbar .t { font-size:18px; font-weight:bold; }
  header.topbar a.logout { color:#dff2e3; font-size:13px; text-decoration:underline; }
  .wrap { max-width:520px; margin:0 auto; padding:16px; }
  .stagebar { background:#16241c; color:#fff; text-align:center; padding:10px; font-size:15px; font-weight:bold; letter-spacing:0.3px; cursor:pointer; }
  .stagebar .chg { font-weight:normal; font-size:12px; color:#a9d6b3; margin-left:8px; }
  .card { background:#fff; border-radius:10px; padding:18px; margin:16px 0; border:1px solid #dcebe0; box-shadow:0 1px 3px rgba(20,60,30,0.08); }
  h2 { margin:0 0 10px; font-size:18px; }
  .muted { color:#5c6b60; font-size:13px; }
  .biground { background:#1E7B34; color:#fff; border:none; border-radius:12px; padding:22px; font-size:20px; font-weight:bold; width:100%; cursor:pointer; }
  .biground:active { background:#155a26; }
  .bigsecondary { background:#fff; color:#1E7B34; border:2px solid #1E7B34; border-radius:12px; padding:18px; font-size:17px; font-weight:bold; width:100%; cursor:pointer; margin-top:12px; }
  .stagepick { display:flex; gap:12px; flex-direction:column; }
  .stagebtn { background:#fff; border:2px solid #1E7B34; color:#155a26; padding:26px; font-size:20px; font-weight:bold; border-radius:12px; cursor:pointer; }
  .stagebtn:active { background:#e6f4e9; }
  .infogrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:6px; }
  .infoitem { background:#f4f8f5; border-radius:8px; padding:10px 12px; }
  .infoitem .lbl { font-size:11px; color:#5c6b60; text-transform:uppercase; letter-spacing:0.4px; }
  .infoitem .val { font-size:17px; font-weight:bold; color:#155a26; margin-top:2px; word-break:break-word; }
  .infoitem .val.undef { color:#a08b3a; font-weight:normal; font-style:italic; font-size:14px; }
  label { display:block; font-size:14px; font-weight:bold; margin:16px 0 6px; }
  input[type=number], input[type=text] { width:100%; padding:14px; font-size:19px; border:2px solid #bcd8c3; border-radius:8px; font-family:inherit; }
  input:focus { outline:none; border-color:#1E7B34; }
  .countrow { display:flex; gap:10px; }
  .countrow > div { flex:1; }
  .countbox input { text-align:center; font-weight:bold; }
  .countbox.ok input { border-color:#1E7B34; color:#155a26; }
  .countbox.reject input { border-color:#c0453f; color:#a83232; }
  .countbox.lost input { background:#f0f0ee; color:#5c6b60; }
  .tiles { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
  .tile { border:2px solid #bcd8c3; background:#fff; border-radius:20px; padding:10px 14px; font-size:14px; cursor:pointer; color:#1e2b22; }
  .tile.sel { background:#1E7B34; border-color:#1E7B34; color:#fff; }
  textarea { width:100%; padding:12px; font-size:16px; border:2px solid #bcd8c3; border-radius:8px; font-family:inherit; min-height:70px; }
  .err { background:#fdecea; color:#a83232; padding:12px; border-radius:8px; margin:12px 0; font-size:15px; border:1px solid #f3c7c0; }
  .ok { background:#e6f4e9; color:#155a26; padding:12px; border-radius:8px; margin:12px 0; font-size:15px; border:1px solid #bfe3c8; }
  .center { text-align:center; }
  .bigcheck { font-size:64px; line-height:1; margin:10px 0; }
  #qr-reader { width:100%; border-radius:10px; overflow:hidden; margin-top:10px; }
  .linklike { background:none; border:none; color:#1E7B34; text-decoration:underline; font-size:14px; cursor:pointer; padding:6px; }
  .spinner { border:4px solid #dcebe0; border-top:4px solid #1E7B34; border-radius:50%; width:34px; height:34px; animation:spin 0.8s linear infinite; margin:16px auto; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .disabled { opacity:0.45; pointer-events:none; }
`;

function shell(title, bodyHtml, extraHead) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>${esc(title)}</title><style>${CSS}</style>${extraHead || ""}</head>
  <body>${bodyHtml}</body></html>`;
}

function loginPage(err) {
  const body = `
  <header class="topbar"><div class="t">Crown Quality Scan</div></header>
  <div class="wrap">
    <div class="card">
      <h2>Station sign-in</h2>
      ${err ? `<div class="err">${esc(err)}</div>` : ""}
      <p class="muted">Enter the pilot PIN once for this device. You won't need to enter it again on this phone/tablet.</p>
      <form method="POST" action="/login">
        <label>PIN</label>
        <input type="text" inputmode="numeric" name="pin" autofocus>
        <button class="biground" type="submit" style="margin-top:16px;">Enter</button>
      </form>
    </div>
  </div>`;
  return shell("Sign in — Crown Quality Scan", body);
}

async function handleLogin(request) {
  const form = await request.formData();
  const pin = (form.get("pin") || "").trim();
  if (pin === PIN) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        "Set-Cookie": `${COOKIE_NAME}=${PIN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
      },
    });
  }
  return new Response(loginPage("Incorrect PIN."), {
    status: 401,
    headers: { "Content-Type": "text/html" },
  });
}

function handleLogout() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  });
}

// ---------- Main scan-entry page (single-page app, vanilla JS) ----------

function mainPage() {
  const stagesJson = safeJSON(STAGES);
  const reasonsJson = safeJSON(REASONS);
  const body = `
  <header class="topbar">
    <div class="t">Crown Quality Scan</div>
    <a class="logout" href="/logout">Sign out</a>
  </header>
  <div id="stagebar" class="stagebar" style="display:none;" onclick="changeStage()"></div>
  <div class="wrap">

    <div id="view-stagepick" style="display:none;">
      <div class="card">
        <h2>Which station is this?</h2>
        <p class="muted">Pick once — this device will remember it.</p>
        <div class="stagepick" id="stagepickBtns"></div>
      </div>
    </div>

    <div id="view-scan" style="display:none;">
      <div class="card center">
        <h2>Scan the lot's QR code</h2>
        <button class="biground" onclick="startScan()">&#128247; SCAN QR CODE</button>
        <div id="qr-reader"></div>
        <button class="linklike" id="cancelScanBtn" style="display:none;" onclick="stopScan()">Cancel scan</button>
      </div>
      <div class="card">
        <h2>Or type the Lot ID</h2>
        <p class="muted">Use this if the camera doesn't work or the label is damaged.</p>
        <input type="text" id="manualLot" placeholder="LOT-20260815-0084" autocapitalize="characters">
        <button class="bigsecondary" onclick="submitManualLot()">USE THIS LOT ID</button>
      </div>
    </div>

    <div id="view-loading" style="display:none;" class="center">
      <div class="spinner"></div>
      <p class="muted">Looking up lot...</p>
    </div>

    <div id="view-error" style="display:none;">
      <div class="err" id="errorText"></div>
      <button class="biground" onclick="resetToScan()">TRY AGAIN</button>
    </div>

    <div id="view-alreadyrecorded" style="display:none;">
      <div class="card" id="infoCardAlready"></div>
      <div class="ok">This lot's entry for this station is already recorded. If it's wrong, please ask your supervisor to correct it (Correct an Entry, on the office system).</div>
      <button class="biground" onclick="resetToScan()">SCAN NEXT LOT</button>
    </div>

    <div id="view-entry" style="display:none;">
      <div class="card" id="infoCard"></div>
      <div class="card">
        <div id="priorMissingNote"></div>
        <label>Quantity received</label>
        <input type="number" inputmode="numeric" min="0" id="qtyReceived">
        <p class="muted">Pre-filled by the system. Change it only if what you physically have is different.</p>

        <div class="countrow">
          <div class="countbox ok">
            <label>OK pieces</label>
            <input type="number" inputmode="numeric" min="0" id="qtyOk" value="0">
          </div>
          <div class="countbox reject">
            <label>Rejected pieces</label>
            <input type="number" inputmode="numeric" min="0" id="qtyReject" value="0">
          </div>
        </div>
        <div class="countbox lost" style="margin-top:10px;">
          <label>Lost pieces (calculated automatically)</label>
          <input type="text" id="qtyLost" value="0" readonly>
        </div>

        <div id="reasonBlock" style="display:none;">
          <label>Why were pieces rejected?</label>
          <div class="tiles" id="reasonTiles"></div>
          <input type="text" id="reasonOther" placeholder="Type the reason" style="display:none; margin-top:8px;">
        </div>

        <label>Comments <span class="muted">(optional)</span></label>
        <textarea id="comments" placeholder="Anything worth noting..."></textarea>

        <label>Operator ID</label>
        <input type="text" id="operatorId" placeholder="Your operator ID">

        <div id="entryErr" class="err" style="display:none;"></div>
        <button class="biground" style="margin-top:18px;" onclick="submitEntry()">SUBMIT</button>
      </div>
    </div>

    <div id="view-confirm" style="display:none;" class="center">
      <div class="card">
        <div class="bigcheck">&#9989;</div>
        <h2>Saved!</h2>
        <p class="muted" id="confirmDetail"></p>
        <button class="biground" onclick="resetToScan()">SCAN NEXT LOT (<span id="cd">5</span>)</button>
      </div>
    </div>

  </div>
  <script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
  <script>
  const STAGES = ${stagesJson};
  const REASONS = ${reasonsJson};
  let currentStage = null;
  let currentLot = null;
  let selectedReason = null;
  let html5QrCode = null;
  let countdownTimer = null;

  function views() { return ['stagepick','scan','loading','error','alreadyrecorded','entry','confirm']; }
  function show(name) {
    views().forEach(v => document.getElementById('view-'+v).style.display = (v===name ? 'block' : 'none'));
    document.getElementById('stagebar').style.display = currentStage ? 'block' : 'none';
  }

  function stageName(id) { const s = STAGES.find(x => x.id === id); return s ? s.name : ('Stage '+id); }

  function initStage() {
    const params = new URLSearchParams(location.search);
    const urlStage = parseInt(params.get('stage'), 10);
    const savedStage = parseInt(localStorage.getItem('crownInspStage'), 10);
    if (urlStage && STAGES.some(s => s.id === urlStage)) {
      currentStage = urlStage;
      localStorage.setItem('crownInspStage', String(urlStage));
    } else if (savedStage && STAGES.some(s => s.id === savedStage)) {
      currentStage = savedStage;
    }
    updateStageBar();
    const urlLot = params.get('lot');
    if (currentStage && urlLot) {
      show('loading');
      lookupLot(urlLot.trim());
    } else if (currentStage) {
      show('scan');
    } else {
      renderStagePicker();
      show('stagepick');
    }
  }

  function updateStageBar() {
    const bar = document.getElementById('stagebar');
    bar.innerHTML = currentStage ? ('STATION: ' + stageName(currentStage).toUpperCase() + ' <span class="chg">(tap to change)</span>') : '';
  }

  function renderStagePicker() {
    const box = document.getElementById('stagepickBtns');
    box.innerHTML = '';
    STAGES.forEach(s => {
      const b = document.createElement('button');
      b.className = 'stagebtn';
      b.textContent = s.name;
      b.onclick = () => { currentStage = s.id; localStorage.setItem('crownInspStage', String(s.id)); updateStageBar(); show('scan'); };
      box.appendChild(b);
    });
  }

  function changeStage() {
    if (!confirm('Change this device\\'s station? Only do this if the tablet has genuinely moved to a different station.')) return;
    currentStage = null;
    localStorage.removeItem('crownInspStage');
    renderStagePicker();
    show('stagepick');
  }

  function resetToScan() {
    clearInterval(countdownTimer);
    currentLot = null;
    selectedReason = null;
    if (history.replaceState) history.replaceState(null, '', location.pathname + (currentStage ? ('?stage='+currentStage) : ''));
    show('scan');
  }

  function showError(msg) {
    stopScan();
    document.getElementById('errorText').textContent = msg;
    show('error');
  }

  function submitManualLot() {
    const v = document.getElementById('manualLot').value.trim();
    if (!v) { alert('Please type a Lot ID.'); return; }
    show('loading');
    lookupLot(v);
  }

  function startScan() {
    document.getElementById('qr-reader').style.display = 'block';
    document.getElementById('cancelScanBtn').style.display = 'inline-block';
    html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 230 },
      (decodedText) => {
        let lot = decodedText.trim();
        try {
          const u = new URL(decodedText);
          const p = u.searchParams.get('lot');
          if (p) lot = p.trim();
        } catch (e) { /* plain text QR, use as-is */ }
        stopScan();
        show('loading');
        lookupLot(lot);
      },
      () => {}
    ).catch(() => {
      showError('Could not open the camera. Please type the Lot ID below instead, or check camera permission for this site.');
    });
  }

  function stopScan() {
    document.getElementById('qr-reader').style.display = 'none';
    document.getElementById('cancelScanBtn').style.display = 'none';
    if (html5QrCode) { html5QrCode.stop().catch(() => {}); html5QrCode = null; }
  }

  async function lookupLot(lotId) {
    try {
      const res = await fetch('/api/lookup?lot=' + encodeURIComponent(lotId) + '&stage=' + currentStage);
      const data = await res.json();
      if (!data.ok) { showError(data.error || 'Lot not found. Please check the code and try again.'); return; }
      currentLot = data;
      renderInfo(data.already_recorded ? 'infoCardAlready' : 'infoCard', data);
      if (data.already_recorded) {
        show('alreadyrecorded');
      } else {
        renderEntryForm(data);
        show('entry');
      }
    } catch (e) {
      showError('Network problem — please try again.');
    }
  }

  function fmtField(v) { return (v === null || v === undefined || v === 0 || v === '0') ? '<span class="val undef">Not defined</span>' : ('<span class="val">' + esc(String(v)) + '</span>'); }
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function renderInfo(elId, d) {
    document.getElementById(elId).innerHTML =
      '<h2>' + esc(d.lot_id) + '</h2>' +
      '<p class="muted">Station: ' + esc(stageName(currentStage)) + '</p>' +
      '<div class="infogrid">' +
        '<div class="infoitem"><div class="lbl">Model #</div>' + fmtField(d.model_code) + '</div>' +
        '<div class="infoitem"><div class="lbl">Finish #</div>' + fmtField(d.finishing_number) + '</div>' +
        '<div class="infoitem"><div class="lbl">Plating #</div>' + fmtField(d.plating_number) + '</div>' +
        '<div class="infoitem"><div class="lbl">Laser marking #</div>' + fmtField(d.laser_marking_number) + '</div>' +
      '</div>';
  }

  function renderEntryForm(d) {
    document.getElementById('qtyReceived').value = (d.qty_received_default === null ? 0 : d.qty_received_default);
    document.getElementById('qtyOk').value = 0;
    document.getElementById('qtyReject').value = 0;
    document.getElementById('qtyLost').value = 0;
    document.getElementById('comments').value = '';
    document.getElementById('operatorId').value = '';
    document.getElementById('entryErr').style.display = 'none';
    selectedReason = null;
    document.getElementById('reasonOther').style.display = 'none';
    document.getElementById('reasonOther').value = '';
    document.getElementById('priorMissingNote').innerHTML = d.prior_stage_missing
      ? '<div class="err">The previous stage hasn\\'t been recorded for this lot yet. Please confirm the received quantity with your supervisor before continuing.</div>' : '';
    const tiles = document.getElementById('reasonTiles');
    tiles.innerHTML = '';
    REASONS.forEach(r => {
      const t = document.createElement('div');
      t.className = 'tile';
      t.textContent = r;
      t.onclick = () => selectReason(r, t);
      tiles.appendChild(t);
    });
    recalcLost();
  }

  function selectReason(r, el) {
    document.querySelectorAll('#reasonTiles .tile').forEach(t => t.classList.remove('sel'));
    el.classList.add('sel');
    selectedReason = r;
    document.getElementById('reasonOther').style.display = (r === 'Other') ? 'block' : 'none';
  }

  function recalcLost() {
    const rec = parseInt(document.getElementById('qtyReceived').value, 10) || 0;
    const ok = parseInt(document.getElementById('qtyOk').value, 10) || 0;
    const rej = parseInt(document.getElementById('qtyReject').value, 10) || 0;
    document.getElementById('reasonBlock').style.display = rej > 0 ? 'block' : 'none';
    const lost = rec - ok - rej;
    document.getElementById('qtyLost').value = lost;
  }
  ['qtyReceived','qtyOk','qtyReject'].forEach(id => {
    document.addEventListener('input', (e) => { if (e.target && e.target.id === id) recalcLost(); });
  });

  async function submitEntry() {
    const rec = parseInt(document.getElementById('qtyReceived').value, 10);
    const ok = parseInt(document.getElementById('qtyOk').value, 10);
    const rej = parseInt(document.getElementById('qtyReject').value, 10);
    const opId = document.getElementById('operatorId').value.trim();
    const errBox = document.getElementById('entryErr');
    errBox.style.display = 'none';

    if (isNaN(rec) || rec < 0) { return fieldErr('Please enter the quantity received.'); }
    if (isNaN(ok) || ok < 0) { return fieldErr('Please enter the OK piece count.'); }
    if (isNaN(rej) || rej < 0) { return fieldErr('Please enter the rejected piece count.'); }
    if (ok + rej > rec) { return fieldErr('OK + Rejected can\\'t be more than what was received. Please check your counts.'); }
    if (rej > 0 && !selectedReason) { return fieldErr('Please tap a reason for the rejected pieces.'); }
    if (rej > 0 && selectedReason === 'Other' && !document.getElementById('reasonOther').value.trim()) { return fieldErr('Please type the rejection reason.'); }
    if (!opId) { return fieldErr('Please enter your Operator ID.'); }

    const reasonToSend = rej > 0 ? (selectedReason === 'Other' ? document.getElementById('reasonOther').value.trim() : selectedReason) : '';

    const body = new URLSearchParams({
      lot_id: currentLot.lot_id,
      stage_id: String(currentStage),
      qty_received: String(rec),
      qty_ok: String(ok),
      qty_reject: String(rej),
      reject_reason: reasonToSend,
      comments: document.getElementById('comments').value.trim(),
      operator_id: opId,
    });

    try {
      const res = await fetch('/submit', { method: 'POST', body });
      const data = await res.json();
      if (!data.ok) { return fieldErr(data.error || 'Could not save. Please try again.'); }
      if (data.duplicate) {
        renderInfo('infoCardAlready', currentLot);
        show('alreadyrecorded');
        return;
      }
      document.getElementById('confirmDetail').textContent =
        'OK: ' + ok + '   Rejected: ' + rej + '   Lost: ' + (rec - ok - rej);
      show('confirm');
      let secs = 5;
      document.getElementById('cd').textContent = secs;
      countdownTimer = setInterval(() => {
        secs -= 1;
        if (secs <= 0) { clearInterval(countdownTimer); resetToScan(); }
        else { document.getElementById('cd').textContent = secs; }
      }, 1000);
    } catch (e) {
      fieldErr('Network problem — please try again.');
    }
  }

  function fieldErr(msg) {
    const b = document.getElementById('entryErr');
    b.textContent = msg;
    b.style.display = 'block';
  }

  initStage();
  </script>`;
  return shell("Crown Quality Scan", body);
}

// ---------- Label generator page (office use — same app, not part of operator flow) ----------

async function labelsPage(env) {
  const { results } = await env.DB.prepare(
    "SELECT lot_id FROM lots ORDER BY created_at DESC LIMIT 25"
  ).all();
  const options = results.map((r) => `<option value="${esc(r.lot_id)}">`).join("");
  const body = `
  <header class="topbar"><div class="t">Crown Quality Scan — QR Labels</div><a class="logout" href="/logout">Sign out</a></header>
  <div class="wrap">
    <div class="card">
      <h2>Generate a lot's QR label</h2>
      <p class="muted">For office/supervisor use — print one label per lot and stick it on the traveler card or bin. Operators scan this at each station.</p>
      <label>Lot ID</label>
      <input list="recentlots" id="labelLot" placeholder="LOT-20260815-0084">
      <datalist id="recentlots">${options}</datalist>
      <button class="biground" onclick="genLabel()">GENERATE</button>
    </div>
    <div class="card center" id="labelOut" style="display:none;">
      <div id="qrcanvas" style="display:flex; justify-content:center;"></div>
      <p style="font-size:18px; font-weight:bold; margin:10px 0 0;" id="labelLotText"></p>
      <p class="muted">Scan to open Crown Quality Scan for this lot</p>
      <button class="bigsecondary" onclick="window.print()">PRINT LABEL</button>
    </div>
    <p class="muted center" style="margin-top:24px;"><a href="/">&larr; Back to scan entry</a></p>
  </div>
  <style>@media print { header.topbar, .card:not(#labelOut), .bigsecondary, p.muted { display:none !important; } #labelOut { border:none; box-shadow:none; } }</style>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
  <script>
  function genLabel() {
    const lot = document.getElementById('labelLot').value.trim();
    if (!lot) { alert('Please enter a Lot ID.'); return; }
    const url = location.origin + '/?lot=' + encodeURIComponent(lot);
    const container = document.getElementById('qrcanvas');
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    QRCode.toCanvas(canvas, url, { width: 240, margin: 1 }, function (err) {
      if (err) { alert('Could not generate QR code.'); return; }
      document.getElementById('labelLotText').textContent = lot;
      document.getElementById('labelOut').style.display = 'block';
    });
  }
  </script>`;
  return shell("QR Labels — Crown Quality Scan", body);
}

// ---------- API ----------

async function apiLookup(env, request) {
  const url = new URL(request.url);
  const lotId = (url.searchParams.get("lot") || "").trim();
  const stageId = parseInt(url.searchParams.get("stage") || "", 10);
  if (!lotId) return Response.json({ ok: false, error: "Please scan or type a Lot ID." });
  if (!STAGES.some((s) => s.id === stageId)) return Response.json({ ok: false, error: "Unknown station." });

  const lot = await env.DB.prepare(
    `SELECT l.lot_id, l.qty_created, l.finishing_number, l.plating_number, l.laser_marking_number, m.model_code
     FROM lots l JOIN models m ON m.model_id = l.model_id WHERE l.lot_id = ?`
  ).bind(lotId).first();
  if (!lot) return Response.json({ ok: false, error: "Lot " + lotId + " was not found. Please check the code." });

  const already = await env.DB.prepare(
    "SELECT 1 FROM stage_events_effective WHERE lot_id = ? AND stage_id = ? AND is_active = 1 LIMIT 1"
  ).bind(lotId, stageId).first();

  let qtyReceivedDefault = null;
  let priorMissing = false;
  if (stageId === STAGES[0].id) {
    qtyReceivedDefault = lot.qty_created;
  } else {
    const priorStageId = STAGES[STAGES.findIndex((s) => s.id === stageId) - 1]?.id;
    if (priorStageId) {
      const prior = await env.DB.prepare(
        "SELECT effective_qty_ok FROM stage_events_effective WHERE lot_id = ? AND stage_id = ? AND is_active = 1 LIMIT 1"
      ).bind(lotId, priorStageId).first();
      if (prior) qtyReceivedDefault = prior.effective_qty_ok;
      else priorMissing = true;
    }
  }

  return Response.json({
    ok: true,
    lot_id: lot.lot_id,
    model_code: lot.model_code,
    finishing_number: lot.finishing_number,
    plating_number: lot.plating_number,
    laser_marking_number: lot.laser_marking_number,
    already_recorded: !!already,
    qty_received_default: qtyReceivedDefault,
    prior_stage_missing: priorMissing,
  });
}

async function apiSubmit(env, request) {
  const form = await request.formData();
  const lotId = (form.get("lot_id") || "").trim();
  const stageId = parseInt(form.get("stage_id") || "", 10);
  const qtyReceived = parseInt(form.get("qty_received") || "", 10);
  const qtyOk = parseInt(form.get("qty_ok") || "", 10);
  const qtyReject = parseInt(form.get("qty_reject") || "", 10);
  const rejectReason = (form.get("reject_reason") || "").trim();
  const comments = (form.get("comments") || "").trim();
  const operatorId = (form.get("operator_id") || "").trim();

  if (!lotId || !STAGES.some((s) => s.id === stageId)) return Response.json({ ok: false, error: "Missing lot or station." });
  if ([qtyReceived, qtyOk, qtyReject].some((n) => isNaN(n) || n < 0)) return Response.json({ ok: false, error: "Please check the piece counts." });
  if (qtyOk + qtyReject > qtyReceived) return Response.json({ ok: false, error: "OK + Rejected can't be more than what was received." });
  if (!operatorId) return Response.json({ ok: false, error: "Please enter your Operator ID." });
  if (qtyReject > 0 && !rejectReason) return Response.json({ ok: false, error: "Please give a reason for the rejected pieces." });

  const qtyLost = qtyReceived - qtyOk - qtyReject;
  const ts = new Date().toISOString();

  // REVIEW: atomic insert-if-not-already-recorded, guarding against the race of
  // two devices submitting the same lot+stage near-simultaneously — a single
  // SQL statement rather than a separate check-then-insert.
  const result = await env.DB.prepare(
    `INSERT INTO stage_events (lot_id, stage_id, qty_received, qty_ok, qty_reject, qty_lost, reject_reason, operator_id, comments, event_timestamp)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM stage_events_effective WHERE lot_id = ? AND stage_id = ? AND is_active = 1
     )`
  ).bind(lotId, stageId, qtyReceived, qtyOk, qtyReject, qtyLost, rejectReason || null, operatorId, comments || null, ts, lotId, stageId).run();

  if (!result.meta || result.meta.changes === 0) {
    return Response.json({ ok: true, duplicate: true });
  }
  return Response.json({ ok: true, duplicate: false });
}

// ---------- Router ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/login" && request.method === "POST") return handleLogin(request);
    if (url.pathname === "/logout") return handleLogout();

    if (!isAuthed(request)) {
      return new Response(loginPage(null), { headers: { "Content-Type": "text/html" } });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(mainPage(), { headers: { "Content-Type": "text/html" } });
    }
    if (url.pathname === "/labels" && request.method === "GET") {
      return new Response(await labelsPage(env), { headers: { "Content-Type": "text/html" } });
    }
    if (url.pathname === "/api/lookup" && request.method === "GET") {
      return apiLookup(env, request);
    }
    if (url.pathname === "/submit" && request.method === "POST") {
      return apiSubmit(env, request);
    }

    return new Response("Not found", { status: 404 });
  },
};
