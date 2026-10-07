# Test results — P08 AI Project Manager

Run date: 2026-10-07 · n8n 1.123.83 (self-hosted) · Node.js 22.22.0
Raw evidence: `evidence/` (test output, n8n run JSON, live execution frames and recording).

## Summary

| Area | Result |
|---|---|
| Automated tests (`npm test`) | **34 / 34 pass** — 22 engine tests + 12 acceptance scenarios (`evidence/test-output.tap`) |
| n8n end-to-end, AI report accepted | **Pass** — all 9 executed nodes succeeded, Telegram `ok: true` (message 13) |
| n8n end-to-end, AI contradicts rules | **Pass** — AI text rejected, rule report sent, Telegram `ok: true` (message 14) |
| n8n end-to-end, AI unavailable (HTTP 503) | **Pass** — rule report sent, Telegram `ok: true` (message 15) |
| Live editor run, recorded | **Pass** — 4.3 s from click to "Workflow executed successfully" (`evidence/n8n-live/`) |
| Dashboard (1600 px and 390 px phone) | **Pass** — renders, no console errors |
| Secret scan (source, docs, evidence, images, PDFs, video, ZIP, git history) | **Pass** — see section 6 |

## 1. Test environment (what was live and what was a stand-in)

| Layer | In these runs | Notes |
|---|---|---|
| n8n | **Real** n8n 1.123.83 | Production workflow file; only Config values changed |
| Trello | Local Trello API stand-in | `scripts/mock-trello-server.js` serves `fixtures/trello-board.json` in Trello REST format, requires key + token, adds 350 ms latency |
| Gemini | Gemini-API-compatible test endpoint | `scripts/mock-gemini-server.js`, real `generateContent` request and response shape, 1.2 s latency |
| Telegram | **Real** Telegram Bot API | Messages delivered to the project bot |

Why: this build environment's network proxy could not authenticate to Trello (key + token) or Gemini. The architecture does not depend on it — in production n8n holds all three credentials. Details: `docs/TEST-ENVIRONMENT.md`.

## 2. Acceptance scenarios (tests/scenarios.test.js)

| # | Scenario | Expected | Unit test | n8n run |
|---|---|---|---|---|
| S1 | All projects on track | 3 ON TRACK, no "act now" section | Pass | — |
| S2 | Overdue project | OVERDUE, "passed 5 day(s) ago" | Pass | Pass (Client Portal v2) |
| S3 | Blocked project | BLOCKED, blocker text as reason | Pass | Pass (Payment Gateway Migration) |
| S4 | Dependency problem | blocked / late / unknown dependency each flagged | Pass | Pass (Mobile App 3.4, Support Chatbot) |
| S5 | Hours exceeded | +38% → high severity | Pass | Pass (Data Warehouse Sync) |
| S6 | Multiple risks on one card | 6 flags, OVERDUE wins by precedence, most severe first | Pass | — |
| S7 | Missing update | 15 days → high severity | Pass | Pass (Customer Onboarding Emails) |
| S8 | Missing required data | "Missing: Owner, Priority, Estimated Hours" | Pass | Pass (Internal Analytics Dashboard) |
| S9 | Gemini unavailable | rule report; also for timeout, empty and disabled AI | Pass | Pass (HTTP 503) |
| S10 | Gemini gives a correct report | AI report accepted | Pass | Pass |
| S11 | Gemini contradicts rules | rejected (on-track contradiction, omitted project, empty) | Pass | Pass |
| S12 | Telegram notification | header, counts, footer label, ≤ 4096 chars | Pass | Pass (3 deliveries) |

The 22 engine tests also cover: deadline today is not overdue, exact threshold edges (7 days, +20%), self-dependency, completed dependency, Done and archived cards, invalid input (bad dates, negative or text numbers, non-array, bad asOf), config overrides, determinism, Trello parsing (list IDs, dropdown options, numbers stored as strings), prompt content, HTML escaping.

## 3. n8n executions (evidence/n8n-run-*.json)

Board result in all runs: 11 active → **1 OVERDUE, 1 BLOCKED, 6 AT RISK, 3 ON TRACK**, 1 Done, 2 decisions required.

| Node | Items out | AI accepted (ms) | AI contradicts (ms) | AI unavailable (ms) |
|---|---|---|---|---|
| Run Now | 1 | 0 | 1 | 0 |
| Config | 1 | 4 | 4 | 4 |
| Trello: Get Lists | 6 | 473 | 476 | 482 |
| Trello: Get Custom Fields | 9 | 382 | 396 | 397 |
| Trello: Get Cards | 12 | 383 | 379 | 381 |
| Risk Engine | 1 | 89 | 114 | 84 |
| Gemini: Founder Report | 1 | 1251 | 1243 | 1264 (error captured, flow continued) |
| Select Report | 1 | 21 — `source: ai` | 24 — `source: rules` | 27 — `source: rules` |
| Telegram: Notify Founder | 1 | 817 — ok, #13 | 505 — ok, #14 | 608 — ok, #15 |

Select Report reasons:
- Accepted: `AI report passed validation`
- Contradicts: `AI report rejected: AI response calls "Security Audit Remediation" on track, rules say AT RISK`
- Unavailable: `AI request failed: 503 … The model is overloaded`

## 4. Live editor recording (evidence/n8n-live/)

Playwright opened the workflow in the n8n editor, clicked **Execute workflow**, and captured 52 frames until "Workflow executed successfully" (click at 0.75 s, done at 5.04 s). It then opened the outputs of Trello: Get Cards, Risk Engine, Gemini, Select Report and Telegram. `execution-recording.mp4` plays the frames at real speed. Chat and bot IDs are masked on screen before every still; the script stops if any remain visible.

## 5. Media checks

| Asset | Check | Result |
|---|---|---|
| `video/P08-video.mp4` | 1920×1080, 30 fps, H.264 + AAC, duration | 60.0 s, −16 LUFS integrated |
| Voice-over | 6 lines, all inside their scene windows, speed 1.00–1.07 | Pass |
| Screenshots | 12 files, 1600×1200 | Pass |
| Case study | A4, 8 pages | Pass |
| Presentation | 16:9, 13 slides | Pass |

## 6. Security checks

- Text search for the Telegram token, bot ID and chat ID across the repository, evidence JSON, PDFs (`pdftotext`) and the final ZIP: **0 matches**.
- Screenshots: identifiers masked in the DOM before capture; the recorder fails if any identifier is still visible.
- Git history: searched every commit for the same values: **0 matches**.
- The workflow JSON references credentials by name only.
- Local test credentials were stored only in the throwaway n8n instance's encrypted store; the short-lived import file was overwritten and deleted.

## 7. Not verified here

- A live Trello board, and a live Gemini response from Google. Both use the same nodes and only need the n8n credentials in `docs/HOW-TO.md`.
