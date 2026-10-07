# Start here

**P08 — AI Project Manager: Trello + n8n + Gemini + Telegram**

An n8n workflow that reads every project on a Trello board, decides its health with clear rules (overdue, blocked, at risk, on track), asks Gemini for a short founder report, checks that report against the rules, and sends it on Telegram every weekday morning.

## What is in this package

| Folder | What you will find | Use it for |
|---|---|---|
| `01-Case-Study` | A4 case study PDF (8 pages) | Send to a client, attach to proposals |
| `02-Client-Presentation` | 16:9 presentation PDF (13 slides) | Calls, screen sharing, Upwork portfolio |
| `03-Video` | 60-second video, 1920×1080, with voice-over and music | Upwork portfolio, LinkedIn, proposals |
| `04-Images` | Cover, architecture diagram, 12 screenshots (1600×1200) | Upwork portfolio images |
| `05-How-To-Use` | Setup and usage guide (PDF and Markdown) | Installing the workflow with real accounts |
| `06-Portfolio-Text` | Upwork entry, test results, media and license record (PDF and Markdown) | Copy-paste text for Upwork, proof of testing |
| `07-Workflow-and-Code` | n8n workflow, rule engine, tests, scripts, evidence | Importing into n8n, technical review |

## Upload to Upwork in this order

1. `04-Images/P08-cover.png`
2. `03-Video/P08-video.mp4`
3. `04-Images/screenshots/05-n8n-execution.png`
4. `04-Images/screenshots/08-telegram.png`
5. `04-Images/screenshots/02-trello-board.png`
6. `04-Images/P08-architecture.png`
7. `04-Images/screenshots/11-overdue-at-risk.png`
8. `04-Images/screenshots/07-gemini-report.png`
9. `04-Images/screenshots/12-end-to-end-result.png`
10. `01-Case-Study/P08-case-study.pdf`

Title and description: `06-Portfolio-Text/P08-UPWORK-PORTFOLIO-ENTRY.pdf`.

## Screenshots

| File | Shows |
|---|---|
| 01-cover-overview | Project overview |
| 02-trello-board | Trello board with 12 projects |
| 03-trello-card-details | All fields on one card |
| 04-n8n-workflow | The 10-node n8n workflow |
| 05-n8n-execution | The workflow captured while running and after success |
| 06-rule-engine | Rule engine input and output in n8n |
| 07-gemini-report | AI report accepted after validation |
| 08-telegram | The message the founder receives |
| 09-dashboard | All projects ranked by severity |
| 10-blocker-scenario | One blocker affecting dependent projects |
| 11-overdue-at-risk | Overdue and at-risk projects with reasons |
| 12-end-to-end-result | All three report paths and 12 test scenarios |

## Keep it accurate

Built as a portfolio project. The board data is a test dataset. In the recorded n8n runs, Trello and Gemini were served by local stand-ins; Telegram delivery was live. Do not claim a real client, time saved, revenue or a production deployment.
