#!/usr/bin/env node
/**
 * Generates n8n/p08-ai-project-manager.workflow.json.
 *
 * The Risk Engine and Select Report Code nodes embed src/p08-engine.js verbatim,
 * so the logic running in n8n is byte-for-byte the logic covered by the tests.
 * Credentials are referenced by name only; no secret is ever written to the file.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const engineSrc = fs.readFileSync(path.join(root, 'src/p08-engine.js'), 'utf8');

const withEngine = (body) =>
  [
    '// ---- src/p08-engine.js (embedded by scripts/build-workflow.js — edit the source file, then rebuild) ----',
    'const P08 = (function () { const module = { exports: {} };',
    engineSrc,
    'return module.exports; })();',
    '// ---- node logic ----',
    body.trim(),
  ].join('\n');

const RISK_ENGINE_CODE = withEngine(`
const cfg = $('Config').first().json;
for (const key of ['trelloBoardId', 'telegramChatId']) {
  if (!String(cfg[key] || '').trim()) throw new Error('Config.' + key + ' is empty. Set it in the Config node (see docs/HOW-TO.md).');
}
const rows = (node) => $(node).all().map((i) => i.json).filter((j) => j && j.id);
const board = {
  lists: rows('Trello: Get Lists'),
  customFields: rows('Trello: Get Custom Fields'),
  cards: rows('Trello: Get Cards'),
};
const asOf = cfg.asOfOverride || $now.setZone(cfg.timezone || 'UTC').toISODate();
const result = P08.evaluate(P08.fromTrello(board), { asOf });
return [{ json: { result, ruleReport: P08.buildRuleReport(result), aiPrompt: P08.buildAiPrompt(result) } }];
`);

const SELECT_REPORT_CODE = withEngine(`
const cfg = $('Config').first().json;
const engine = $('Risk Engine').first().json;
const ai = $input.first().json || {};
const pick = P08.selectReport(ai, engine.result, { aiEnabled: cfg.aiEnabled });
return [{ json: {
  source: pick.source,
  reason: pick.reason,
  reportText: pick.reportText,
  aiText: pick.aiText,
  ruleReport: engine.ruleReport,
  telegramText: P08.buildTelegramMessage(pick.reportText, engine.result, pick.source, cfg.aiLabel || 'Gemini'),
  summary: engine.result.summary,
  result: engine.result,
} }];
`);

const trelloRequest = (name, id, pathExpr, query, position, extra = {}) => ({
  id,
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position,
  alwaysOutputData: true,
  ...extra,
  parameters: {
    url: `={{ $('Config').first().json.trelloBaseUrl }}/1/boards/{{ $('Config').first().json.trelloBoardId }}${pathExpr}`,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'trelloApi',
    sendQuery: true,
    queryParameters: { parameters: query.map(([n, v]) => ({ name: n, value: v })) },
    options: { timeout: 30000 },
  },
  credentials: { trelloApi: { id: 'p08TrelloApi', name: 'P08 Trello API' } },
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000,
});

const assignment = (name, value, type = 'string') => ({ id: `cfg-${name}`, name, value, type });

const workflow = {
  name: 'P08 — AI Project Manager (Trello → Rules → Gemini → Telegram)',
  nodes: [
    {
      id: 'n-manual',
      name: 'Run Now',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
    {
      id: 'n-schedule',
      name: 'Weekdays 08:00',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 200],
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * 1-5' }] } },
    },
    {
      id: 'n-config',
      name: 'Config',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [240, 100],
      parameters: {
        mode: 'manual',
        assignments: {
          assignments: [
            assignment('trelloBaseUrl', 'https://api.trello.com'),
            assignment('trelloBoardId', ''),
            assignment('telegramChatId', ''),
            assignment('geminiBaseUrl', 'https://generativelanguage.googleapis.com'),
            assignment('geminiModel', 'gemini-2.5-flash'),
            assignment('aiEnabled', 'true'),
            assignment('aiLabel', 'Gemini'),
            assignment('timezone', 'Asia/Riyadh'),
            assignment('asOfOverride', ''),
          ],
        },
        options: {},
      },
    },
    trelloRequest('Trello: Get Lists', 'n-lists', '/lists', [['fields', 'id,name,closed']], [480, 100]),
    trelloRequest(
      'Trello: Get Custom Fields',
      'n-fields',
      '/customFields',
      [],
      [720, 100],
      { executeOnce: true }
    ),
    trelloRequest(
      'Trello: Get Cards',
      'n-cards',
      '/cards/open',
      [
        ['customFieldItems', 'true'],
        ['fields', 'id,name,idList,due,dueComplete,dateLastActivity,shortUrl,closed'],
      ],
      [960, 100],
      { executeOnce: true }
    ),
    {
      id: 'n-engine',
      name: 'Risk Engine',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1200, 100],
      parameters: { jsCode: RISK_ENGINE_CODE },
      notes: 'Deterministic health rules. AI never decides status.',
    },
    {
      id: 'n-gemini',
      name: 'Gemini: Founder Report',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1440, 100],
      onError: 'continueRegularOutput',
      parameters: {
        method: 'POST',
        url: "={{ $('Config').first().json.geminiBaseUrl }}/v1beta/models/{{ $('Config').first().json.geminiModel }}:generateContent",
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ contents: [{ role: "user", parts: [{ text: $json.aiPrompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } } }) }}',
        options: { timeout: 30000 },
      },
      credentials: { httpHeaderAuth: { id: 'p08GeminiKey', name: 'P08 Gemini API Key' } },
      notes: 'Header Auth credential: name x-goog-api-key. On failure the flow continues with the rule-based report.',
    },
    {
      id: 'n-select',
      name: 'Select Report',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1680, 100],
      parameters: { jsCode: SELECT_REPORT_CODE },
      notes: 'Uses the AI text only if it passes guardrails; otherwise the rule-based report.',
    },
    {
      id: 'n-telegram',
      name: 'Telegram: Notify Founder',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [1920, 100],
      parameters: {
        chatId: "={{ $('Config').first().json.telegramChatId }}",
        text: '={{ $json.telegramText }}',
        additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
      },
      credentials: { telegramApi: { id: 'p08TelegramBot', name: 'P08 Telegram Bot' } },
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 3000,
    },
  ],
  connections: {
    'Run Now': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
    'Weekdays 08:00': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
    Config: { main: [[{ node: 'Trello: Get Lists', type: 'main', index: 0 }]] },
    'Trello: Get Lists': { main: [[{ node: 'Trello: Get Custom Fields', type: 'main', index: 0 }]] },
    'Trello: Get Custom Fields': { main: [[{ node: 'Trello: Get Cards', type: 'main', index: 0 }]] },
    'Trello: Get Cards': { main: [[{ node: 'Risk Engine', type: 'main', index: 0 }]] },
    'Risk Engine': { main: [[{ node: 'Gemini: Founder Report', type: 'main', index: 0 }]] },
    'Gemini: Founder Report': { main: [[{ node: 'Select Report', type: 'main', index: 0 }]] },
    'Select Report': { main: [[{ node: 'Telegram: Notify Founder', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', timezone: 'Asia/Riyadh' },
  pinData: {},
};

const out = path.join(root, 'workflow/p08-ai-project-manager.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log(`wrote ${path.relative(root, out)} (${workflow.nodes.length} nodes)`);
