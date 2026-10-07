#!/usr/bin/env node
/**
 * Controlled n8n test environment for P08 (used to produce the evidence in evidence/).
 *
 * Runs the production workflow JSON in a throwaway n8n instance, changing only Config values:
 *   trelloBaseUrl -> local Trello API stand-in (scripts/mock-trello-server.js, fixture data)
 *   geminiBaseUrl -> Gemini-API-compatible test endpoint (scripts/mock-gemini-server.js)
 *   telegram      -> REAL Telegram Bot API (token/chat id from env, stored only in n8n's encrypted store)
 *
 *   N8N_BIN=/path/to/n8n TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... node scripts/n8n-harness.js setup <dataDir>
 *   ... node scripts/n8n-harness.js run <dataDir> <scenario>      scenario: faithful | contradict | unavailable
 *
 * Secrets are never printed or written to the repository; run output is scrubbed before saving.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const [cmd, dataDir, scenario] = process.argv.slice(2);
const N8N = process.env.N8N_BIN || 'n8n';
const SCENARIOS = {
  faithful: { id: 'p08Faithful', model: 'p08-test-faithful', name: 'P08 — AI Project Manager' },
  contradict: { id: 'p08Contradict', model: 'p08-test-contradict', name: 'P08 — scenario: AI contradicts rules' },
  unavailable: { id: 'p08Unavailable', model: 'p08-test-unavailable', name: 'P08 — scenario: AI unavailable' },
};

function env() {
  const keyFile = path.join(dataDir, '.p08-enc');
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(24).toString('base64'), { mode: 0o600 });
  return Object.assign({}, process.env, {
    N8N_USER_FOLDER: dataDir,
    N8N_ENCRYPTION_KEY: fs.readFileSync(keyFile, 'utf8'),
    N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_RUNNERS_ENABLED: 'true',
    N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true',
  });
}
const n8n = (args) => execFileSync(N8N, args, { env: env(), stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).toString();
const scrub = (text) =>
  [process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID].filter(Boolean).reduce((t, s) => t.split(s).join('[redacted]'), text);

function setup() {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const creds = [
    { id: 'p08TrelloApi', name: 'P08 Trello API', type: 'trelloApi', data: { apiKey: 'test-environment-key', apiToken: 'test-environment-token' } },
    { id: 'p08GeminiKey', name: 'P08 Gemini API Key', type: 'httpHeaderAuth', data: { name: 'x-goog-api-key', value: 'test-environment-key' } },
    { id: 'p08TelegramBot', name: 'P08 Telegram Bot', type: 'telegramApi', data: { accessToken: TELEGRAM_BOT_TOKEN, baseUrl: 'https://api.telegram.org' } },
  ];
  const credFile = path.join(dataDir, `creds-${process.pid}.json`);
  fs.writeFileSync(credFile, JSON.stringify(creds), { mode: 0o600 });
  try {
    n8n(['import:credentials', `--input=${credFile}`]);
  } finally {
    fs.writeFileSync(credFile, crypto.randomBytes(512)); // overwrite before unlinking
    fs.unlinkSync(credFile);
  }
  const board = require(path.join(ROOT, 'fixtures/trello-board.json'));
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflow/p08-ai-project-manager.workflow.json'), 'utf8'));
  for (const sc of Object.values(SCENARIOS)) {
    const wf = JSON.parse(JSON.stringify(base));
    Object.assign(wf, { id: sc.id, name: sc.name, active: false });
    const cfg = wf.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments;
    const set = (k, v) => (cfg.find((a) => a.name === k).value = v);
    set('trelloBaseUrl', 'http://127.0.0.1:4010');
    set('trelloBoardId', board.boardId);
    set('telegramChatId', TELEGRAM_CHAT_ID);
    set('geminiBaseUrl', 'http://127.0.0.1:4020');
    set('geminiModel', sc.model);
    set('aiLabel', 'Gemini-compatible test endpoint');
    set('asOfOverride', board.asOf);
    const f = path.join(dataDir, `${sc.id}.json`);
    fs.writeFileSync(f, JSON.stringify(wf), { mode: 0o600 });
    n8n(['import:workflow', `--input=${f}`]);
    fs.unlinkSync(f);
  }
  console.log('n8n test environment ready:', Object.keys(SCENARIOS).join(', '));
}

function run() {
  const sc = SCENARIOS[scenario];
  if (!sc) throw new Error('unknown scenario ' + scenario);
  let raw;
  try {
    raw = n8n(['execute', `--id=${sc.id}`, '--rawOutput']);
  } catch (e) {
    raw = (e.stdout || '').toString();
  }
  const end = raw.lastIndexOf('\nError executing');
  const exec = JSON.parse(raw.slice(raw.indexOf('{'), end > 0 ? end : undefined));
  const rd = exec.data.resultData;
  const out = (node) => ((((rd.runData[node] || [])[0] || {}).data || {}).main || [[]])[0].map((i) => i.json);
  const sel = out('Select Report')[0] || {};
  const tg = out('Telegram: Notify Founder')[0] || {};
  const evidence = {
    scenario,
    geminiModel: sc.model,
    startedAt: new Date(rd.runData['Run Now'][0].startTime).toISOString(),
    error: rd.error ? rd.error.message : null,
    nodes: Object.fromEntries(
      Object.entries(rd.runData).map(([n, v]) => [n, { status: v[0].executionStatus, ms: v[0].executionTime, items: out(n).length }])
    ),
    selectReport: { source: sel.source, reason: sel.reason, reportText: sel.reportText, aiText: sel.aiText, telegramText: sel.telegramText },
    telegram: tg.ok === undefined ? null : { ok: tg.ok, message_id: tg.result && tg.result.message_id, date: tg.result && new Date(tg.result.date * 1000).toISOString() },
    result: sel.result,
  };
  const file = path.join(ROOT, `evidence/n8n-run-${scenario}.json`);
  const text = scrub(JSON.stringify(evidence, null, 2));
  JSON.parse(text); // must still be valid JSON after redaction
  fs.writeFileSync(file, text + '\n');
  console.log(`${scenario}: error=${evidence.error} source=${evidence.selectReport.source} telegram=${JSON.stringify(evidence.telegram)}`);
  console.log(`  reason: ${evidence.selectReport.reason}`);
}

if (!dataDir) throw new Error('usage: n8n-harness.js setup|run <dataDir> [scenario]');
({ setup, run })[cmd]();
