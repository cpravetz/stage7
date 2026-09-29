import { SchemaRecord } from '../../../types'
import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory'
import { healthcareResultSchema } from './healthcare-contract'

function withUxMetadata(schema: SchemaRecord): SchemaRecord {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
  if (!properties) return schema
  Object.entries(properties).forEach(([key, property], index) => {
    if (!property || typeof property !== 'object') return
    property.title = property.title || key.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase())
    property.order = typeof property.order === 'number' ? property.order : index + 1
    property.hint = property.hint || property.description || 'See the tool documentation for details.'
  })
  return schema
}

const HEALTHCARE_HOME = process.env.HEALTHCARE_HOME || '/tmp/healthcare'
const SAFETY_BOUNDARY = 'Decision support and education only: do not diagnose, prescribe, change treatment, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician must review all outputs.'
const metadata = { domain: 'healthcare', persistenceEnv: 'HEALTHCARE_HOME', HEALTHCARE_HOME, homeEnv: 'HEALTHCARE_HOME', healthcareHome: HEALTHCARE_HOME, clinicalSafetyBoundary: SAFETY_BOUNDARY }
const triggers = [
  { kind: 'user' as const, phrase_examples: ['evaluate clinic workflow', 'review this clinical case', 'create a care plan', 'stage intake dispatch'] },
  { kind: 'schedule' as const, cadence: 'daily clinical operations review' },
  { kind: 'event' as const, on: 'intake submission, appointment change, care-plan request, or guideline update' },
  { kind: 'data' as const, condition: 'workflow, evidence, education, or intake data is available for review' },
]

