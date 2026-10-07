'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P08 = require('../src/p08-engine');
const board = require('../fixtures/trello-board.json');

const AS_OF = '2026-10-07';

// Minimal valid project; each test overrides only what it checks.
function project(overrides = {}) {
  return Object.assign(
    {
      id: 'x',
      project: 'Alpha',
      status: 'In Progress',
      owner: 'Owner A',
      priority: 'Medium',
      deadline: '2026-10-30T17:00:00.000Z',
      deadlineComplete: false,
      estimatedHours: 10,
      actualHours: 5,
      blocker: '',
      dependency: '',
      riskLevel: 'Low',
      nextMilestone: 'M1',
      decisionRequired: '',
      lastActivity: '2026-10-06T09:00:00.000Z',
    },
    overrides
  );
}
const run = (projects, config) => P08.evaluate(projects, { asOf: AS_OF, config });
const one = (overrides, config) => run([project(overrides)], config).projects[0];
const codes = (p) => p.flags.map((f) => f.code);

test('healthy card is ON TRACK with no flags', () => {
  const p = one({});
  assert.equal(p.health, 'ON TRACK');
  assert.deepEqual(p.flags, []);
});

test('past deadline => OVERDUE', () => {
  const p = one({ deadline: '2026-10-06T17:00:00.000Z' });
  assert.equal(p.health, 'OVERDUE');
  assert.equal(p.daysToDeadline, -1);
});

test('deadline today is not overdue', () => {
  assert.notEqual(one({ deadline: '2026-10-07T23:00:00.000Z' }).health, 'OVERDUE');
});

test('blocker text or Blocked list => BLOCKED', () => {
  assert.equal(one({ blocker: 'Waiting on vendor' }).health, 'BLOCKED');
  assert.equal(one({ status: 'Blocked' }).health, 'BLOCKED');
});

test('OVERDUE takes precedence over BLOCKED', () => {
  const p = one({ blocker: 'x', deadline: '2026-10-01T00:00:00.000Z' });
  assert.equal(p.health, 'OVERDUE');
  assert.ok(codes(p).includes('BLOCKED'));
});

test('hours over estimate: medium at <=20%, high above', () => {
  const m = one({ estimatedHours: 10, actualHours: 12 });
  assert.equal(m.health, 'AT RISK');
  assert.equal(m.flags[0].severity, 'medium');
  assert.equal(one({ estimatedHours: 10, actualHours: 13 }).flags[0].severity, 'high');
  assert.equal(one({ estimatedHours: 10, actualHours: 10 }).health, 'ON TRACK');
});

test('missing update: >7 days medium, >14 days high, missing date flagged', () => {
  assert.equal(one({ lastActivity: '2026-09-30T00:00:00.000Z' }).health, 'ON TRACK'); // exactly 7 days
  assert.equal(one({ lastActivity: '2026-09-29T00:00:00.000Z' }).flags[0].severity, 'medium');
  assert.equal(one({ lastActivity: '2026-09-20T00:00:00.000Z' }).flags[0].severity, 'high');
  assert.deepEqual(codes(one({ lastActivity: null })), ['MISSING_UPDATE']);
});

test('missing required fields are listed', () => {
  const p = one({ owner: '', priority: '', estimatedHours: null, deadline: null });
  assert.equal(p.health, 'AT RISK');
  assert.match(p.flags[0].message, /Owner, Deadline, Priority, Estimated Hours/);
});

test('due soon while not started => AT RISK', () => {
  const p = one({ status: 'To Do', deadline: '2026-10-10T00:00:00.000Z' });
  assert.deepEqual(codes(p), ['DUE_SOON_NOT_STARTED']);
});

test('dependency on a BLOCKED card => DEPENDENCY_AT_RISK', () => {
  const r = run([project({ project: 'A', dependency: 'B' }), project({ project: 'B', blocker: 'stuck' })]);
  const a = r.projects.find((p) => p.project === 'A');
  assert.equal(a.health, 'AT RISK');
  assert.deepEqual(codes(a), ['DEPENDENCY_AT_RISK']);
});

test('dependency finishing after this deadline => DEPENDENCY_LATE', () => {
  const r = run([
    project({ project: 'A', dependency: 'b', deadline: '2026-10-20T00:00:00.000Z' }), // case-insensitive match
    project({ project: 'B', deadline: '2026-10-25T00:00:00.000Z' }),
  ]);
  assert.deepEqual(codes(r.projects.find((p) => p.project === 'A')), ['DEPENDENCY_LATE']);
});

test('unknown, self and completed dependencies', () => {
  assert.deepEqual(codes(one({ dependency: 'Nope' })), ['DEPENDENCY_NOT_FOUND']);
  assert.deepEqual(codes(one({ dependency: 'Alpha' })), ['DEPENDENCY_NOT_FOUND']);
  const r = run([project({ project: 'A', dependency: 'B' }), project({ project: 'B', status: 'Done', deadline: '2026-12-01T00:00:00.000Z' })]);
  assert.equal(r.projects.find((p) => p.project === 'A').health, 'ON TRACK');
});

