import { createCodeSkill } from '../../../adk';
import { SchemaProps } from '../code-skill-factory';

const EVENT_PLANNING_BUDGETING = createCodeSkill({
  id: 'event-planning-budgeting',
  name: 'Event Planning & Budgeting',
  description:
    'Create comprehensive event plans and budgets with timelines, vendor categories, cost estimates, and risk mitigation. Reasoning-only: generates the plan draft for approval before any bookings.',
tier: 'advise',
domainKnowledge: 'Event planning conventions, budget estimation, vendor cost categories, timelines, and risk mitigation',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const task = input.task || 'plan';
const eventName = input.eventName || '';
const eventType = input.eventType || 'conference';
const date = input.date || '';
const venue = input.venue || '';
const expectedAttendees = input.expectedAttendees || 0;
const budgetTotal = input.budgetTotal || 0;
const budgetBreakdown = input.budgetBreakdown || {};
const timeline = input.timeline || [];
const vendors = input.vendors || [];
const risks = input.risks || [];

const baseDir = process.env.EVENT_HOME || path.join('/tmp/event');
const storePath = path.join(baseDir, 'plans.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

let plan = { id: 'event_' + Date.now(), eventName, eventType, date, venue, expectedAttendees, budgetTotal, createdAt: new Date().toISOString(), source: 'reasoning' };

const defaultCategories = [
  { category: 'Venue', typicalPct: 0.3, items: ['Rental', 'Insurance', 'Permits', 'Security'] },
  { category: 'Catering', typicalPct: 0.25, items: ['Food', 'Beverage', 'Service', 'Rentals'] },
  { category: 'A/V & Production', typicalPct: 0.15, items: ['Sound', 'Lighting', 'Video', 'Streaming', 'Stage'] },
  { category: 'Marketing', typicalPct: 0.1, items: ['Digital ads', 'Print', 'Email platform', 'Signage'] },
  { category: 'Speakers/Talent', typicalPct: 0.1, items: ['Fees', 'Travel', 'Lodging', 'Per diem'] },
  { category: 'Staffing', typicalPct: 0.05, items: ['Event staff', 'Volunteers', 'Coordinators'] },
  { category: 'Decor & Experience', typicalPct: 0.05, items: ['Flowers', 'Furniture', 'Activities', 'Swag'] },
];

function renderBudgetMarkdown(budgetObj) {
  const lines = ['| Category | Allocated | % |', '|---|---:|---:|'];
  Object.keys(budgetObj).forEach(cat => {
    const b = budgetObj[cat];
      lines.push('| ' + cat + ' | $' + b.allocated.toLocaleString() + ' | ' + (b.pct * 100).toFixed(1) + '% |');
  });
  return lines.join('\n');
}

if (task === 'plan') {
  const phases = [
    { phase: 'Concept & Goals', weeksBefore: 24, tasks: ['Define objectives, audience, KPIs', 'Set date options', 'Initial budget framework', 'Select event type/format'] },
    { phase: 'Venue & Vendors', weeksBefore: 16, tasks: ['Shortlist venues', 'RFP to vendors', 'Negotiate contracts', 'Lock venue'] },
    { phase: 'Program & Content', weeksBefore: 12, tasks: ['Recruit speakers', 'Build agenda', 'Design sessions', 'Confirm A/V needs'] },
    { phase: 'Marketing Launch', weeksBefore: 10, tasks: ['Launch registration', 'Email campaigns', 'Social media', 'Partner outreach'] },
    { phase: 'Operations Prep', weeksBefore: 4, tasks: ['Finalize BEO', 'Create run of show', 'Staff briefings', 'Emergency plan'] },
    { phase: 'Final Week', weeksBefore: 1, tasks: ['Final counts', 'Vendor confirmations', 'Print materials', 'Tech rehearsal'] },
    { phase: 'Event Day(s)', weeksBefore: 0, tasks: ['Execute run of show', 'Monitor budget', 'Guest experience', 'Issue resolution'] },
    { phase: 'Post-Event', weeksBefore: -1, tasks: ['Surveys', 'Financial reconciliation', 'Debrief', 'Report to stakeholders'] },
  ];

  const defaultBudget = {};
  let allocated = 0;
  defaultCategories.forEach(cat => {
    const pct = budgetBreakdown[cat.category]?.pct || cat.typicalPct;
    const amount = Math.round(budgetTotal * pct);
    allocated += amount;
    defaultBudget[cat.category] = { allocated: amount, pct, items: cat.items, spent: 0, committed: 0 };
  });
  defaultBudget.Contingency = { allocated: Math.round(budgetTotal * 0.1), pct: 0.1, items: ['Unforeseen'], spent: 0, committed: 0 };

  plan.plan = {
    eventName,
    eventType,
    date,
    venue,
    expectedAttendees,
    budgetTotal,
    budget: defaultBudget,
    phases,
    timeline: timeline.length ? timeline : phases.flatMap(p => p.tasks.map((t, i) => ({ task: t, due: \`Week \${24 - p.weeksBefore}\`, phase: p.phase }))),
    vendors: vendors.map(v => ({ name: v.name, category: v.category, status: 'pending', contact: v.contact, estimatedCost: v.estimatedCost })),
    risks: risks.length ? risks : [
      { risk: 'Low registration', likelihood: 'medium', impact: 'high', mitigation: 'Early-bird pricing, referral incentives' },
      { risk: 'Venue cancellation', likelihood: 'low', impact: 'critical', mitigation: 'Backup venue contract, force majeure clause' },
      { risk: 'Speaker dropout', likelihood: 'medium', impact: 'medium', mitigation: 'Backup speakers, contract penalties' },
      { risk: 'Tech failure', likelihood: 'medium', impact: 'high', mitigation: 'Redundant systems, on-site tech lead' },
      { risk: 'Weather (outdoor)', likelihood: 'low', impact: 'high', mitigation: 'Tent rental, indoor backup, weather insurance' },
    ],
    kpis: ['Registrations vs target', 'Budget variance', 'Attendee satisfaction (NPS)', 'Sponsor ROI', 'Cost per attendee'],
  };
} else if (task === 'budget') {
  if (!budgetTotal) {
    const resp = { success: false, status: 'failed', error: 'budgetTotal is required for budget task', present: [{ id: 'error', body: 'budgetTotal is required for budget task' }] };
    console.log(JSON.stringify(resp));
    return;
  }

  const budget = {};
  let allocated = 0;
  defaultCategories.forEach(cat => {
    const pct = budgetBreakdown[cat.category]?.pct || cat.typicalPct;
    const amount = Math.round(budgetTotal * pct);
    allocated += amount;
    budget[cat.category] = { allocated: amount, pct, items: cat.items, spent: 0, committed: 0, variance: 0 };
  });
  budget.Contingency = { allocated: Math.round(budgetTotal * 0.1), pct: 0.1, items: ['Unforeseen'], spent: 0, committed: 0, variance: 0 };

  plan.budget = budget;
  plan.budgetSummary = { total: budgetTotal, allocated, remaining: budgetTotal - allocated, contingencyPct: 10 };
  plan.tracking = {
    lastUpdated: new Date().toISOString(),
    categories: Object.keys(budget).map(cat => ({ category: cat, ...budget[cat] })),
  };
} else if (task === 'timeline') {
  plan.timeline = timeline.length ? timeline : [
    { milestone: 'Venue contracted', targetDate: 'Week 16', owner: 'Planner', status: 'pending' },
    { milestone: 'Speakers confirmed', targetDate: 'Week 12', owner: 'Program Lead', status: 'pending' },
    { milestone: 'Registration opens', targetDate: 'Week 10', owner: 'Marketing', status: 'pending' },
    { milestone: 'Early-bird ends', targetDate: 'Week 6', owner: 'Marketing', status: 'pending' },
    { milestone: 'Final counts due', targetDate: 'Week 2', owner: 'Planner', status: 'pending' },
    { milestone: 'Run of show final', targetDate: 'Week 1', owner: 'Operations', status: 'pending' },
    { milestone: 'Event execution', targetDate: 'Week 0', owner: 'All', status: 'pending' },
    { milestone: 'Post-event report', targetDate: 'Week +2', owner: 'Planner', status: 'pending' },
  ];
} else {
  const resp = { success: false, status: 'failed', error: 'Invalid task. Use "plan", "budget", or "timeline".', present: [{ id: 'error', body: 'Invalid task. Use "plan", "budget", or "timeline".' }] };
  console.log(JSON.stringify(resp));
  return;
}

store.push(plan);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

// Build presentation blocks derived from real computed data
const present = [];
  present.push({
  id: 'overview',
  title: 'Event summary',
  kind: 'markdown',
  body: \`**\${eventName}**\\n\\n- Type: \${eventType}\\n- Date: \${date || 'TBD'}\\n- Venue: \${venue || 'TBD'}\\n- Expected attendees: \${expectedAttendees}\`,
});

if (plan.plan && plan.plan.budget) {
  present.push({ id: 'budget', title: 'Budget allocation', kind: 'markdown', body: renderBudgetMarkdown(plan.plan.budget) });
}

  if (plan.plan && plan.plan.timeline && plan.plan.timeline.length) {
  const tl = plan.plan.timeline.slice(0, 12).map(item => \`- \${item.task || item.milestone} (\${item.due || item.targetDate || 'TBD'})\`).join('\n');
  present.push({ id: 'timeline', title: 'Top timeline items', kind: 'markdown', body: tl });
}

  if (plan.plan && plan.plan.vendors && plan.plan.vendors.length) {
  const vs = plan.plan.vendors.map(v => \`- \${v.name} — \${v.category} — \${v.contact || 'no contact'} — est $\${(v.estimatedCost||0).toLocaleString()}\`).join('\n');
  present.push({ id: 'vendors', title: 'Vendors', kind: 'markdown', body: vs });
}

  if (plan.plan && plan.plan.risks && plan.plan.risks.length) {
  const rs = plan.plan.risks.map(r => \`- \${r.risk} — \${r.likelihood}/\${r.impact} — Mitigation: \${r.mitigation}\`).join('\n');
  present.push({ id: 'risks', title: 'Risk register (top items)', kind: 'markdown', body: rs });
}

const result = { success: true, status: 'ok', data: { plan, storePath }, present };
console.log(JSON.stringify(result));
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      task: SchemaProps.select(['plan', 'budget', 'timeline'], { description: 'What to create: full plan, budget detail, or timeline' }),
      eventName: SchemaProps.text({ description: 'Event name' }),
      eventType: SchemaProps.select(['conference', 'workshop', 'gala', 'wedding', 'festival', 'trade-show', 'retreat', 'product-launch', 'fundraiser', 'networking'], { description: 'Event type' }),
      date: SchemaProps.text({ description: 'Event date(s) (ISO format)' }),
      venue: SchemaProps.text({ description: 'Venue name/location' }),
      expectedAttendees: SchemaProps.number({ description: 'Expected attendance' }),
      budgetTotal: SchemaProps.number({ description: 'Total budget in dollars' }),
      budgetBreakdown: { type: 'object', description: 'Custom budget percentages per category: { "Venue": { "pct": 0.35 } }' },
      timeline: SchemaProps.objectArray({ type: 'object', properties: { task: { type: 'string' }, due: { type: 'string' }, phase: { type: 'string' } } }, { description: 'Custom timeline tasks' }),
      vendors: SchemaProps.objectArray({ type: 'object', properties: { name: { type: 'string' }, category: { type: 'string' }, contact: { type: 'string' }, estimatedCost: { type: 'number' } } }, { description: 'Known vendors' }),
      risks: SchemaProps.objectArray({ type: 'object', properties: { risk: { type: 'string' }, likelihood: { type: 'string' }, impact: { type: 'string' }, mitigation: { type: 'string' } } }, { description: 'Risk register' }),
    },
    required: ['task', 'eventName'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      status: { type: ['string', 'null'], description: 'ok, partial, failed, blocked, not-connected, or confirmation-required' },
      data: { type: ['object', 'null'] },
      error: { type: ['string', 'null'] },
      present: {
        type: 'array',
        description: 'User-formatted presentation blocks derived from the computed result',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            kind: { type: 'string' },
          },
          required: ['id', 'body'],
        },
      },
    },
    required: ['success', 'present'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Plan an event', 'Create a budget', 'Build a timeline'] },
  ],
});

export { EVENT_PLANNING_BUDGETING };