const intakeSource = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';
  const SAFETY = ${JSON.stringify(SAFETY_BOUNDARY)};

  function emit(success, status, opts) {
    const result = {
      success: success,
      status: status,
      connected: opts.connected,
      endpoint: opts.endpoint || null,
      healthcareHome: process.env.HEALTHCARE_HOME || '/tmp/healthcare',
      data: opts.data || null,
      error: opts.error || null,
      present: opts.present || [],
    };
    console.log(JSON.stringify(result));
    return result;
  }

  function presentNotice(title, body) {
    return [{ id: 'notice', title: title, kind: 'text', body: body + NL + NL + SAFETY }];
  }

  const endpoint = String(input.endpointUrl || input.endpoint || process.env.HEALTHCARE_INTAKE_ENDPOINT || '');
  const token = String(input.token || input.accessToken || process.env.HEALTHCARE_INTAKE_TOKEN || process.env.HEALTHCARE_INTAKE_ACCESS_TOKEN || '');
  const dryRun = input.dryRun === true || input.dryRun === undefined || input.dryRun !== false;
  const liveRequested = input.dryRun === false;
  const confirmationRequired = true;
  const confirmed = input.confirmation === true || input.confirmed === true;
  const payload = input.payload || {
    providerId: input.provider || null,
    appointmentType: input.appointmentType || null,
    facilityId: input.facility || null,
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    reasonForVisit: input.reasonForVisit || null,
    symptoms: Array.isArray(input.symptoms) ? input.symptoms : [],
    urgency: input.urgency || 'unknown',
  };
  const requiredDocuments = Array.isArray(input.requiredDocuments) ? input.requiredDocuments : [];
  const suppliedDocuments = Array.isArray(input.documents) ? input.documents : [];
  const missingDocumentation = requiredDocuments.filter((document) => !suppliedDocuments.includes(document));
  const queuePosition = input.queuePosition === undefined ? (Array.isArray(input.pendingIntakeIds) ? input.pendingIntakeIds.length + 1 : null) : Number(input.queuePosition);
  const route = String(input.route || input.provider || input.facility || 'unassigned');

  if (!endpoint) {
    const body = 'No healthcare intake endpoint is configured. The intake was staged locally but was not sent to any system.';
    emit(false, 'not-connected', {
      connected: false,
      endpoint: null,
      error: 'Not connected: no healthcare intake endpoint is configured',
      present: presentNotice('Not connected', body),
    });
    return;
  }

  if (payload.urgency === 'emergency') {
    const body = 'Emergency intake cannot be dispatched by this tool. Use the clinician-approved emergency pathway.';
    emit(false, 'safety-escalation', {
      connected: false,
      endpoint: endpoint,
      dryRun: dryRun,
      missingDocumentation: missingDocumentation,
      queuePosition: queuePosition,
      route: route,
      data: { missingDocumentation, queuePosition, route },
      error: 'Emergency intake cannot be dispatched by this tool; use the clinician-approved emergency pathway.',
      present: presentNotice('Safety escalation', body),
    });
    return;
  }

  if (liveRequested && confirmationRequired && !confirmed) {
    const body = 'A live intake dispatch was requested but explicit confirmation was not received. No external request was sent.';
    emit(false, 'confirmation-required', {
      connected: true,
      endpoint: endpoint,
      dryRun: false,
      missingDocumentation: missingDocumentation,
      queuePosition: queuePosition,
      route: route,
      data: { missingDocumentation, queuePosition, route },
      error: 'Explicit confirmation is required for live intake dispatch',
      present: presentNotice('Confirmation required', body),
    });
    return;
  }

  if (dryRun) {
    const payloadLines = [];
    payloadLines.push('Staged intake payload (no external request was sent):');
    payloadLines.push('');
    Object.entries(payload).forEach(function (entry) {
      var key = entry[0], val = entry[1];
      if (Array.isArray(val)) {
        payloadLines.push('  ' + key + ': ' + (val.length ? val.join(', ') : '(empty array)'));
      } else if (val && typeof val === 'object') {
        payloadLines.push('  ' + key + ': ' + JSON.stringify(val));
      } else {
        payloadLines.push('  ' + key + ': ' + (val === null ? 'null' : String(val)));
      }
    });
    payloadLines.push('');
    if (missingDocumentation.length > 0) {
      payloadLines.push('Missing required documentation: ' + missingDocumentation.join(', '));
    } else {
      payloadLines.push('Required documentation: all supplied');
    }
    payloadLines.push('Queue position: ' + (queuePosition === null ? 'not determined' : queuePosition));
    payloadLines.push('Route: ' + route);
    payloadLines.push('');
    payloadLines.push(SAFETY);

    emit(true, 'dry-run', {
      connected: false,
      endpoint: endpoint,
      data: { source: 'local', payload: payload, missingDocumentation, queuePosition, route },
      present: [{ id: 'staged', title: 'Intake staged', kind: 'text', body: payloadLines.join(NL) }],
    });
    return;
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
    const text = await response.text();
    let responseData = null;
    try { responseData = text ? JSON.parse(text) : null; } catch (_) { responseData = { text }; }

    if (!response.ok) {
      const body = 'The intake endpoint returned HTTP ' + response.status + '. The intake was not registered.';
      emit(false, 'error', {
        connected: true,
        endpoint: endpoint,
        data: { source: 'external', payload: payload, missingDocumentation, queuePosition, route, response: { status: response.status, data: responseData }, dryRun: false },
        error: 'Intake endpoint returned HTTP ' + response.status,
        present: presentNotice('Dispatch failed', body),
      });
      return;
    }

    const respLines = [];
    respLines.push('Intake dispatched to ' + endpoint + '.');
    respLines.push('');
    respLines.push('Response status: ' + response.status);
    if (responseData && typeof responseData === 'object') {
      const keys = Object.keys(responseData);
      if (keys.length > 0) {
        respLines.push('Response data:');
        keys.forEach(function (key) {
          respLines.push('  ' + key + ': ' + String(responseData[key]));
        });
      } else {
        respLines.push('Response body: (empty object)');
      }
    } else if (responseData !== null) {
      respLines.push('Response body: ' + String(responseData));
    } else {
      respLines.push('Response body: (empty)');
    }
    respLines.push('');
    if (missingDocumentation.length > 0) {
      respLines.push('Missing required documentation: ' + missingDocumentation.join(', '));
    }
    respLines.push('Route: ' + route);
    respLines.push('');
    respLines.push(SAFETY);

    emit(true, 'live', {
      connected: true,
      endpoint: endpoint,
      data: { source: 'external', payload: payload, missingDocumentation, queuePosition, route, response: { status: response.status, data: responseData }, dryRun: false },
      present: [{ id: 'dispatched', title: 'Intake dispatched', kind: 'text', body: respLines.join(NL) }],
    });
  } catch (error) {
    const body = 'The intake endpoint could not be reached: ' + (error instanceof Error ? error.message : String(error)) + '. No external request was sent.';
    emit(false, 'error', {
      connected: true,
      endpoint: endpoint,
      data: { source: 'external', payload: payload, missingDocumentation, queuePosition, route, dryRun: false },
      error: error instanceof Error ? error.message : String(error),
      present: presentNotice('Dispatch failed', body),
    });
  }
})();`;

const intakeConfig = createSchemaRecord({
  healthcareHome: SchemaProps.text({ description: 'Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME' }),
  endpointUrl: SchemaProps.url({ description: 'Healthcare intake endpoint URL; may also be supplied at runtime through HEALTHCARE_INTAKE_ENDPOINT' }),
  token: SchemaProps.password({ description: 'Bearer token for the intake endpoint' }),
  accessToken: SchemaProps.password({ description: 'Alternate bearer access token for the intake endpoint' }),
  confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before a live intake request', default: true }),
  defaultDryRun: SchemaProps.boolean({ description: 'Default intake execution to dry-run', default: true }),
})

const intake = createCodeSkill({
  id: 'healthcare-appointment-patient-intake-dispatcher',
  name: 'Appointment & Patient Intake Dispatcher',
  description: 'Stage patient intake in dry-run mode by default and dispatch it to a configured healthcare endpoint only after explicit confirmation, with honest disconnected and safety states.',
  tier: 'represent',
  domainKnowledge: 'Patient intake scheduling, appointment management, and healthcare endpoint dispatch coordination',
  confirmBeforeSend: true,
  manifest: { sourceCode: intakeSource, configSchema: intakeConfig, persistenceEnv: 'HEALTHCARE_HOME', healthcareHome: HEALTHCARE_HOME, endpointEnvVar: 'HEALTHCARE_INTAKE_ENDPOINT', confirmBeforeSend: true, ui: { view: 'intake-approval' }, metadata },
  inputSchema: createSchemaRecord({
    endpoint: SchemaProps.url({ description: 'Optional alternate intake endpoint override' }),
    token: SchemaProps.password({ description: 'Optional bearer token override for the intake endpoint' }),
    accessToken: SchemaProps.password({ description: 'Optional alternate access-token override for the intake endpoint' }),
    payload: SchemaProps.object({}, { description: 'Patient intake payload to validate or dispatch' }),
    patient: SchemaProps.text({ description: 'Patient identifier used when payload is omitted' }),
    appointmentType: SchemaProps.text({ description: 'Appointment type used when payload is omitted' }),
    reasonForVisit: SchemaProps.text({ description: 'Reason for visit used when payload is omitted' }),
    requiredDocuments: SchemaProps.stringArray({ description: 'Documents required before the visit' }),
    documents: SchemaProps.stringArray({ description: 'Documents already supplied by the patient' }),
    pendingIntakeIds: SchemaProps.stringArray({ description: 'Pending intake identifiers used to derive queue position' }),
    queuePosition: SchemaProps.integer({ description: 'Optional explicit intake queue position' }),
    route: SchemaProps.text({ description: 'Optional routing destination or queue name' }),
    provider: SchemaProps.text({ description: 'Optional provider identifier for routing' }),
    facility: SchemaProps.text({ description: 'Optional facility identifier for routing' }),
    startTime: SchemaProps.text({ description: 'Optional appointment start time in ISO 8601 format' }),
    endTime: SchemaProps.text({ description: 'Optional appointment end time in ISO 8601 format' }),
    symptoms: SchemaProps.stringArray({ description: 'Symptoms used when payload is omitted' }),
    urgency: SchemaProps.select(['unknown', 'routine', 'urgent', 'emergency'], { description: 'Intake urgency; emergency intake is never auto-dispatched', default: 'unknown' }),
    dryRun: SchemaProps.boolean({ description: 'Validate and stage without dispatch; defaults to true', default: true }),
    confirmation: SchemaProps.boolean({ description: 'Explicit approval for a live intake dispatch', default: false }),
    confirmed: SchemaProps.boolean({ description: 'Alternate explicit approval flag for a live intake dispatch', default: false }),
  }),
  outputSchema: healthcareResultSchema('Intake payload, missing documentation, queue position, route, and response when dispatched'),
  triggers,
})

intake.configSchema = intakeConfig
withUxMetadata(intake.inputSchema as SchemaRecord)
if (intake.configSchema) withUxMetadata(intake.configSchema)

export { intake as APPOINTMENT_PATIENT_INTAKE_DISPATCHER }
