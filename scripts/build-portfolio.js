#!/usr/bin/env node
/**
 * Builds the P08 portfolio package from real outputs in evidence/:
 *   cover/P08-cover.png · architecture/P08-architecture.png · screenshots/01..12 (1600x1200)
 *   case-study/P08-case-study.pdf (A4) · presentation/P08-presentation.pdf (16:9, 13 slides)
 *
 *   node scripts/build-portfolio.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');

const ROOT = path.join(__dirname, '..');
const EV = path.join(ROOT, 'evidence');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const runs = { faithful: read('evidence/n8n-run-faithful.json'), contradict: read('evidence/n8n-run-contradict.json'), unavailable: read('evidence/n8n-run-unavailable.json') };
const live = read('evidence/n8n-live/timeline.json');
const run = runs.faithful;
const R = run.result;
const S = R.summary;
const tap = fs.readFileSync(path.join(EV, 'test-output.tap'), 'utf8');
const T = { total: +(tap.match(/^# tests (\d+)/m) || [])[1], pass: +(tap.match(/^# pass (\d+)/m) || [])[1], fail: +(tap.match(/^# fail (\d+)/m) || [])[1] };
const P = (n) => R.projects.find((p) => p.project === n);
const img = (rel) => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, rel)).toString('base64');
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CSS = `<link rel="stylesheet" href="file://${ROOT}/assets/p08.css">`;
const FOOT = 'P08 · AI Project Manager · Trello + n8n + Gemini + Telegram · Muhammad Rehan Ansar';
const CHIP = { OVERDUE: 'overdue', BLOCKED: 'blocked', 'AT RISK': 'atrisk', 'ON TRACK': 'ontrack', DONE: 'done' };
const midFrame = live.frames.reduce((best, f) => (Math.abs(f.t - (live.clickedAt + (live.doneAt - live.clickedAt) * 0.62)) < Math.abs(best.t - (live.clickedAt + (live.doneAt - live.clickedAt) * 0.62)) ? f : best));
const midT = (midFrame.t - live.clickedAt).toFixed(1);
const short = (r) => r.selectReport.reason.replace(/^AI request failed: (\d{3}).*$/, 'AI request failed: HTTP $1 — model unavailable');
const runMs = Object.values(run.nodes).reduce((a, n) => a + (n.ms || 0), 0);

const RULES = [
  ['OVERDUE', 'overdue', 'Deadline before today, card not in Done', 'critical'],
  ['BLOCKED', 'blocked', 'Blocker field filled, or card in the Blocked list', 'critical'],
  ['Due soon, not started', 'atrisk', 'Deadline within 7 days, still in Backlog / To Do', 'high'],
  ['Dependency at risk', 'atrisk', 'Depends on a card that is OVERDUE or BLOCKED', 'high'],
  ['Dependency late / not found', 'atrisk', 'Dependency finishes after this deadline, or name not on the board', 'high'],
  ['Hours over estimate', 'atrisk', 'Actual > estimated hours (high above +20%)', 'medium / high'],
  ['Missing update', 'atrisk', 'No card activity for more than 7 days (high above 14)', 'medium / high'],
  ['Missing required data', 'atrisk', 'Owner, Deadline, Priority or Estimated Hours empty', 'medium'],
  ['Owner reported high risk', 'atrisk', 'Risk Level custom field = High', 'medium'],
];
const SCEN = [
  ['S1', 'All projects on track', 'No flags, no "act now" section', 'Unit'],
  ['S2', 'Overdue project', 'OVERDUE, days late in reason', 'Unit + n8n'],
  ['S3', 'Blocked project', 'BLOCKED, blocker text in reason', 'Unit + n8n'],
  ['S4', 'Dependency problem', 'Blocked / late / unknown dependency flagged', 'Unit + n8n'],
  ['S5', 'Hours exceeded', '+38% → high severity', 'Unit + n8n'],
  ['S6', 'Multiple risks on one card', '6 flags, OVERDUE wins by precedence', 'Unit'],
  ['S7', 'Missing update', '15 days → high severity', 'Unit + n8n'],
  ['S8', 'Missing required data', 'Missing owner listed', 'Unit + n8n'],
  ['S9', 'Gemini unavailable', 'HTTP 503 → rule report sent', 'Unit + n8n'],
  ['S10', 'Gemini correct', 'AI report accepted', 'Unit + n8n'],
  ['S11', 'Gemini contradicts rules', 'Rejected → rule report sent', 'Unit + n8n'],
  ['S12', 'Telegram notification', 'Delivered, Bot API ok = true', 'Unit + n8n'],
];

// ---------- shared page pieces (1600x1200) ----------
const BASE = `
  body{margin:0}
  .cv{width:1600px;height:1200px;position:relative;overflow:hidden;background:var(--bg)}
  .cv.dark{background:radial-gradient(1200px 700px at 85% -10%,rgba(45,212,191,.22),transparent 60%),radial-gradient(800px 600px at -10% 110%,rgba(45,212,191,.10),transparent 60%),var(--navy);color:#fff}
  .foot{position:absolute;left:72px;right:72px;bottom:0;height:56px;display:flex;align-items:center;justify-content:space-between;font:500 13px var(--mono);letter-spacing:.06em;color:var(--muted);border-top:1px solid var(--line);background:inherit}
  .dark .foot{color:#7C8BA5;border-color:rgba(255,255,255,.1)}
  .hd{position:absolute;left:72px;top:48px;right:72px}
  .hd .label{color:var(--teal-d)} .dark .hd .label{color:var(--teal)}
  .hd h1{font-size:42px;margin-top:8px;font-weight:800}
  .hd p{font-size:18px;color:var(--ink-2);margin:10px 0 0;max-width:1300px;line-height:1.5}
  .chips{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
  .win{position:absolute;background:#fff;border-radius:14px;border:1px solid var(--line);box-shadow:0 26px 60px rgba(15,23,42,.16);overflow:hidden}
  .wbar{height:40px;background:#F3F5F9;border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 16px;gap:7px}
  .dot{width:11px;height:11px;border-radius:50%}
  .url{margin-left:14px;flex:1;background:#fff;border:1px solid var(--line);border-radius:7px;height:25px;display:flex;align-items:center;padding:0 12px;font:500 12px var(--mono);color:var(--muted);white-space:nowrap;overflow:hidden}
  .view{position:absolute;top:40px;left:0;right:0;bottom:0;overflow:hidden;background:#fff}
  .view img{position:absolute}
  .tag{position:absolute;z-index:3}
  .rc{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 20px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
  .rc b{display:block;font:700 18px var(--head);margin:8px 0 4px}
  .rc .m{font-size:14.5px;color:var(--ink-2);line-height:1.45}
  table.t{border-collapse:collapse;width:100%;font-size:15px} table.t th{font:500 11px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;padding:11px 14px;background:#F8FAFC;border-bottom:1px solid var(--line)} table.t td{padding:11px 14px;border-bottom:1px solid #EEF2F6;vertical-align:top}
`;
const DOTS = '<span class="dot" style="background:#F87171"></span><span class="dot" style="background:#FBBF24"></span><span class="dot" style="background:#34D399"></span>';
/** Window showing a region of a capture. srcW = the capture's CSS width; region {x,y,w} in those units. */
const win = (box, url, src, srcW, region = { x: 0, y: 0, w: srcW }) => {
  const scale = box.w / region.w;
  return `<div class="win" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h + 40}px"><div class="wbar">${DOTS}<div class="url">${esc(url)}</div></div>
    <div class="view"><img src="${src}" style="width:${srcW * scale}px;left:${-region.x * scale}px;top:${-region.y * scale}px"></div></div>`;
};
const page = (body, dark = false, extra = '') =>
  `<!doctype html><html><head><meta charset="utf-8">${CSS}<style>${BASE}${extra}</style></head><body><div class="cv${dark ? ' dark' : ''}">${body}<div class="foot"><span>${FOOT}</span><span>2026</span></div></div></body></html>`;
