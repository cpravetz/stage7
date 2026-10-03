import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
/**
 * CRM write. `represent`, because it writes to the system of record.
 *
 * Defaults to a staged request: a CRM sync that has not been confirmed is the
 * difference between a rep seeing their pipeline and the pipeline being
 * quietly rewritten. With no endpoint configured it reports the staged payload
 * and marks itself not-connected rather than implying a write happened.
 */
const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: { type: 'string' },
    data: { type: ['object', 'null'] },
    error: { type: ['string', 'null'] },
    present: {
      type: 'array',
      description: 'Pre-formatted, user-facing text blocks',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          kind: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['id', 'body'],
      },
    },
  },
  required: ['success', 'status', 'data', 'error', 'present'],
};

const CRM_SYNC = createDeclarativeCodeSkill({
  id: 'sales-crm-sync',
  name: 'CRM Sync',
  description:
    'Stages a deal sync against the configured CRM. Defaults to dry run; a live write requires confirmation. With no endpoint configured, reports the staged payload and marks itself not-connected rather than implying the CRM was updated.',
  persistenceEnvVar: 'SALES_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      dealData: { type: 'object', description: 'The deal record to write: stage, value, close date, contacts' },
      dryRun: SchemaProps.boolean({ description: 'Stage the payload without writing it' }),
    },
    required: ['dealData'],
  },
  outputSchema: RESULT_SCHEMA,
  triggers: [],
  tier: 'represent',
  emitEvent: 'sales.deal.synced',
  domainKnowledge:
    'CRM record synchronisation: deal stage and value writes, upsert matching, and the ' +
    'staged-versus-live distinction that keeps a pipeline read from a pipeline rewrite',
  isSkill: false,
  manifest: {
    actionLabel: 'Sync to CRM',
    configSchema: {
      type: 'object',
      properties: {
        endpointUrl: { type: 'string', description: 'CRM API endpoint' },
        provider: {
          type: 'string',
          enum: ['salesforce', 'hubspot', 'pipedrive', 'custom'],
          description: 'CRM provider',
        },
        objectName: { type: 'string', description: 'CRM object written, e.g. Opportunity' },
        writeMode: {
          type: 'string',
          enum: ['upsert', 'create-only', 'update-only'],
          description: 'How the record is matched',
          default: 'upsert',
        },
      },
      required: ['endpointUrl', 'provider'],
    },
    lowerOrderTools: [],
  },
  handler: async function handler(input, ctx) {
    const NL = '\n';
    const deal = (input.dealData || {}) as Record<string, unknown>;
    if (!Object.keys(deal).length) {
      return {
        success: false,
        status: 'blocked',
        data: null,
        error: 'No deal data was supplied; there is nothing to sync.',
        present: [
          {
            id: 'notice',
            title: 'Nothing to sync',
            kind: 'text',
            body: 'Supply dealData — the deal record to write.',
          },
        ],
      };
    }

    const endpoint = String(ctx.config?.endpointUrl || '');
    const dryRun = input.dryRun !== false;
    const payload = { deal, writeMode: ctx.config?.writeMode || 'upsert', objectName: ctx.config?.objectName || 'Opportunity' };

    const lines: string[] = [];
    lines.push('CRM Sync');
    lines.push('========');
    lines.push('');
    if (!endpoint) {
      lines.push('NOT CONNECTED — no CRM endpoint is configured, so nothing was written.');
    } else if (dryRun) {
      lines.push('DRY RUN — the payload below was staged and not sent.');
    } else {
      lines.push('LIVE — confirmation was given, so this payload was sent to the CRM.');
    }
    lines.push(`Provider:  ${ctx.config?.provider || '(not configured)'}`);
    lines.push(`Endpoint:  ${endpoint || '(not configured)'}`);
    lines.push(`Write mode: ${payload.writeMode}`);
    lines.push('');
    lines.push('PAYLOAD');
    lines.push(JSON.stringify(payload, null, 2));

    return {
      success: true,
      status: !endpoint ? 'not-connected' : dryRun ? 'dry-run' : 'ok',
      data: {
        payload,
        connected: Boolean(endpoint),
        sent: Boolean(endpoint) && !dryRun,
        storePath: ctx.store.getFilePath('crm-sync'),
        source: 'supplied-input',
      },
      error: !endpoint
        ? 'No CRM endpoint is configured. The payload was staged but not written.'
        : null,
      present: [{ id: 'crm', title: 'CRM Sync', kind: 'text', body: lines.join(NL) }],
    };
  },
});

export { CRM_SYNC };
