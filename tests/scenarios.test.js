'use strict';
/**
 * The 12 acceptance scenarios for P08. Each one runs the real engine functions
 * (the same code embedded in the n8n Code nodes). Scenarios 9–12 are also
 * executed inside n8n — see TEST-RESULTS.md.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const P08 = require('../src/p08-engine');
const board = require('../fixtures/trello-board.json');

const AS_OF = '2026-10-07';
const card = (o = {}) =>
  Object.assign(
    {
      project: 'Website Refresh', status: 'In Progress', owner: 'Nadia Siddiqui', priority: 'Medium',
      deadline: '2026-10-28T17:00:00.000Z', estimatedHours: 40, actualHours: 20, blocker: '', dependency: '',
      riskLevel: 'Low', nextMilestone: 'Design review', decisionRequired: '', lastActivity: '2026-10-06T09:00:00.000Z',
    },
    o
  );
const evalCards = (cards) => P08.evaluate(cards, { asOf: AS_OF });
const byName = (r, n) => r.projects.find((p) => p.project === n);
const codes = (p) => p.flags.map((f) => f.code).sort();
const fixture = () => P08.evaluate(P08.fromTrello(board), { asOf: board.asOf });
const gemini = (text) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });

test('S1 all projects on track', () => {
  const r = evalCards([card({ project: 'A' }), card({ project: 'B' }), card({ project: 'C', status: 'Review' })]);
  assert.deepEqual([r.summary.onTrack, r.summary.atRisk, r.summary.overdue, r.summary.blocked], [3, 0, 0, 0]);
  assert.match(P08.buildRuleReport(r), /On track: A, B, C/);
  assert.doesNotMatch(P08.buildRuleReport(r), /Needs action now/);
});

test('S2 overdue project', () => {
  const p = byName(evalCards([card({ project: 'Client Portal v2', deadline: '2026-10-02T17:00:00.000Z' })]), 'Client Portal v2');
  assert.equal(p.health, 'OVERDUE');
  assert.equal(p.daysToDeadline, -5);
  assert.match(p.flags[0].message, /passed 5 day\(s\) ago/);
});

test('S3 blocked project', () => {
  const p = evalCards([card({ blocker: 'Waiting for bank sandbox credentials' })]).projects[0];
  assert.equal(p.health, 'BLOCKED');
  assert.equal(p.flags[0].message, 'Blocker: Waiting for bank sandbox credentials');
});

test('S4 dependency problem (blocked dependency, late dependency, unknown dependency)', () => {
  const r = evalCards([
    card({ project: 'Mobile App', dependency: 'Payments' }),
    card({ project: 'Payments', blocker: 'Vendor' }),
    card({ project: 'Chatbot', dependency: 'KB Cleanup', deadline: '2026-10-20T00:00:00.000Z' }),
    card({ project: 'KB Cleanup', deadline: '2026-11-10T00:00:00.000Z' }),
    card({ project: 'Reports', dependency: 'Does Not Exist' }),
  ]);
  assert.deepEqual(codes(byName(r, 'Mobile App')), ['DEPENDENCY_AT_RISK']);
  assert.deepEqual(codes(byName(r, 'Chatbot')), ['DEPENDENCY_LATE']);
  assert.deepEqual(codes(byName(r, 'Reports')), ['DEPENDENCY_NOT_FOUND']);
  assert.equal(r.summary.dependencyIssues, 3);
});

test('S5 hours exceeded', () => {
  const p = evalCards([card({ estimatedHours: 40, actualHours: 55 })]).projects[0];
  assert.equal(p.health, 'AT RISK');
  assert.deepEqual(p.flags[0], { code: 'HOURS_OVER_ESTIMATE', severity: 'high', message: '55h logged vs 40h estimated (+38%)' });
});

test('S6 multiple simultaneous risks on one card', () => {
  const p = evalCards([
    card({
      deadline: '2026-10-01T00:00:00.000Z', blocker: 'Legal review', actualHours: 60, estimatedHours: 40,
      lastActivity: '2026-09-15T00:00:00.000Z', owner: '', riskLevel: 'High',
    }),
  ]).projects[0];
  assert.equal(p.health, 'OVERDUE'); // highest precedence wins
  assert.deepEqual(codes(p), ['BLOCKED', 'HOURS_OVER_ESTIMATE', 'MISSING_FIELDS', 'MISSING_UPDATE', 'OVERDUE', 'OWNER_REPORTED_HIGH_RISK']);
  assert.equal(p.flags[0].severity, 'critical'); // most severe listed first
});

test('S7 missing update', () => {
  const p = evalCards([card({ lastActivity: '2026-09-22T09:30:00.000Z' })]).projects[0];
  assert.equal(p.health, 'AT RISK');
  assert.deepEqual(p.flags[0], { code: 'MISSING_UPDATE', severity: 'high', message: 'No update for 15 days' });
});

test('S8 missing required data', () => {
  const p = evalCards([card({ owner: '', priority: '', estimatedHours: null })]).projects[0];
  assert.equal(p.health, 'AT RISK');
  assert.equal(p.flags[0].message, 'Missing: Owner, Priority, Estimated Hours');
});

test('S9 Gemini unavailable -> rule-based report', () => {
  const r = fixture();
  for (const failure of [{ error: { message: '503 - Service Unavailable' } }, { error: 'timeout of 30000ms exceeded' }, {}, null]) {
    const pick = P08.selectReport(failure, r, { aiEnabled: 'true' });
    assert.equal(pick.source, 'rules');
    assert.equal(pick.reportText, P08.buildRuleReport(r));
  }
  assert.equal(P08.selectReport(gemini('anything'), r, { aiEnabled: 'false' }).reason, 'AI disabled in Config');
});

test('S10 Gemini gives a correct report -> accepted', () => {
  const r = fixture();
  const text = 'Two projects need you today. Client Portal v2 is 5 days overdue. Payment Gateway Migration is blocked on bank sandbox credentials. Six more are at risk.';
  const pick = P08.selectReport(gemini(text), r, { aiEnabled: 'true' });
  assert.deepEqual([pick.source, pick.reportText, pick.reason], ['ai', text, 'AI report passed validation']);
});

test('S11 Gemini contradicts deterministic rules -> rejected, rules used', () => {
  const r = fixture();
  const cases = {
    'calls an AT RISK project on track': 'Client Portal v2 is overdue. Payment Gateway Migration is blocked. Data Warehouse Sync is on track.',
    'omits a BLOCKED project': 'Client Portal v2 is overdue. Everything else is fine.',
    'empty answer': '',
  };
  for (const [label, text] of Object.entries(cases)) {
    const pick = P08.selectReport(gemini(text), r, { aiEnabled: 'true' });
    assert.equal(pick.source, 'rules', label);
    assert.match(pick.reason, /^AI report rejected/, label);
  }
});

test('S12 Telegram notification content', () => {
  const r = fixture();
  const rules = P08.buildTelegramMessage(P08.buildRuleReport(r), r, 'rules');
  assert.match(rules, /^<b>P08 Project Health — 2026-10-07<\/b>/);
  assert.match(rules, /Overdue 1 .* Blocked 1 .* At risk 6 .* On track 3/);
  assert.match(rules, /report by rule engine \(AI fallback\)/);
  assert.match(rules, /Decisions required from you/);
  const ai = P08.buildTelegramMessage('Short note', r, 'ai', 'Gemini');
  assert.match(ai, /report by Gemini \(validated\)/);
  assert.ok(rules.length <= 4096);
});
