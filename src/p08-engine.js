/**
 * P08 — AI Project Manager: deterministic health/risk engine.
 *
 * Pure JavaScript, no dependencies. The same file is:
 *   - required by the Node test suite and local scripts, and
 *   - embedded verbatim into the n8n "Risk Engine" Code node by scripts/build-workflow.js.
 *
 * Health is decided ONLY by the rules in this file. The AI layer receives the
 * already-calculated facts and may only rephrase them.
 */
'use strict';

const HEALTH = Object.freeze({
  OVERDUE: 'OVERDUE',
  BLOCKED: 'BLOCKED',
  AT_RISK: 'AT RISK',
  ON_TRACK: 'ON TRACK',
  DONE: 'DONE',
});

const HEALTH_RANK = { OVERDUE: 4, BLOCKED: 3, 'AT RISK': 2, 'ON TRACK': 1, DONE: 0 };
const PRIORITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const SEVERITY_RANK = { critical: 3, high: 2, medium: 1, info: 0 };

const DEFAULT_CONFIG = Object.freeze({
  staleDays: 7, // no card activity for more than N days -> missing update
  staleCriticalDays: 14, // escalates the missing-update flag to high severity
  dueSoonDays: 7, // deadline within N days while still in an early list
  hoursOverHighPct: 20, // actual hours above estimate by more than N% -> high severity
  doneLists: ['Done'],
  blockedLists: ['Blocked'],
  notStartedLists: ['Backlog', 'To Do'],
});

