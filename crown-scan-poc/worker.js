// Crown Production Scan Entry App — Cloudflare Worker (v3)
// Updated 18 Aug 2026 per Jain's UX/product review request:
//  1. Lost quantity is now auto-calculated (Received - OK - Reject), never typed
//     manually. This also closes the earlier CHECK-constraint gap: since Lost is
//     always derived, OK+Reject+Lost == Received by construction whenever the
//     OK+Reject <= Received guard passes, so the database's original two-column
//     constraint is now sufficient again.
//  2. "Look up a lot" renamed to "Search a lot".
//  3. New Management Reports page: stage-wise reject/loss rates aggregated across
//     all lots, for decision-making about where quality issues concentrate.
//  4. Persistent left-sidebar navigation (styled after the Quality Inspect app
//     Jain referenced), replacing the old single-flow page-to-page links.
//  5. Lot detail page now leads with a bar chart (Received vs OK vs Reject vs
//     Lost per stage) and a numbers table, with the existing per-stage cards below.
//  6. New "Report an Issue" feature: a lightweight, lot/stage-optional issue log,
//     separate from the quantity-correction workflow, visible to management.
//
// Data here is the same illustrative/synthetic sample set used in the PoC —
// not real Arihant production numbers.
//
// Access: a shared PIN gate (cookie-based) protects this since it's a public
// URL and the named-individual access list (Project Plan A1.7) hasn't been
// built yet. This is a stand-in, not the real RBAC. Management Reports and
// Supervisor Review are reachable by anyone with the shared PIN in this pilot
// phase — deliberately punted, not an oversight.

const PILOT_STAGES = [
  { id: 1, name: "Machine Shop" },
  { id: 2, name: "1st Inspection" },
];

const PIN = "REDACTED_SET_YOUR_OWN_PIN"; // shared pilot PIN — change before any real rollout (redacted for public/shared repo)
const COOKIE_NAME = "crownauth";

