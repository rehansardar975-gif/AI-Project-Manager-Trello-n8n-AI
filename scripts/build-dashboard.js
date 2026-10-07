#!/usr/bin/env node
/**
 * Writes dashboard/data.js from a rule-engine run.
 *   node scripts/build-dashboard.js                 -> evaluates fixtures/trello-board.json
 *   node scripts/build-dashboard.js run.json        -> uses an exported n8n run (evidence/*.json)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P08 = require('../src/p08-engine');
const root = path.join(__dirname, '..');

let result, report, source;
if (process.argv[2]) {
  const run = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  result = run.result;
  report = run.selectReport.source === 'ai' ? null : P08.buildRuleReport(result);
  source = `n8n execution ${new Date(run.executedAt).toISOString().replace("T", " ").slice(0, 16)} UTC`;
} else {
  const board = require('../fixtures/trello-board.json');
  result = P08.evaluate(P08.fromTrello(board), { asOf: board.asOf });
  source = 'fixtures/trello-board.json';
}
report = report || P08.buildRuleReport(result);
const data = { generatedFrom: source, result, report };
fs.writeFileSync(path.join(root, 'dashboard/data.js'), 'window.P08_DATA = ' + JSON.stringify(data, null, 1) + ';\n');
console.log(`dashboard/data.js written from ${source}`);