test('Done cards are never flagged and excluded from active counts', () => {
  const r = run([project({ status: 'Done', deadline: '2026-01-01T00:00:00.000Z', lastActivity: null })]);
  assert.equal(r.projects[0].health, 'DONE');
  assert.deepEqual(r.projects[0].flags, []);
  assert.equal(r.summary.active, 0);
  assert.equal(r.summary.done, 1);
});

test('invalid inputs are rejected or tolerated safely', () => {
  assert.throws(() => P08.evaluate('nope'), /array/);
  assert.throws(() => P08.evaluate([], { asOf: 'not-a-date' }), /asOf/);
  assert.throws(() => P08.fromTrello({}), /expected/);
  // Garbage numbers/dates become "missing", not crashes.
  const p = one({ estimatedHours: 'abc', actualHours: -4, deadline: 'bad-date' });
  assert.match(p.flags[0].message, /Deadline, Estimated Hours/);
  assert.equal(run([]).summary.active, 0);
});

test('config overrides thresholds', () => {
  assert.equal(one({ lastActivity: '2026-10-04T00:00:00.000Z' }, { staleDays: 2 }).health, 'AT RISK');
});

test('evaluation is deterministic', () => {
  const projects = P08.fromTrello(board);
  assert.deepEqual(P08.evaluate(projects, { asOf: AS_OF }), P08.evaluate(projects, { asOf: AS_OF }));
});

test('Trello fixture: normalization reads every custom field type', () => {
  const projects = P08.fromTrello(board);
  assert.equal(projects.length, 12);
  const cp = projects.find((p) => p.project === 'Client Portal v2');
  assert.equal(cp.owner, 'Sara Malik');
  assert.equal(cp.priority, 'Critical'); // dropdown option lookup
  assert.equal(cp.actualHours, 138); // number stored as string by Trello
  assert.equal(cp.status, 'In Progress'); // list id -> name
});

test('Trello fixture: expected health for every card', () => {
  const r = P08.evaluate(P08.fromTrello(board), { asOf: board.asOf });
  const health = Object.fromEntries(r.projects.map((p) => [p.project, p.health]));
  assert.deepEqual(health, {
    'Client Portal v2': 'OVERDUE',
    'Payment Gateway Migration': 'BLOCKED',
    'Security Audit Remediation': 'AT RISK',
    'Mobile App Release 3.4': 'AT RISK',
    'Support Chatbot Rollout': 'AT RISK',
    'Data Warehouse Sync': 'AT RISK',
    'Customer Onboarding Emails': 'AT RISK',
    'Internal Analytics Dashboard': 'AT RISK',
    'CRM Data Import': 'ON TRACK',
    'Knowledge Base Cleanup': 'ON TRACK',
    'Marketing Website Refresh': 'ON TRACK',
    'Q3 Invoicing Automation': 'DONE',
  });
  assert.equal(r.projects[0].project, 'Client Portal v2'); // most severe first
  assert.equal(r.summary.decisionsRequired, 2);
});

test('closed (archived) cards are ignored', () => {
  const b = JSON.parse(JSON.stringify(board));
  b.cards[0].closed = true;
  assert.equal(P08.fromTrello(b).length, 11);
});

test('AI guardrail: accepts faithful text, rejects omissions and contradictions', () => {
  const r = P08.evaluate(P08.fromTrello(board), { asOf: board.asOf });
  const good = 'Two projects need you now. Client Portal v2 is overdue. Payment Gateway Migration is blocked.';
  assert.equal(P08.validateAiReport(good, r).ok, true);
  assert.equal(P08.validateAiReport('', r).ok, false);
  assert.match(P08.validateAiReport('Client Portal v2 is overdue.', r).reason, /Payment Gateway Migration/);
  const contradicts = good + ' Data Warehouse Sync is on track.';
  assert.match(P08.validateAiReport(contradicts, r).reason, /Data Warehouse Sync/);
  assert.equal(P08.validateAiReport('x'.repeat(3000), r).ok, false);
});

test('AI prompt carries facts and forbids re-judging status', () => {
  const r = P08.evaluate(P08.fromTrello(board), { asOf: board.asOf });
  const prompt = P08.buildAiPrompt(r);
  assert.match(prompt, /Never change, upgrade, downgrade or re-judge/);
  assert.ok(prompt.includes('"health":"OVERDUE"'));
  assert.ok(!prompt.includes('Q3 Invoicing Automation')); // done work is not sent
});

test('Telegram message escapes HTML and stays within 4096 chars', () => {
  const r = run([project({ project: 'A <b>&</b>' })]);
  const msg = P08.buildTelegramMessage('x <script>'.repeat(1000), r, 'rules');
  assert.ok(msg.length <= 4096);
  assert.ok(!msg.includes('<script>'));
  assert.match(msg, /rule engine \(AI fallback\)/);
});
