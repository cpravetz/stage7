// @ts-nocheck

import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { salesResultSchema } from '../sales-contract';

const PIPELINE_ENDPOINT_ENV = 'SALES_PIPELINE_ENDPOINT';
const PIPELINE_API_KEY_ENV = 'SALES_PIPELINE_API_KEY';

const ENTITY_VERBS = {
  lead: 'lead',
  contact: 'contact',
  account: 'account',
  opportunity: 'opportunity',
  activity: 'activity',
  event: 'event',
  document: 'document',
};

const pipelineOps = createDeclarativeCodeSkill({
  id: 'pipeline-ops',
  name: 'Pipeline Ops',
  description:
    'Stage or send CRM pipeline operations for a configured sales endpoint. Pass dryRun true to stage the request and see exactly what would be sent; a live write requires dryRun false plus explicit confirmation. With no endpoint configured it reports the staged request and marks itself not connected rather than inventing a result.',
  persistenceEnvVar: 'STORAGE_DIR',
  tier: 'represent',
  domainKnowledge: 'Sales pipeline management, CRM operations, and deal tracking',
  inputSchema: createSchemaRecord({
    endpoint: SchemaProps.url({ description: 'Optional pipeline endpoint override for this call' }),
    dryRun: SchemaProps.boolean({ description: 'Stage the request without sending it; defaults to true', default: true }),
    confirmation: SchemaProps.boolean({ description: 'Explicit approval for a live pipeline write; required when dryRun is false', default: false }),
    entity: SchemaProps.select(['lead', 'contact', 'account', 'opportunity', 'activity', 'event', 'document'], { description: 'Entity type for the operation' }),
    entityId: SchemaProps.text({ description: 'Unique identifier of the entity' }),
    data: SchemaProps.object({}, { description: 'Data payload for the operation', additionalProperties: true }),
    subject: SchemaProps.text({ description: 'Email or document subject' }),
    startTime: SchemaProps.datetime({ description: 'ISO 8601 start time for calendar events' }),
    endTime: SchemaProps.datetime({ description: 'ISO 8601 end time for calendar events' }),
    duration: SchemaProps.number({ description: 'Event duration in minutes' }),
    attendees: SchemaProps.stringArray({ description: 'Attendee email addresses' }),
    meetingType: SchemaProps.select(['discovery', 'demo', 'proposal', 'followup', 'negotiation'], { description: 'Type of sales meeting' }),
    lineItems: SchemaProps.objectArray(
      SchemaProps.object(
        {
          description: SchemaProps.text({ description: 'Line item description' }),
          quantity: SchemaProps.number({ description: 'Line item quantity' }),
          unitPrice: SchemaProps.number({ description: 'Line item unit price' }),
        },
        { description: 'Line item for a proposal or quote' },
      ),
      { description: 'Line items for proposals and quotes; the total is derived from these' },
    ),
    totalAmount: SchemaProps.number({ description: 'Stated total, cross-checked against the line items' }),
    validUntil: SchemaProps.datetime({ description: 'Expiration date for proposals (ISO 8601)' }),
    leadId: SchemaProps.text({ description: 'Associated lead identifier' }),
    opportunityId: SchemaProps.text({ description: 'Associated opportunity identifier' }),
  }),
  outputSchema: salesResultSchema('Staged or sent operation, derived totals, and whether anything was actually sent'),
  triggers: [{ kind: 'user', phrase_examples: ['Update my CRM record', 'Send this to the pipeline', 'Stage this deal'] }],
  isSkill: true,
  // Pipeline records are written to the CRM; the brief is the work that decides
  // what is worth writing. Both belong to the pipeline, not to loose entry points.
  manifest: {
    lowerOrderTools: ['sales-crm-sync'],
    actionLabel: 'Review pipeline',
  credentialSource: {
    apiKey: { configKey: 'apiKey', required: false, label: "pipeline service API key, needed only for a live write (set in this Skill configuration, or a vault secret)" },
  },
    configSchema: createSchemaRecord({
      endpointUrl: SchemaProps.url({ description: 'Pipeline endpoint URL; may also be supplied at runtime through ' + PIPELINE_ENDPOINT_ENV }),
      defaultDryRun: SchemaProps.boolean({ description: 'Default pipeline operations to dry-run', default: true }),
      crmProvider: SchemaProps.select(['salesforce', 'hubspot', 'pipedrive', 'custom'], { description: 'Default CRM provider' }),
      calendarProvider: SchemaProps.select(['google', 'outlook', 'calendly', 'custom'], { description: 'Default calendar provider' }),
      documentProvider: SchemaProps.select(['pandadoc', 'proposify', 'quoter', 'custom'], { description: 'Default document management provider' }),
      defaultOwnerId: SchemaProps.text({ description: 'Default CRM owner ID for records' }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute', default: 60 }),
    }),
    endpointConfigKey: 'endpointUrl',
    // The key is optional (`required: false`): it is only needed for a live external

    // write, so gating on it would block the analysis-only and dry-run paths that

    // report what this Skill can honestly compute without one.
    persistenceEnv: 'SALES_HOME',
    timeoutMs: 30000,
    ui: { view: 'pipeline-ops' }
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const ENDPOINT_ENV = "SALES_PIPELINE_ENDPOINT";
      const API_KEY_ENV = "SALES_PIPELINE_API_KEY";
      const ENTITY_VERBS = {"lead":"lead","contact":"contact","account":"account","opportunity":"opportunity","activity":"activity","event":"event","document":"document"};

      const endpoint = String(input.endpointUrl || input.endpoint || ctx.config?.endpointUrl || '').trim();
            // Secrets arrive through ctx.credentials, resolved from this Skill's
      // credentialSource, never from the process environment.
      const apiKey = String((ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '').trim();

      // Dry run is the default and is checked first, before anything is sent. The shared external
      // action template ignored this flag entirely; honouring it here is the whole safety property.
      const dryRun = input.dryRun === true || input.dryRun === undefined;
      const liveRequested = input.dryRun === false;
      const confirmed = input.confirmation === true;

      const entity = String(input.entity || '').trim();
      const entityId = input.entityId ? String(input.entityId) : '';
      const channel = String(input.channel || 'crm');

      const missingInformation = [];
      if (!entity) missingInformation.push('entity');
      if (!entityId) missingInformation.push('entityId');
      if (!input.data || typeof input.data !== 'object' || Object.keys(input.data).length === 0) {
        if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) missingInformation.push('data');
      }

      // Derive the monetary total from the supplied line items rather than trusting a stated figure.
      const lineItems = Array.isArray(input.lineItems) ? input.lineItems : [];
      let derivedTotal = 0;
      const pricedLines = [];
      lineItems.forEach(function (item, index) {
        if (!item || typeof item !== 'object') return;
        const quantity = typeof item.quantity === 'number' ? item.quantity : 1;
        const unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
        const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
        derivedTotal += lineTotal;
        pricedLines.push({ description: String(item.description || ('line ' + (index + 1))), quantity: quantity, unitPrice: unitPrice, lineTotal: lineTotal });
      });
      derivedTotal = Math.round(derivedTotal * 100) / 100;

      const statedTotal = typeof input.totalAmount === 'number' ? input.totalAmount : null;
      const totalDisagreement = statedTotal !== null && pricedLines.length > 0 && Math.abs(statedTotal - derivedTotal) > 0.005;

      const operation = {
        entity: entity,
        entityLabel: ENTITY_VERBS[entity] || entity,
        entityId: entityId,
        channel: channel,
        data: input.data && typeof input.data === 'object' ? input.data : {},
        lineItems: pricedLines,
        statedTotal: statedTotal,
        derivedTotal: pricedLines.length ? derivedTotal : null,
        leadId: input.leadId || null,
        opportunityId: input.opportunityId || null,
        subject: input.subject || null,
        startTime: input.startTime || null,
        endTime: input.endTime || null,
        duration: typeof input.duration === 'number' ? input.duration : null,
        attendees: Array.isArray(input.attendees) ? input.attendees : [],
        validUntil: input.validUntil || null,
      };

      const renderOperation = function (op) {
        const lines = [];
        lines.push('Operation: ' + (op.entityLabel || 'record') + ' ' + (op.entityId || '(no id supplied)'));
        lines.push('Channel: ' + op.channel);
        if (op.leadId) lines.push('Lead: ' + op.leadId);
        if (op.opportunityId) lines.push('Opportunity: ' + op.opportunityId);
        if (op.subject) lines.push('Subject: ' + op.subject);
        if (op.startTime) lines.push('Start: ' + op.startTime);
        if (op.endTime) lines.push('End: ' + op.endTime);
        if (op.duration !== null) lines.push('Duration: ' + op.duration + ' minutes');
        if (op.attendees.length) lines.push('Attendees: ' + op.attendees.join(', '));
        if (op.validUntil) lines.push('Valid until: ' + op.validUntil);
        if (pricedLines.length) {
          lines.push('');
          lines.push('Line items:');
          pricedLines.forEach(function (line) {
            lines.push('  - ' + line.description + ' x' + line.quantity + ' at ' + line.unitPrice + ' = ' + line.lineTotal);
          });
          lines.push('Derived total: ' + derivedTotal);
          if (statedTotal !== null) {
            lines.push('Stated total: ' + statedTotal + (totalDisagreement ? '  (differs from the line items above)' : '  (matches the line items)'));
          }
        }
        const dataKeys = Object.keys(op.data);
        if (dataKeys.length) {
          lines.push('');
          lines.push('Payload:');
          dataKeys.forEach(function (key) {
            var value = op.data[key];
            var rendered;
            if (value !== null && typeof value === 'object') rendered = JSON.stringify(value);
            else rendered = String(value);
            if (rendered.length > 200) rendered = rendered.slice(0, 200) + '...';
            lines.push('  ' + key + ': ' + rendered);
          });
        }
        return lines;
      };

      if (missingInformation.length) {
        const lines = [];
        lines.push('The operation was not staged because required information is missing.');
        lines.push('');
        lines.push('Missing: ' + missingInformation.map(function (field) {
          return field === 'entity' ? 'the type of record' : field === 'entityId' ? 'the record identifier' : 'the details to write';
        }).join(', ') + '.');
        lines.push('');
        lines.push('Send the type of record, its identifier, and the details to write to stage the request.');
        lines.push('A proposal or quote can carry line items instead of a details payload.');
        lines.push('Nothing was sent and no external system was contacted.');
        return { success: false, status: 'not-connected', data: { operation: operation, missingInformation: missingInformation, sent: false }, error: 'Not connected: required operation details are missing, so nothing was staged or sent', present: [{ id: 'notice', title: 'Operation details required', kind: 'text', body: lines.join(NL) }] };
        return;
      }

      if (liveRequested && !confirmed) {
        const lines = [];
        lines.push('A live pipeline write was requested but explicit confirmation was not supplied.');
        lines.push('');
        lines.push('Nothing was sent and no external system was changed.');
        lines.push('Re-run with dryRun true to stage the request without sending it, or supply');
        lines.push('confirmation true to send it to ' + (endpoint || 'the configured endpoint') + '.');    return { success: false, status: 'confirmation-required', data: { operation: operation, endpoint: endpoint || null, sent: false }, error: 'Explicit confirmation is required before a live pipeline write', present: [{ id: 'notice', title: 'Confirmation required', kind: 'text', body: lines.join(NL) }] };
        return;
      }

      if (!endpoint) {
        const lines = [];
        lines.push('No pipeline endpoint is configured, so this request could not be sent.');
        lines.push('');
        lines.push('Staged request (not sent):');
        lines.push('');
        renderOperation(operation).forEach(function (line) { lines.push('  ' + line); });
        lines.push('');
        lines.push('Set ' + ENDPOINT_ENV + ' in the environment, or pass endpoint, to enable live writes.');
        lines.push('Nothing was sent and no external system was contacted.');
        return { success: false, status: 'not-connected', data: {
          operation: operation,
          endpoint: null,
          missingInformation: ['endpoint'],
          sent: false,
          staged: true,
        }, error: 'Not connected: no pipeline endpoint is configured, so the request was staged but not sent', present: [{ id: 'notice', title: 'Not connected: no pipeline endpoint', kind: 'text', body: lines.join(NL) }] };
        return;
      }

      if (dryRun) {
        const lines = [];
        lines.push('Staged pipeline request. Nothing was sent and no external system was changed.');
        lines.push('');
        lines.push('Endpoint: ' + endpoint);
        lines.push('Authentication: ' + (apiKey ? 'API key present (' + API_KEY_ENV + ')' : 'no API key configured'));
        lines.push('');
        renderOperation(operation).forEach(function (line) { lines.push('  ' + line); });
        lines.push('');
        lines.push('This is a dry run. To send it, re-run with dryRun false and confirmation true.');
        return { success: true, status: 'dry-run', data: {
          operation: operation,
          endpoint: endpoint,
          method: 'POST',
          authenticated: Boolean(apiKey),
          sent: false,
          staged: true,
        }, error: null, present: [{ id: 'staged', title: 'Pipeline request staged', kind: 'text', body: lines.join(NL) }] };
        return;
      }

      // Live path: confirmation was supplied and an endpoint exists.
      if (!apiKey) {
        const lines = [];
        lines.push('A live write was confirmed, but no API key is configured, so nothing was sent.');
        lines.push('');
        lines.push('Set ' + API_KEY_ENV + ' in the environment, or pass apiKey, then re-run.');
        lines.push('');
        lines.push('The request that would have been sent:');
        lines.push('');
        renderOperation(operation).forEach(function (line) { lines.push('  ' + line); });
        return { success: false, status: 'not-connected', data: {
          operation: operation,
          endpoint: endpoint,
          missingInformation: ['apiKey'],
          sent: false,
        }, error: 'Not connected: no pipeline API key is configured, so the confirmed write was not sent', present: [{ id: 'notice', title: 'Not connected: no API key', kind: 'text', body: lines.join(NL) }] };
        return;
      }

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['X-API-Key'] = apiKey;
        const payload = {
          entity: operation.entity,
          entityId: operation.entityId,
          data: operation.data,
          lineItems: operation.lineItems,
          totalAmount: operation.derivedTotal !== null ? operation.derivedTotal : operation.statedTotal,
        };
        const response = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
        const text = await response.text();
        let responseData = null;
        try { responseData = text ? JSON.parse(text) : null; } catch (e) { responseData = { text: text }; }

        if (!response.ok) {
          const lines = [];
          lines.push('The pipeline endpoint returned HTTP ' + response.status + '.');
          lines.push('');
          lines.push('The ' + operation.entityLabel + ' was not written.');
          lines.push('');
          renderOperation(operation).forEach(function (line) { lines.push('  ' + line); });
          if (responseData && typeof responseData === 'object') {
            lines.push('');
            lines.push('Response:');
            Object.keys(responseData).forEach(function (key) { lines.push('  ' + key + ': ' + String(responseData[key])); });
          }
          return { success: false, status: 'error', data: {
            operation: operation,
            endpoint: endpoint,
            sent: true,
            responseStatus: response.status,
            responseData: responseData,
          }, error: 'Pipeline endpoint returned HTTP ' + response.status, present: [{ id: 'notice', title: 'Pipeline write failed', kind: 'text', body: lines.join(NL) }] };
          return;
        }

        const lines = [];
        lines.push('Pipeline write succeeded.');
        lines.push('');
        lines.push('Endpoint: ' + endpoint);
        lines.push('Response status: ' + response.status);
        lines.push('');
        renderOperation(operation).forEach(function (line) { lines.push('  ' + line); });
        if (responseData && typeof responseData === 'object' && Object.keys(responseData).length) {
          lines.push('');
          lines.push('Response:');
          Object.keys(responseData).forEach(function (key) { lines.push('  ' + key + ': ' + String(responseData[key])); });
        } else if (responseData) {
          lines.push('');
          lines.push('Response body: ' + String(responseData));
        }
        return { success: true, status: 'ok', data: {
          operation: operation,
          endpoint: endpoint,
          sent: true,
          responseStatus: response.status,
          responseData: responseData,
        }, error: null, present: [{ id: 'report', title: 'Pipeline write complete', kind: 'text', body: lines.join(NL) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const lines = [];
        lines.push('The pipeline endpoint could not be reached: ' + message);
        lines.push('');
        lines.push('The ' + operation.entityLabel + ' was not written.');
        lines.push('');
        renderOperation(operation).forEach(function (line) { lines.push('  ' + line); });
        return { success: false, status: 'error', data: {
          operation: operation,
          endpoint: endpoint,
          sent: true,
          responseStatus: null,
        }, error: message, present: [{ id: 'notice', title: 'Pipeline write failed', kind: 'text', body: lines.join(NL) }] };
      }
    }
  });
pipelineOps.configSchema = createSchemaRecord({
      endpointUrl: SchemaProps.url({ description: 'Pipeline endpoint URL; may also be supplied at runtime through ' + PIPELINE_ENDPOINT_ENV }),
      defaultDryRun: SchemaProps.boolean({ description: 'Default pipeline operations to dry-run', default: true }),
      crmProvider: SchemaProps.select(['salesforce', 'hubspot', 'pipedrive', 'custom'], { description: 'Default CRM provider' }),
      calendarProvider: SchemaProps.select(['google', 'outlook', 'calendly', 'custom'], { description: 'Default calendar provider' }),
      documentProvider: SchemaProps.select(['pandadoc', 'proposify', 'quoter', 'custom'], { description: 'Default document management provider' }),
      defaultOwnerId: SchemaProps.text({ description: 'Default CRM owner ID for records' }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute', default: 60 }),
    });

export { pipelineOps as PIPELINE_OPS };