const head = (label, title, text, chips = '') => `<div class="hd"><div class="label">${label}</div><h1>${title}</h1><p>${text}</p><div class="chips">${chips}</div></div>`;
const chip = (t, c, st = '') => `<span class="chip ${c}" style="${st}">${t}</span>`;
const reasonCard = (p, extra = '') =>
  `<div class="rc" ${extra}>${chip(p.health, CHIP[p.health])}<b>${esc(p.project)}</b><div class="m">${p.flags.map((f) => '• ' + esc(f.message)).join('<br>') || 'No rule triggered'}</div><div class="m" style="margin-top:6px;color:var(--muted)">${esc(p.owner || 'No owner')} · ${esc(p.priority || '—')} · due ${esc(p.deadline || '—')}</div></div>`;
const tgBubble = (text, w, fs = 15) =>
  `<div style="width:${w}px;background:#fff;border-radius:18px 18px 18px 4px;padding:18px 22px;font-size:${fs}px;line-height:1.55;color:#111;box-shadow:0 4px 14px rgba(0,0,0,.08)">${text.replace(/\n/g, '<br>')}<div style="text-align:right;font-size:12px;color:#8A9AA9;margin-top:6px">${run.telegram.date.slice(11, 16)} UTC ✓✓</div></div>`;

const cap = {
  board: img('evidence/captures/trello-board.png'),
  cardCP: img('evidence/captures/trello-card-client-portal.png'),
  cardPG: img('evidence/captures/trello-card-payment-gateway.png'),
  dash: img('evidence/captures/dashboard.png'),
  idle: img('evidence/n8n-live/01-canvas-idle.png'),
  success: img('evidence/n8n-live/02-canvas-success.png'),
  mid: img('evidence/n8n-live/frames/' + midFrame.file),
  risk: img('evidence/n8n-live/04-node-risk-engine.png'),
  select: img('evidence/n8n-live/06-node-select-report.png'),
  tg: img('evidence/n8n-live/07-node-telegram.png'),
  execs: img('evidence/n8n-live/08-executions.png'),
};
const FULL = { x: 72, y: 262, w: 1456, h: 819 };
const ROW = { x: 60, y: 300, w: 1500 }; // node row region inside n8n canvas captures (1600 wide)