// Custom field names expected on the Trello board (see docs/TRELLO-SETUP.md).
const FIELD = Object.freeze({
  OWNER: 'Owner',
  PRIORITY: 'Priority',
  ESTIMATED_HOURS: 'Estimated Hours',
  ACTUAL_HOURS: 'Actual Hours',
  BLOCKER: 'Blocker',
  DEPENDENCY: 'Dependency',
  RISK_LEVEL: 'Risk Level',
  NEXT_MILESTONE: 'Next Milestone',
  DECISION_REQUIRED: 'Decision Required',
});

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnly(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Convert raw Trello API responses into normalized project records.
 * @param {{cards: object[], lists: object[], customFields: object[]}} board
 */
function fromTrello(board) {
  if (!board || !Array.isArray(board.cards)) {
    throw new Error('fromTrello: expected { cards: [], lists: [], customFields: [] }');
  }
  const lists = Array.isArray(board.lists) ? board.lists : [];
  const customFields = Array.isArray(board.customFields) ? board.customFields : [];

  const listName = new Map(lists.map((l) => [l.id, cleanText(l.name)]));
  const fieldDefs = new Map(customFields.map((f) => [f.id, f]));

  return board.cards
    .filter((card) => card && !card.closed)
    .map((card) => {
      const values = {};
      for (const item of card.customFieldItems || []) {
        const def = fieldDefs.get(item.idCustomField);
        if (!def) continue;
        values[cleanText(def.name)] = readCustomFieldValue(def, item);
      }
      return {
        id: card.id,
        project: cleanText(card.name),
        url: card.shortUrl || card.url || '',
        status: listName.get(card.idList) || 'Unknown list',
        owner: cleanText(values[FIELD.OWNER]),
        priority: cleanText(values[FIELD.PRIORITY]),
        deadline: card.due || null,
        deadlineComplete: Boolean(card.dueComplete),
        estimatedHours: toNumber(values[FIELD.ESTIMATED_HOURS]),
        actualHours: toNumber(values[FIELD.ACTUAL_HOURS]),
        blocker: cleanText(values[FIELD.BLOCKER]),
        dependency: cleanText(values[FIELD.DEPENDENCY]),
        riskLevel: cleanText(values[FIELD.RISK_LEVEL]),
        nextMilestone: cleanText(values[FIELD.NEXT_MILESTONE]),
        decisionRequired: cleanText(values[FIELD.DECISION_REQUIRED]),
        lastActivity: card.dateLastActivity || null,
      };
    });
}

function readCustomFieldValue(def, item) {
  if (def.type === 'list') {
    const option = (def.options || []).find((o) => o.id === item.idValue);
    return option && option.value ? option.value.text : '';
  }
  const v = item.value || {};
  if (def.type === 'number') return v.number;
  if (def.type === 'checkbox') return v.checked === 'true' ? 'Yes' : '';
  if (def.type === 'date') return v.date;
  return v.text;
}

function flag(code, severity, message) {
  return { code, severity, message };
}

function fmtDate(ms) {
  return ms === null ? 'none' : new Date(ms).toISOString().slice(0, 10);
}

/**
 * Evaluate project health. Deterministic: same input + asOf => same output.
 * @param {object[]} projects normalized records (see fromTrello)
 * @param {{asOf?: string|Date, config?: object}} options
 */
function evaluate(projects, options = {}) {
  if (!Array.isArray(projects)) throw new Error('evaluate: projects must be an array');
  const cfg = Object.assign({}, DEFAULT_CONFIG, options.config || {});
  const asOfMs = toDateOnly(options.asOf || new Date());
  if (asOfMs === null) throw new Error('evaluate: invalid asOf date');

  const isDone = (p) => cfg.doneLists.includes(p.status) || p.deadlineComplete === true;

  // Pass 1: rules that depend only on the card itself.
  const evaluated = projects.map((raw) => {
    // Re-sanitize: records may come from sources other than fromTrello().
    const p = Object.assign({}, raw, {
      project: cleanText(raw.project),
      status: cleanText(raw.status),
      owner: cleanText(raw.owner),
      priority: cleanText(raw.priority),
      blocker: cleanText(raw.blocker),
      dependency: cleanText(raw.dependency),
      riskLevel: cleanText(raw.riskLevel),
      nextMilestone: cleanText(raw.nextMilestone),
      decisionRequired: cleanText(raw.decisionRequired),
      estimatedHours: toNumber(raw.estimatedHours),
      actualHours: toNumber(raw.actualHours),
    });
    const flags = [];
    const due = toDateOnly(p.deadline);
    const done = isDone(p);
    const daysToDeadline = due === null ? null : Math.round((due - asOfMs) / DAY_MS);
    const last = toDateOnly(p.lastActivity);
    const daysSinceUpdate = last === null ? null : Math.round((asOfMs - last) / DAY_MS);

    if (!done) {
      if (due !== null && due < asOfMs) {
        flags.push(flag('OVERDUE', 'critical', `Deadline ${fmtDate(due)} passed ${-daysToDeadline} day(s) ago`));
      }
      if (cfg.blockedLists.includes(p.status) || p.blocker) {
        flags.push(flag('BLOCKED', 'critical', p.blocker ? `Blocker: ${p.blocker}` : `Card sits in "${p.status}" list`));
      }
      if (
        due !== null &&
        daysToDeadline >= 0 &&
        daysToDeadline <= cfg.dueSoonDays &&
        cfg.notStartedLists.includes(p.status)
      ) {
        flags.push(flag('DUE_SOON_NOT_STARTED', 'high', `Due in ${daysToDeadline} day(s) but still in "${p.status}"`));
      }
      if (p.estimatedHours !== null && p.actualHours !== null && p.estimatedHours > 0 && p.actualHours > p.estimatedHours) {
        const overPct = Math.round(((p.actualHours - p.estimatedHours) / p.estimatedHours) * 100);
        flags.push(
          flag(
            'HOURS_OVER_ESTIMATE',
            overPct > cfg.hoursOverHighPct ? 'high' : 'medium',
            `${p.actualHours}h logged vs ${p.estimatedHours}h estimated (+${overPct}%)`
          )
        );
      }
      if (daysSinceUpdate === null) {
        flags.push(flag('MISSING_UPDATE', 'medium', 'No activity date recorded'));
      } else if (daysSinceUpdate > cfg.staleDays) {
        flags.push(
          flag(
            'MISSING_UPDATE',
            daysSinceUpdate > cfg.staleCriticalDays ? 'high' : 'medium',
            `No update for ${daysSinceUpdate} days`
          )
        );
      }
      const missing = [];
      if (!p.owner) missing.push('Owner');
      if (due === null) missing.push('Deadline');
      if (!p.priority) missing.push('Priority');
      if (p.estimatedHours === null) missing.push('Estimated Hours');
      if (missing.length) {
        flags.push(flag('MISSING_FIELDS', 'medium', `Missing: ${missing.join(', ')}`));
      }
      if (p.riskLevel === 'High') {
        flags.push(flag('OWNER_REPORTED_HIGH_RISK', 'medium', 'Owner marked Risk Level = High'));
      }
    }

    return Object.assign({}, p, { done, due, daysToDeadline, daysSinceUpdate, flags });
  });

  // Pass 2: dependency rules (need every card's pass-1 state).
  const byName = new Map(evaluated.map((p) => [p.project.toLowerCase(), p]));
  for (const p of evaluated) {
    if (p.done || !p.dependency) continue;
    const dep = byName.get(p.dependency.toLowerCase());
    if (!dep) {
      p.flags.push(flag('DEPENDENCY_NOT_FOUND', 'high', `Dependency "${p.dependency}" does not match any card on the board`));
      continue;
    }
    if (dep === p) {
      p.flags.push(flag('DEPENDENCY_NOT_FOUND', 'high', 'Card lists itself as its dependency'));
      continue;
    }
    if (dep.done) continue;
    const depCritical = dep.flags.filter((f) => f.code === 'OVERDUE' || f.code === 'BLOCKED').map((f) => f.code);
    if (depCritical.length) {
      p.flags.push(flag('DEPENDENCY_AT_RISK', 'high', `Depends on "${dep.project}", which is ${depCritical.join(' + ')}`));
    } else if (p.due !== null && (dep.due === null || dep.due > p.due)) {
      p.flags.push(
        flag(
          'DEPENDENCY_LATE',
          'high',
          `Depends on "${dep.project}" (due ${fmtDate(dep.due)}), which finishes after this deadline (${fmtDate(p.due)})`
        )
      );
    }
  }

  // Health decision: fixed precedence, no AI involvement.
  const results = evaluated.map((p) => {
    let health;
    const codes = new Set(p.flags.map((f) => f.code));
    if (p.done) health = HEALTH.DONE;
    else if (codes.has('OVERDUE')) health = HEALTH.OVERDUE;
    else if (codes.has('BLOCKED')) health = HEALTH.BLOCKED;
    else if (p.flags.length) health = HEALTH.AT_RISK;
    else health = HEALTH.ON_TRACK;

    p.flags.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    const score =
      HEALTH_RANK[health] * 100 +
      (PRIORITY_RANK[p.priority] || 0) * 10 +
      Math.min(p.flags.length, 9);

    return {
      id: p.id,
      project: p.project,
      url: p.url,
      status: p.status,
      owner: p.owner || null,
      priority: p.priority || null,
      deadline: p.due === null ? null : fmtDate(p.due),
      daysToDeadline: p.daysToDeadline,
      estimatedHours: p.estimatedHours,
      actualHours: p.actualHours,
      blocker: p.blocker || null,
      dependency: p.dependency || null,
      riskLevel: p.riskLevel || null,
      nextMilestone: p.nextMilestone || null,
      decisionRequired: p.decisionRequired || null,
      daysSinceUpdate: p.daysSinceUpdate,
      health,
      flags: p.flags,
      score,
    };
  });

  results.sort((a, b) => b.score - a.score || a.project.localeCompare(b.project));

  const active = results.filter((r) => r.health !== HEALTH.DONE);
  const count = (h) => active.filter((r) => r.health === h).length;
  const flagCount = (code) => active.filter((r) => r.flags.some((f) => f.code === code)).length;
  const est = active.reduce((s, r) => s + (r.estimatedHours || 0), 0);
  const act = active.reduce((s, r) => s + (r.actualHours || 0), 0);

  return {
    asOf: fmtDate(asOfMs),
    config: cfg,
    summary: {
      totalCards: results.length,
      active: active.length,
      done: results.length - active.length,
      overdue: count(HEALTH.OVERDUE),
      blocked: count(HEALTH.BLOCKED),
      atRisk: count(HEALTH.AT_RISK),
      onTrack: count(HEALTH.ON_TRACK),
      missingUpdates: flagCount('MISSING_UPDATE'),
      hoursOverEstimate: flagCount('HOURS_OVER_ESTIMATE'),
      dependencyIssues: active.filter((r) => r.flags.some((f) => f.code.startsWith('DEPENDENCY_'))).length,
      decisionsRequired: active.filter((r) => r.decisionRequired).length,
      estimatedHours: est,
      actualHours: act,
    },
    projects: results,
  };
}

/** Plain-text, rule-based founder report. Always available; used when AI is unavailable or rejected. */
function buildRuleReport(result) {
  const s = result.summary;
  const active = result.projects.filter((p) => p.health !== HEALTH.DONE);
  const lines = [];
  lines.push(`Portfolio health — ${result.asOf}`);
  lines.push(
    `${s.active} active: ${s.overdue} overdue, ${s.blocked} blocked, ${s.atRisk} at risk, ${s.onTrack} on track. ${s.done} done.`
  );
  const critical = active.filter((p) => p.health === HEALTH.OVERDUE || p.health === HEALTH.BLOCKED);
  if (critical.length) {
    lines.push('');
    lines.push('Needs action now:');
    for (const p of critical) {
      lines.push(`- ${p.project} [${p.health}] (${p.owner || 'no owner'}): ${p.flags[0].message}`);
    }
  }
  const risk = active.filter((p) => p.health === HEALTH.AT_RISK);
  if (risk.length) {
    lines.push('');
    lines.push('At risk:');
    for (const p of risk) {
      lines.push(`- ${p.project} (${p.owner || 'no owner'}): ${p.flags.map((f) => f.message).slice(0, 2).join('; ')}`);
    }
  }
  const decisions = active.filter((p) => p.decisionRequired);
  if (decisions.length) {
    lines.push('');
    lines.push('Decisions required from you:');
    for (const p of decisions) lines.push(`- ${p.project}: ${p.decisionRequired}`);
  }
  const ok = active.filter((p) => p.health === HEALTH.ON_TRACK);
  if (ok.length) {
    lines.push('');
    lines.push(`On track: ${ok.map((p) => p.project).join(', ')}`);
  }
  return lines.join('\n');
}

/** Prompt for the AI layer. Facts are passed as JSON; the model may not change them. */
function buildAiPrompt(result) {
  const facts = {
    asOf: result.asOf,
    summary: result.summary,
    projects: result.projects
      .filter((p) => p.health !== HEALTH.DONE)
      .map((p) => ({
        project: p.project,
        health: p.health,
        owner: p.owner,
        priority: p.priority,
        deadline: p.deadline,
        nextMilestone: p.nextMilestone,
        decisionRequired: p.decisionRequired,
        issues: p.flags.map((f) => f.message),
      })),
  };
  return [
    'You write a weekly portfolio status note for a company founder.',
    'The health status of every project has ALREADY been decided by deterministic rules. Treat it as fixed fact.',
    'Rules:',
    '- Never change, upgrade, downgrade or re-judge any health status.',
    '- Use only the facts in the JSON. Do not invent numbers, dates, people, causes or outcomes.',
    '- Mention every project whose health is OVERDUE or BLOCKED by its exact name.',
    '- Plain text only, no markdown symbols such as ** or #. Maximum 170 words.',
    'Structure: one-line headline; "Act now" (overdue/blocked, with the specific issue); "Watch" (at risk);',
    '"Decisions for you" (only if decisionRequired is set); one closing line on what is on track.',
    '',
    'FACTS:',
    JSON.stringify(facts),
  ].join('\n');
}

/**
 * Guardrail on the AI output. Rejects empty/oversized text, missing critical
 * projects, or any health label that contradicts the rule engine.
 */
function validateAiReport(text, result) {
  const t = cleanText(text);
  if (!t) return { ok: false, reason: 'empty AI response' };
  if (t.length > 2500) return { ok: false, reason: 'AI response too long' };
  const active = result.projects.filter((p) => p.health !== HEALTH.DONE);
  for (const p of active) {
    if ((p.health === HEALTH.OVERDUE || p.health === HEALTH.BLOCKED) && !t.toLowerCase().includes(p.project.toLowerCase())) {
      return { ok: false, reason: `AI response omitted critical project "${p.project}"` };
    }
  }
  // A project described with a better health than the rules gave it is a contradiction.
  for (const p of active) {
    if (p.health === HEALTH.ON_TRACK) continue;
    const re = new RegExp(escapeRegExp(p.project) + '[^.\\n]{0,40}\\bon track\\b', 'i');
    if (re.test(t)) return { ok: false, reason: `AI response calls "${p.project}" on track, rules say ${p.health}` };
  }
  return { ok: true, reason: 'passed guardrails' };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Telegram HTML message (<= 4096 chars). */
function buildTelegramMessage(reportText, result, source) {
  const s = result.summary;
  const header =
    `<b>P08 Project Health — ${escapeHtml(result.asOf)}</b>\n` +
    `🔴 Overdue ${s.overdue}  ⛔ Blocked ${s.blocked}  🟠 At risk ${s.atRisk}  🟢 On track ${s.onTrack}\n` +
    `<i>Status decided by rules · report by ${source === 'ai' ? 'Gemini' : 'rule engine (AI fallback)'}</i>\n\n`;
  let body = escapeHtml(reportText);
  const max = 4096 - header.length - 20;
  if (body.length > max) body = body.slice(0, max) + '\n…';
  return header + body;
}

const P08 = {
  HEALTH,
  FIELD,
  DEFAULT_CONFIG,
  fromTrello,
  evaluate,
  buildRuleReport,
  buildAiPrompt,
  validateAiReport,
  buildTelegramMessage,
};

if (typeof module !== 'undefined' && module.exports) module.exports = P08;
