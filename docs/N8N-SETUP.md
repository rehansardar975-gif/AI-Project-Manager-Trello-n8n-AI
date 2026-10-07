# n8n setup (about 10 minutes)

Tested on n8n **1.123.x** (self-hosted). Works on n8n Cloud the same way.

## 1. Import

Workflows → Import from file → `n8n/p08-ai-project-manager.workflow.json`.

## 2. Credentials (Credentials → Add)

| Name (must match) | Type | Fields |
|---|---|---|
| `P08 Trello API` | Trello API | API Key, API Token |
| `P08 Gemini API Key` | Header Auth | Name: `x-goog-api-key` · Value: your Gemini key (raw key, no prefix, no quotes) |
| `P08 Telegram Bot` | Telegram API | Access Token from @BotFather |

If n8n shows "credential not found" on a node after import, open the node and select the credential from the list.

## 3. Config node

| Key | Value |
|---|---|
| `trelloBoardId` | Board ID from `docs/TRELLO-SETUP.md` |
| `telegramChatId` | Your chat ID (send any message to the bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and read `chat.id`) |
| `geminiModel` | Default `gemini-2.5-flash`; change if Google retires it |
| `aiEnabled` | `true` / `false` (false = always rule report) |
| `timezone` | Used to decide "today" for deadlines (default Asia/Riyadh) |
| `asOfOverride` | Leave empty. Set `YYYY-MM-DD` only to replay a past day |

## 4. Test, then activate

1. Click **Execute workflow** (Run Now). Expect all nodes green and a Telegram message.
2. Open **Select Report** output: `source` is `ai` or `rules`, `reason` explains why.
3. Toggle the workflow **Active** for the weekday 08:00 schedule.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Trello nodes 401 `invalid key` / `invalid token` | Wrong key/token in `P08 Trello API` |
| Trello nodes 404 | Wrong `trelloBoardId` |
| `source: rules`, reason `Gemini request failed: 400 API key not valid` | Gemini key wrong or has a prefix/whitespace |
| `source: rules`, reason `AI response omitted critical project` | Guardrail working as designed; rule report sent |
| Telegram 400 `chat not found` | Wrong chat ID, or you have not sent `/start` to the bot |
| Telegram 404 | Wrong bot token |

## Updating the rules

Edit `src/p08-engine.js` → `npm test` → `npm run build:workflow` → re-import (or paste the new Code node contents).
