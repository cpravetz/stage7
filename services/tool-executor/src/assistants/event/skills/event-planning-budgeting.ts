import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';

const EVENT_PLANNING_BUDGETING = createDeclarativeCodeSkill({
  id: 'event-planning-budgeting',
  name: 'Event Planning & Budgeting',
  description:
    'Create comprehensive event plans and budgets with timelines, vendor categories, cost estimates, and risk mitigation. Reasoning-only: generates the plan draft for approval before any bookings.',
  tier: 'advise',
  domainKnowledge: 'Event planning conventions, budget estimation, vendor cost categories, timelines, and risk mitigation',
  persistenceEnvVar: 'EVENT_HOME',
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
  async handler(input, ctx) {
    const task = input.task || 'plan';
    const eventName = input.eventName || '';
    const eventType = input.eventType || 'conference';
    const date = input.date || '';
    const venue = input.venue || '';
    const expectedAttendees = input.expectedAttendees || 0;
    const budgetTotal = input.budgetTotal || 0;

    if (task === 'budget' && !budgetTotal) {
      return {
        success: false,
        status: 'failed',
        error: 'budgetTotal is required for budget task',
        present: [ctx.render.text('error', 'Error', 'budgetTotal is required for budget task')],
      };
    }

    if (task !== 'plan' && task !== 'budget' && task !== 'timeline') {
      return {
        success: false,
        status: 'failed',
        error: 'Invalid task. Use "plan", "budget", or "timeline".',
        present: [ctx.render.text('error', 'Error', 'Invalid task. Use "plan", "budget", or "timeline".')],
      };
    }

    const store = ctx.store.load('plans');
    const planObj = {
      id: `event_${Date.now()}`,
      eventName,
      eventType,
      date,
      venue,
      expectedAttendees,
      budgetTotal,
      createdAt: new Date().toISOString(),
      source: 'reasoning',
    };

    store.push(planObj);
    ctx.store.save('plans', store);

    const overviewBody = `**${eventName}**\n\n- Type: ${eventType}\n- Date: ${date || 'TBD'}\n- Venue: ${venue || 'TBD'}\n- Expected attendees: ${expectedAttendees}`;

    return {
      success: true,
      status: 'ok',
      data: { plan: planObj },
      present: [
        ctx.render.markdown('overview', 'Event summary', overviewBody),
      ],
    };
  },
});

export { EVENT_PLANNING_BUDGETING };
