# Test results — P08 AI Project Manager

Run date: 2026-10-07 · Environment: Claude Code Cloud container, Node 22.22.0, n8n 1.123.83 (self-hosted, local)

## Summary

| Area | Result |
|---|---|
| Engine unit tests | **22 / 22 pass** (`npm test`, raw output: `evidence/test-output.tap`) |
| Full n8n run, Trello API responses → Telegram | **Pass** — execution #3, 1.917 s, all 9 executed nodes green |
| Telegram delivery | **Pass** — Bot API returned `ok: true`, message_id 4 |
| Gemini fails → rule report sent | **Pass** (real Gemini call through the build proxy returned 400) |
| Gemini faithful → AI report used | **Pass** (local Gemini-format response) |
| Gemini contradicts rules → rejected | **Pass** (local Gemini-format response) |
| Dashboard renders, desktop 1520 px + mobile 390 px | **Pass** — no console errors |
| Live Trello board | **Not verified** — build environment cannot authenticate to Trello (see `docs/CLOUD-ENVIRONMENT.md`) |
| Live Gemini response | **Not verified** — same reason; key confirmed working outside this environment |

## 1. Engine unit tests (`test/engine.test.js`)

| Covered | Tests |
|---|---|
| Happy path | healthy card is ON TRACK with no flags |
| OVERDUE | past deadline; deadline today is not overdue; OVERDUE takes precedence over BLOCKED |
| BLOCKED | blocker text or Blocked list |
| Hours | ≤20% over → medium; >20% → high; equal → no flag |
| Missing updates | exactly 7 days ok; 8 days medium; >14 days high; missing date flagged |
| Missing data | Owner/Deadline/Priority/Estimated Hours listed |
| Dependencies | on BLOCKED card; finishing after this deadline (case-insensitive); unknown name; self-reference; completed dependency ignored |
| Due soon | ≤7 days while in To Do |
| Done / archived | Done never flagged, excluded from counts; archived cards ignored |
| Invalid input | non-array, bad asOf, bad board object throw clear errors; garbage numbers/dates become "missing" (bug found and fixed during testing: `evaluate()` now re-sanitizes numeric fields) |
| Config | thresholds overridable |
| Determinism | identical output on repeated runs |
| Trello parsing | list id → name, dropdown option lookup, numbers stored as strings |
| Full fixture | expected health for all 12 cards; severity ordering |
| AI guardrail | accepts faithful text; rejects empty, oversized, omitted critical project, contradiction |
| AI prompt | carries facts, forbids re-judging, excludes Done work |
| Telegram | HTML escaped, ≤ 4096 chars, fallback label |

## 2. n8n end-to-end (real n8n instance)

Setup: workflow imported unchanged except Config values (`trelloBaseUrl` → local Trello API stand-in, board ID, chat ID). Credentials stored in n8n's encrypted store. Raw result: `evidence/n8n-run-2026-10-07.json`.

| Node | Status | Items out |
|---|---|---|
| Run Now | success | 1 |
| Config | success | 1 |
| Trello: Get Lists | success | 6 |
| Trello: Get Custom Fields | success | 9 |
| Trello: Get Cards | success | 12 |
| Risk Engine | success | 1 |
| Gemini: Founder Report | success (error captured, flow continued) | 1 |
| Select Report | success — `source: rules` | 1 |
| Telegram: Notify Founder | success — `ok: true` | 1 |

Execution history (visible in `evidence/n8n-execution.png`):

| # | Result | Cause |
|---|---|---|
| 1 | Error at Telegram (404) | Test credential setup: token not applied by n8n's `CREDENTIALS_OVERWRITE_DATA` in CLI mode |
| 2 | Error at Telegram (404) | Same; overwrite approach abandoned |
| 3 | **Success** | Token stored in n8n encrypted credential store |
| 4 | Success, `source: ai` | AI-accepted path |
| 5 | Success, `source: rules`, reason `AI response calls "Data Warehouse Sync" on track, rules say AT RISK` | Guardrail path |

Runs 1–2 failed because of the local test harness, not the workflow. Trello and engine stages were green in all runs.

## 3. Result on the test board (as of 2026-10-07)

11 active cards: **1 OVERDUE, 1 BLOCKED, 6 AT RISK, 3 ON TRACK**, 1 Done, 2 decisions required.

| Project | Health | Main reason |
|---|---|---|
| Client Portal v2 | OVERDUE | Deadline passed 5 days ago; +15% hours |
| Payment Gateway Migration | BLOCKED | Waiting for bank sandbox credentials |
| Security Audit Remediation | AT RISK | Due in 5 days, still in To Do |
| Mobile App Release 3.4 | AT RISK | Depends on a BLOCKED card |
| Support Chatbot Rollout | AT RISK | Dependency finishes after its deadline |
| Data Warehouse Sync | AT RISK | +38% hours over estimate |
| Customer Onboarding Emails | AT RISK | No update for 15 days |
| Internal Analytics Dashboard | AT RISK | Missing owner |
| CRM Data Import, Knowledge Base Cleanup, Marketing Website Refresh | ON TRACK | — |

## 4. Security checks

- Repository scanned for the Telegram token and chat ID before commit: 0 matches.
- Workflow JSON contains credential names only.
- Local test files containing the token were removed; n8n stores it encrypted (plaintext search of the n8n data folder: 0 matches).

## 5. What the client must still verify

1. Run `scripts/trello-setup.js` (or build the board manually) and execute the workflow against the live board.
2. Confirm one live Gemini response is accepted (`Select Report.source = ai`).
