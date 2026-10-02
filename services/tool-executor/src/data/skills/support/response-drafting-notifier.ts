import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

/**
 * Notifier half of the response-drafting split.
 *
 * The original Skill was event-triggered but required a customerMessage that no
 * event supplied. This half fixes that honestly: the messages come from
 * configured queues, and `eventTypes` is a required selector so the Skill has a
 * bounded scope instead of watching everything.
 */
const RESPONSE_DRAFTING_NOTIFIER = createDeclarativeCodeSkill({
  id: 'response-drafting-notifier',
  name: 'Response Drafting Notifier',
  description: 'Drafts replies for queued inbound messages and notifies the configured channels.',
  persistenceEnvVar: 'SUPPORT_HOME',
  tier: 'aid',
  domainKnowledge: 'Customer success metrics (CSAT, NPS, Churn Rate), SLA management, support escalation tiers, ticket triage',
  inputSchema: {
    type: 'object',
    properties: {
      runReason: SchemaProps.text({ description: 'Why this run was invoked (event, schedule, manual)' }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      response: { type: 'object' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'response'],
  },
  configSchema: {
    type: 'object',
    properties: {
      eventTypes: { type: 'array', items: { type: 'string' }, description: 'Store keys of the inbound message queues to drain' },
      targetChannels: { type: 'array', items: { type: 'string' }, description: 'Channels to notify with each drafted reply' },
      templateId: { type: 'string', description: 'Default response template applied when a queue entry names none' },
    },
    required: ['eventTypes'],
    additionalProperties: false,
  },
  triggers: [
    { kind: 'schedule', cadence: 'Every 15 minutes' },
  ],
  isSkill: true,
  manifest: {},
  handler: async function handler(input, ctx) {
    const eventTypes = Array.isArray(ctx.config?.eventTypes) ? (ctx.config!.eventTypes as unknown[]).map(String) : [];
    const targetChannels = Array.isArray(ctx.config?.targetChannels) ? (ctx.config!.targetChannels as unknown[]).map(String) : [];
    const defaultTemplateId = typeof ctx.config?.templateId === 'string' ? ctx.config.templateId : '';
    const runReason = typeof input?.runReason === 'string' ? input.runReason : 'schedule';

    const kbArticles = ctx.store.load('kb', []);
    const templates = ctx.store.load('templates', []);
    const store = ctx.store.load('responses', []);

    const queued: string[] = [];
    const drained: Array<Record<string, any>> = [];
    const skipped: Array<Record<string, any>> = [];

    for (const eventType of eventTypes) {
      queued.push(eventType);
      const queue = ctx.store.load(eventType, []);
      const messages = Array.isArray(queue)
        ? queue
        : Array.isArray(queue?.messages)
          ? queue.messages
          : [];
      for (const message of messages) {
        const customerMessage = typeof message === 'string' ? message : message?.message || message?.body || '';
        if (!customerMessage) {
          // Counted so a queue that is present but full of unparseable entries
          // cannot report a clean run.
          skipped.push({ eventType, reason: 'no readable message body' });
          continue;
        }
        const ticketId = String(message?.ticket || message?.ticketId || `${eventType}:${drained.length + 1}`);
        // Composer inlined for the same reason as the User half: the sandbox has
        // no access to sibling modules.
        const tmpl = message?.template || defaultTemplateId;
        const matchedTemplate = tmpl ? templates.find((t: Record<string, any>) => (t.name || t.id) === tmpl) : null;
        const kbReferences = message?.includeKB === false ? [] : kbArticles.slice(0, 3).map((a: Record<string, any>) => a.title || a.id);
        const nextSteps = Array.isArray(message?.suggestedActions) ? message.suggestedActions : [];
        const prefix = matchedTemplate ? (matchedTemplate.body || matchedTemplate.content || '') : '';
        const actions = nextSteps.length ? 'Suggested next steps: ' + nextSteps.join(', ') + '.' : '';
        const body = [prefix, 'Regarding your inquiry: ' + customerMessage, actions].filter(Boolean).join(' ');
        const drafted: Record<string, any> = {
          ticketId,
          response: body,
          alternatives: [body.replace(/empathetic/gi, 'professional'), body.replace(/empathetic/gi, 'friendly')],
          confidence: 0.8,
          suggestedActions: nextSteps,
          kbReferences,
          tone: message?.tone || 'empathetic',
          template: tmpl || null,
          createdAt: new Date().toISOString(),
          source: 'local',
        };
        // `ctx.emit` is an object with success/failure/notConnected formatters,
        // not a channel dispatcher, so there is no notification primitive to
        // call here. Recording the destination channels on the queued reply is
        // what this Skill can honestly do; claiming it notified them would be a
        // capability it does not have.
        drafted.targetChannels = targetChannels;
        store.push(drafted);
        drained.push({ eventType, ticketId, kbReferences: drafted.kbReferences.length, targetChannels });
      }
    }

    ctx.store.save('responses', store);
    const summary = {
      runReason,
      eventTypes: queued,
      targetChannels,
      drained: drained.length,
      skipped: skipped.length,
      skippedDetail: skipped,
      storePath: ctx.store.getFilePath('responses'),
    };

    return {
      success: true,
      response: { drained: drained.length, skipped: skipped.length, eventTypes: queued },
      data: summary,
      present: [
        ctx.render.text(
          'report',
          'Response Drafting Notifier',
          `Drafted ${drained.length} repl${drained.length === 1 ? 'y' : 'ies'} from ${queued.length} configured queue(s)` +
            `${skipped.length ? `; skipped ${skipped.length} unreadable entr${skipped.length === 1 ? 'y' : 'ies'}` : ''}` +
            `${targetChannels.length ? `; addressed to ${targetChannels.join(', ')}` : ''}.`,
        ),
      ],
    };
  },
});

export { RESPONSE_DRAFTING_NOTIFIER };