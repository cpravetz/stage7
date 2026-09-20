import { createCodeSkill } from '../../../adk';
import { SchemaProps } from '../code-skill-factory';

const EVENT_PLANNING_BUDGETING = createCodeSkill({
  id: 'event_planning_budgeting',
  name: 'Event Planning & Budgeting',
  description:
    'Create comprehensive event plans and budgets with timelines, vendor categories, cost estimates, and risk mitigation. Reasoning-only: generates the plan draft for approval before any bookings.',
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
    console.log(JSON.stringify({ success: false, error: 'budgetTotal is required for budget task' }));
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
  console.log(JSON.stringify({ success: false, error: 'Invalid task. Use "plan", "budget", or "timeline".' }));
  return;
}

store.push(plan);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: { plan, storePath } }));
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
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Plan an event', 'Create a budget', 'Build a timeline'] },
    { kind: 'schedule', cadence: 'Weekly event pipeline review' },
    { kind: 'event', on: 'New event request' },
    { kind: 'event', on: 'Venue inquiry received' },
  ],
});

export { EVENT_PLANNING_BUDGETING };
