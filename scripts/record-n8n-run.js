#!/usr/bin/env node
/**
 * Records a live execution of the P08 workflow in the n8n editor (Playwright):
 *   - frame sequence while the workflow runs (evidence/recording/frames/NNNN.png + timeline.json)
 *   - stills of the canvas before/after and of the key node outputs
 *
 *   N8N_URL=http://127.0.0.1:5678 N8N_OWNER_PASSWORD=... node scripts/record-n8n-run.js <outDir> [workflowId]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');

const BASE = process.env.N8N_URL || 'http://127.0.0.1:5678';
const [outDir, wfId = 'p08Faithful'] = process.argv.slice(2);
const W = 1600;
const H = 900;

(async () => {
  fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.2 });
  const page = await ctx.newPage();
  const pw = process.env.N8N_OWNER_PASSWORD;
  const owner = { email: 'owner@p08.local', firstName: 'P08', lastName: 'Owner', password: pw };
  let r = await page.request.post(BASE + '/rest/owner/setup', { data: owner });
  if (!r.ok()) r = await page.request.post(BASE + '/rest/login', { data: { emailOrLdapLoginId: owner.email, password: pw } });
  if (!r.ok()) throw new Error('login failed: ' + r.status());

  // Redact private identifiers (chat id, bot id) from the DOM before any still is taken.
  const secrets = [process.env.TELEGRAM_CHAT_ID, (process.env.TELEGRAM_BOT_TOKEN || '').split(':')[0]].filter((x) => x && x.length > 3);
  const redact = () =>
    page.evaluate((list) => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) for (const s of list) if (n.nodeValue.includes(s)) n.nodeValue = n.nodeValue.split(s).join('••••••••••');
      for (const el of document.querySelectorAll('input,textarea')) for (const s of list) if (el.value && el.value.includes(s)) el.value = el.value.split(s).join('••••••••••');
    }, secrets);
  const still = async (name) => {
    await redact();
    const leaked = await page.evaluate((list) => list.some((s) => document.body.innerText.includes(s)), secrets);
    if (leaked) throw new Error('redaction failed for ' + name);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
    console.log('still', name);
  };
  const dismiss = async () => {
    for (const t of ['Got it', 'Dismiss', 'Skip', 'Close', 'Maybe later']) {
      const b = page.getByRole('button', { name: t, exact: true });
      if (await b.count()) await b.first().click().catch(() => {});
    }
  };
  const node = (name) => page.locator(`[data-test-id="canvas-node"][data-node-name="${name}"]`).first();

  await page.goto(`${BASE}/workflow/${wfId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await dismiss();
  await page.keyboard.press('Shift+1').catch(() => {}); // zoom to fit
  await page.waitForTimeout(800);
  await still('01-canvas-idle');

  // ---- live execution frame capture ----
  const timeline = [];
  const t0 = Date.now();
  const grab = async () => {
    const f = String(timeline.length).padStart(4, '0') + '.png';
    await page.screenshot({ path: path.join(outDir, 'frames', f) });
    timeline.push({ file: f, t: (Date.now() - t0) / 1000 });
  };
  for (let i = 0; i < 6; i++) await grab(); // idle lead-in
  const btn = page.locator('[data-test-id="execute-workflow-button"]').first();
  await (await btn.count() ? btn : page.getByRole('button', { name: /Execute workflow/ }).first()).click();
  const clickedAt = (Date.now() - t0) / 1000;
  let doneAt = null;
  while ((Date.now() - t0) / 1000 < clickedAt + 25) {
    await grab();
    const running = await page.locator('[data-test-id="canvas-node"] .running, [data-test-id="canvas-node-status-running"]').count();
    const ok = await page.getByText(/executed successfully/i).count();
    if (!doneAt && ok && !running) doneAt = (Date.now() - t0) / 1000;
    if (doneAt && (Date.now() - t0) / 1000 > doneAt + 2) break;
  }
  fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ clickedAt, doneAt, frames: timeline }, null, 1));
  console.log(`frames=${timeline.length} clickedAt=${clickedAt}s doneAt=${doneAt}s`);
  await page.waitForTimeout(1500);
  await still('02-canvas-success');

  // ---- node outputs ----
  for (const [name, file] of [
    ['Trello: Get Cards', '03-node-trello-cards'],
    ['Risk Engine', '04-node-risk-engine'],
    ['Gemini: Founder Report', '05-node-gemini'],
    ['Select Report', '06-node-select-report'],
    ['Telegram: Notify Founder', '07-node-telegram'],
  ]) {
    await node(name).dblclick();
    await page.waitForTimeout(1500);
    const json = page.locator('[data-test-id="ndv-output-panel"]').getByText('JSON', { exact: true }).first();
    if (await json.count()) await json.click().catch(() => {});
    await page.waitForTimeout(800);
    await still(file);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }
  await page.goto(`${BASE}/workflow/${wfId}/executions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await still('08-executions');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
