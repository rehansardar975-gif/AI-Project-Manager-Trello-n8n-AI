#!/usr/bin/env node
/**
 * Gemini-API-compatible test endpoint (test runs only — not Google Gemini).
 * Implements POST /v1beta/models/{model}:generateContent with the real response shape so the
 * n8n "Gemini → Select Report" branch can be executed without a Gemini key.
 *
 *   model p08-test-faithful     -> founder note built only from the FACTS JSON in the prompt (passes validation)
 *   model p08-test-contradict   -> same note but calls an AT RISK project "on track" (must be rejected)
 *   model p08-test-unavailable  -> HTTP 503 (must fall back to the rule report)
 *
 *   node scripts/mock-gemini-server.js [port=4020] [delayMs=0]
 */
'use strict';
const http = require('http');
const port = Number(process.argv[2] || 4020);
const delay = Number(process.argv[3] || 0);

function founderNote(facts) {
  const s = facts.summary;
  const by = (h) => facts.projects.filter((p) => p.health === h);
  const lines = [`${s.overdue + s.blocked} projects need you today; ${s.atRisk} more are at risk.`, '', 'Act now'];
  for (const p of [...by('OVERDUE'), ...by('BLOCKED')]) lines.push(`- ${p.project} (${p.owner || 'no owner'}) is ${p.health.toLowerCase()}: ${p.issues[0]}.`);
  lines.push('', 'Watch');
  for (const p of by('AT RISK')) lines.push(`- ${p.project}: ${p.issues[0]}.`);
  const decisions = facts.projects.filter((p) => p.decisionRequired);
  if (decisions.length) {
    lines.push('', 'Decisions for you');
    for (const p of decisions) lines.push(`- ${p.project}: ${p.decisionRequired}.`);
  }
  lines.push('', `On track: ${by('ON TRACK').map((p) => p.project).join(', ') || 'none'}.`);
  return lines.join('\n');
}

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () =>
      setTimeout(() => {
        const model = (req.url.match(/models\/([^:]+):generateContent/) || [])[1];
        let status = 200;
        let payload;
        try {
          const prompt = JSON.parse(body).contents[0].parts[0].text;
          const facts = JSON.parse(prompt.slice(prompt.indexOf('FACTS:') + 6));
          if (model === 'p08-test-unavailable') {
            status = 503;
            payload = { error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } };
          } else {
            let text = founderNote(facts);
            if (model === 'p08-test-contradict') {
              const risky = facts.projects.find((p) => p.health === 'AT RISK');
              if (risky) text += `\n${risky.project} is on track.`;
            } else if (model !== 'p08-test-faithful') {
              status = 404;
              payload = { error: { code: 404, message: `models/${model} is not found`, status: 'NOT_FOUND' } };
            }
            payload = payload || { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], modelVersion: model };
          }
        } catch (e) {
          status = 400;
          payload = { error: { code: 400, message: 'Invalid request: ' + e.message, status: 'INVALID_ARGUMENT' } };
        }
        console.log(`${new Date().toISOString()} POST ${model} -> ${status}`);
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      }, delay)
    );
  })
  .listen(port, '127.0.0.1', () => console.log(`Gemini-compatible test endpoint on http://127.0.0.1:${port} (delay ${delay}ms)`));