const NAV_ITEMS = [
  { key: "search", label: "Search a Lot", href: "/" },
  { key: "correct", label: "Correct an Entry", href: "/correct-entry" },
  { key: "issue", label: "Report an Issue", href: "/report-issue" },
  { key: "reports", label: "Management Reports", href: "/reports" },
  { key: "supervisor", label: "Supervisor Review", href: "/supervisor" },
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

const SHARED_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; background:#f2f8f3; margin:0; padding:0; color:#1e2b22; }
  .card { background:#fff; border-radius:8px; padding:20px; margin-bottom:16px; border:1px solid #dcebe0; box-shadow:0 1px 3px rgba(20,60,30,0.08); }
  label { display:block; font-size:13px; font-weight:bold; margin:12px 0 4px; color:#1e2b22; }
  input, select, textarea { width:100%; padding:8px; font-size:15px; border:1px solid #bcd8c3; border-radius:4px; font-family:inherit; }
  input:focus, select:focus, textarea:focus { outline:none; border-color:#1E7B34; box-shadow:0 0 0 2px rgba(30,123,52,0.15); }
  input[readonly] { background:#f4f8f5; color:#166028; font-weight:bold; }
  button { background:#1E7B34; color:#fff; border:none; padding:10px 18px; border-radius:4px; font-size:15px; cursor:pointer; margin-top:14px; }
  button:hover { background:#166028; }
  button.secondary { background:#7a8c7e; }
  button.secondary:hover { background:#647266; }
  button.danger { background:#a83232; }
  button.danger:hover { background:#8a2828; }
  .row { display:flex; gap:10px; }
  .row3 { display:flex; gap:8px; }
  .row3 > div { flex:1; }
  .row > div { flex:1; }
  .err { background:#fdecea; color:#a83232; padding:10px; border-radius:4px; margin-bottom:12px; font-size:14px; border:1px solid #f3c7c0; }
  .ok { background:#e6f4e9; color:#1E7B34; padding:10px; border-radius:4px; margin-bottom:12px; font-size:14px; border:1px solid #bfe3c8; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:8px; border-bottom:1px solid #e3ede5; }
  th { background:#f4f8f5; font-weight:700; color:#155a26; }
  .muted { color:#6f7d73; font-size:12px; }
  .code { font-family: Consolas, monospace; background:#eaf4ec; padding:2px 6px; border-radius:3px; color:#155a26; }
  a { color:#1E7B34; }
  .badge { display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:bold; }
  .badge-open { background:#fdecea; color:#a83232; }
  .badge-resolved { background:#e6f4e9; color:#1E7B34; }
  .badge-low { background:#eef2ee; color:#556b5c; }
  .badge-medium { background:#fff3cd; color:#8a6d00; }
  .badge-high { background:#fdecea; color:#a83232; }
  .canvaswrap { position:relative; width:100%; background:#fff; border:1px solid #dcebe0; border-radius:8px; padding:14px; margin-bottom:16px; }
`;

function authCardShell(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title><style>${SHARED_CSS}
  body{display:flex; align-items:flex-start; justify-content:center; padding-top:60px;}
  .authwrap{width:100%; max-width:420px;}
  header.topbar{background:#1E7B34; color:#fff; padding:16px 20px; border-radius:8px 8px 0 0;}
  header.topbar h1{margin:0; font-size:19px;}
  header.topbar .sub{font-size:12px; opacity:0.9; margin-top:2px;}
  .authcard{border-radius:0 0 8px 8px; margin-bottom:0;}
  </style><script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script></head><body>
  <div class="authwrap">
    <header class="topbar"><h1>Crown Production — Scan Entry</h1><div class="sub">Cloudflare pilot demo · illustrative data, not real Arihant production numbers</div></header>
    <div class="card authcard">${body}</div>
  </div>
  </body></html>`;
}

function appShell(activeKey, heading, sub, body) {
  const navHtml = NAV_ITEMS.map((item) =>
    `<a href="${item.href}"${item.key === activeKey ? ' class="active"' : ""}>${esc(item.label)}</a>`
  ).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(heading)} — Crown Scan Entry</title><style>${SHARED_CSS}
  html, body { height:100%; }
  body { display:flex; min-height:100vh; }
  .sidebar { width:230px; flex-shrink:0; background:#16241c; color:#e8f0ea; display:flex; flex-direction:column; padding:20px 0; }
  .sidebar .brand { padding:0 20px 18px; font-size:17px; font-weight:bold; color:#fff; border-bottom:1px solid #2a3d31; margin-bottom:12px; }
  .sidebar .brand .dot { color:#4CAF50; margin-right:6px; }
  .sidebar nav { flex:1; }
  .sidebar nav a { display:block; padding:11px 20px; color:#c9d6cd; text-decoration:none; font-size:14px; border-left:3px solid transparent; }
  .sidebar nav a:hover { background:#1f3327; color:#fff; }
  .sidebar nav a.active { background:#1f3327; color:#fff; border-left-color:#4CAF50; font-weight:bold; }
  .sidebar .logoutbox { margin:16px 20px 0; }
  .sidebar .logoutbox a { display:block; text-align:center; background:#a83232; color:#fff; padding:10px; border-radius:4px; text-decoration:none; font-size:14px; }
  .sidebar .logoutbox a:hover { background:#8a2828; }
  .main { flex:1; min-width:0; }
  header.topbar { background:#1E7B34; color:#fff; padding:18px 28px; }
  header.topbar h1 { margin:0; font-size:19px; }
  header.topbar .sub { font-size:12px; opacity:0.9; margin-top:2px; }
  .content { max-width:920px; margin:24px auto; padding:0 20px 48px; }
  @media (max-width:760px) {
    body { flex-direction:column; }
    .sidebar { width:100%; flex-direction:row; overflow-x:auto; padding:10px 0; }
    .sidebar .brand, .sidebar .logoutbox { display:none; }
    .sidebar nav { display:flex; flex:none; }
    .sidebar nav a { border-left:none; border-bottom:3px solid transparent; white-space:nowrap; }
    .sidebar nav a.active { border-left-color:transparent; border-bottom-color:#4CAF50; }
  }
  </style><script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script></head><body>
  <div class="sidebar">
    <div class="brand"><span class="dot">&#9679;</span>Crown Scan Entry</div>
    <nav>${navHtml}</nav>
    <div class="logoutbox"><a href="/logout">Logout</a></div>
  </div>
  <div class="main">
    <header class="topbar"><h1>${esc(heading)}</h1><div class="sub">${esc(sub)}</div></header>
    <div class="content">${body}</div>
  </div>
  </body></html>`;
}

function isAuthed(request) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.split(";").some((c) => c.trim() === `${COOKIE_NAME}=${PIN}`);
}

function loginPage(err) {
  return authCardShell("Sign in", `
    <h2>Pilot access</h2>
    ${err ? `<div class="err">${esc(err)}</div>` : ""}
    <p class="muted">Shared PIN for the POC pilot — a placeholder until the named-individual access list (Project Plan A1.7) is built.</p>
    <form method="POST" action="/login">
      <label>PIN</label>
      <input type="password" name="pin" autofocus>
      <button type="submit">Enter</button>
    </form>`);
}

async function handleLogin(request) {
  const form = await request.formData();
  const pin = form.get("pin") || "";
  if (pin === PIN) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        "Set-Cookie": `${COOKIE_NAME}=${PIN}; Path=/; HttpOnly; SameSite=Lax`,
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

function displayLotId(lot) {
  return `${lot.lot_id}.${lot.model_code}.${lot.finishing_number}.${lot.plating_number}.${lot.laser_marking_number}`;
}

function lotSearchForm(recentOptions, actionPath, heading, helpText) {
  return `
  <div class="card">
    <h2>${esc(heading)}</h2>
    <form method="GET" action="${actionPath}">
      <label>Lot ID</label>
      <input list="recent" name="id" placeholder="LOT-20260815-0084" autofocus>
      <datalist id="recent">${recentOptions}</datalist>
      <button type="submit">Search</button>
    </form>
    ${helpText ? `<p class="muted">${helpText}</p>` : ""}
  </div>`;
}

async function recentLotOptions(env) {
  const { results } = await env.DB.prepare(
    "SELECT lot_id FROM lots ORDER BY created_at DESC LIMIT 15"
  ).all();
  return results.map((r) => `<option value="${esc(r.lot_id)}">`).join("");
}

async function indexPage(env) {
  const options = await recentLotOptions(env);
  const body = lotSearchForm(
    options,
    "/lot",
    "Search a lot",
    `Pilot stages: ${esc(PILOT_STAGES.map((s) => s.name).join(", "))}`
  );
  return appShell("search", "Search a Lot", "Look up a lot's progress by Lot ID", body);
}

async function fetchStageEffectiveRows(env, lotId) {
  const rows = [];
  for (const stage of PILOT_STAGES) {
    const eff = await env.DB.prepare(
      `SELECT * FROM stage_events_effective WHERE lot_id = ? AND stage_id = ?`
    ).bind(lotId, stage.id).first();
    const pendingCorrection = eff
      ? await env.DB.prepare(
          `SELECT * FROM stage_event_corrections WHERE original_event_id = ? AND status = 'Pending'`
        ).bind(eff.event_id).first()
      : null;
    rows.push({ stage, eff, pendingCorrection });
  }
  return rows;
}

async function lotPage(env, lotId, notice) {
  const lot = await env.DB.prepare(
    `SELECT l.*, m.model_code FROM lots l JOIN models m ON m.model_id = l.model_id WHERE l.lot_id = ?`
  ).bind(lotId).first();
  if (!lot) {
    return appShell("search", "Lot not found", "", `
    <div class="card"><div class="err">Lot "${esc(lotId)}" not found.</div>
    <a href="/">&larr; Back to search</a></div>`);
  }

  const stageData = await fetchStageEffectiveRows(env, lotId);

  const chartLabels = stageData.map((r) => r.stage.name);
  const chartReceived = stageData.map((r) => (r.eff ? r.eff.qty_received : 0));
  const chartOk = stageData.map((r) => (r.eff ? r.eff.effective_qty_ok : 0));
  const chartReject = stageData.map((r) => (r.eff ? r.eff.effective_qty_reject : 0));
  const chartLost = stageData.map((r) => (r.eff ? r.eff.effective_qty_lost : 0));

  const tableRows = stageData.map((r) => {
    const e = r.eff;
    if (!e) {
      return `<tr><td>${esc(r.stage.name)}</td><td colspan="4" class="muted">No entry yet</td></tr>`;
    }
    return `<tr>
      <td>${esc(r.stage.name)}</td>
      <td>${e.qty_received}</td>
      <td>${e.effective_qty_ok}</td>
      <td>${e.effective_qty_reject}</td>
      <td>${e.effective_qty_lost}</td>
    </tr>`;
  }).join("");

  const chartCard = `
  <div class="canvaswrap"><canvas id="lotChart" height="110"></canvas></div>
  <div class="card">
    <h2>Quantity by stage</h2>
    <table>
      <tr><th>Stage</th><th>Received</th><th>OK</th><th>Reject</th><th>Lost</th></tr>
      ${tableRows}
    </table>
  </div>
  <script>
  new Chart(document.getElementById('lotChart'), {
    type: 'bar',
    data: {
      labels: ${safeJSON(chartLabels)},
      datasets: [
        { label: 'Received', data: ${safeJSON(chartReceived)}, backgroundColor: '#bcd8c3' },
        { label: 'OK', data: ${safeJSON(chartOk)}, backgroundColor: '#1E7B34' },
        { label: 'Reject', data: ${safeJSON(chartReject)}, backgroundColor: '#a83232' },
        { label: 'Lost', data: ${safeJSON(chartLost)}, backgroundColor: '#8a8a8a' }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' }, title: { display: true, text: 'Drop in OK quantity across stages' } },
      scales: { y: { beginAtZero: true } }
    }
  });
  </script>`;

  let stageRows = "";
  for (const { stage, eff, pendingCorrection } of stageData) {
    if (!eff) {
      stageRows += `
      <div class="card">
        <h3>${esc(stage.name)}</h3>
        <p class="muted">No entry yet.</p>
        <form method="POST" action="/entry" oninput="updateLost${stage.id}()">
          <input type="hidden" name="lot_id" value="${esc(lotId)}">
          <input type="hidden" name="stage_id" value="${stage.id}">
          <label>Qty received</label>
          <input type="number" id="qr${stage.id}" name="qty_received" required>
          <label>Qty OK / Qty Rejected</label>
          <div class="row3">
            <div><input type="number" id="ok${stage.id}" name="qty_ok" placeholder="OK" required></div>
            <div><input type="number" id="rj${stage.id}" name="qty_reject" placeholder="Reject" required value="0"></div>
            <div><input type="text" id="lost${stage.id}" readonly value="0" title="Calculated automatically"></div>
          </div>
          <p class="muted">Lost quantity (third box above) is calculated automatically as Received &minus; OK &minus; Reject — it is not entered manually.</p>
          <label>Reject reason (if any)</label>
          <input type="text" name="reject_reason">
          <label>Note on loss (optional)</label>
          <input type="text" name="lost_reason" placeholder="e.g. dropped, misplaced, unaccounted">
          <label>Operator ID</label>
          <input type="text" name="operator_id" placeholder="e.g. E-0142" required>
          <label>Operator name</label>
          <input type="text" name="operator_name" placeholder="e.g. Ramesh Kumar" required>
          <button type="submit">Record entry</button>
        </form>
        <script>
        function updateLost${stage.id}() {
          const r = parseFloat(document.getElementById('qr${stage.id}').value) || 0;
          const o = parseFloat(document.getElementById('ok${stage.id}').value) || 0;
          const j = parseFloat(document.getElementById('rj${stage.id}').value) || 0;
          document.getElementById('lost${stage.id}').value = Math.max(0, r - o - j);
        }
        </script>
      </div>`;
    } else if (pendingCorrection) {
      stageRows += `
      <div class="card">
        <h3>${esc(stage.name)}</h3>
        <p>Recorded: OK ${eff.effective_qty_ok} / Reject ${eff.effective_qty_reject} / Lost ${eff.effective_qty_lost} of ${eff.qty_received} received.</p>
        <div class="muted">A correction request is pending supervisor approval — numbers shown are unchanged until then.</div>
      </div>`;
    } else {
      stageRows += `
      <div class="card">
        <h3>${esc(stage.name)}</h3>
        <p>Recorded: OK ${eff.effective_qty_ok} / Reject ${eff.effective_qty_reject} / Lost ${eff.effective_qty_lost} of ${eff.qty_received} received.
        ${eff.was_amended ? '<span class="muted">(amended)</span>' : ""}</p>
        <p class="muted">Operator: ${esc(eff.operator_name)}${eff.operator_id ? " (" + esc(eff.operator_id) + ")" : ""}</p>
        <form method="GET" action="/correct">
          <input type="hidden" name="event_id" value="${eff.event_id}">
          <button type="submit" class="secondary">Request correction</button>
        </form>
      </div>`;
    }
  }

  const body = `
  <div class="card">
    <h2>${esc(lotId)}</h2>
    <p class="muted">Model ${esc(lot.model_code)} · Machine ${esc(lot.machine_code)} · Created ${esc(lot.created_at)} · Qty created ${lot.qty_created}</p>
    <p class="muted">Nomenclature ID: <span class="code">${esc(displayLotId(lot))}</span>
      ${lot.route ? ` · Route ${esc(lot.route)}` : " · route not yet assigned (post-Polishing)"}</p>
    ${notice ? `<div class="ok">${esc(notice)}</div>` : ""}
  </div>
  ${chartCard}
  ${stageRows}
  <p><a href="/">&larr; Search another lot</a></p>`;

  return appShell("search", `Lot ${lotId}`, "Stage-by-stage quantity and quality detail", body);
}

async function handleEntry(env, request) {
  const form = await request.formData();
  const lotId = form.get("lot_id");
  const stageId = Number(form.get("stage_id"));
  const qtyReceived = Number(form.get("qty_received"));
  const qtyOk = Number(form.get("qty_ok"));
  const qtyReject = Number(form.get("qty_reject"));
  const rejectReason = form.get("reject_reason") || null;
  const lostReason = form.get("lost_reason") || null;
  const operatorId = form.get("operator_id");
  const operatorName = form.get("operator_name");

  if (qtyOk + qtyReject > qtyReceived) {
    return new Response(await (async () => appShell("search", "Entry rejected", "", `
    <div class="card">
      <div class="err">Entry rejected: OK (${qtyOk}) + reject (${qtyReject}) exceeds qty received (${qtyReceived}).
      Nothing was saved — recheck the counts.</div>
      <a href="/lot?id=${encodeURIComponent(lotId)}">&larr; Back to lot</a>
    </div>`))(), { headers: { "Content-Type": "text/html" } });
  }

  const qtyLost = qtyReceived - qtyOk - qtyReject;

  try {
    await env.DB.prepare(
      `INSERT INTO stage_events (lot_id, stage_id, qty_received, qty_ok, qty_reject, qty_lost, reject_reason, lost_reason, operator_id, operator_name, event_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(lotId, stageId, qtyReceived, qtyOk, qtyReject, qtyLost, rejectReason, lostReason, operatorId, operatorName).run();
  } catch (e) {
    return new Response(appShell("search", "Entry rejected", "", `
    <div class="card"><div class="err">Database rejected this entry: ${esc(e.message)}</div>
    <a href="/lot?id=${encodeURIComponent(lotId)}">&larr; Back to lot</a></div>`), { headers: { "Content-Type": "text/html" } });
  }

  return Response.redirect(
    new URL(`/lot?id=${encodeURIComponent(lotId)}&notice=${encodeURIComponent("Entry recorded.")}`, request.url),
    302
  );
}

async function correctEntryPage(env, lotId) {
  if (!lotId) {
    const options = await recentLotOptions(env);
    const body = lotSearchForm(
      options,
      "/correct-entry",
      "Correct an entry",
      "Search for the lot whose entry needs correcting."
    );
    return appShell("correct", "Correct an Entry", "Search a lot, then request a correction on a recorded stage", body);
  }

  const lot = await env.DB.prepare(
    `SELECT l.*, m.model_code FROM lots l JOIN models m ON m.model_id = l.model_id WHERE l.lot_id = ?`
  ).bind(lotId).first();
  if (!lot) {
    return appShell("correct", "Lot not found", "", `
    <div class="card"><div class="err">Lot "${esc(lotId)}" not found.</div>
    <a href="/correct-entry">&larr; Back</a></div>`);
  }

  const stageData = await fetchStageEffectiveRows(env, lotId);
  let rows = "";
  for (const { stage, eff, pendingCorrection } of stageData) {
    if (!eff) {
      rows += `
      <div class="card">
        <h3>${esc(stage.name)}</h3>
        <p class="muted">No entry recorded yet for this stage — nothing to correct.</p>
      </div>`;
    } else if (pendingCorrection) {
      rows += `
      <div class="card">
        <h3>${esc(stage.name)}</h3>
        <p>Recorded: OK ${eff.effective_qty_ok} / Reject ${eff.effective_qty_reject} / Lost ${eff.effective_qty_lost} of ${eff.qty_received} received.</p>
        <div class="muted">A correction request is already pending supervisor approval for this entry.</div>
      </div>`;
    } else {
      rows += `
      <div class="card">
        <h3>${esc(stage.name)}</h3>
        <p>Recorded: OK ${eff.effective_qty_ok} / Reject ${eff.effective_qty_reject} / Lost ${eff.effective_qty_lost} of ${eff.qty_received} received.</p>
        <p class="muted">Operator: ${esc(eff.operator_name)}${eff.operator_id ? " (" + esc(eff.operator_id) + ")" : ""}</p>
        <form method="GET" action="/correct">
          <input type="hidden" name="event_id" value="${eff.event_id}">
          <button type="submit">Request correction</button>
        </form>
      </div>`;
    }
  }

  const body = `
  <div class="card">
    <h2>${esc(lotId)}</h2>
    <p class="muted">Model ${esc(lot.model_code)} · Machine ${esc(lot.machine_code)}</p>
  </div>
  ${rows}
  <p><a href="/correct-entry">&larr; Correct a different lot</a></p>`;

  return appShell("correct", "Correct an Entry", `Pick a stage to correct for ${lotId}`, body);
}

async function correctFormPage(env, eventId) {
  const ev = await env.DB.prepare(
    `SELECT se.*, l.lot_id AS lot_id FROM stage_events se JOIN lots l ON l.lot_id = se.lot_id WHERE se.event_id = ?`
  ).bind(eventId).first();
  if (!ev) return appShell("correct", "Not found", "", `<div class="card"><div class="err">Event not found.</div></div>`);

  const body = `
  <div class="card">
    <h2>Request correction — ${esc(ev.lot_id)}</h2>
    <p class="muted">Original: OK ${ev.qty_ok} / Reject ${ev.qty_reject} / Lost ${ev.qty_lost} of ${ev.qty_received} received. Recorded by ${esc(ev.operator_name)}${ev.operator_id ? " (" + esc(ev.operator_id) + ")" : ""}.</p>
    <form method="POST" action="/correct" oninput="updateCorrectedLost()">
      <input type="hidden" name="event_id" value="${ev.event_id}">
      <input type="hidden" id="qty_received_ref" value="${ev.qty_received}">
      <label>Corrected OK / Corrected Reject</label>
      <div class="row3">
        <div><input type="number" id="cok" name="corrected_qty_ok" value="${ev.qty_ok}" required></div>
        <div><input type="number" id="crj" name="corrected_qty_reject" value="${ev.qty_reject}" required></div>
        <div><input type="text" id="clost" readonly value="${ev.qty_lost}" title="Calculated automatically"></div>
      </div>
      <p class="muted">Lost (third box) recalculates automatically as Received &minus; corrected OK &minus; corrected Reject.</p>
      <label>Corrected reject reason</label>
      <input type="text" name="corrected_reject_reason" value="${esc(ev.reject_reason || "")}">
      <label>Note on loss (optional)</label>
      <input type="text" name="corrected_lost_reason" value="${esc(ev.lost_reason || "")}">
      <label>Reason for correction</label>
      <input type="text" name="reason" required placeholder="e.g. miscounted rejects, rechecked bin">
      <label>Requested by</label>
      <input type="text" name="requested_by" placeholder="Op-101" required>
      <button type="submit">Submit correction request</button>
    </form>
    <p class="muted">This goes to a supervisor for approval. The original entry is never edited — reported numbers change only after approval.</p>
  </div>
  <script>
  function updateCorrectedLost() {
    const r = parseFloat(document.getElementById('qty_received_ref').value) || 0;
    const o = parseFloat(document.getElementById('cok').value) || 0;
    const j = parseFloat(document.getElementById('crj').value) || 0;
    document.getElementById('clost').value = Math.max(0, r - o - j);
  }
  </script>`;

  return appShell("correct", "Request correction", `Lot ${ev.lot_id}`, body);
}

async function handleCorrect(env, request) {
  const form = await request.formData();
  const eventId = Number(form.get("event_id"));
  const correctedOk = Number(form.get("corrected_qty_ok"));
  const correctedReject = Number(form.get("corrected_qty_reject"));
  const correctedReason = form.get("corrected_reject_reason") || null;
  const correctedLostReason = form.get("corrected_lost_reason") || null;
  const reason = form.get("reason");
  const requestedBy = form.get("requested_by");

  const ev = await env.DB.prepare("SELECT lot_id, qty_received FROM stage_events WHERE event_id = ?").bind(eventId).first();
  if (!ev) {
    return new Response(appShell("correct", "Not found", "", `<div class="card"><div class="err">Original event not found.</div></div>`), { headers: { "Content-Type": "text/html" } });
  }

  if (correctedOk + correctedReject > ev.qty_received) {
    return new Response(appShell("correct", "Correction rejected", "", `
    <div class="card">
      <div class="err">Correction rejected: OK (${correctedOk}) + reject (${correctedReject}) exceeds qty received (${ev.qty_received}).</div>
      <a href="/correct?event_id=${eventId}">&larr; Back</a>
    </div>`), { headers: { "Content-Type": "text/html" } });
  }
  const correctedLost = ev.qty_received - correctedOk - correctedReject;

  await env.DB.prepare(
    `INSERT INTO stage_event_corrections
     (original_event_id, correction_type, corrected_qty_ok, corrected_qty_reject, corrected_qty_lost, corrected_reject_reason, corrected_lost_reason, reason, requested_by, requested_at, status)
     VALUES (?, 'Amendment', ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'Pending')`
  ).bind(eventId, correctedOk, correctedReject, correctedLost, correctedReason, correctedLostReason, reason, requestedBy).run();

  return Response.redirect(
    new URL(`/lot?id=${encodeURIComponent(ev.lot_id)}&notice=${encodeURIComponent("Correction requested — pending supervisor approval.")}`, request.url),
    302
  );
}

async function supervisorPage(env) {
  const { results } = await env.DB.prepare(
    `SELECT c.*, se.lot_id, se.qty_ok AS orig_ok, se.qty_reject AS orig_reject, se.qty_lost AS orig_lost, se.qty_received
     FROM stage_event_corrections c
     JOIN stage_events se ON se.event_id = c.original_event_id
     WHERE c.status = 'Pending'
     ORDER BY c.requested_at ASC`
  ).all();

  if (results.length === 0) {
    return appShell("supervisor", "Supervisor Review", "Pending corrections awaiting approval", `
    <div class="card"><p class="muted">No pending corrections.</p></div>`);
  }

  const rows = results.map((c) => `
    <div class="card">
      <h3>${esc(c.lot_id)} — correction #${c.correction_id}</h3>
      <p>Original: OK ${c.orig_ok} / Reject ${c.orig_reject} / Lost ${c.orig_lost} of ${c.qty_received}<br>
      Requested: OK ${c.corrected_qty_ok} / Reject ${c.corrected_qty_reject} / Lost ${c.corrected_qty_lost}</p>
      <p class="muted">Reason: ${esc(c.reason)} — requested by ${esc(c.requested_by)} at ${esc(c.requested_at)}</p>
      <form method="POST" action="/resolve" style="display:inline">
        <input type="hidden" name="correction_id" value="${c.correction_id}">
        <input type="hidden" name="decision" value="Approved">
        <button type="submit">Approve</button>
      </form>
      <form method="POST" action="/resolve" style="display:inline">
        <input type="hidden" name="correction_id" value="${c.correction_id}">
        <input type="hidden" name="decision" value="Rejected">
        <button type="submit" class="danger">Reject</button>
      </form>
    </div>`).join("");

  return appShell("supervisor", "Supervisor Review", "Pending corrections awaiting approval", rows);
}

async function handleResolve(env, request) {
  const form = await request.formData();
  const correctionId = Number(form.get("correction_id"));
  const decision = form.get("decision");
  await env.DB.prepare(
    `UPDATE stage_event_corrections SET status = ?, approved_by = 'supervisor-poc', resolved_at = datetime('now') WHERE correction_id = ?`
  ).bind(decision, correctionId).run();
  return Response.redirect(new URL("/supervisor", request.url), 302);
}

function severityBadge(sev) {
  const cls = sev === "High" ? "badge-high" : sev === "Low" ? "badge-low" : "badge-medium";
  return `<span class="badge ${cls}">${esc(sev)}</span>`;
}

function statusBadge(status) {
  const cls = status === "Resolved" ? "badge-resolved" : "badge-open";
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

async function reportIssuePage(env, notice) {
  const options = await recentLotOptions(env);
  const stageOptions = PILOT_STAGES.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");

  const { results } = await env.DB.prepare(
    `SELECT * FROM issue_reports ORDER BY reported_at DESC LIMIT 20`
  ).all();

  const stageNameById = {};
  for (const s of PILOT_STAGES) stageNameById[s.id] = s.name;

  const issueRows = results.map((i) => `
    <div class="card">
      <h3>${i.lot_id ? esc(i.lot_id) : "General"}${i.stage_id ? " · " + esc(stageNameById[i.stage_id] || "Stage " + i.stage_id) : ""}
        ${severityBadge(i.severity)} ${statusBadge(i.status)}</h3>
      <p>${esc(i.description)}</p>
      <p class="muted">Reported by ${esc(i.reported_by)} at ${esc(i.reported_at)}</p>
      ${i.status === "Open" ? `
      <form method="POST" action="/resolve-issue">
        <input type="hidden" name="issue_id" value="${i.issue_id}">
        <button type="submit" class="secondary">Mark resolved</button>
      </form>` : ""}
    </div>`).join("");

  const body = `
  <div class="card">
    <h2>Report an issue</h2>
    ${notice ? `<div class="ok">${esc(notice)}</div>` : ""}
    <form method="POST" action="/report-issue">
      <label>Lot ID (optional)</label>
      <input list="recent" name="lot_id" placeholder="Leave blank if not lot-specific">
      <datalist id="recent">${options}</datalist>
      <label>Stage (optional)</label>
      <select name="stage_id">
        <option value="">— General / not stage-specific —</option>
        ${stageOptions}
      </select>
      <label>Description</label>
      <textarea name="description" rows="3" required placeholder="e.g. machine P-3 down since 10am, supplier defect on incoming brass rod, ..."></textarea>
      <label>Severity</label>
      <select name="severity">
        <option value="Low">Low</option>
        <option value="Medium" selected>Medium</option>
        <option value="High">High</option>
      </select>
      <label>Reported by</label>
      <input type="text" name="reported_by" placeholder="e.g. Op-101" required>
      <button type="submit">Submit issue</button>
    </form>
  </div>
  <h2 style="margin:26px 0 10px;font-size:16px;">Recent issues</h2>
  ${issueRows || '<div class="card"><p class="muted">No issues reported yet.</p></div>'}`;

  return appShell("issue", "Report an Issue", "Log quality or process issues for management visibility", body);
}

async function handleReportIssue(env, request) {
  const form = await request.formData();
  const lotId = form.get("lot_id") || null;
  const stageId = form.get("stage_id") ? Number(form.get("stage_id")) : null;
  const description = form.get("description");
  const severity = form.get("severity") || "Medium";
  const reportedBy = form.get("reported_by");

  await env.DB.prepare(
    `INSERT INTO issue_reports (lot_id, stage_id, description, severity, reported_by, reported_at, status)
     VALUES (?, ?, ?, ?, ?, datetime('now'), 'Open')`
  ).bind(lotId, stageId, description, severity, reportedBy).run();

  return Response.redirect(
    new URL(`/report-issue?notice=${encodeURIComponent("Issue reported.")}`, request.url),
    302
  );
}

async function handleResolveIssue(env, request) {
  const form = await request.formData();
  const issueId = Number(form.get("issue_id"));
  await env.DB.prepare(
    `UPDATE issue_reports SET status = 'Resolved' WHERE issue_id = ?`
  ).bind(issueId).run();
  return Response.redirect(new URL("/report-issue", request.url), 302);
}

async function managementReportsPage(env) {
  const stageIds = PILOT_STAGES.map((s) => s.id);
  const placeholders = stageIds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT stage_id,
            SUM(qty_received) AS total_received,
            SUM(effective_qty_ok) AS total_ok,
            SUM(effective_qty_reject) AS total_reject,
            SUM(effective_qty_lost) AS total_lost
     FROM stage_events_effective
     WHERE stage_id IN (${placeholders}) AND is_active = 1
     GROUP BY stage_id`
  ).bind(...stageIds).all();

  const byStage = {};
  for (const r of results) byStage[r.stage_id] = r;

  const stats = PILOT_STAGES.map((s) => {
    const r = byStage[s.id] || { total_received: 0, total_ok: 0, total_reject: 0, total_lost: 0 };
    const rejectRate = r.total_received ? (r.total_reject / r.total_received) * 100 : 0;
    const lossRate = r.total_received ? (r.total_lost / r.total_received) * 100 : 0;
    return { name: s.name, ...r, rejectRate, lossRate };
  });

  const tableRows = stats.map((s) => `
    <tr>
      <td>${esc(s.name)}</td>
      <td>${s.total_received}</td>
      <td>${s.total_ok}</td>
      <td>${s.total_reject}</td>
      <td>${s.total_lost}</td>
      <td>${s.rejectRate.toFixed(2)}%</td>
      <td>${s.lossRate.toFixed(2)}%</td>
    </tr>`).join("");

  const { results: openIssues } = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM issue_reports WHERE status = 'Open'`
  ).all();
  const openCount = openIssues[0] ? openIssues[0].n : 0;

  const { results: recentIssues } = await env.DB.prepare(
    `SELECT * FROM issue_reports WHERE status = 'Open' ORDER BY reported_at DESC LIMIT 5`
  ).all();
  const stageNameById = {};
  for (const s of PILOT_STAGES) stageNameById[s.id] = s.name;
  const recentIssueRows = recentIssues.map((i) => `
    <tr>
      <td>${i.lot_id ? esc(i.lot_id) : "General"}</td>
      <td>${i.stage_id ? esc(stageNameById[i.stage_id] || "") : "—"}</td>
      <td>${severityBadge(i.severity)}</td>
      <td>${esc(i.description)}</td>
      <td class="muted">${esc(i.reported_at)}</td>
    </tr>`).join("");

  const body = `
  <div class="canvaswrap"><canvas id="stageChart" height="100"></canvas></div>
  <div class="card">
    <h2>Reject and loss rate by stage (all lots)</h2>
    <table>
      <tr><th>Stage</th><th>Received</th><th>OK</th><th>Reject</th><th>Lost</th><th>Reject rate</th><th>Loss rate</th></tr>
      ${tableRows}
    </table>
  </div>
  <div class="card">
    <h2>Open issues (${openCount})</h2>
    ${recentIssueRows ? `<table>
      <tr><th>Lot</th><th>Stage</th><th>Severity</th><th>Description</th><th>Reported</th></tr>
      ${recentIssueRows}
    </table>` : '<p class="muted">No open issues.</p>'}
    <p class="muted"><a href="/report-issue">See all issues &rarr;</a></p>
  </div>
  <script>
  new Chart(document.getElementById('stageChart'), {
    type: 'bar',
    data: {
      labels: ${safeJSON(stats.map((s) => s.name))},
      datasets: [
        { label: 'Reject rate %', data: ${safeJSON(stats.map((s) => Number(s.rejectRate.toFixed(2))))}, backgroundColor: '#a83232' },
        { label: 'Loss rate %', data: ${safeJSON(stats.map((s) => Number(s.lossRate.toFixed(2))))}, backgroundColor: '#8a8a8a' }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' }, title: { display: true, text: 'Where quality is being lost, across all lots' } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' } } }
    }
  });
  </script>`;

  return appShell("reports", "Management Reports", "Stage-wise quality performance across all lots, for decision-making", body);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/login" && request.method === "POST") {
      return handleLogin(request);
    }
    if (path === "/logout") {
      return handleLogout();
    }

    if (!isAuthed(request)) {
      return new Response(loginPage(), { headers: { "Content-Type": "text/html" } });
    }

    try {
      if (path === "/" && request.method === "GET") {
        return new Response(await indexPage(env), { headers: { "Content-Type": "text/html" } });
      }
      if (path === "/lot" && request.method === "GET") {
        return new Response(
          await lotPage(env, url.searchParams.get("id"), url.searchParams.get("notice")),
          { headers: { "Content-Type": "text/html" } }
        );
      }
      if (path === "/entry" && request.method === "POST") {
        return handleEntry(env, request);
      }
      if (path === "/correct-entry" && request.method === "GET") {
        return new Response(
          await correctEntryPage(env, url.searchParams.get("id")),
          { headers: { "Content-Type": "text/html" } }
        );
      }
      if (path === "/correct" && request.method === "GET") {
        return new Response(
          await correctFormPage(env, Number(url.searchParams.get("event_id"))),
          { headers: { "Content-Type": "text/html" } }
        );
      }
      if (path === "/correct" && request.method === "POST") {
        return handleCorrect(env, request);
      }
      if (path === "/report-issue" && request.method === "GET") {
        return new Response(
          await reportIssuePage(env, url.searchParams.get("notice")),
          { headers: { "Content-Type": "text/html" } }
        );
      }
      if (path === "/report-issue" && request.method === "POST") {
        return handleReportIssue(env, request);
      }
      if (path === "/resolve-issue" && request.method === "POST") {
        return handleResolveIssue(env, request);
      }
      if (path === "/reports" && request.method === "GET") {
        return new Response(await managementReportsPage(env), { headers: { "Content-Type": "text/html" } });
      }
      if (path === "/supervisor" && request.method === "GET") {
        return new Response(await supervisorPage(env), { headers: { "Content-Type": "text/html" } });
      }
      if (path === "/resolve" && request.method === "POST") {
        return handleResolve(env, request);
      }
      return new Response("Not found", { status: 404 });
    } catch (e) {
      return new Response(`Server error: ${e.message}\n${e.stack || ""}`, { status: 500 });
    }
  },
};