// ---------- cover / architecture ----------
const PAGES = {};
PAGES.cover = page(
  `<div style="position:absolute;left:96px;top:104px;right:96px">
    <div class="chips"><span class="chip dark">PORTFOLIO PROJECT P08</span><span class="chip dark">n8n AUTOMATION · AI REPORTING</span></div>
    <h1 style="font-size:96px;line-height:1.02;font-weight:800;margin-top:34px">AI Project Manager</h1>
    <div style="font:600 36px var(--head);color:#B6C2D6;margin-top:18px">Trello <span style="color:var(--teal)">+</span> n8n <span style="color:var(--teal)">+</span> Gemini <span style="color:var(--teal)">+</span> Telegram</div>
    <p style="font-size:23px;line-height:1.5;color:#94A3B8;margin-top:22px;max-width:1080px">Reads every project on a Trello board, decides health with clear rules, has Gemini write a short founder report, checks it, and sends it on Telegram.</p>
    <div style="display:flex;gap:14px;margin-top:30px">${[['OVERDUE', 'overdue'], ['BLOCKED', 'blocked'], ['AT RISK', 'atrisk'], ['ON TRACK', 'ontrack']].map(([t, c]) => chip(t, c, 'font-size:15px;padding:8px 16px')).join('')}</div>
  </div>
  <div style="position:absolute;left:96px;right:96px;top:640px;height:500px;border-radius:16px 16px 0 0;overflow:hidden;border:1px solid rgba(45,212,191,.35);box-shadow:0 0 90px rgba(45,212,191,.2);background:#fff">
    <div style="height:36px;background:#16233F;display:flex;align-items:center;gap:8px;padding:0 16px">${DOTS}<span style="margin-left:12px;font:500 12px var(--mono);color:#8FA3C0">n8n · P08 — AI Project Manager · succeeded</span></div>
    <img src="${cap.success}" style="position:absolute;top:36px;width:${1408 * 1600 / 1530}px;left:${-40 * 1408 / 1530}px;margin-top:${-250 * 1408 / 1530}px">
  </div>`,
  true
);
const abox = (x, y, w, h, t, s, tone = '') =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:14px;padding:16px 22px;${tone === 'teal' ? 'background:var(--navy);color:#fff;border:2px solid var(--teal);box-shadow:0 0 36px var(--teal-glow)' : tone === 'warn' ? 'background:#FFF7ED;border:1.5px dashed #F59E0B' : 'background:#fff;border:1px solid var(--line);box-shadow:0 10px 28px rgba(15,23,42,.06)'}">
   <div style="font:700 21px var(--head)">${t}</div><div style="font-size:14.5px;line-height:1.45;margin-top:6px;color:${tone === 'teal' ? '#B6C2D6' : 'var(--ink-2)'}">${s}</div></div>`;
const ys = [236, 372, 508, 644, 780, 916];
const MAIN = [
  ['Trello board', 'Source of truth: lists, due dates, 9 custom fields, activity dates', '', 'SOURCE'],
  ['n8n workflow', 'Weekdays 08:00 or manual run · reads lists, fields and cards via Trello API', '', 'ORCHESTRATION'],
  ['Deterministic rule engine', 'Decides OVERDUE › BLOCKED › AT RISK › ON TRACK, with a reason for every flag', 'teal', 'DECIDES HEALTH'],
  ['Gemini', 'Gets computed facts as JSON · writes a short founder report · cannot change status', '', 'WRITES SUMMARY'],
  ['AI validation', 'Every OVERDUE/BLOCKED project named · no status contradicted · length limit', '', 'CHECKS AI'],
  ['Telegram', 'One HTML message to the founder · retries 3×', '', 'DELIVERS'],
];
PAGES.architecture = page(
  head('ARCHITECTURE', 'Rules decide. AI explains. n8n delivers.', 'Main path on the left. If Gemini fails, times out, or writes something that contradicts the rules, the rule-based report goes to Telegram instead.') +
    `<svg width="1600" height="1200" style="position:absolute;left:0;top:0"><defs>
      <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#0D9488"/></marker>
      <marker id="w" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#D97706"/></marker></defs>
      ${ys.slice(0, 5).map((y) => `<line x1="680" y1="${y + 110}" x2="680" y2="${y + 134}" stroke="#0D9488" stroke-width="3" marker-end="url(#a)"/>`).join('')}
      <path d="M980 ${ys[3] + 55} H1105" stroke="#D97706" stroke-width="2.5" stroke-dasharray="7 6" fill="none" marker-end="url(#w)"/>
      <text x="1042" y="${ys[3] + 44}" text-anchor="middle" font-family="JetBrains Mono" font-size="12.5" fill="#B45309">error / timeout</text>
      <path d="M980 ${ys[4] + 55} H1105" stroke="#D97706" stroke-width="2.5" stroke-dasharray="7 6" fill="none" marker-end="url(#w)"/>
      <text x="1042" y="${ys[4] + 44}" text-anchor="middle" font-family="JetBrains Mono" font-size="12.5" fill="#B45309">rejected</text>
      <path d="M1320 ${ys[4] + 150} V${ys[5] + 55} H990" stroke="#D97706" stroke-width="2.5" stroke-dasharray="7 6" fill="none" marker-end="url(#w)"/>
      <text x="1160" y="${ys[5] + 44}" text-anchor="middle" font-family="JetBrains Mono" font-size="12.5" fill="#B45309">fallback</text>
      <path d="M680 ${ys[4] + 110} V${ys[4] + 134}" stroke="#0D9488" stroke-width="3"/>
      <text x="700" y="${ys[5] - 8}" font-family="JetBrains Mono" font-size="12.5" fill="#0D9488">accepted</text>
    </svg>` +
    MAIN.map(([t, s, tone, lab], i) => `<div class="label" style="position:absolute;left:72px;top:${ys[i] + 46}px;width:270px;text-align:right;color:${tone ? 'var(--teal-d)' : 'var(--muted)'}">${lab}</div>` + abox(380, ys[i], 600, 110, t, s, tone)).join('') +
    abox(1110, ys[3] + 10, 420, 240, 'Rule-based report', 'Built from the same rule engine output. Used when Gemini is unavailable, returns an error, or fails validation. The founder always gets a report.', 'warn') +
    `<div style="position:absolute;left:1110px;top:${ys[0]}px;width:420px" class="rc"><div class="label" style="color:var(--teal-d)">ALSO FROM THE ENGINE</div><b>Dashboard</b><div class="m">Static HTML view of the same results for screen sharing.</div></div>
     <div style="position:absolute;left:1110px;top:${ys[1] + 20}px;width:420px" class="rc"><div class="label" style="color:var(--teal-d)">SECURITY</div><b>Credentials only in n8n</b><div class="m">Trello key + token, Gemini key and Telegram bot token live in n8n's credential store. None in code or git.</div></div>`
);

