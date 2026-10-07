# Build environment notes (Claude Code Cloud)

This file records what the build environment could and could not reach, so results are not overstated. It does not affect the deployed system, which runs entirely inside n8n.

## Observed (2026-10-07)

| Service | Method in build environment | Result |
|---|---|---|
| Telegram | Bot token + chat ID as environment variables | Works. Message delivered from the n8n run. |
| Trello | Network Secret injected by the egress proxy for `api.trello.com` | HTTP 401 from Trello's edge (`ext_authz_denied`, "credentials supplied were not valid for this endpoint") |
| Gemini | Network Secret injected for `generativelanguage.googleapis.com` | HTTP 400 `API_KEY_INVALID` (a key is sent, but Google rejects the value received) |

Both keys were confirmed working outside the build environment, so the failure is in how the secret is injected, not in the keys.

## Decision

Trello requires **two** values per request (key + token, as query parameters or as one `Authorization: OAuth oauth_consumer_key="…", oauth_token="…"` header). The proxy injects one configured secret per host, and that configuration cannot be read back from inside the session. Instead of trial-and-error with the proxy, the architecture was changed so **only n8n ever calls Trello and Gemini**, using n8n's own credential store. The build environment never needs those credentials.

How the system was still verified end to end here:

- A real n8n 1.123 instance was run in the session.
- Trello API responses were served by `scripts/mock-trello-server.js` from `fixtures/trello-board.json` (exact Trello response shapes; the mock enforces that key + token are present).
- The Gemini call was made for real through the proxy (it failed with 400), which exercised the fallback path. The AI-accepted and AI-rejected paths were exercised with `scripts/mock-gemini-server.js`.
- Telegram delivery was real.

## Optional: if you want direct Trello/Gemini access in a future Cloud session

Not needed for P08. If wanted later, recreate the Network Secrets as:

- `api.trello.com` — header `Authorization`, value `OAuth oauth_consumer_key="<KEY>", oauth_token="<TOKEN>"` (no `Bearer` prefix).
- `generativelanguage.googleapis.com` — header `x-goog-api-key`, value = raw key (no prefix, no quotes, no trailing newline).

This depends on the proxy supporting a custom header name and a raw value. That is **not verified**.
