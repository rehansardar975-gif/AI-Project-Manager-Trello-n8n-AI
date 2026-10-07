#!/usr/bin/env node
/**
 * Renders video/P08-video.mp4 (1920x1080, 30 fps, 60 s) from real project captures.
 * Every frame is drawn by a timeline function (render(t)) and captured with Playwright,
 * then muxed with video/audio/voiceover.wav and video/audio/music.wav (see build-audio.py).
 *
 *   node scripts/build-video.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');

const ROOT = path.join(__dirname, '..');
const EV = path.join(ROOT, 'evidence');
const FPS = 30;
const LEN = 60;
const run = JSON.parse(fs.readFileSync(path.join(EV, 'n8n-run-faithful.json'), 'utf8'));
const live = JSON.parse(fs.readFileSync(path.join(EV, 'n8n-live/timeline.json'), 'utf8'));
const uri = (p) => 'file://' + path.join(ROOT, p);
const s = run.result.summary;
const proj = (n) => run.result.projects.find((p) => p.project === n);

const aiLines = run.selectReport.reportText.split('\n').slice(0, 16);
const tgText = run.selectReport.telegramText.split('\n').slice(0, 10).join('<br>');

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${uri('assets/p08.css')}">
<style>
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:var(--navy)}
.bg{position:absolute;inset:0;background:radial-gradient(1300px 760px at 82% -12%,rgba(45,212,191,.24),transparent 60%),radial-gradient(900px 700px at -10% 115%,rgba(45,212,191,.10),transparent 60%),var(--navy)}
.sc{position:absolute;inset:0;opacity:0}
.cap{position:absolute;left:96px;top:64px;color:#fff}
.cap .label{color:var(--teal)}
.cap h2{font:800 46px var(--head);margin-top:8px;letter-spacing:-.02em}
.frame{position:absolute;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 40px 90px rgba(0,0,0,.45),0 0 0 1px rgba(45,212,191,.25)}
.frame .bar{height:40px;background:#16233F;display:flex;align-items:center;gap:8px;padding:0 16px}
.frame .dot{width:11px;height:11px;border-radius:50%}
.frame .url{margin-left:14px;font:500 13px var(--mono);color:#8FA3C0}
.frame .view{position:absolute;top:40px;left:0;right:0;bottom:0;overflow:hidden;background:#fff}
.frame .view img{position:absolute;left:0;top:0;width:100%;transform-origin:0 0}
.note{position:absolute;font:500 15px var(--mono);color:#8FA3C0;letter-spacing:.04em}
.kpi{position:absolute;width:250px;padding:22px 24px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff}
.kpi .n{font:800 64px var(--head);line-height:1}
.reason{position:absolute;left:1180px;width:640px;padding:18px 22px;border-radius:14px;background:#fff;color:var(--ink);box-shadow:0 20px 50px rgba(0,0,0,.35)}
.reason b{font:700 20px var(--head);display:block;margin:8px 0 4px}
.reason span{font-size:16.5px;color:var(--ink-2)}
.card{position:absolute;background:#fff;border-radius:18px;box-shadow:0 30px 70px rgba(0,0,0,.4);color:var(--ink)}
.check{display:flex;gap:12px;align-items:center;font-size:19px;margin:12px 0;color:var(--ink-2)}
.check i{width:28px;height:28px;border-radius:50%;background:var(--green-bg);color:var(--green);display:grid;place-items:center;font-style:normal;font-weight:800}
.phone{position:absolute;width:520px;height:760px;border-radius:52px;background:#0E1621;border:10px solid #22304A;box-shadow:0 40px 90px rgba(0,0,0,.5);overflow:hidden}
.tgtop{height:86px;background:#17212B;display:flex;align-items:flex-end;padding:0 22px 14px;gap:12px;color:#fff}
.tgav{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,var(--teal),var(--teal-d));display:grid;place-items:center;font:800 14px var(--head);color:var(--navy)}
.bubble{position:absolute;left:18px;right:40px;background:#182533;color:#E9EEF3;border-radius:16px 16px 16px 4px;padding:14px 16px;font-size:15.5px;line-height:1.5}
</style></head><body><div class="bg"></div>

<section class="sc" id="s1">
  <div style="position:absolute;left:150px;top:250px;right:150px;color:#fff">
    <div id="s1chips" style="display:flex;gap:12px"><span class="chip dark" style="font-size:15px;padding:8px 16px">PORTFOLIO PROJECT P08</span></div>
    <h1 id="s1t" style="font:800 128px var(--head);letter-spacing:-.03em;margin-top:34px">AI Project Manager</h1>
    <div id="s1s" style="display:flex;gap:18px;margin-top:34px;font:600 34px var(--head);color:#B6C2D6">
      ${['Trello', 'n8n', 'Gemini', 'Telegram'].map((x, i) => `<span class="s1w" style="opacity:0">${i ? '<span style="color:var(--teal);margin-right:18px">→</span>' : ''}${x}</span>`).join('')}
    </div>
    <div id="s1h" style="display:flex;gap:16px;margin-top:60px">${[['OVERDUE', 'overdue'], ['BLOCKED', 'blocked'], ['AT RISK', 'atrisk'], ['ON TRACK', 'ontrack']].map(([t, c]) => `<span class="chip ${c} s1c" style="font-size:18px;padding:10px 20px;opacity:0">${t}</span>`).join('')}</div>
  </div>
</section>

<section class="sc" id="s2">
  <div class="cap"><div class="label">01 · SOURCE OF TRUTH</div><h2>Trello board: 12 projects, 9 custom fields</h2></div>
  <div class="frame" style="left:96px;top:200px;width:1728px;height:812px"><div class="bar"><span class="dot" style="background:#F87171"></span><span class="dot" style="background:#FBBF24"></span><span class="dot" style="background:#34D399"></span><span class="url">Trello board · P08 Delivery Portfolio</span></div>
    <div class="view"><img id="s2img" src="${uri('evidence/captures/trello-board.png')}"></div></div>
  <div class="frame" id="s2card" style="left:560px;top:250px;width:1000px;height:603px;opacity:0"><div class="bar"><span class="dot" style="background:#F87171"></span><span class="dot" style="background:#FBBF24"></span><span class="dot" style="background:#34D399"></span><span class="url">Card · Client Portal v2</span></div>
    <div class="view"><img src="${uri('evidence/captures/trello-card-client-portal.png')}" style="width:1600px;left:-300px;top:-34px"></div></div>
  <div class="note" style="left:96px;top:1030px">Board view rendered from the Trello API data used in the run</div>
</section>

<section class="sc" id="s3">
  <div class="cap"><div class="label">02 · LIVE RUN IN n8n</div><h2>Every node turns green as it finishes</h2></div>
  <div class="frame" style="left:96px;top:200px;width:1728px;height:812px"><div class="bar"><span class="dot" style="background:#F87171"></span><span class="dot" style="background:#FBBF24"></span><span class="dot" style="background:#34D399"></span><span class="url">n8n · P08 — AI Project Manager · Execute workflow</span></div>
    <div class="view" id="s3view">${live.frames.map((f, i) => `<img class="lf" data-t="${f.t}" src="${uri('evidence/n8n-live/frames/' + f.file)}" style="display:${i ? 'none' : 'block'}">`).join('')}</div></div>
  <div class="note" style="left:96px;top:1030px" id="s3note">Real n8n execution · played at half speed</div>
</section>

<section class="sc" id="s4">
  <div class="cap"><div class="label">03 · RULES DECIDE HEALTH</div><h2>Deterministic, with a reason for every flag</h2></div>
  ${[['Overdue', s.overdue, 'var(--red)'], ['Blocked', s.blocked, '#A78BFA'], ['At risk', s.atRisk, '#FBBF24'], ['On track', s.onTrack, '#34D399']]
    .map(([l, n, c], i) => `<div class="kpi s4k" style="left:${96 + i * 270}px;top:230px;opacity:0"><div class="label" style="color:#8FA3C0">${l}</div><div class="n" style="color:${c};margin-top:10px">${n}</div></div>`).join('')}
  <div class="frame" style="left:96px;top:420px;width:1040px;height:590px"><div class="bar"><span class="dot" style="background:#F87171"></span><span class="dot" style="background:#FBBF24"></span><span class="dot" style="background:#34D399"></span><span class="url">Risk Engine output · dashboard</span></div>
    <div class="view"><img id="s4img" src="${uri('evidence/captures/dashboard.png')}"></div></div>
  ${[['Client Portal v2', 'overdue', 'OVERDUE', proj('Client Portal v2').flags[0].message],
     ['Payment Gateway Migration', 'blocked', 'BLOCKED', proj('Payment Gateway Migration').flags[0].message],
     ['Mobile App Release 3.4', 'atrisk', 'AT RISK', proj('Mobile App Release 3.4').flags[0].message],
     ['Data Warehouse Sync', 'atrisk', 'AT RISK', proj('Data Warehouse Sync').flags[0].message]]
    .map(([n, c, h, m], i) => `<div class="reason s4r" style="top:${230 + i * 196}px;opacity:0"><span class="chip ${c}">${h}</span><b>${n}</b><span>${m}</span></div>`).join('')}
</section>

<section class="sc" id="s5">
  <div class="cap"><div class="label">04 · AI REPORT, VALIDATED</div><h2>Gemini writes it. The rules check it.</h2></div>
  <div class="card" style="left:96px;top:210px;width:1060px;height:800px;padding:34px 40px">
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="label" style="color:var(--teal-d)">FOUNDER REPORT · AI TEXT</span><span class="chip teal">${run.result.asOf}</span></div>
    <div id="s5txt" style="margin-top:20px;font-size:19px;line-height:1.55;color:var(--ink-2);white-space:pre-wrap"></div>
  </div>
  <div class="card" style="left:1196px;top:210px;width:628px;height:470px;padding:30px 34px">
    <div class="label" style="color:var(--teal-d)">VALIDATION AGAINST RULES</div>
    ${['Names every OVERDUE and BLOCKED project', 'No project described better than its rule status', 'Not empty, within length limit']
      .map((c) => `<div class="check s5c" style="opacity:0"><i>✓</i>${c}</div>`).join('')}
    <div id="s5ok" style="opacity:0;margin-top:26px"><span class="chip ontrack" style="font-size:20px;padding:12px 22px">ACCEPTED · source = ai</span></div>
  </div>
  <div class="card" id="s5fb" style="left:1196px;top:710px;width:628px;height:300px;padding:28px 34px;opacity:0;background:#16233F;color:#fff;border:1px solid rgba(45,212,191,.35)">
    <div class="label" style="color:var(--teal)">FALLBACK — ALSO TESTED IN n8n</div>
    <div style="font-size:19px;line-height:1.6;margin-top:12px;color:#CBD5E1">AI unavailable (HTTP 503) → rule report sent<br>AI contradicts a status → rejected, rule report sent</div>
  </div>
  <div class="note" style="left:96px;top:1030px">Recorded with a Gemini-API-compatible test endpoint · production uses the Gemini API through n8n</div>
</section>

<section class="sc" id="s6">
  <div class="phone" id="s6p" style="left:180px;top:160px">
    <div class="tgtop"><div class="tgav">P08</div><div><div style="font-weight:700;font-size:17px">AI Project Manager</div><div style="font-size:13px;color:#8FA3C0">bot</div></div></div>
    <div class="bubble" id="s6b" style="top:120px;opacity:0">${tgText}<div style="text-align:right;font-size:12px;color:#6C7883;margin-top:6px">${run.telegram.date.slice(11, 16)} UTC ✓✓</div></div>
  </div>
  <div style="position:absolute;left:820px;top:250px;right:96px;color:#fff">
    <div class="label" style="color:var(--teal)">05 · TELEGRAM</div>
    <h2 style="font:800 60px var(--head);margin-top:12px;letter-spacing:-.02em">One clear message,<br>every weekday 08:00</h2>
    <div id="s6d" style="opacity:0;margin-top:34px;display:flex;gap:12px;flex-wrap:wrap"><span class="chip ontrack" style="font-size:17px;padding:9px 18px">DELIVERED · BOT API ok = true</span><span class="chip dark" style="font-size:17px;padding:9px 18px">MESSAGE #${run.telegram.message_id}</span></div>
    <div id="s6e" style="opacity:0;margin-top:90px;font:700 38px var(--head);color:#B6C2D6">Rules decide. AI explains. <span style="color:var(--teal)">n8n delivers.</span></div>
    <div id="s6f" style="opacity:0;margin-top:26px;font:500 18px var(--mono);color:#7C8BA5">P08 · Muhammad Rehan Ansar</div>
  </div>
</section>

<script>
const AI = ${JSON.stringify(aiLines.join('\n'))};
const LIVE = ${JSON.stringify({ clickedAt: live.clickedAt, doneAt: live.doneAt })};
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const prog = (t, a, b) => ease((t - a) / (b - a));
const $ = (q) => document.querySelector(q), $$ = (q) => [...document.querySelectorAll(q)];
const SC = [['s1', 0, 5.2], ['s2', 5, 15.2], ['s3', 15, 30.2], ['s4', 30, 42.2], ['s5', 42, 52.2], ['s6', 52, 60.5]];
const imgs = $$('.lf');
window.render = (t) => {
  for (const [id, a, b] of SC) {
    const o = Math.min(prog(t, a - .01, a + .45), 1 - prog(t, b - .45, b));
    const el = document.getElementById(id); el.style.opacity = o; el.style.display = o > 0 ? 'block' : 'none';
  }
  // S1 title
  $('#s1t').style.transform = 'translateY(' + (40 * (1 - prog(t, .1, 1.1))) + 'px)'; $('#s1t').style.opacity = prog(t, .1, 1.1);
  $$('.s1w').forEach((e, i) => e.style.opacity = prog(t, 1.0 + i * .45, 1.5 + i * .45));
  $$('.s1c').forEach((e, i) => { e.style.opacity = prog(t, 2.8 + i * .25, 3.3 + i * .25); e.style.transform = 'translateY(' + 14 * (1 - prog(t, 2.8 + i * .25, 3.3 + i * .25)) + 'px)'; });
  // S2 board: slow push-in toward In Progress, then card detail
  const z = 1728 / 1920 * (1 + .14 * prog(t, 5, 10));
  $('#s2img').style.transform = 'translate(' + (-235 * prog(t, 5, 10)) + 'px,' + (-30 * prog(t, 5, 10)) + 'px) scale(' + z / (1728 / 1920) + ')';
  $('#s2img').style.width = '1728px';
  $('#s2card').style.opacity = prog(t, 10.2, 10.9); $('#s2card').style.transform = 'translateY(' + 30 * (1 - prog(t, 10.2, 10.9)) + 'px)';
  // S3 live frames: real time [clickedAt-.6, doneAt+1.6] mapped to video [16.5, 16.5 + 2x]
  const real = LIVE.clickedAt - .6 + Math.max(0, t - 16.5) / 2;
  let k = 0; for (let i = 0; i < imgs.length; i++) if (+imgs[i].dataset.t <= real) k = i;
  imgs.forEach((im, i) => { im.style.display = i === k ? 'block' : 'none'; });
  const zoom = 1 + .05 * prog(t, 15.2, 17);
  imgs[k].style.transform = 'translate(' + (-40 * prog(t, 15.2, 17)) + 'px,' + (-135 * prog(t, 15.2, 17)) + 'px) scale(' + zoom + ')';
  imgs[k].style.width = '1728px';
  $('#s3note').textContent = real >= LIVE.doneAt ? 'Real n8n execution · completed successfully' : 'Real n8n execution · played at half speed';
  // S4
  $$('.s4k').forEach((e, i) => e.style.opacity = prog(t, 30.5 + i * .35, 31 + i * .35));
  $$('.s4r').forEach((e, i) => { e.style.opacity = prog(t, 33 + i * 1.6, 33.6 + i * 1.6); e.style.transform = 'translateX(' + 40 * (1 - prog(t, 33 + i * 1.6, 33.6 + i * 1.6)) + 'px)'; });
  $('#s4img').style.width = '1040px'; $('#s4img').style.transform = 'translateY(' + (-120 * prog(t, 31, 41)) + 'px)';
  // S5 typing + checks
  $('#s5txt').textContent = AI.slice(0, Math.floor(AI.length * prog(t, 42.4, 47.5)));
  $$('.s5c').forEach((e, i) => e.style.opacity = prog(t, 46.5 + i * .6, 47 + i * .6));
  $('#s5ok').style.opacity = prog(t, 48.6, 49.1);
  $('#s5fb').style.opacity = prog(t, 49.6, 50.3);
  // S6
  $('#s6p').style.transform = 'translateY(' + 60 * (1 - prog(t, 52, 53)) + 'px)';
  $('#s6b').style.opacity = prog(t, 53, 53.6); $('#s6b').style.transform = 'translateY(' + 24 * (1 - prog(t, 53, 53.6)) + 'px)';
  $('#s6d').style.opacity = prog(t, 54.3, 54.9); $('#s6e').style.opacity = prog(t, 55.8, 56.6); $('#s6f').style.opacity = prog(t, 56.8, 57.4);
};
window.render(0);
</script></body></html>`;

(async () => {
  const outDir = path.join(ROOT, 'video');
  fs.mkdirSync(path.join(outDir, 'build'), { recursive: true });
  const page_html = path.join(outDir, 'build/timeline.html');
  fs.writeFileSync(page_html, html);
  const silent = path.join(outDir, 'build/silent.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + page_html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const total = FPS * LEN;
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log(`frame ${f}/${total}`);
    if ([60, 270, 500, 900, 1180, 1440, 1700].includes(f)) fs.writeFileSync(path.join(outDir, `build/check-${String(f).padStart(4, '0')}.jpg`), buf);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  // mix: music ducked under the voice (sidechain), then loudness-normalise
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', path.join(outDir, 'audio/voiceover.wav'), '-i', path.join(outDir, 'audio/music.wav'),
    '-filter_complex',
    '[1:a]aformat=channel_layouts=stereo,asplit=2[vo][sc];[2:a]volume=0.55[m];[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];[vo][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]',
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(LEN), '-movflags', '+faststart', path.join(outDir, 'P08-video.mp4')]);
  console.log('video/P08-video.mp4 written');
})().catch((e) => { console.error(e); process.exit(1); });