// ---------- 12 screenshots ----------
const SHOTS = {};
SHOTS['01-cover-overview'] = PAGES.cover;
SHOTS['02-trello-board'] = page(
  head('TRELLO · SOURCE OF TRUTH', 'The board n8n reads: 12 projects in 6 lists', 'Each card carries owner, priority, deadline, estimated and actual hours, blocker, dependency, risk level, next milestone and decision required.',
    chip('6 LISTS', 'teal') + chip('9 CUSTOM FIELDS', 'teal') + chip('12 CARDS', 'teal')) +
    win(FULL, 'Trello board · P08 Delivery Portfolio · rendered from Trello REST API data', cap.board, 1920)
);
SHOTS['03-trello-card-details'] = page(
  head('TRELLO · CARD DETAIL', 'Every field the rules use, on one card', 'Client Portal v2: Critical priority, due 2 Oct, 138 of 120 hours used, owner marked risk High, and a decision waiting on the founder.',
    chip('OWNER', 'teal') + chip('DEADLINE', 'teal') + chip('HOURS', 'teal') + chip('RISK LEVEL', 'teal') + chip('DECISION REQUIRED', 'teal')) +
    win(FULL, 'Trello card · Client Portal v2 · custom fields', cap.cardCP, 1600, { x: 290, y: 20, w: 1020 })
);
SHOTS['04-n8n-workflow'] = page(
  head('n8n · WORKFLOW', '10 nodes from trigger to Telegram', 'Schedule (weekdays 08:00) or manual trigger → Config → 3 Trello API reads → Risk Engine → Gemini → Select Report (validation) → Telegram.',
    chip('n8n 1.123', 'teal') + chip('IMPORTABLE JSON', 'teal') + chip('CREDENTIALS BY NAME ONLY', 'teal')) +
    win(FULL, 'n8n editor · P08 — AI Project Manager', cap.idle, 1600, { x: 20, y: 20, w: 1560 })
);
SHOTS['05-n8n-execution'] = page(
  head('n8n · LIVE EXECUTION', `Captured while running: ${(live.doneAt - live.clickedAt).toFixed(1)} s from click to finish`, `Top: ${midT} s after clicking Execute — Trello and Risk Engine done, Gemini running. Bottom: every node green, item counts on each connection.`,
    chip('RUNNING', 'atrisk') + chip('SUCCEEDED', 'ontrack') + chip(`${T.pass}/${T.total} TESTS`, 'teal')) +
    win({ x: 72, y: 262, w: 1456, h: 360 }, `n8n · executing · t = ${midT} s`, cap.mid, 1600, { x: 60, y: 330, w: 1500 }) +
    win({ x: 72, y: 690, w: 1456, h: 360 }, 'n8n · workflow executed successfully', cap.success, 1600, { x: 60, y: 330, w: 1500 }) +
    `<div class="tag" style="left:96px;top:318px">${chip('RUNNING', 'atrisk', 'font-size:13px')}</div><div class="tag" style="left:96px;top:746px">${chip('SUCCEEDED', 'ontrack', 'font-size:13px')}</div>`
);
SHOTS['06-rule-engine'] = page(
  head('RULE ENGINE · PROJECT HEALTH', 'Trello cards in, health decided by rules out', `The Risk Engine Code node received 12 cards and produced: ${S.overdue} overdue, ${S.blocked} blocked, ${S.atRisk} at risk, ${S.onTrack} on track, ${S.done} done.`,
    chip(`${S.overdue} OVERDUE`, 'overdue') + chip(`${S.blocked} BLOCKED`, 'blocked') + chip(`${S.atRisk} AT RISK`, 'atrisk') + chip(`${S.onTrack} ON TRACK`, 'ontrack')) +
    win(FULL, 'n8n · Risk Engine node · input: Trello cards · output: evaluated result', cap.risk, 1600)
);
SHOTS['07-gemini-report'] = page(
  head('GEMINI · FOUNDER REPORT', 'AI text accepted only after validation', 'Select Report received the AI response, checked it against the rule results, and marked it source = ai, "AI report passed validation".',
    chip('SOURCE = AI', 'ontrack') + chip('VALIDATED AGAINST RULES', 'teal') + chip('GEMINI-COMPATIBLE TEST ENDPOINT', 'done')) +
    win({ x: 72, y: 262, w: 860, h: 819 }, 'n8n · Select Report node · output', cap.select, 1600, { x: 1000, y: 0, w: 600 }) +
    `<div class="rc" style="position:absolute;left:960px;top:262px;width:568px;height:859px;padding:24px 26px;overflow:hidden"><div class="label" style="color:var(--teal-d)">AI REPORT TEXT (AS SENT)</div>
     <div style="font-size:15px;line-height:1.55;color:var(--ink-2);margin-top:12px;white-space:pre-wrap">${esc(run.selectReport.reportText)}</div></div>`
);
SHOTS['08-telegram'] = page(
  head('TELEGRAM · NOTIFICATION', 'What the founder receives', 'Sent by the n8n Telegram node. The Telegram Bot API answered ok = true (right: the Bot API response from the recorded editor run). Chat and bot IDs are masked.',
    chip('DELIVERED', 'ontrack') + chip('HTML FORMAT', 'teal') + chip('RETRY 3×', 'teal')) +
    `<div style="position:absolute;left:72px;top:262px;width:700px;height:859px;border-radius:14px;background:linear-gradient(160deg,#DCEFE6,#CFE3EE);border:1px solid var(--line);padding:26px;overflow:hidden">${tgBubble(run.selectReport.telegramText, 640, 14)}</div>` +
    win({ x: 800, y: 262, w: 728, h: 819 }, 'n8n · Telegram node · Bot API response', cap.tg, 1600, { x: 1010, y: 80, w: 590 })
);
SHOTS['09-dashboard'] = page(
  head('DASHBOARD', 'Every project ranked by severity, with the reason', 'Static HTML view of the same Risk Engine output, plus the validated founder report. Works on desktop and phone.',
    chip('SAME DATA AS n8n RUN', 'teal') + chip('RESPONSIVE', 'teal')) + win(FULL, 'dashboard/index.html', cap.dash, 1600)
);
SHOTS['10-blocker-scenario'] = page(
  head('SCENARIO · BLOCKER + DEPENDENCY', 'One blocker, three projects affected', 'Payment Gateway Migration is blocked. Mobile App Release 3.4 depends on it, so the rules flag it too, even though its own card looks fine.',
    chip('BLOCKED', 'blocked') + chip('DEPENDENCY AT RISK', 'atrisk') + chip('DEPENDENCY LATE', 'atrisk')) +
    win({ x: 72, y: 262, w: 820, h: 560 }, 'Trello card · Payment Gateway Migration', cap.cardPG, 1600, { x: 300, y: 20, w: 1000 }) +
    `<div style="position:absolute;left:920px;top:262px;width:608px;display:flex;flex-direction:column;gap:16px">${reasonCard(P('Payment Gateway Migration'))}${reasonCard(P('Mobile App Release 3.4'))}${reasonCard(P('Support Chatbot Rollout'))}</div>
     <div class="rc" style="position:absolute;left:72px;top:862px;width:820px"><div class="label" style="color:var(--teal-d)">HOW THE RULE WORKS</div><div class="m" style="margin-top:8px;font-size:15.5px">Pass 1 checks each card on its own. Pass 2 looks up every Dependency by card name: if the dependency is OVERDUE or BLOCKED, or will finish after this card's deadline, the dependent card is flagged with the reason.</div></div>`
);
SHOTS['11-overdue-at-risk'] = page(
  head('SCENARIO · OVERDUE + AT RISK', 'Different problems, each with its own reason', 'One overdue card and five at-risk cards, each caught by a different rule: deadline, hours, missing update, missing owner, or due soon without starting.',
    chip('OVERDUE', 'overdue') + chip('HOURS OVER', 'atrisk') + chip('NO UPDATE 15 DAYS', 'atrisk') + chip('MISSING OWNER', 'atrisk') + chip('DUE SOON, NOT STARTED', 'atrisk')) +
    `<div style="position:absolute;left:72px;top:262px;right:72px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px">${['Client Portal v2', 'Security Audit Remediation', 'Data Warehouse Sync', 'Customer Onboarding Emails', 'Internal Analytics Dashboard', 'Support Chatbot Rollout'].map((n) => reasonCard(P(n), 'style="min-height:200px"')).join('')}</div>
     <div class="rc" style="position:absolute;left:72px;right:72px;top:770px;padding:0;overflow:hidden"><table class="t"><tr><th>Precedence</th><th>Health</th><th>When</th></tr>
     <tr><td class="mono">1</td><td>${chip('OVERDUE', 'overdue')}</td><td>Deadline passed and card not Done</td></tr><tr><td class="mono">2</td><td>${chip('BLOCKED', 'blocked')}</td><td>Blocker recorded or card in Blocked list</td></tr>
     <tr><td class="mono">3</td><td>${chip('AT RISK', 'atrisk')}</td><td>Any other signal fires</td></tr><tr><td class="mono">4</td><td>${chip('ON TRACK', 'ontrack')}</td><td>No signal</td></tr></table></div>`
);
const runRow = (k, label) => {
  const r = runs[k];
  return `<tr><td><b>${label}</b><div class="m mono" style="font-size:12px;color:var(--muted)">${r.geminiModel}</div></td><td>${chip(r.selectReport.source === 'ai' ? 'AI REPORT' : 'RULE REPORT', r.selectReport.source === 'ai' ? 'ontrack' : 'atrisk')}</td><td style="font-size:13.5px;color:var(--ink-2)">${esc(short(r))}</td><td>${chip('ok · #' + r.telegram.message_id, 'ontrack')}</td><td class="mono">${Object.values(r.nodes).filter((n) => n.status === 'success').length}/9</td></tr>`;
};
SHOTS['12-end-to-end-result'] = page(
  head('END-TO-END RESULT', 'Three report paths, all executed in n8n, all delivered', `Same workflow, same Trello data, three Gemini behaviours. Every run reached Telegram. Plus ${T.pass}/${T.total} automated tests on the engine.`,
    chip(`${T.pass}/${T.total} TESTS PASS`, 'ontrack') + chip('3/3 n8n RUNS DELIVERED', 'ontrack') + chip('12/12 SCENARIOS', 'ontrack')) +
    `<div class="rc" style="position:absolute;left:72px;right:72px;top:262px;padding:0;overflow:hidden"><table class="t"><tr><th>Gemini behaviour</th><th>Report sent</th><th>Select Report reason</th><th>Telegram</th><th>Nodes OK</th></tr>
     ${runRow('faithful', 'Correct report')}${runRow('contradict', 'Contradicts rules')}${runRow('unavailable', 'Unavailable (503)')}</table></div>
     <div class="rc" style="position:absolute;left:72px;right:72px;top:600px;padding:20px 24px"><div class="label" style="color:var(--teal-d)">ACCEPTANCE SCENARIOS</div>
     <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px 24px;margin-top:14px">${SCEN.map(([id, n, e]) => `<div style="display:flex;gap:10px;font-size:15px"><span style="color:var(--green);font-weight:800">✓</span><span><b style="font-weight:600">${id} ${n}</b><br><span style="color:var(--muted);font-size:13.5px">${e}</span></span></div>`).join('')}</div></div>`
);

