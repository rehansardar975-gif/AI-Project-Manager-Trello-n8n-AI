# Upwork portfolio entry — P08

**Title (≤ 70 chars)**
AI Project Manager: Trello + n8n Risk Alerts with Gemini & Telegram

**Role**
Automation developer — architecture, n8n workflow, rule engine, AI prompt and guardrail, testing.

**Project description**

Founders often track delivery in Trello but don't have time to open every card. This n8n workflow reads the whole board every weekday at 08:00 and sends one Telegram message that answers: what is late, what is blocked, what is drifting, and what needs my decision.

How it works:
• Trello is the source of truth: lists for status, due dates, and 9 custom fields (owner, priority, estimated/actual hours, blocker, dependency, risk level, next milestone, decision required).
• A deterministic rule engine decides health: OVERDUE, BLOCKED, AT RISK or ON TRACK. It checks deadlines, blockers, hours over estimate, missing updates, missing fields and dependency problems.
• Gemini turns those facts into a short founder report. It is not allowed to change any status.
• A guardrail checks the AI text. If Gemini fails or contradicts the rules, the rule-based report is sent instead, so the founder always gets a message.
• Credentials are kept only in n8n. Nothing sensitive is in the code.

Verified: 22 automated tests, a full n8n run delivered to Telegram in under 2 seconds, and all three report paths (AI accepted, AI rejected, AI unavailable).

**Skills / tags**
n8n · Workflow Automation · Trello API · Google Gemini API · Telegram Bot API · JavaScript · AI Integration · Project Management Automation · API Integration

**Media order**
1. `portfolio/cover.png`
2. `portfolio/screenshots/04-telegram.png`
3. `portfolio/screenshots/01-dashboard.png`
4. `portfolio/screenshots/02-n8n-workflow.png`
5. `portfolio/architecture.png`
6. `portfolio/screenshots/05-rules.png`
7. `portfolio/screenshots/06-tests.png`
8. `portfolio/P08-video.mp4`
9. `portfolio/P08-case-study.pdf`

**Short version (for proposals)**
I built an n8n workflow that reads a Trello board, decides project health with clear rules (overdue, blocked, at risk, on track), has Gemini write a short founder summary, and sends it to Telegram every morning. If the AI fails, a rule-based report is still sent.

**Honesty notes (do not remove before publishing)**
- The board data is a test dataset of 12 projects created for this build. No real client.
- Do not claim time saved, revenue or production users.
