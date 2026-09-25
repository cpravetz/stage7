import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory';

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

const HEALTHCARE_HOME = process.env.HEALTHCARE_HOME || '/tmp/healthcare';
const SAFETY_BOUNDARY = 'Decision support and care coordination only: do not diagnose, prescribe, change treatment, allocate clinical resources autonomously, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician or authorized care team must review all outputs and referrals.';
const metadata = { domain: 'healthcare', persistenceEnv: 'HEALTHCARE_HOME', HEALTHCARE_HOME, homeEnv: 'HEALTHCARE_HOME', healthcareHome: HEALTHCARE_HOME, clinicalSafetyBoundary: SAFETY_BOUNDARY };
const triggers = [
  { kind: 'user' as const, phrase_examples: ['coordinate a care referral', 'match a patient to care resources'] },
];

const referralConfig = createSchemaRecord({
  healthcareHome: SchemaProps.text({ description: 'Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME' }),
  endpointUrl: SchemaProps.url({ description: 'Optional referral coordination endpoint URL; the connected resource coordination tool may supply its own endpoint' }),
  accessToken: SchemaProps.password({ description: 'Bearer access token for an optional referral coordination endpoint' }),
  confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before a live referral or resource mutation', default: true }),
  defaultDryRun: SchemaProps.boolean({ description: 'Default referral coordination to dry-run', default: true }),
  maxResults: SchemaProps.integer({ description: 'Maximum resource candidates to request', minimum: 1, maximum: 50, default: 10 }),
});