// ---------- presentation (13 slides) ----------
const SL_CSS = `@page{size:1920px 1080px;margin:0}body{margin:0}
  .sl{width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);break-after:page}
  .sl.dark{background:radial-gradient(1300px 700px at 85% -10%,rgba(45,212,191,.22),transparent 60%),var(--navy);color:#fff}
  .sf{position:absolute;left:96px;right:96px;bottom:0;height:62px;display:flex;align-items:center;justify-content:space-between;font:500 14px var(--mono);color:var(--muted);border-top:1px solid var(--line)}
  .dark .sf{color:#7C8BA5;border-color:rgba(255,255,255,.1)}
  .st{position:absolute;left:96px;top:72px;right:96px}.st .label{color:var(--teal-d)}.dark .st .label{color:var(--teal)}
  .st h1{font-size:56px;margin-top:10px;font-weight:800}.st p{font-size:24px;line-height:1.5;color:var(--ink-2);max-width:1600px;margin-top:14px}.dark .st p{color:#B6C2D6}
  .shot{position:absolute;left:96px;right:96px;top:290px;bottom:86px;border-radius:14px;overflow:hidden;border:1px solid var(--line);box-shadow:0 24px 60px rgba(15,23,42,.14);background:#fff}
  .shot img{position:absolute;width:100%}
  .rc{background:#fff;color:var(--ink);border:1px solid var(--line);border-radius:16px;padding:26px 30px} .rc b{display:block;font:700 26px var(--head);margin-bottom:8px} .rc .m{font-size:20px;line-height:1.5;color:var(--ink-2)}
  .g3{position:absolute;left:96px;right:96px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
  table.t{border-collapse:collapse;width:100%;font-size:19px} table.t th{font:500 13px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;padding:11px 18px;background:#F8FAFC;border-bottom:1px solid var(--line)} table.t td{padding:10px 18px;border-bottom:1px solid #EEF2F6}`;
