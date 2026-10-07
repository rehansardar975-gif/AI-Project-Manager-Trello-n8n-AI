# P08 AI Project Manager — HOW-TO

Setup, configuration, testing and troubleshooting for the Trello → n8n → rules → Gemini → Telegram workflow.
No real keys, tokens or chat IDs appear in this document. Use your own.

---

## 1. System requirements

| Component | Requirement |
|---|---|
| n8n | 1.x, self-hosted or n8n Cloud (tested on **1.123.83**) |
| Trello | Any plan with the **Custom Fields** Power-Up on the board |
| Gemini | Google AI Studio API key with access to a Gemini text model |
| Telegram | A bot created with @BotFather, and the chat that should receive the report |
| Node.js | 18+ — only for running tests and the optional setup script, not needed by n8n |

---

## 2. Trello setup

### Board structure

**Lists (status):** `Backlog` · `To Do` · `In Progress` · `Blocked` · `Review` · `Done`

### Required fields

| P08 field | Where it lives in Trello | Type |
|---|---|---|
| Project | Card name | — |
| Status | List the card is in | — |
| Deadline | Card due date | — |
| Owner | Custom field | Text |
| Priority | Custom field | Dropdown: Critical, High, Medium, Low |
| Estimated Hours | Custom field | Number |
| Actual Hours | Custom field | Number |
| Blocker | Custom field | Text — leave empty when nothing blocks the card |
| Dependency | Custom field | Text — the exact name of another card on the board |
| Risk Level | Custom field | Dropdown: Low, Medium, High (the owner's own view) |
| Next Milestone | Custom field | Text |
| Decision Required | Custom field | Text — leave empty when no decision is needed |
| Last update | Card activity date | automatic |

Custom field names must match exactly (case-sensitive). They are defined in `FIELD` in `src/p08-engine.js`.

### Option A — script (creates everything)

```bash
TRELLO_API_KEY=<your key> TRELLO_TOKEN=<your token> node scripts/trello-setup.js            # board, lists, fields, 12 project cards
TRELLO_API_KEY=<your key> TRELLO_TOKEN=<your token> node scripts/trello-setup.js --no-cards # structure only
node scripts/trello-setup.js --dry-run                                                      # show the API calls, no credentials needed
```

Get the key at <https://trello.com/power-ups/admin> (your Power-Up → API key), then generate a token from the same page. The script prints the new **board ID**.

### Option B — manual

Create the board and the six lists, enable Custom Fields, add the nine fields above, then add cards.
Board ID: open the board, add `.json` to the end of its URL, and copy the top-level `"id"`.

---

## 3. Credentials (created inside n8n only)

| n8n credential name (must match) | n8n type | Fields |
|---|---|---|
| `P08 Trello API` | Trello API | API Key, API Token |
| `P08 Gemini API Key` | Header Auth | Name: `x-goog-api-key` · Value: the raw Gemini key (no prefix, quotes or spaces) |
| `P08 Telegram Bot` | Telegram API | Access Token from @BotFather |

n8n encrypts these. They are never stored in the workflow file, this repository, or the reports.

### Gemini setup
1. Open <https://aistudio.google.com/apikey> and create an API key.
2. Paste it into the `P08 Gemini API Key` credential as described above.
3. Default model: `gemini-2.5-flash` (change it in Config if Google renames or retires it).

### Telegram setup
1. In Telegram, message **@BotFather** → `/newbot` → copy the token into `P08 Telegram Bot`.
2. Send any message (for instance `/start`) to your new bot from the account or group that should receive reports.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy `message.chat.id`. That is the **chat ID**.

---

## 4. Import the workflow

n8n → **Workflows** → **Import from file** → `workflow/p08-ai-project-manager.workflow.json`.

If a node shows "credential not found", open it and pick the matching credential from the list.

## 5. Configuration (Config node)

| Key | Value |
|---|---|
| `trelloBaseUrl` | `https://api.trello.com` (leave as is) |
| `trelloBoardId` | Board ID from step 2 — **required** |
| `telegramChatId` | Chat ID from step 3 — **required** |
| `geminiBaseUrl` | `https://generativelanguage.googleapis.com` (leave as is) |
| `geminiModel` | `gemini-2.5-flash` |
| `aiEnabled` | `true`, or `false` to always send the rule report |
| `aiLabel` | Name shown in the Telegram footer for AI reports (default `Gemini`) |
| `timezone` | Used to decide "today" (default `Asia/Riyadh`) |
| `asOfOverride` | Leave empty. `YYYY-MM-DD` only to replay a past date |

If `trelloBoardId` or `telegramChatId` is empty, the Risk Engine stops with a message naming the missing key.

Rule thresholds (stale days, due-soon days, hours percentage) are in `DEFAULT_CONFIG` in `src/p08-engine.js`.

## 6. Run the workflow

1. Click **Execute workflow** (Run Now). All nodes should turn green and the report should arrive on Telegram.
2. Open **Select Report** → output: `source` is `ai` or `rules`, and `reason` says why.
3. Switch the workflow to **Active** for the weekday 08:00 schedule (cron `0 8 * * 1-5`, workflow timezone).

## 7. Testing each scenario

### Automated (no accounts needed)

```bash
npm test     # 34 tests, including the 12 acceptance scenarios in tests/scenarios.test.js
```

### On the live board

| Scenario | Change on Trello | Expected in Telegram / Select Report |
|---|---|---|
| All on track | All cards current, no blocker, hours within estimate | Only an "On track" line |
| Overdue | Set a past due date on an open card | Card under "Act now" as OVERDUE |
| Blocked | Fill the Blocker field | Card under "Act now" as BLOCKED |
| Dependency problem | Set Dependency to the blocked card's name | Dependent card AT RISK, reason names the dependency |
| Hours exceeded | Actual Hours above Estimated Hours | AT RISK with "+N%" |
| Multiple risks | Combine several of the above on one card | Highest status wins; all reasons listed |
| Missing update | Leave a card untouched for 8+ days | AT RISK "No update for N days" |
| Missing data | Clear Owner or Priority | AT RISK "Missing: …" |
| Gemini unavailable | Set `geminiModel` to a non-existent model | `source: rules`, reason "AI request failed" |
| Gemini correct | Normal run | `source: ai`, reason "AI report passed validation" |
| Gemini contradicts | (covered by tests; cannot be forced on the live API) | `source: rules`, reason "AI report rejected" |
| Telegram | Any run | Message arrives; Telegram node output `ok: true` |

### Local test environment (no Trello or Gemini account)

The same workflow can run against local stand-ins:

```bash
node scripts/mock-trello-server.js 4010        # serves fixtures/trello-board.json in Trello API format
node scripts/mock-gemini-server.js 4020        # Gemini-API-compatible endpoint (models: p08-test-faithful | p08-test-contradict | p08-test-unavailable)
```

Set `trelloBaseUrl` to `http://127.0.0.1:4010`, `trelloBoardId` to `b08000000000000000000001`, `geminiBaseUrl` to `http://127.0.0.1:4020` and `geminiModel` to one of the test models. `scripts/n8n-harness.js` automates this setup and saves results to `evidence/`.

## 8. Expected output

Telegram message from the test board (AI report accepted):

```
P08 Project Health — 2026-10-07
🔴 Overdue 1  ⛔ Blocked 1  🟠 At risk 6  🟢 On track 3
Status decided by rules · report by Gemini (validated)

2 projects need you today; 6 more are at risk.

Act now
- Client Portal v2 (Sara Malik) is overdue: Deadline 2026-10-02 passed 5 day(s) ago.
- Payment Gateway Migration (Omar Haddad) is blocked: Blocker: Waiting for bank sandbox credentials.
...
Decisions for you
- Client Portal v2: Approve a 1-week scope cut or one extra developer.
```

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Risk Engine: `Config.trelloBoardId is empty` | Config not filled | Set the value in Config |
| Trello nodes 401 `invalid key` / `invalid token` | Wrong key or token | Re-enter both in `P08 Trello API` |
| Trello nodes 404 | Wrong board ID | Copy the ID again from the board's `.json` |
| All cards ON TRACK with "Missing: …" | Custom field names differ | Rename fields to match section 2 exactly |
| `source: rules`, reason `AI request failed: 400 … API key not valid` | Gemini key wrong, or has a prefix/space | Paste the raw key again |
| `source: rules`, reason `AI request failed: 404` | Model name not available | Change `geminiModel` |
| `source: rules`, reason `AI report rejected: …` | Guardrail working as designed | None — the rule report was sent |
| Telegram 400 `chat not found` | Wrong chat ID, or the bot was never messaged | Send `/start` to the bot, re-check the ID |
| Telegram 401 / 404 | Wrong bot token | Re-enter the token |
| Nothing at 08:00 | Workflow not Active, or wrong timezone | Activate it; check Settings → Timezone |

## 10. Changing the rules

Edit `src/p08-engine.js` → `npm test` → `npm run build:workflow` → re-import the workflow (or paste the regenerated Code node contents).