const source = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const healthcareHome = process.env.HEALTHCARE_HOME || '/tmp/healthcare';
  const executeTool = typeof __execute_tool === 'function' ? __execute_tool : null;
  const patientId = String(input.patient || '');
  const referralId = String(input.referralId || '');
  const clinicalNeeds = Array.isArray(input.clinicalNeeds) ? input.clinicalNeeds.map((item) => String(item)).filter(Boolean) : [];
  const insurance = input.insurance && typeof input.insurance === 'object' ? input.insurance : {};
  const preferences = input.preferences && typeof input.preferences === 'object' ? input.preferences : {};
  const location = input.location && typeof input.location === 'object' ? input.location : {};
  const specialty = String(input.specialty || '');
  const urgency = String(input.urgency || 'routine');
  const maxResults = Math.max(1, Math.min(50, Number(input.maxResults || 10)));
  const dryRun = input.dryRun === true || input.dryRun === undefined || input.dryRun !== false;
  const liveRequested = input.dryRun === false;
  const confirmed = input.confirmation === true || input.confirmed === true;
  const communicationConfirmed = input.communicationConfirmation === true || input.communicationConfirmed === true;
  const missingInformation = [];
  if (!patientId) missingInformation.push('patientId');
  if (clinicalNeeds.length === 0) missingInformation.push('clinicalNeeds');

  const delegatedResults = {};
  const steps = ['records_scheduling', 'resource_coordination', 'patient_communication'];

  if (missingInformation.length) {
    console.log(JSON.stringify({
      success: false,
      status: 'not-connected',
      connected: false,
      operation: 'refer',
      healthcareHome,
      missingInformation,
      error: 'Not connected: required referral information was not supplied; no resource or referral record was created',
      safetyBoundary: ${JSON.stringify(SAFETY_BOUNDARY)},
    }));
    return;
  }

  if (urgency === 'emergency') {
    console.log(JSON.stringify({
      success: false,
      status: 'safety-escalation',
      connected: false,
      operation: 'refer',
      healthcareHome,
      error: 'Emergency care requires the approved clinical emergency pathway and authorized clinician coordination; this skill does not autonomously allocate or dispatch resources',
      safetyBoundary: ${JSON.stringify(SAFETY_BOUNDARY)},
    }));
    return;
  }

  if (liveRequested && !confirmed) {
    console.log(JSON.stringify({
      success: false,
      status: 'confirmation-required',
      connected: false,
      operation: 'refer',
      healthcareHome,
      error: 'Explicit confirmation is required before a live referral or resource mutation',
      safetyBoundary: ${JSON.stringify(SAFETY_BOUNDARY)},
    }));
    return;
  }

  if (!executeTool) {
    console.log(JSON.stringify({
      success: false,
      status: 'not-connected',
      connected: false,
      operation: 'refer',
      healthcareHome,
      error: 'Not connected: no lower-order healthcare tool is available',
      safetyBoundary: ${JSON.stringify(SAFETY_BOUNDARY)},
    }));
    return;
  }

  try {
    const recordsResult = await executeTool('healthcare-records-scheduling-ops', {
      operation: 'appointment-scheduler',
      patientId,
      referralId: referralId || undefined,
      data: {
        operation: 'refer',
        clinicalNeeds,
        insurance,
        preferences,
        location,
        specialty,
        urgency,
        referralType: 'care-resource',
      },
      dryRun,
    });
    if (!recordsResult || recordsResult.success === false) {
      console.log(JSON.stringify({
        success: false,
        connected: false,
        operation: 'refer',
        healthcareHome,
        delegatedTo: steps,
        stepResults: delegatedResults,
        error: recordsResult && recordsResult.error ? recordsResult.error : 'Not connected: healthcare records scheduling ops did not return a successful result',
        safetyBoundary: ${JSON.stringify(SAFETY_BOUNDARY)},
      }));
      return;
    }
    delegatedResults.records_scheduling = recordsResult;

    const lowerOrderOperation = 'refer';
    const resourceResult = await executeTool('healthcare-resource-coordination', {
      operation: lowerOrderOperation,
      patientId,
      referralId: referralId || undefined,
      clinicalNeeds,
      insurance,
      preferences,
      location,
      specialty,
      urgency,
      maxResults,
      dryRun,
      confirmation: confirmed,
      endpointUrl: input.endpointUrl || undefined,
      accessToken: input.accessToken || undefined,
    });
    if (!resourceResult || resourceResult.success === false) {
      console.log(JSON.stringify({
        success: false,
        connected: false,
        operation: 'refer',
        healthcareHome,
        delegatedTo: steps,
        stepResults: delegatedResults,
        error: resourceResult && resourceResult.error ? resourceResult.error : 'Not connected: healthcare resource coordination tool did not return a successful result',
        safetyBoundary: ${JSON.stringify(SAFETY_BOUNDARY)},
      }));
      return;
    }
    delegatedResults.resource_coordination = resourceResult;

    const resourceData = resourceResult.data && typeof resourceResult.data === 'object' ? resourceResult.data : (resourceResult.response && resourceResult.response.data && typeof resourceResult.response.data === 'object' ? resourceResult.response.data : {});
    const candidates = Array.isArray(resourceData.candidates) ? resourceData.candidates : (Array.isArray(resourceData.matches) ? resourceData.matches : []);
    const referralRecord = resourceData.referral && typeof resourceData.referral === 'object' ? resourceData.referral : null;
    const referralStatus = resourceData.referralStatus || resourceData.status || null;
    const followUpRequired = Boolean(resourceData.followUpRequired);
    const followUpAt = resourceData.followUpAt || null;

    let communicationResult = null;
    if (dryRun || communicationConfirmed || confirmed) {
      communicationResult = await executeTool('healthcare-patient-communication', {
        operation: 'send',
        patientId,
        channel: input.communicationChannel || 'portal',
        templateId: input.communicationTemplateId || 'referral-status-update',
        subject: input.communicationSubject || 'Care Referral Update',
        message: referralRecord ? 'Your care referral has been submitted for coordination. Referral status: ' + (referralStatus || 'pending') + '.' : 'Care referral coordination update available.',
        variables: { patientId, referralId: referralId || undefined, referralStatus: referralStatus || 'pending', operation: 'refer' },
        scheduledAt: followUpRequired && followUpAt ? followUpAt : undefined,
        priority: urgency === 'urgent' ? 'urgent' : 'routine',
        dryRun,
      });
      delegatedResults.patient_communication = communicationResult;
    }

    const allConnected = (!recordsResult || recordsResult.success !== false) && (!resourceResult || resourceResult.success !== false) && (!communicationResult || communicationResult.success !== false);
    console.log(JSON.stringify({
      success: true,
      connected: allConnected,
      operation: 'refer',
      data: {
        referral: referralRecord,
        candidates,
        referralStatus,
        followUpRequired,
        followUpAt,
        resourceCount: candidates.length,
        communication: communicationResult && communicationResult.success ? (communicationResult.data || { channel: input.communicationChannel || 'portal', sent: true }) : null,
      },
      delegatedTo: steps,
      stepResults: delegatedResults,
      healthcareHome,
      safetyBoundary: ${JSON.stringify(SAFETY_BOUNDARY)},
    }));
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      status: 'error',
      connected: false,
      operation: 'refer',
      healthcareHome,
      delegatedTo: steps,
      error: error instanceof Error ? error.message : String(error),
      safetyBoundary: ${JSON.stringify(SAFETY_BOUNDARY)},
    }));
  }
})()`;

const careResourceReferralCoordinator = createCodeSkill({
  id: 'care-resource-referral-coordinator',
  name: 'Care Resource & Referral Coordinator',
  description: 'Coordinate patient care-resource matching, referral creation, and referral status follow-up by delegating to healthcare records scheduling, resource coordination, and patient communication tools with dry-run and explicit-confirmation gates.',
  tier: 'represent',
  domainKnowledge: 'Care resource matching, referral coordination, and resource utilization optimization',
  manifest: {
    sourceCode: source,
    configSchema: referralConfig,
    persistenceEnv: 'HEALTHCARE_HOME',
    healthcareHome: HEALTHCARE_HOME,
    lowerOrderTools: ['healthcare-records-scheduling-ops', 'healthcare-resource-coordination', 'healthcare-patient-communication'],
    confirmBeforeSend: true,
    ui: { view: 'care-resource-referral-coordination' },
    metadata,
  },
  inputSchema: createSchemaRecord({
    patient: SchemaProps.text({ description: 'Minimum-necessary patient identifier' }),
    referralId: SchemaProps.text({ description: 'Referral identifier for track or status operations' }),
    clinicalNeeds: SchemaProps.stringArray({ description: 'Clinician-supplied care needs used for resource matching' }),
    insurance: SchemaProps.object({}, { description: 'Minimum-necessary insurance or network information', additionalProperties: true }),
    preferences: SchemaProps.object({}, { description: 'Patient care-resource preferences', additionalProperties: true }),
    location: SchemaProps.object({}, { description: 'Patient location or service area', additionalProperties: true }),
    specialty: SchemaProps.text({ description: 'Requested clinical specialty or program' }),
    urgency: SchemaProps.select(['routine', 'urgent', 'emergency'], { description: 'Referral urgency; emergency requests require the approved clinical pathway', default: 'routine' }),
    maxResults: SchemaProps.integer({ description: 'Maximum resource candidates to request', minimum: 1, maximum: 50, default: 10 }),
    dryRun: SchemaProps.boolean({ description: 'Validate and stage without creating or mutating a referral; defaults to true', default: true }),
    confirmation: SchemaProps.boolean({ description: 'Explicit approval for a live referral or resource mutation', default: false }),
    confirmed: SchemaProps.boolean({ description: 'Alternate explicit approval flag for a live referral or resource mutation', default: false }),
    communicationChannel: SchemaProps.select(['email', 'sms', 'portal', 'voice'], { description: 'Patient communication channel for referral notifications', default: 'portal' }),
    communicationTemplateId: SchemaProps.text({ description: 'Message template identifier for patient referral notifications' }),
    communicationSubject: SchemaProps.text({ description: 'Subject line for patient referral communication' }),
    communicationConfirmation: SchemaProps.boolean({ description: 'Explicit approval for sending patient communication about the referral', default: false }),
    communicationConfirmed: SchemaProps.boolean({ description: 'Alternate explicit approval flag for patient communication', default: false }),
    accessToken: SchemaProps.password({ description: 'Optional bearer token for an endpoint override' }),
    context: SchemaProps.object({}, { description: 'Additional coordination context that does not replace required clinical inputs', additionalProperties: true }),
  }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether referral coordination completed' }),
    connected: SchemaProps.boolean({ description: 'Whether all connected lower-order tools returned successfully' }),
    data: SchemaProps.object({
      referral: SchemaProps.object({}, { description: 'Referral record returned by the connected coordination tool', additionalProperties: true }),
      candidates: SchemaProps.objectArray(SchemaProps.object({}, { description: 'Candidate care resource', additionalProperties: true }), { description: 'Resource candidates returned by the connected coordination tool' }),
      referralStatus: SchemaProps.text({ description: 'Referral status returned by the connected coordination tool' }),
      followUpRequired: SchemaProps.boolean({ description: 'Whether follow-up is required' }),
      followUpAt: SchemaProps.text({ description: 'Suggested follow-up time when supplied by the connected tool' }),
      resourceCount: SchemaProps.integer({ description: 'Number of candidate resources returned' }),
      communication: SchemaProps.object({}, { description: 'Patient communication result when available', additionalProperties: true }),
    }, { description: 'Referral coordination result' }),
    delegatedTo: SchemaProps.objectArray(SchemaProps.text({ description: 'Connected lower-order tool identifier' }), { description: 'Lower-order tools delegated to during coordination' }),
    stepResults: SchemaProps.object({}, { description: 'Individual step results from each lower-order tool', additionalProperties: true }),
    healthcareHome: SchemaProps.text({ description: 'Healthcare workspace used for the operation' }),
    safetyBoundary: SchemaProps.text({ description: 'Clinical and governance safety boundary' }),
    missingInformation: SchemaProps.stringArray({ description: 'Required information missing before coordination' }),
    error: SchemaProps.text({ description: 'Failure, connectivity, or governance message' }),
  }, { required: ['success', 'connected'] }),
  triggers,
  confirmBeforeSend: true,
});

careResourceReferralCoordinator.configSchema = referralConfig;
withUxMetadata(careResourceReferralCoordinator.inputSchema as SchemaRecord);
withUxMetadata(careResourceReferralCoordinator.outputSchema as SchemaRecord);
if (careResourceReferralCoordinator.configSchema) withUxMetadata(careResourceReferralCoordinator.configSchema);

export { careResourceReferralCoordinator };
