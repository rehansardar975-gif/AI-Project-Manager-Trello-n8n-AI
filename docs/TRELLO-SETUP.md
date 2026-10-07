# Trello board setup

## Structure

**Lists (status):** Backlog · To Do · In Progress · Blocked · Review · Done

**Card fields**

| P08 field | Trello source | Type |
|---|---|---|
| Project | Card name | — |
| Status | List name | — |
| Deadline | Card due date | — |
| Owner | Custom field | Text |
| Priority | Custom field | Dropdown: Critical, High, Medium, Low |
| Estimated Hours | Custom field | Number |
| Actual Hours | Custom field | Number |
| Blocker | Custom field | Text (empty = no blocker) |
| Dependency | Custom field | Text — exact name of another card |
| Risk Level | Custom field | Dropdown: Low, Medium, High (owner's own view) |
| Next Milestone | Custom field | Text |
| Decision Required | Custom field | Text (empty = none) |
| Last update | Card activity date (automatic) | — |

Field names must match exactly (case-sensitive); they are defined in `FIELD` in `src/p08-engine.js`.

## Option A — automatic (recommended)

On your own computer (Node 18+), with your Trello key and token from <https://trello.com/power-ups/admin> → your Power-Up → API key → generate token:

```bash
TRELLO_API_KEY=xxx TRELLO_TOKEN=yyy node scripts/trello-setup.js            # board + lists + fields + 12 cards
TRELLO_API_KEY=xxx TRELLO_TOKEN=yyy node scripts/trello-setup.js --no-cards # structure only
node scripts/trello-setup.js --dry-run                                      # print the API calls, no credentials needed
```

The script prints the new board ID. Put it in the n8n **Config** node (`trelloBoardId`). Card deadlines are shifted so they stay relative to today.

Note: freshly created cards all have today's activity date, so the "missing update" rule will not fire until a card is left untouched for 8+ days.

## Option B — manual

Create the board and lists above, enable the **Custom Fields** Power-Up, add the 9 fields with the exact names/types, then add cards. Board ID: open the board, add `.json` to the URL, copy `id`.
