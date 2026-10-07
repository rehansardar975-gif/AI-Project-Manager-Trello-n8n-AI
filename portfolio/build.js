#!/usr/bin/env node
/**
 * Builds every P08 portfolio asset from real project outputs:
 *   cover.png, architecture.png, screenshots/*.png (1600x1200)
 *   P08-case-study.pdf (A4), P08-presentation.pdf (16:9), video frames for P08-video.mp4
 * Inputs: portfolio/captures/*.png (real captures), evidence/n8n-run-*.json, evidence/test-output.tap
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');

const ROOT = path.join(__dirname, '..');
const OUT = __dirname;
const run = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/n8n-run-2026-10-07.json'), 'utf8'));
const tap = fs.readFileSync(path.join(ROOT, 'evidence/test-output.tap'), 'utf8');
const s = run.result.summary;
const tests = {
  total: +(tap.match(/^# tests (\d+)/m) || [])[1],
  pass: +(tap.match(/^# pass (\d+)/m) || [])[1],
  fail: +(tap.match(/^# fail (\d+)/m) || [])[1],
  names: [...tap.matchAll(/^ok \d+ - (.+)$/gm)].map((m) => m[1]),
};
const img = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64');
const css = `<link rel="stylesheet" href="file://${ROOT}/assets/p08.css">`;
const FOOTER = 'P08 · AI Project Manager · Trello + n8n + Gemini + Telegram · Muhammad Rehan Ansar';

const base = `
  .cv{width:1600px;height:1200px;position:relative;overflow:hidden;background:var(--bg)}
  .cv.dark{background:radial-gradient(1200px 700px at 85% -10%,rgba(45,212,191,.22),transparent 60%),radial-gradient(800px 600px at -10% 110%,rgba(45,212,191,.10),transparent 60%),var(--navy);color:#fff}
  .foot{position:absolute;left:72px;right:72px;bottom:34px;display:flex;justify-content:space-between;font:500 13px var(--mono);letter-spacing:.06em;color:var(--muted);border-top:1px solid var(--line);padding-top:16px}
  .dark .foot{color:#7C8BA5;border-color:rgba(255,255,255,.1)}
  .hd{position:absolute;left:72px;top:60px;right:72px}
  .hd .label{color:var(--teal-d)} .dark .hd .label{color:var(--teal)}
  .hd h1{font-size:46px;margin-top:10px;font-weight:800}
  .hd p{font-size:19px;color:var(--ink-2);margin:12px 0 0;max-width:1180px;line-height:1.5}
  .chips{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
  .win{position:absolute;left:72px;right:72px;top:300px;bottom:100px;background:#fff;border-radius:16px;border:1px solid var(--line);box-shadow:0 30px 70px rgba(15,23,42,.16);overflow:hidden;display:flex;flex-direction:column}
  .bar{height:46px;background:#F3F5F9;border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 18px;gap:8px;flex:none}
  .dot{width:12px;height:12px;border-radius:50%}
  .url{margin-left:18px;flex:1;background:#fff;border:1px solid var(--line);border-radius:8px;height:28px;display:flex;align-items:center;padding:0 12px;font:500 12.5px var(--mono);color:var(--muted)}
  .shot{flex:1;background-size:cover;background-position:top left}
`;
const windowFrame = (url, image, pos = 'top left') =>
  `<div class="win"><div class="bar"><span class="dot" style="background:#F87171"></span><span class="dot" style="background:#FBBF24"></span><span class="dot" style="background:#34D399"></span><div class="url">${url}</div></div><div class="shot" style="background-image:url(${image});background-position:${pos}"></div></div>`;
const page = (body, extraCss = '', dark = false) =>
  `<!doctype html><html><head><meta charset="utf-8">${css}<style>${base}${extraCss}</style></head><body style="margin:0"><div class="cv${dark ? ' dark' : ''}">${body}<div class="foot"><span>${FOOTER}</span><span>${new Date().getFullYear()}</span></div></div></body></html>`;
const header = (label, title, text, chips = '') =>
  `<div class="hd"><div class="label">${label}</div><h1>${title}</h1><p>${text}</p><div class="chips">${chips}</div></div>`;

// ---------- pages ----------
const PAGES = {};

PAGES.cover = page(
  `<div style="position:absolute;left:96px;top:120px;right:96px">
    <div class="chips"><span class="chip dark">PORTFOLIO PROJECT P08</span><span class="chip dark">n8n · TRELLO · GEMINI · TELEGRAM</span></div>
    <h1 style="font-size:92px;line-height:1.02;font-weight:800;margin-top:40px;max-width:1150px">AI Project Manager</h1>
    <p style="font-size:30px;line-height:1.4;color:#B6C2D6;margin-top:26px;max-width:1080px">Reads every project card on a Trello board, decides health with deterministic rules, and sends the founder a short report on Telegram.</p>
    <div style="display:flex;gap:18px;margin-top:64px">
      ${[['OVERDUE', 'overdue'], ['BLOCKED', 'blocked'], ['AT RISK', 'atrisk'], ['ON TRACK', 'ontrack']].map(([t, c]) => `<span class="chip ${c}" style="font-size:16px;padding:9px 18px">${t}</span>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:70px">
      ${[
        ['12', 'Trello fields read per card'],
        ['9', 'deterministic risk signals'],
        [`${tests.pass}/${tests.total}`, 'automated tests passing'],
        ['1.9 s', 'full n8n run, Trello → Telegram'],
      ].map(([n, t]) => `<div style="border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:16px;padding:24px 26px"><div style="font:800 46px var(--head);color:var(--teal)">${n}</div><div style="color:#B6C2D6;font-size:17px;margin-top:6px">${t}</div></div>`).join('')}
    </div>
  </div>
  <div style="position:absolute;left:96px;right:96px;top:770px;height:420px;border-radius:16px 16px 0 0;overflow:hidden;border:1px solid rgba(45,212,191,.35);box-shadow:0 0 80px rgba(45,212,191,.18)">
    <div style="height:38px;background:#16233F;display:flex;align-items:center;gap:8px;padding:0 16px"><span class="dot" style="background:#F87171"></span><span class="dot" style="background:#FBBF24"></span><span class="dot" style="background:#34D399"></span></div>
    <div style="height:100%;background:url(${img('captures/dashboard.png')}) top left/100% auto no-repeat"></div>
  </div>`,
  '.cv.dark .foot{background:var(--navy);bottom:0;padding:16px 0 34px}',
  true
);

const box = (x, y, w, h, title, sub, tone = 'light') =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:16px;padding:20px 22px;${tone === 'teal' ? 'background:var(--navy);color:#fff;border:2px solid var(--teal);box-shadow:0 0 40px var(--teal-glow)' : 'background:#fff;border:1px solid var(--line);box-shadow:0 10px 30px rgba(15,23,42,.06)'}">
    <div style="font:700 21px var(--head)">${title}</div><div style="font-size:14.5px;line-height:1.5;margin-top:8px;color:${tone === 'teal' ? '#B6C2D6' : 'var(--ink-2)'}">${sub}</div></div>`;
const arrow = (x1, y1, x2, y2, label = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0D9488" stroke-width="3" marker-end="url(#ah)"/>` +
  (label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 10}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="#64748B">${label}</text>` : '');
PAGES.architecture = page(
  header('ARCHITECTURE', 'Trello → n8n → rules → Gemini → Telegram', 'Each layer does one job. Trello holds the data, n8n runs the flow, the rule engine decides health, Gemini only writes the summary, and Telegram delivers it.') +
    `<svg width="1600" height="1200" style="position:absolute;left:0;top:0"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#0D9488"/></marker></defs>
      ${arrow(332, 500, 400, 500, '')}${arrow(672, 500, 740, 500)}${arrow(1012, 500, 1080, 500)}
      ${arrow(1210, 610, 1210, 700, '')}${arrow(1080, 790, 1012, 790)}${arrow(740, 790, 672, 790)}
    </svg>` +
    box(72, 400, 260, 210, 'Trello board', 'Source of truth. 6 lists, 9 custom fields, card due dates and activity dates.') +
    box(400, 400, 272, 210, 'n8n triggers', 'Weekdays 08:00 schedule plus manual run. Config node holds board, chat and model settings.') +
    box(740, 400, 272, 210, 'Trello API reads', 'Lists, custom fields and open cards via the n8n Trello credential (key + token).') +
    box(1080, 400, 448, 210, 'Risk engine (Code node)', 'Deterministic rules decide OVERDUE › BLOCKED › AT RISK › ON TRACK. Same file as the tested <span class="mono">src/p08-engine.js</span>.', 'teal') +
    box(1080, 700, 448, 190, 'Gemini founder report', 'Gets facts as JSON. Must not change any status. Fails or times out → flow continues.') +
    box(740, 700, 272, 190, 'Guardrail + fallback', 'AI text rejected if it drops a critical project or contradicts a status. Then the rule report is used.') +
    box(400, 700, 272, 190, 'Telegram', 'HTML message with counts, actions, risks and decisions. Retries 3×.') +
    box(72, 700, 260, 190, 'Dashboard', 'Static HTML view of the Risk Engine output, for screen sharing and review.') +
    `<div style="position:absolute;left:72px;right:72px;top:940px;display:flex;gap:14px">
      ${['Credentials live only in n8n', 'No secrets in git', 'AI never sets status', 'Report always delivered'].map((t) => `<span class="chip teal" style="font-size:13px;padding:8px 14px">${t}</span>`).join('')}
    </div>`
);

PAGES['01-dashboard'] = page(
  header('DASHBOARD', 'Every project, ranked by severity', `Output of the n8n run on ${run.result.asOf}: ${s.overdue} overdue, ${s.blocked} blocked, ${s.atRisk} at risk, ${s.onTrack} on track. Each row says why.`,
    '<span class="chip overdue">OVERDUE</span><span class="chip blocked">BLOCKED</span><span class="chip atrisk">AT RISK</span><span class="chip ontrack">ON TRACK</span>') +
    windowFrame('dashboard/index.html', img('captures/dashboard.png'))
);
PAGES['02-n8n-workflow'] = page(
  header('n8n WORKFLOW', '10 nodes, one straight line', 'Schedule or manual trigger → Config → three Trello API reads → Risk Engine → Gemini → Select Report → Telegram. Gemini errors do not stop the flow.',
    '<span class="chip teal">n8n 1.123</span><span class="chip teal">IMPORTABLE JSON</span><span class="chip teal">RETRY ON TRELLO + TELEGRAM</span>') +
    windowFrame('localhost:5678 · n8n editor', img('captures/n8n-canvas.png'))
);
PAGES['03-n8n-execution'] = page(
  header('EXECUTION', 'Successful run in 1.9 seconds', 'Real n8n execution: 6 lists → 9 custom fields → 12 cards → 1 report → Telegram. Earlier failed runs stay visible in the history.',
    '<span class="chip ontrack">SUCCEEDED</span><span class="chip teal">EXECUTION #3</span>') +
    windowFrame('localhost:5678 · executions', img('captures/n8n-execution.png'))
);
const tgHtml = run.selectReport.telegramText.replace(/\n/g, '<br>');
PAGES['04-telegram'] = page(
  header('TELEGRAM', 'The founder gets one clear message', `Exact text sent by the n8n Telegram node (message accepted by the Telegram Bot API, ok = true). Gemini was unavailable in this run, so the guardrail used the rule-based report.`,
    '<span class="chip ontrack">DELIVERED</span><span class="chip atrisk">AI FALLBACK PATH</span>') +
    `<div style="position:absolute;left:72px;right:72px;top:300px;bottom:100px;border-radius:16px;background:linear-gradient(160deg,#DCEFE6,#CFE3EE);border:1px solid var(--line);overflow:hidden;padding:36px 60px">
      <div style="max-width:1000px;background:#fff;border-radius:18px 18px 18px 4px;padding:22px 26px;font-size:15.5px;line-height:1.55;color:#111;box-shadow:0 4px 14px rgba(0,0,0,.08)">${tgHtml}
      <div style="text-align:right;font-size:12px;color:#8A9AA9;margin-top:6px">${new Date(run.executedAt).toISOString().slice(11, 16)} UTC</div></div></div>`,
  ''
);
const RULES = [
  ['OVERDUE', 'overdue', 'Deadline before today and card not in Done', 'critical'],
  ['BLOCKED', 'blocked', 'Blocker field filled, or card in the Blocked list', 'critical'],
  ['Due soon, not started', 'atrisk', 'Deadline within 7 days while in Backlog / To Do', 'high'],
  ['Dependency at risk', 'atrisk', 'Depends on a card that is OVERDUE or BLOCKED', 'high'],
  ['Dependency late / missing', 'atrisk', 'Dependency finishes after this deadline, or name not found', 'high'],
  ['Hours over estimate', 'atrisk', 'Actual > estimated hours (high above +20%)', 'medium / high'],
  ['Missing update', 'atrisk', 'No card activity for more than 7 days (high above 14)', 'medium / high'],
  ['Missing fields', 'atrisk', 'Owner, Deadline, Priority or Estimated Hours empty', 'medium'],
  ['Owner reported high risk', 'atrisk', 'Risk Level custom field = High', 'medium'],
];
PAGES['05-rules'] = page(
  header('RISK ENGINE', 'Health is decided by rules, not by AI', 'Fixed precedence: OVERDUE › BLOCKED › AT RISK › ON TRACK. Same input always gives the same answer. Thresholds are configurable.') +
    `<div class="card" style="position:absolute;left:72px;right:72px;top:300px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:17px">
      <tr style="background:#F8FAFC"><th style="text-align:left;padding:16px 24px" class="label">Signal</th><th style="text-align:left;padding:16px" class="label">Rule</th><th style="text-align:left;padding:16px" class="label">Severity</th></tr>
      ${RULES.map(([n, c, r, sev]) => `<tr style="border-top:1px solid var(--line)"><td style="padding:17px 24px"><span class="chip ${c}" style="font-size:13px">${n.toUpperCase()}</span></td><td style="padding:17px 16px;color:var(--ink-2)">${r}</td><td style="padding:17px 16px" class="mono">${sev}</td></tr>`).join('')}
      </table></div>`
);
PAGES['06-tests'] = page(
  header('VERIFICATION', `${tests.pass} of ${tests.total} automated tests pass`, 'Node.js built-in test runner on the engine, plus three real n8n executions covering each report path.',
    `<span class="chip ontrack">${tests.pass} PASS</span><span class="chip ${tests.fail ? 'overdue' : 'done'}">${tests.fail} FAIL</span>`) +
    `<div style="position:absolute;left:72px;top:300px;width:900px;bottom:100px" class="card"><div style="padding:22px 26px;columns:1">
      ${tests.names.map((n) => `<div style="display:flex;gap:12px;padding:6.5px 0;font-size:15px;border-bottom:1px solid #F1F5F9"><span style="color:var(--green);font-weight:700">✓</span><span>${n}</span></div>`).join('')}
    </div></div>
    <div style="position:absolute;left:1000px;right:72px;top:300px;display:flex;flex-direction:column;gap:18px">
      ${[
        ['Gemini unavailable', 'Rule-based report sent to Telegram', 'ontrack', 'PASS'],
        ['Gemini answer is faithful', 'AI report selected', 'ontrack', 'PASS'],
        ['Gemini contradicts a status', 'AI report rejected, rule report used', 'ontrack', 'PASS'],
        ['Real Trello board', 'Not run in this environment', 'atrisk', 'PENDING'],
        ['Real Gemini key', 'Not run in this environment', 'atrisk', 'PENDING'],
      ].map(([t, d, c, v]) => `<div class="card" style="padding:18px 22px"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font:700 18px var(--head)">${t}</b><span class="chip ${c}">${v}</span></div><div style="color:var(--muted);margin-top:6px;font-size:15px">${d}</div></div>`).join('')}
    </div>`
);

// ---------- slides (16:9) ----------
const slide = (inner, dark = false) =>
  `<section class="sl${dark ? ' dark' : ''}">${inner}<div class="sf"><span>${FOOTER}</span></div></section>`;
const SLIDE_CSS = `
  @page{size:1920px 1080px;margin:0}
  .sl{width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);page-break-after:always;break-after:page}
  .sl.dark{background:radial-gradient(1300px 700px at 85% -10%,rgba(45,212,191,.22),transparent 60%),var(--navy);color:#fff}
  .sf{position:absolute;left:96px;right:96px;bottom:36px;font:500 14px var(--mono);color:var(--muted);border-top:1px solid var(--line);padding-top:16px}
  .dark .sf{color:#7C8BA5;border-color:rgba(255,255,255,.1)}
  .st{position:absolute;left:96px;top:80px;right:96px}.st .label{color:var(--teal-d)}.dark .st .label{color:var(--teal)}
  .st h1{font-size:60px;margin-top:12px;font-weight:800}.st p{font-size:25px;line-height:1.5;color:var(--ink-2);max-width:1500px;margin-top:16px}
  .dark .st p{color:#B6C2D6}
  .full{position:absolute;left:96px;right:96px;top:330px;bottom:100px;border-radius:16px;background-size:contain;background-repeat:no-repeat;background-position:center top}
`;
function buildSlides() {
const SLIDES = [];
const shotPng = (name) => img(`screenshots/${name}.png`);
SLIDES.push(slide(
  `<div class="st" style="top:200px"><div class="label">PORTFOLIO PROJECT P08</div><h1 style="font-size:104px;line-height:1.02">AI Project Manager</h1>
   <p style="font-size:32px;max-width:1400px">Trello → n8n → deterministic risk rules → Gemini founder report → Telegram.</p>
   <div class="chips" style="margin-top:46px"><span class="chip overdue" style="font-size:18px;padding:10px 20px">OVERDUE</span><span class="chip blocked" style="font-size:18px;padding:10px 20px">BLOCKED</span><span class="chip atrisk" style="font-size:18px;padding:10px 20px">AT RISK</span><span class="chip ontrack" style="font-size:18px;padding:10px 20px">ON TRACK</span></div></div>`, true));
SLIDES.push(slide(
  `<div class="st"><div class="label">THE PROBLEM</div><h1>Founders find out about late projects too late</h1>
   <p>Project data is on a Trello board, but nobody reads twelve cards every morning. Overdue work, blockers, hours running over and stale cards stay hidden until a client asks.</p></div>
   <div style="position:absolute;left:96px;right:96px;top:520px;display:grid;grid-template-columns:repeat(3,1fr);gap:28px">
   ${[['Manual status checks', 'Someone has to open every card and compare dates and hours.'], ['Hidden dependencies', 'A blocked card quietly delays the cards that depend on it.'], ['AI alone is not reliable', 'An LLM asked "is this project at risk?" can give a different answer each time.']]
     .map(([t, d]) => `<div class="card" style="padding:34px"><div style="font:700 28px var(--head)">${t}</div><div style="font-size:21px;line-height:1.5;color:var(--ink-2);margin-top:12px">${d}</div></div>`).join('')}</div>`));
SLIDES.push(slide(`<div class="full" style="background-image:url(${img('architecture.png')});top:60px;bottom:90px"></div>`));
SLIDES.push(slide(`<div class="full" style="background-image:url(${shotPng('05-rules')});top:60px;bottom:90px"></div>`));
SLIDES.push(slide(`<div class="full" style="background-image:url(${shotPng('02-n8n-workflow')});top:60px;bottom:90px"></div>`));
SLIDES.push(slide(`<div class="full" style="background-image:url(${shotPng('01-dashboard')});top:60px;bottom:90px"></div>`));
SLIDES.push(slide(`<div class="full" style="background-image:url(${shotPng('04-telegram')});top:60px;bottom:90px"></div>`));
SLIDES.push(slide(`<div class="full" style="background-image:url(${shotPng('06-tests')});top:60px;bottom:90px"></div>`));
SLIDES.push(slide(
  `<div class="st" style="top:180px"><div class="label">WHAT THIS GIVES A BUSINESS</div><h1>A daily answer to “what needs me today?”</h1>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:60px;max-width:1600px">
   ${['Health decided by clear, testable rules', 'Founder report on Telegram every weekday', 'Rule-based report if the AI is down or wrong', 'Credentials kept inside n8n, never in code',
      'Works on an existing Trello board with custom fields', 'Rules and thresholds can be changed per team']
     .map((t) => `<div style="display:flex;gap:16px;align-items:center;font-size:26px;color:#E2E8F0"><span style="color:var(--teal);font:800 30px var(--head)">✓</span>${t}</div>`).join('')}</div></div>`, true));

return `<!doctype html><html><head><meta charset="utf-8">${css}<style>${SLIDE_CSS}.chips{display:flex;gap:12px;flex-wrap:wrap}body{margin:0}</style></head><body>${SLIDES.join('')}</body></html>`;
}

// ---------- case study (A4) ----------
const CASE_CSS = `
  @page{size:A4;margin:0}
  .pg{width:210mm;height:297mm;position:relative;overflow:hidden;background:#fff;page-break-after:always;break-after:page;padding:18mm 17mm 22mm}
  .pg.dark{background:radial-gradient(600px 400px at 90% -5%,rgba(45,212,191,.25),transparent 60%),var(--navy);color:#fff}
  .pf{position:absolute;left:17mm;right:17mm;bottom:9mm;font:500 7.5pt var(--mono);color:var(--muted);border-top:1px solid var(--line);padding-top:3mm;display:flex;justify-content:space-between}
  .dark .pf{border-color:rgba(255,255,255,.12);color:#7C8BA5}
  h2{font-size:17pt;margin:0 0 3mm}h3{font-size:11.5pt;margin:5mm 0 2mm}
  p,li{font-size:9.6pt;line-height:1.55;color:var(--ink-2)} .dark p{color:#B6C2D6}
  .fig{width:100%;max-height:106mm;object-fit:cover;object-position:top;border:1px solid var(--line);border-radius:3mm;display:block;margin:3mm 0}
  .lbl{font:500 7.5pt var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--teal-d);margin-bottom:2mm}
  table{border-collapse:collapse;width:100%;font-size:8.8pt} td,th{border-bottom:1px solid var(--line);padding:2mm 2.5mm;text-align:left;vertical-align:top} th{font:500 7pt var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
`;
const cpage = (inner, n, dark = false) =>
  `<section class="pg${dark ? ' dark' : ''}">${inner}<div class="pf"><span>P08 · AI Project Manager · Case study</span><span>${n}</span></div></section>`;
const buildCase = () => `<!doctype html><html><head><meta charset="utf-8">${css}<style>${CASE_CSS}</style></head><body style="margin:0">
${cpage(`<img src="${img('cover.png')}" style="width:100%;border-radius:3mm;margin-top:4mm">
  <div class="lbl" style="margin-top:10mm;color:var(--teal)">CASE STUDY</div>
  <h1 style="font-size:28pt;line-height:1.1">Automated project health reporting for a founder, built on Trello and n8n</h1>
  <p style="font-size:11pt;margin-top:5mm">A Trello board is the source of truth. An n8n workflow reads it every weekday morning, a deterministic rule engine decides the health of each project, Gemini turns the facts into a short founder note, and Telegram delivers it. If the AI fails or contradicts the rules, the rule-based report is sent instead.</p>`, 1, true)}
${cpage(`<div class="lbl">01 · Problem</div><h2>Status lives in Trello, but nobody reads every card</h2>
  <p>Teams track delivery in Trello. The founder needs to know which projects are late, blocked or drifting, but the signals are spread across due dates, custom fields, card activity and links between cards. Checking manually takes time and is easy to skip, so problems surface late.</p>
  <p>Asking an AI model "which projects are at risk?" is not a fix: the answer can change between runs and cannot be audited.</p>
  <div class="lbl" style="margin-top:7mm">02 · Solution</div><h2>Rules decide. AI explains. n8n delivers.</h2>
  <ul><li><b>Trello</b> — 6 lists (Backlog, To Do, In Progress, Blocked, Review, Done) and 9 custom fields: Owner, Priority, Estimated Hours, Actual Hours, Blocker, Dependency, Risk Level, Next Milestone, Decision Required. Project = card name, Status = list, Deadline = due date.</li>
  <li><b>n8n</b> — schedule (weekdays 08:00) and manual triggers; three Trello API reads using the n8n Trello credential; Code nodes; Gemini HTTP call; Telegram node.</li>
  <li><b>Risk engine</b> — one dependency-free JavaScript file, unit tested, embedded unchanged into the n8n Code node by a build script.</li>
  <li><b>Gemini</b> — receives only computed facts as JSON with instructions not to change any status. Output is checked by a guardrail before use.</li>
  <li><b>Telegram</b> — HTML message with counts, actions, risks and founder decisions.</li></ul>
  <img class="fig" src="${img('architecture.png')}">`, 2)}
${cpage(`<div class="lbl">03 · Deterministic rules</div><h2>Health precedence: OVERDUE › BLOCKED › AT RISK › ON TRACK</h2>
  <table><tr><th>Signal</th><th>Rule</th><th>Severity</th></tr>${RULES.map(([n, , r, sev]) => `<tr><td><b>${n}</b></td><td>${r}</td><td class="mono">${sev}</td></tr>`).join('')}</table>
  <p style="margin-top:4mm">A card with no signal is ON TRACK. Done cards are excluded. Decisions Required are listed separately for the founder and do not change health.</p>
  <div class="lbl" style="margin-top:6mm">04 · Result on the test board</div><h2>${s.active} active cards → ${s.overdue} overdue, ${s.blocked} blocked, ${s.atRisk} at risk, ${s.onTrack} on track</h2>
  <img class="fig" src="${img('screenshots/01-dashboard.png')}">`, 3)}
${cpage(`<div class="lbl">05 · n8n workflow</div><h2>10 nodes, executed end to end</h2>
  <img class="fig" src="${img('screenshots/03-n8n-execution.png')}">
  <div class="lbl" style="margin-top:5mm">06 · AI guardrail</div><h2>The AI can only rephrase</h2>
  <p>The Select Report node accepts Gemini's text only if it is non-empty, under the length limit, names every OVERDUE and BLOCKED project, and never calls a non-healthy project "on track". Otherwise the rule-based report is sent. All three paths were executed in n8n:</p>
  <table><tr><th>Gemini response</th><th>Report sent</th><th>Result</th></tr>
  <tr><td>Request failed (HTTP 400)</td><td>Rule-based</td><td>Pass — delivered to Telegram</td></tr>
  <tr><td>Faithful summary</td><td>Gemini</td><td>Pass</td></tr>
  <tr><td>Calls an AT RISK project "on track"</td><td>Rule-based</td><td>Pass — contradiction rejected</td></tr></table>`, 4)}
${cpage(`<div class="lbl">07 · Delivery</div><h2>What the founder receives</h2>
  <img class="fig" src="${img('screenshots/04-telegram.png')}">
  <div class="lbl" style="margin-top:5mm">08 · Security and verification</div><h2>No credentials in code</h2>
  <ul><li>Trello key + token, Gemini key and Telegram bot token are stored as n8n credentials. The workflow JSON references them by name only.</li>
  <li>${tests.pass}/${tests.total} automated tests pass (rules, edge cases, invalid input, Trello parsing, guardrail, Telegram escaping and length).</li>
  <li>Verified: full n8n run with Trello API responses served from a local test server, real Telegram delivery, all three report paths.</li>
  <li>Not verified in this build environment: a live Trello board and a live Gemini response. Both use the same nodes and only need credentials.</li></ul>`, 5)}
</body></html>`;

// ---------- render ----------
(async () => {
  fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'build'), { recursive: true });
  const browser = await chromium.launch();
  const render = async (html, file, w, h) => {
    const htmlFile = path.join(OUT, 'build', path.basename(file).replace(/\.\w+$/, '.html'));
    fs.writeFileSync(htmlFile, html);
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto('file://' + htmlFile, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    return p;
  };
  for (const name of ['cover', 'architecture', '01-dashboard', '02-n8n-workflow', '03-n8n-execution', '04-telegram', '05-rules', '06-tests']) {
    const target = name === 'cover' || name === 'architecture' ? `${name}.png` : `screenshots/${name}.png`;
    const p = await render(PAGES[name], target, 1600, 1200);
    await p.screenshot({ path: path.join(OUT, target) });
    await p.close();
    console.log('png', target);
  }
  // slides: PDF + one 1920x1080 PNG per slide for the video
  let p = await render(buildSlides(), 'P08-presentation.pdf', 1920, 1080);
  await p.pdf({ path: path.join(OUT, 'P08-presentation.pdf'), width: '1920px', height: '1080px', printBackground: true });
  fs.mkdirSync(path.join(OUT, 'build/frames'), { recursive: true });
  const n = await p.locator('.sl').count();
  for (let i = 0; i < n; i++) await p.locator('.sl').nth(i).screenshot({ path: path.join(OUT, `build/frames/slide-${String(i + 1).padStart(2, '0')}.png`) });
  await p.close();
  console.log(`pdf P08-presentation.pdf (${n} slides) + frames`);
  p = await render(buildCase(), 'P08-case-study.pdf', 794, 1123);
  await p.pdf({ path: path.join(OUT, 'P08-case-study.pdf'), format: 'A4', printBackground: true });
  await p.close();
  console.log('pdf P08-case-study.pdf');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
