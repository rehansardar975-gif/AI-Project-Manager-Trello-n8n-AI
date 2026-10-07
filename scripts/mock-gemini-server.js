#!/usr/bin/env node
/**
 * Local Gemini generateContent stand-in for test runs only. Returns a response in the
 * real API shape so the n8n "Select Report" branch can be exercised without an API key.
 *   model "faithful-test"  -> text that passes the guardrails
 *   model "contradict-test" -> text that calls an AT RISK project "on track" (must be rejected)
 */
'use strict';
const http = require('http');
const port = Number(process.argv[2] || 4020);
const TEXT = {
  'faithful-test':
    'Two projects need your attention today. Act now: Client Portal v2 is overdue by 5 days, and Payment Gateway Migration is blocked waiting for bank sandbox credentials.',
  'contradict-test':
    'Act now: Client Portal v2 is overdue and Payment Gateway Migration is blocked. Data Warehouse Sync is on track.',
};
http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const m = req.url.match(/models\/([^:]+):generateContent/);
      const text = m && TEXT[m[1]];
      console.log(`${req.method} ${req.url.split('?')[0]} prompt_chars=${body.length} -> ${text ? 200 : 404}`);
      res.writeHead(text ? 200 : 404, { 'content-type': 'application/json' });
      res.end(JSON.stringify(text ? { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] } : { error: { code: 404, message: 'model not found' } }));
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`mock Gemini on http://127.0.0.1:${port}`));
