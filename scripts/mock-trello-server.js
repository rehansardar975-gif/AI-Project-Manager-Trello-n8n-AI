#!/usr/bin/env node
/**
 * Local Trello API stand-in for test runs only (never used in the deployed workflow).
 * Serves fixtures/trello-board.json on the three endpoints the workflow calls and,
 * like Trello, rejects requests that do not carry both `key` and `token` query params.
 *
 *   node scripts/mock-trello-server.js [port=4010] [delayMs=0]
 *   then set Config.trelloBaseUrl = http://127.0.0.1:4010 in n8n
 */
'use strict';
const http = require('http');
const board = require('../fixtures/trello-board.json');

const port = Number(process.argv[2] || process.env.MOCK_TRELLO_PORT || 4010);
const delay = Number(process.argv[3] || 0); // simulated network latency for recordings
const routes = {
  [`/1/boards/${board.boardId}/lists`]: board.lists,
  [`/1/boards/${board.boardId}/customFields`]: board.customFields,
  [`/1/boards/${board.boardId}/cards/open`]: board.cards.filter((c) => !c.closed),
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const authed = url.searchParams.get('key') && url.searchParams.get('token');
    const body = routes[url.pathname];
    let status = 200;
    let payload = body;
    if (!authed) [status, payload] = [401, 'invalid key'];
    else if (req.method !== 'GET' || !body) [status, payload] = [404, 'The requested resource was not found.'];
    console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} -> ${status}`); // query (credentials) never logged
    setTimeout(() => {
    res.writeHead(status, { 'content-type': typeof payload === 'string' ? 'text/plain' : 'application/json' });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
    }, delay);
  })
  .listen(port, '127.0.0.1', () => console.log(`mock Trello on http://127.0.0.1:${port} board=${board.boardId}`));
