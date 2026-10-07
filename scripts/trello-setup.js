#!/usr/bin/env node
/**
 * Creates the P08 Trello board: 6 lists, 9 custom fields and (optionally) the
 * cards from fixtures/projects.seed.json, with deadlines shifted so they are
 * relative to today.
 *
 * Run on a machine where Trello API access works (NOT inside the Claude Cloud
 * session — its egress proxy cannot represent Trello's key + token auth):
 *
 *   TRELLO_API_KEY=... TRELLO_TOKEN=... node scripts/trello-setup.js [--no-cards] [--dry-run]
 *
 * Credentials are read from the environment only and are never printed.
 * Requires Node 18+ (global fetch). Custom Fields must be available on the board's workspace.
 */
'use strict';
const path = require('path');

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const WITH_CARDS = !args.has('--no-cards');
const { TRELLO_API_KEY: KEY, TRELLO_TOKEN: TOKEN } = process.env;
const API = 'https://api.trello.com/1';

const seed = require(path.join(__dirname, '../fixtures/projects.seed.json'));

const FIELDS = [
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
const KEY_OF = {
  Owner: 'owner', Priority: 'priority', 'Estimated Hours': 'estimatedHours', 'Actual Hours': 'actualHours',
  Blocker: 'blocker', Dependency: 'dependency', 'Risk Level': 'riskLevel', 'Next Milestone': 'nextMilestone',
  'Decision Required': 'decisionRequired',
};

async function trello(method, route, body) {
  if (DRY) {
    console.log(`[dry-run] ${method} ${route}`);
    return { id: `dry-${route}`, options: [] };
  }
  const url = new URL(API + route);
  url.searchParams.set('key', KEY);
  url.searchParams.set('token', TOKEN);
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

function shiftDate(isoDate) {
  // Keep each date's distance from the seed's asOf, anchored to today.
  const offset = Date.parse(isoDate) - Date.parse(seed.asOf);
  return new Date(Date.now() + offset).toISOString();
}

async function main() {
  if (!DRY && (!KEY || !TOKEN)) {
    console.error('Set TRELLO_API_KEY and TRELLO_TOKEN in the environment (or use --dry-run).');
    process.exit(1);
  }
  const board = await trello('POST', '/boards', { name: seed.board, defaultLists: false, prefs_permissionLevel: 'private' });
  console.log(`board created: ${board.id} ${board.shortUrl || ''}`);

  const lists = {};
  for (const [i, name] of seed.lists.entries()) {
    lists[name] = (await trello('POST', '/lists', { name, idBoard: board.id, pos: (i + 1) * 1024 })).id;
  }
  console.log(`lists: ${Object.keys(lists).join(', ')}`);

  const fields = {};
  for (const [name, type, options] of FIELDS) {
    const f = await trello('POST', '/customFields', {
      idModel: board.id,
      modelType: 'board',
      name,
      type,
      pos: 'bottom',
      display_cardFront: true,
      ...(options ? { options: options.map((t) => ({ value: { text: t }, color: 'none' })) } : {}),
    });
    fields[name] = f;
  }
  console.log(`custom fields: ${Object.keys(fields).join(', ')}`);

  if (WITH_CARDS) {
    for (const p of seed.projects) {
      const card = await trello('POST', '/cards', {
        idList: lists[p.status],
        name: p.project,
        due: p.deadline ? shiftDate(`${p.deadline}T17:00:00.000Z`) : null,
        dueComplete: p.status === 'Done',
      });
      for (const [name, key] of Object.entries(KEY_OF)) {
        const v = p[key];
        if (v === '' || v === null || v === undefined) continue;
        const f = fields[name];
        const body =
          f.type === 'list'
            ? { idValue: (f.options.find((o) => o.value.text === v) || {}).id }
            : { value: f.type === 'number' ? { number: String(v) } : { text: String(v) } };
        await trello('PUT', `/cards/${card.id}/customField/${f.id}/item`, body);
      }
      console.log(`card: ${p.project} -> ${p.status}`);
    }
    console.log('Note: "missing update" rules use Trello activity dates, which are "now" for freshly created cards.');
  }
  console.log(`\nDone. Put this board id into the n8n Config node: ${board.id}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
