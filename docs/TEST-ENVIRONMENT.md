# Test environment

How the evidence in `evidence/` was produced, and what was live.

## Why a controlled environment

The project was built in a cloud container whose network proxy could not authenticate to Trello (which needs an API key **and** a token on every request) or to the Gemini API. Telegram worked directly. Instead of depending on that proxy, the design keeps every credential inside n8n, and the tests run the real workflow in a real n8n instance with local stand-ins for the two services that could not be reached.

## Components

| Part | What ran | File |
|---|---|---|
| Workflow | Production `workflow/p08-ai-project-manager.workflow.json`, imported unchanged except Config values | `scripts/n8n-harness.js` |
| n8n | n8n 1.123.83, throwaway data folder, encrypted credential store | — |
| Trello | Local server returning the board in Trello REST API format (`/1/boards/{id}/lists`, `/customFields`, `/cards/open`); rejects requests without key + token | `scripts/mock-trello-server.js`, `fixtures/trello-board.json` |
| Gemini | Local server implementing `POST /v1beta/models/{model}:generateContent` with Gemini's response shape. Model name picks the behaviour: correct report, contradicting report, or HTTP 503 | `scripts/mock-gemini-server.js` |
| Telegram | Live Telegram Bot API | — |
| Recording | Playwright drives the n8n editor and captures frames during execution | `scripts/record-n8n-run.js` |

In the evidence and Telegram messages, AI reports from the test endpoint are labelled "Gemini-compatible test endpoint", not "Gemini".

## Board view images

The Trello images (`screenshots/02-trello-board.png`, `screenshots/03-trello-card-details.png`, `screenshots/10-blocker-scenario.png`) are rendered by `trello-view/index.html` from the same Trello API data the workflow consumed. They are not screenshots of trello.com.

## Moving to live services

Create the three n8n credentials and fill in the Config node (`docs/HOW-TO.md`). No code changes are needed.