let slideNo = 0;
const slide = (inner, dark = false) => `<section class="sl${dark ? ' dark' : ''}">${inner}<div class="sf"><span>${FOOT}</span><span>${String(++slideNo).padStart(2, '0')} / 13</span></div></section>`;
const st = (label, title, text = '') => `<div class="st"><div class="label">${label}</div><h1>${title}</h1>${text ? `<p>${text}</p>` : ''}</div>`;
const shotImg = (src, offsetPct = 0) => `<div class="shot"><img src="${src}" style="top:${-offsetPct}%"></div>`;
const buildSlides = (shots) => {
  slideNo = 0;
  const s = [];
  s.push(slide(`<div class="st" style="top:150px"><div class="label">PORTFOLIO PROJECT P08</div><h1 style="font-size:116px;line-height:1.02">AI Project Manager</h1>
    <p style="font-size:38px;color:#B6C2D6;margin-top:24px;font-family:var(--head);font-weight:600">Trello <span style="color:var(--teal)">+</span> n8n <span style="color:var(--teal)">+</span> Gemini <span style="color:var(--teal)">+</span> Telegram</p>
    <p style="font-size:26px;max-width:1300px">An n8n workflow that reads a Trello board, decides project health with clear rules, has Gemini write a short founder report, checks it against the rules, and sends it on Telegram.</p>
    <div style="display:flex;gap:16px;margin-top:44px">${[['OVERDUE', 'overdue'], ['BLOCKED', 'blocked'], ['AT RISK', 'atrisk'], ['ON TRACK', 'ontrack']].map(([t, c]) => chip(t, c, 'font-size:20px;padding:11px 22px')).join('')}</div></div>`, true));
  s.push(slide(st('01 · PROBLEM', 'Founders hear about late projects too late', 'The data is already in Trello, but nobody opens every card every morning.') +
    `<div class="g3" style="top:420px">${[['Scattered signals', 'Deadlines, hours, blockers and dependencies sit in different fields on different cards.'], ['Hidden knock-on effects', 'One blocked card quietly delays every card that depends on it.'], ['AI alone is not reliable', 'Asking a model "is this at risk?" can give a different answer each run, with no audit trail.']].map(([t, m]) => `<div class="rc"><b>${t}</b><div class="m">${m}</div></div>`).join('')}</div>`));
  s.push(slide(st('02 · SOLUTION', 'Rules decide. AI explains. n8n delivers.') +
    `<div class="g3" style="top:300px;grid-template-columns:repeat(2,1fr)">${[['Trello stays the source of truth', 'No new tool for the team. Lists, due dates and 9 custom fields.'], ['n8n runs it every weekday', '08:00 schedule plus a manual run button. 10 nodes, importable JSON.'], ['Deterministic rule engine', 'Same input, same answer. Every flag carries a plain-English reason.'], ['Gemini writes, rules check', 'AI text is used only if it agrees with the rules. Otherwise the rule report is sent.']].map(([t, m]) => `<div class="rc"><b>${t}</b><div class="m">${m}</div></div>`).join('')}</div>`));
  s.push(slide(`<div class="shot" style="top:40px;bottom:80px;border:0;box-shadow:none;background:transparent"><img src="${img('architecture/P08-architecture.png')}" style="height:100%;width:auto;left:50%;transform:translateX(-50%)"></div>`));
  s.push(slide(st('04 · TRELLO SOURCE', 'The board the workflow reads', '12 projects · 6 lists · owner, priority, deadline, hours, blocker, dependency, risk level, next milestone, decision required.') + shotImg(cap.board, 0)));
  s.push(slide(st('05 · n8n AUTOMATION', 'Captured while it runs', `Real execution in n8n: ${(live.doneAt - live.clickedAt).toFixed(1)} s from click to finish. Each node turns green with its item count.`) + shotImg(img('screenshots/05-n8n-execution.png'), 20)));
  s.push(slide(st('06 · RULE ENGINE', 'Nine signals, fixed precedence') +
    `<div class="rc" style="position:absolute;left:96px;right:96px;top:240px;padding:0;overflow:hidden"><table class="t"><tr><th>Signal</th><th>Rule</th><th>Severity</th></tr>${RULES.map(([n, c, r, sv]) => `<tr><td>${chip(n.toUpperCase(), c, 'font-size:14px')}</td><td>${r}</td><td class="mono">${sv}</td></tr>`).join('')}</table></div>`));
  s.push(slide(st('07 · GEMINI', 'The AI gets facts, not decisions', 'Gemini receives the computed results as JSON with strict instructions: never change a status, use only the given facts, name every overdue and blocked project, max 170 words.') +
    `<div class="rc" style="position:absolute;left:96px;right:96px;top:380px;bottom:100px;overflow:hidden"><div class="label" style="color:var(--teal-d)">AI REPORT FROM THE RUN (ACCEPTED)</div><div style="font-size:19px;line-height:1.55;color:var(--ink-2);margin-top:12px;white-space:pre-wrap;columns:2;column-gap:48px">${esc(run.selectReport.reportText)}</div></div>`));
  s.push(slide(st('08 · VALIDATION + FALLBACK', 'The founder always gets a correct report') +
    `<div class="g3" style="top:270px">${[['Correct report', 'ontrack', 'AI REPORT SENT', runs.faithful], ['Contradicts rules', 'atrisk', 'RULE REPORT SENT', runs.contradict], ['Gemini unavailable', 'atrisk', 'RULE REPORT SENT', runs.unavailable]].map(([t, c, l, r]) => `<div class="rc"><b>${t}</b>${chip(l, c, 'font-size:15px')}<div class="m" style="margin-top:14px;font-size:17px">${esc(short(r))}</div><div class="m" style="margin-top:12px;font-size:16px;color:var(--muted)">Telegram ok · message #${r.telegram.message_id}</div></div>`).join('')}</div>
     <div class="rc" style="position:absolute;left:96px;right:96px;top:640px"><b>Checks on the AI text</b><div class="m">Not empty, under 2,500 characters · names every OVERDUE and BLOCKED project · never describes a non-healthy project as "on track".</div></div>`));
  s.push(slide(st('09 · TELEGRAM OUTPUT', 'One clear message, every weekday 08:00') + shotImg(img('screenshots/08-telegram.png'), 21)));
  s.push(slide(st('10 · TEST SCENARIOS', `12 scenarios · ${T.pass}/${T.total} automated tests pass`) +
    `<div class="rc" style="position:absolute;left:96px;right:96px;top:240px;padding:0;overflow:hidden"><table class="t"><tr><th>#</th><th>Scenario</th><th>Expected and verified</th><th>Where</th></tr>${SCEN.map(([i, n, e, w]) => `<tr><td class="mono">${i}</td><td><b style="font-weight:600">${n}</b></td><td>${e}</td><td class="mono" style="font-size:15px">${w}</td></tr>`).join('')}</table></div>`));
  s.push(slide(st('11 · FINAL RESULT', 'What the system does today') + shotImg(img('screenshots/12-end-to-end-result.png'), 20)));
  s.push(slide(st('12 · TECHNOLOGY STACK', 'Small, standard and easy to hand over') +
    `<div class="g3" style="top:260px">${[['n8n 1.123', 'Schedule + manual triggers, HTTP Request, Code, Telegram nodes. Credentials stored in n8n.'], ['Trello REST API', 'Lists, custom fields and open cards. Key + token via the n8n Trello credential.'], ['Google Gemini API', 'generateContent, temperature 0.2, 30 s timeout, error output continues the flow.'], ['JavaScript rule engine', 'One dependency-free file, embedded unchanged in the n8n Code nodes.'], ['Telegram Bot API', 'HTML message, link previews off, 3 retries.'], ['Node.js test runner', `${T.total} tests: rules, edge cases, invalid input, parsing, validation, message format.`]].map(([t, m]) => `<div class="rc"><b>${t}</b><div class="m">${m}</div></div>`).join('')}</div>`, true));
  return `<!doctype html><html><head><meta charset="utf-8">${CSS}<style>${SL_CSS}</style></head><body>${s.join('')}</body></html>`;
};

// ---------- case study (A4) ----------
const CS_CSS = `@page{size:A4;margin:0}body{margin:0}
  .pg{width:210mm;height:297mm;position:relative;overflow:hidden;background:#fff;break-after:page;padding:16mm 16mm 20mm}
  .pg.dark{background:radial-gradient(600px 400px at 90% -5%,rgba(45,212,191,.25),transparent 60%),var(--navy);color:#fff}
  .pf{position:absolute;left:16mm;right:16mm;bottom:8mm;font:500 7.5pt var(--mono);color:var(--muted);border-top:1px solid var(--line);padding-top:3mm;display:flex;justify-content:space-between}
  .dark .pf{border-color:rgba(255,255,255,.12);color:#7C8BA5}
  h2{font-size:16pt;margin:0 0 2.5mm}
  p,li{font-size:9.4pt;line-height:1.55;color:var(--ink-2);margin:0 0 2.2mm} .dark p{color:#B6C2D6} ul,ol{padding-left:5mm;margin:0 0 2mm}
  .fig{width:100%;border:1px solid var(--line);border-radius:2.5mm;display:block;margin:2.5mm 0}
  .cap{font:500 7pt var(--mono);color:var(--muted);margin:-1mm 0 3mm}
  .lbl{font:500 7.5pt var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--teal-d);margin:4mm 0 1.5mm}
  table{border-collapse:collapse;width:100%;font-size:8.6pt;margin:1mm 0 3mm} td,th{border-bottom:1px solid var(--line);padding:1.6mm 2.2mm;text-align:left;vertical-align:top} th{font:500 6.8pt var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}`;
let pn = 0;
const cpage = (inner, dark = false) => `<section class="pg${dark ? ' dark' : ''}">${inner}<div class="pf"><span>P08 · AI Project Manager · Case study</span><span>${++pn}</span></div></section>`;
const buildCase = () => {
  pn = 0;
  return `<!doctype html><html><head><meta charset="utf-8">${CSS}<style>${CS_CSS}</style></head><body>
${cpage(`<img src="${img('cover/P08-cover.png')}" style="width:100%;border-radius:3mm">
  <div class="lbl" style="color:var(--teal);margin-top:8mm">CASE STUDY</div>
  <h1 style="font-size:25pt;line-height:1.12">Daily project health for a founder, from Trello to Telegram, with AI that can't overrule the facts</h1>
  <p style="font-size:10.5pt;margin-top:4mm">An n8n workflow reads a Trello board every weekday morning, decides each project's health with deterministic rules, asks Gemini to turn the results into a short founder note, checks that note against the rules, and delivers it on Telegram. If the AI fails or gets something wrong, the rule-based report is sent instead.</p>`, true)}
${cpage(`<div class="lbl">01 · Problem</div><h2>The data is in Trello, but the picture isn't</h2>
  <p>Teams already track delivery on a Trello board. The founder needs a quick answer to "what is late, what is stuck, and what needs me?" — but the signals are spread across due dates, custom fields, activity dates and links between cards. Checking by hand takes time, so problems are often noticed late.</p>
  <p>Simply asking an AI model to judge each project does not fix this: the answer can change from run to run, and nobody can see why a project was marked at risk.</p>
  <div class="lbl">02 · Solution</div><h2>Rules decide. AI explains. n8n delivers.</h2>
  <ul><li><b>Trello</b> stays the single source of truth. No new tool for the team.</li>
  <li><b>n8n</b> runs the flow on a weekday 08:00 schedule, or on demand.</li>
  <li>A <b>deterministic rule engine</b> sets OVERDUE, BLOCKED, AT RISK or ON TRACK, and records a reason for every flag.</li>
  <li><b>Gemini</b> only writes the summary from those facts; it cannot change a status.</li>
  <li>A <b>validation step</b> rejects AI text that drops a critical project or contradicts the rules.</li>
  <li><b>Telegram</b> delivers one clear message. The founder always gets a correct report.</li></ul>
  <div class="lbl">03 · Technical stack</div>
  <table><tr><th>Layer</th><th>Technology</th><th>Notes</th></tr>
  <tr><td>Source</td><td>Trello REST API</td><td>Lists, custom fields, open cards · key + token via n8n Trello credential</td></tr>
  <tr><td>Orchestration</td><td>n8n 1.123</td><td>Schedule + manual triggers, HTTP Request, Code and Telegram nodes</td></tr>
  <tr><td>Rules</td><td>JavaScript (no dependencies)</td><td>One file, embedded unchanged in the n8n Code nodes, unit tested</td></tr>
  <tr><td>AI</td><td>Google Gemini API</td><td>generateContent, temperature 0.2, 30 s timeout, errors continue the flow</td></tr>
  <tr><td>Delivery</td><td>Telegram Bot API</td><td>HTML message, 3 retries</td></tr>
  <tr><td>Testing</td><td>Node.js test runner</td><td>${T.total} tests, 12 acceptance scenarios</td></tr></table>`)}
${cpage(`<div class="lbl">04 · Architecture</div><h2>Main path and fallback path</h2>
  <img class="fig" src="${img('architecture/P08-architecture.png')}">
  <div class="lbl">05 · How the automation works</div>
  <ol><li>The schedule (weekdays 08:00) or the Run Now button starts the workflow. A Config node holds the board ID, chat ID, model name and timezone.</li>
  <li>Three HTTP Request nodes read the board's lists, custom field definitions and open cards from the Trello API (3 retries, 30 s timeout).</li>
  <li>The Risk Engine node maps each card to a project record and applies the rules. It outputs the result, a rule-based report, and the AI prompt.</li>
  <li>The Gemini node sends the prompt. If it errors, the flow continues instead of stopping.</li>
  <li>Select Report validates the AI text and picks the report to send, recording the source and the reason.</li>
  <li>The Telegram node sends the message to the founder.</li></ol>`)}
${cpage(`<div class="lbl">06 · Trello source data</div><h2>12 projects, 6 lists, 9 custom fields</h2>
  <img class="fig" src="${img('screenshots/02-trello-board.png')}"><div class="cap">Board view rendered from the Trello API data used in the n8n runs.</div>
  <div class="lbl">07 · Risk detection logic</div><h2>Fixed precedence: OVERDUE › BLOCKED › AT RISK › ON TRACK</h2>
  <table><tr><th>Signal</th><th>Rule</th><th>Severity</th></tr>${RULES.map(([n, , r, sv]) => `<tr><td><b>${n}</b></td><td>${r}</td><td class="mono">${sv}</td></tr>`).join('')}</table>
  <p>Done cards are excluded. "Decision Required" items are listed for the founder separately and do not change health.</p>`)}
${cpage(`<div class="lbl">08 · Result on the board</div><h2>${S.active} active projects: ${S.overdue} overdue, ${S.blocked} blocked, ${S.atRisk} at risk, ${S.onTrack} on track</h2>
  <img class="fig" src="${img('screenshots/11-overdue-at-risk.png')}">
  <img class="fig" src="${img('screenshots/10-blocker-scenario.png')}" style="max-height:105mm;object-fit:cover;object-position:top">`)}
${cpage(`<div class="lbl">09 · AI reporting</div><h2>Gemini gets facts, not decisions</h2>
  <p>The prompt contains only the computed results as JSON, with fixed instructions: never change or re-judge a status, use only the given facts, name every OVERDUE and BLOCKED project, plain text, at most 170 words.</p>
  <div class="lbl">10 · Validation and fallback</div><h2>Three outcomes, all executed in n8n</h2>
  <table><tr><th>AI response</th><th>Report sent</th><th>Reason recorded by Select Report</th><th>Telegram</th></tr>
  ${[['Correct report', runs.faithful], ['Contradicts the rules', runs.contradict], ['Unavailable (HTTP 503)', runs.unavailable]].map(([l, r]) => `<tr><td>${l}</td><td>${r.selectReport.source === 'ai' ? 'AI report' : 'Rule report'}</td><td>${esc(short(r))}</td><td>ok · #${r.telegram.message_id}</td></tr>`).join('')}</table>
  <img class="fig" src="${img('screenshots/07-gemini-report.png')}" style="max-height:120mm;object-fit:cover;object-position:top">`)}
${cpage(`<div class="lbl">11 · Telegram output</div><h2>What the founder receives</h2>
  <img class="fig" src="${img('screenshots/08-telegram.png')}" style="max-height:118mm;object-fit:cover;object-position:top">
  <div class="lbl">12 · Running workflow</div><h2>Captured during a real n8n execution</h2>
  <img class="fig" src="${img('screenshots/05-n8n-execution.png')}" style="max-height:105mm;object-fit:cover;object-position:top">`)}
${cpage(`<div class="lbl">13 · Key scenarios tested</div><h2>${T.pass} of ${T.total} automated tests pass · 12 acceptance scenarios</h2>
  <table><tr><th>#</th><th>Scenario</th><th>Expected and verified</th><th>Where</th></tr>${SCEN.map(([i, n, e, w]) => `<tr><td class="mono">${i}</td><td>${n}</td><td>${e}</td><td>${w}</td></tr>`).join('')}</table>
  <div class="lbl">14 · Final result</div><h2>What works today</h2>
  <ul><li>Importable n8n workflow, executed end to end in n8n 1.123 with every node succeeding.</li>
  <li>Correct health and a reason for all 12 projects; same answer on every run.</li>
  <li>AI report used only when it agrees with the rules; rule report otherwise. All three paths delivered to Telegram.</li>
  <li>Credentials stored only in n8n; none in code, documents or git.</li></ul>
  <div class="lbl">Test environment</div>
  <p>The n8n runs used the production workflow file with a local Trello API stand-in serving the board data, and a Gemini-API-compatible test endpoint for the AI step. Telegram delivery was live. Connecting a live Trello board and Gemini key needs only the three n8n credentials described in the HOW-TO.</p>`)}
</body></html>`;
};

// ---------- render ----------
(async () => {
  for (const d of ['cover', 'architecture', 'screenshots', 'case-study', 'presentation', 'build/portfolio']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
  const browser = await chromium.launch();
  const open = async (html, name, w, h) => {
    const f = path.join(ROOT, 'build/portfolio', name + '.html');
    fs.writeFileSync(f, html);
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto('file://' + f, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    return p;
  };
  const png = async (html, out) => {
    const p = await open(html, path.basename(out, '.png'), 1600, 1200);
    await p.screenshot({ path: path.join(ROOT, out) });
    await p.close();
    console.log('png', out);
  };
  await png(PAGES.cover, 'cover/P08-cover.png');
  await png(PAGES.architecture, 'architecture/P08-architecture.png');
  for (const [name, html] of Object.entries(SHOTS)) await png(html, `screenshots/${name}.png`);
  let p = await open(buildSlides(), 'presentation', 1920, 1080);
  await p.pdf({ path: path.join(ROOT, 'presentation/P08-presentation.pdf'), width: '1920px', height: '1080px', printBackground: true });
  await p.close();
  console.log('pdf presentation/P08-presentation.pdf');
  p = await open(buildCase(), 'case-study', 794, 1123);
  await p.pdf({ path: path.join(ROOT, 'case-study/P08-case-study.pdf'), format: 'A4', printBackground: true });
  await p.close();
  console.log('pdf case-study/P08-case-study.pdf');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
