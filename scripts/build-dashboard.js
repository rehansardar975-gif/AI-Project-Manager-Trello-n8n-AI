#!/usr/bin/env node
/**
 * Writes dashboard/data.js.
 *   node scripts/build-dashboard.js                         -> evaluates fixtures/trello-board.json (rule report)
 *   node scripts/build-dashboard.js evidence/n8n-run-X.json -> uses a recorded n8n run (result + selected report)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P08 = require('../src/p08-engine');
const root = path.join(__dirname, '..');

let data;
if (process.argv[2]) {
  const run = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  data = {
    generatedFrom: `n8n execution ${run.startedAt.replace('T', ' ').slice(0, 16)} UTC`,
    result: run.result,
    report: run.selectReport.reportText,
    reportSource: run.selectReport.source,
  };
} else {
  const board = require('../fixtures/trello-board.json');
  const result = P08.evaluate(P08.fromTrello(board), { asOf: board.asOf });
  data = { generatedFrom: 'fixtures/trello-board.json', result, report: P08.buildRuleReport(result), reportSource: 'rules' };
}
fs.writeFileSync(path.join(root, 'dashboard/data.js'), 'window.P08_DATA = ' + JSON.stringify(data, null, 1) + ';\n');
console.log(`dashboard/data.js written from ${data.generatedFrom} (report: ${data.reportSource})`);
