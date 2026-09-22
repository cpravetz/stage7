import { Tool, SchemaRecord } from '../../../types'
import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory'

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

const intakeSource = `(async () => {   const input = typeof __tool_input !== 'undefined' ? __tool_input : {};   const healthcareHome = process.env.HEALTHCARE_HOME || '/tmp/healthcare';   const endpoint = String(input.endpointUrl || input.endpoint || process.env.HEALTHCARE_INTAKE_ENDPOINT || '');   const token = String(input.token || input.accessToken || process.env.HEALTHCARE_INTAKE_TOKEN || process.env.HEALTHCARE_INTAKE_ACCESS_TOKEN || '');   const dryRun = input.dryRun === true || input.dryRun === undefined || input.dryRun !== false;   const liveRequested = input.dryRun === false;   const confirmationRequired = true;   const confirmed = input.confirmation === true || input.confirmed === true;   const payload = input.payload || {     providerId: input.provider || null,
     appointmentType: input.appointmentType || null,
     facilityId: input.facility || null,     startTime: input.startTime || null,     endTime: input.endTime || null,     reasonForVisit: input.reasonForVisit || null,     symptoms: Array.isArray(input.symptoms) ? input.symptoms : [],     urgency: input.urgency || 'unknown',   };   const requiredDocuments = Array.isArray(input.requiredDocuments) ? input.requiredDocuments : [];   const suppliedDocuments = Array.isArray(input.documents) ? input.documents : [];   const missingDocumentation = requiredDocuments.filter((document) => !suppliedDocuments.includes(document));   const queuePosition = input.queuePosition === undefined ? (Array.isArray(input.pendingIntakeIds) ? input.pendingIntakeIds.length + 1 : null) : Number(input.queuePosition);   const route = String(input.route || input.provider || input.facility || 'unassigned');   if (!endpoint) {     console.log(JSON.stringify({ success: false, mode: 'not-connected', connected: false, endpoint: null, healthcareHome, error: 'Not connected: no healthcare intake endpoint is configured' }));     return;   }   if (payload.urgency === 'emergency') {     console.log(JSON.stringify({ success: false, mode: 'safety-escalation', connected: false, endpoint, dryRun, missingDocumentation, queuePosition, route, error: 'Emergency intake cannot be dispatched by this tool; use the clinician-approved emergency pathway.' }));     return;   }   if (liveRequested && confirmationRequired && !confirmed) {     console.log(JSON.stringify({ success: false, mode: 'confirmation-required', connected: true, endpoint, dryRun: false, missingDocumentation, queuePosition, route, error: 'Explicit confirmation is required for live intake dispatch' }));     return;   }   if (dryRun) {     console.log(JSON.stringify({ success: true, mode: 'dry-run', connected: false, endpoint, source: 'local', payload, missingDocumentation, queuePosition, route, message: 'Intake staged for review; no external request was sent.' }));     return;   }   try {     const headers = { 'Content-Type': 'application/json' };     if (token) headers.Authorization = 'Bearer ' + token;     const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });     const text = await response.text();     let responseData = null;     try { responseData = text ? JSON.parse(text) : null; } catch (_) { responseData = { text }; }     console.log(JSON.stringify({ success: response.ok, mode: 'live', connected: true, endpoint, source: 'external', payload, missingDocumentation, queuePosition, route, response: { status: response.status, data: responseData } }));   } catch (error) {     console.log(JSON.stringify({ success: false, mode: 'error', connected: true, endpoint, error: error instanceof Error ? error.message : String(error) }));   } })();`
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
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether staging or dispatch completed' }),
    mode: SchemaProps.select(['dry-run', 'live', 'not-connected', 'confirmation-required', 'safety-escalation', 'error'], { description: 'Execution or governance mode' }),
    connected: SchemaProps.boolean({ description: 'Whether a configured endpoint was used' }),
    endpoint: SchemaProps.text({ description: 'Endpoint used or attempted' }),
    payload: SchemaProps.object({}, { description: 'Staged or dispatched intake payload' }),
    missingDocumentation: SchemaProps.stringArray({ description: 'Required documents not supplied' }),
    queuePosition: SchemaProps.integer({ description: 'Derived or supplied intake queue position' }),
    route: SchemaProps.text({ description: 'Derived routing destination' }),
    response: SchemaProps.object({}, { description: 'Remote response when available' }),
    error: SchemaProps.text({ description: 'Failure, safety, or governance message' }),
  }, { required: ['success', 'mode', 'connected'] }),
  triggers,
})
intake.configSchema = intakeConfig
withUxMetadata(intake.inputSchema as SchemaRecord)
withUxMetadata(intake.outputSchema as SchemaRecord)
if (intake.configSchema) withUxMetadata(intake.configSchema)

export const APPOINTMENT_PATIENT_INTAKE_DISPATCHER = intake
