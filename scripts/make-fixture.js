#!/usr/bin/env node
/**
 * Builds fixtures/trello-board.json (exact Trello REST API response shapes for
 * lists, customFields and cards) from the readable fixtures/projects.seed.json.
 * Used by the test suite, the local mock Trello server and the dashboard build.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/projects.seed.json'), 'utf8'));

const id = (prefix, n) => prefix + String(n).padStart(24 - prefix.length, '0');
const BOARD_ID = id('b08', 1);

const lists = seed.lists.map((name, i) => ({ id: id('a1', i + 1), name, closed: false, idBoard: BOARD_ID, pos: (i + 1) * 1024 }));
const listId = Object.fromEntries(lists.map((l) => [l.name, l.id]));

const FIELD_DEFS = [
  ['Owner', 'text'],
  ['Priority', 'list', ['Critical', 'High', 'Medium', 'Low']],
  ['Estimated Hours', 'number'],
  ['Actual Hours', 'number'],
  ['Blocker', 'text'],
  ['Dependency', 'text'],
  ['Risk Level', 'list', ['Low', 'Medium', 'High']],
  ['Next Milestone', 'text'],
  ['Decision Required', 'text'],
];
const customFields = FIELD_DEFS.map(([name, type, opts], i) => ({
  id: id('cf', i + 1),
  idModel: BOARD_ID,
  modelType: 'board',
  name,
  type,
  pos: (i + 1) * 16384,
  display: { cardFront: true },
  ...(opts ? { options: opts.map((t, j) => ({ id: id(`op${i + 1}`, j + 1), idCustomField: id('cf', i + 1), value: { text: t }, color: 'none', pos: (j + 1) * 1024 })) } : {}),
}));
const fieldByName = Object.fromEntries(customFields.map((f) => [f.name, f]));
const KEY = {
  Owner: 'owner', Priority: 'priority', 'Estimated Hours': 'estimatedHours', 'Actual Hours': 'actualHours',
  Blocker: 'blocker', Dependency: 'dependency', 'Risk Level': 'riskLevel', 'Next Milestone': 'nextMilestone',
  'Decision Required': 'decisionRequired',
};

const cards = seed.projects.map((p, i) => {
  const cardId = id('c08', i + 1);
  const customFieldItems = [];
  for (const [name, key] of Object.entries(KEY)) {
    const v = p[key];
    if (v === '' || v === null || v === undefined) continue;
    const def = fieldByName[name];
    const item = { id: id('i' + (i + 1) + 'x', customFieldItems.length + 1), idCustomField: def.id, idModel: cardId, modelType: 'card' };
    if (def.type === 'list') item.idValue = def.options.find((o) => o.value.text === v).id;
    else if (def.type === 'number') item.value = { number: String(v) };
    else item.value = { text: String(v) };
    customFieldItems.push(item);
  }
  return {
    id: cardId,
    name: p.project,
    idBoard: BOARD_ID,
    idList: listId[p.status],
    closed: false,
    due: p.deadline ? `${p.deadline}T17:00:00.000Z` : null,
    dueComplete: p.status === 'Done',
    dateLastActivity: `${p.lastActivity}T09:30:00.000Z`,
    shortUrl: `https://trello.com/c/p08c${String(i + 1).padStart(4, '0')}`,
    customFieldItems,
  };
});

const out = { boardId: BOARD_ID, asOf: seed.asOf, lists, customFields, cards };
fs.writeFileSync(path.join(root, 'fixtures/trello-board.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`fixtures/trello-board.json: ${lists.length} lists, ${customFields.length} custom fields, ${cards.length} cards`);
