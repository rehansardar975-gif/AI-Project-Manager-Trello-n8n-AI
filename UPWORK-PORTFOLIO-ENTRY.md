# Upwork portfolio entry — P08

**Title**
AI Project Manager: Trello + n8n Risk Reports with Gemini & Telegram

**Role**
n8n automation developer — design, workflow, rule engine, AI validation, testing

**Description** (paste into Upwork)

Most teams track delivery in Trello, but a founder doesn't have time to open every card. I built an n8n workflow that reads the whole board every weekday morning and sends one Telegram message: what is late, what is blocked, what is at risk, and which decisions are waiting.

How it works:
• Trello is the source of truth: lists for status, due dates, and custom fields for owner, priority, estimated and actual hours, blocker, dependency, risk level, next milestone and decision required.
• A rule engine decides each project's health (overdue, blocked, at risk, on track) and records the reason, such as "55h logged vs 40h estimated" or "depends on a blocked project".
• Gemini turns those results into a short founder report. It cannot change any status.
• Before sending, the AI text is checked against the rules. If Gemini is down or gets something wrong, the rule-based report is sent instead.
• All credentials stay inside n8n.

What the media shows: the Trello data, the n8n workflow captured while it runs, the rule results, the validated AI report, the Telegram message, and a test summary of 12 scenarios (34 automated tests, three report paths run in n8n and delivered to Telegram).

**Skills**
n8n · Workflow Automation · Trello API · Google Gemini API · Telegram Bot API · JavaScript · AI Integration · API Integration · Business Process Automation

**Project URL**
Leave empty, or link the repository if it is public.

**Media (upload in this order)**
1. `cover/P08-cover.png`
2. `video/P08-video.mp4`
3. `screenshots/05-n8n-execution.png`
4. `screenshots/08-telegram.png`
5. `screenshots/02-trello-board.png`
6. `architecture/P08-architecture.png`
7. `screenshots/11-overdue-at-risk.png`
8. `screenshots/07-gemini-report.png`
9. `screenshots/12-end-to-end-result.png`
10. `case-study/P08-case-study.pdf`

**Short version for proposals**
I built an n8n workflow that reads a Trello board, decides project health with clear rules (overdue, blocked, at risk, on track), has Gemini write a short founder summary, checks that summary against the rules, and sends it to Telegram every morning. If the AI fails, a rule-based report still goes out.

**Accuracy notes (keep these true when you talk about it)**
- Built as a portfolio project, not for a client. The board data is a test dataset.
- The n8n runs used local stand-ins for Trello and Gemini. Telegram delivery was live.
- Do not claim time saved, revenue, users or a production deployment.
