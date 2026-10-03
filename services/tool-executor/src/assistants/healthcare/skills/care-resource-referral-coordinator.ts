// @ts-nocheck -- generated handler body is untyped (implicit any) by design
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { healthcareResultSchema } from '../healthcare-contract';

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

const SAFETY_BOUNDARY = 'Decision support and care coordination only: do not diagnose, prescribe, change treatment, allocate clinical resources autonomously, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician or authorized care team must review all outputs and referrals.';
const metadata = { domain: 'healthcare', persistenceEnv: 'HEALTHCARE_HOME', HEALTHCARE_HOME: 'HEALTHCARE_HOME', homeEnv: 'HEALTHCARE_HOME', healthcareHome: 'HEALTHCARE_HOME', clinicalSafetyBoundary: SAFETY_BOUNDARY };
const triggers = [
  { kind: 'user' as const, phrase_examples: ['coordinate a care referral', 'match a patient to care resources'] },
];

const referralConfig = createSchemaRecord({
  healthcareHome: SchemaProps.text({ description: 'Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME' }),
  endpointUrl: SchemaProps.url({ description: 'Optional referral coordination endpoint URL; the connected resource coordination tool may supply its own endpoint' }),
  confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before a live referral or resource mutation', default: true }),
  defaultDryRun: SchemaProps.boolean({ description: 'Default referral coordination to dry-run', default: true }),
  maxResults: SchemaProps.integer({ description: 'Maximum resource candidates to request', minimum: 1, maximum: 50, default: 10 }),
});

const careResourceReferralCoordinator = createDeclarativeCodeSkill({
  id: 'care-resource-referral-coordinator',
  name: 'Care Resource & Referral Coordinator',
  description: 'Coordinate patient care-resource matching, referral creation, and referral status follow-up by delegating to healthcare records scheduling, resource coordination, and patient communication tools with dry-run and explicit-confirmation gates, reporting delegation coverage honestly.',
  persistenceEnvVar: 'HEALTHCARE_HOME',
  tier: 'represent',
  domainKnowledge: 'Care resource matching, referral coordination, and resource utilization optimization',
  inputSchema: createSchemaRecord({
    patient: SchemaProps.text({ description: 'Minimum-necessary patient identifier' }),
    referralId: SchemaProps.reference('healthcare-referrals', { description: 'Referral for track or status operations' }),
    clinicalNeeds: SchemaProps.stringArray({ description: 'Clinician-supplied care needs used for resource matching' }),
    insurance: SchemaProps.object({}, { description: 'Minimum-necessary insurance or network information', additionalProperties: true }),
    preferences: SchemaProps.object({}, { description: 'Patient care-resource preferences', additionalProperties: true }),
    location: SchemaProps.object({}, { description: 'Patient location or service area', additionalProperties: true }),
    specialty: SchemaProps.text({ description: 'Requested clinical specialty or program' }),
    urgency: SchemaProps.select(['routine', 'urgent', 'emergency'], { description: 'Referral urgency; emergency requests require the approved clinical emergency pathway', default: 'routine' }),
    maxResults: SchemaProps.integer({ description: 'Maximum resource candidates to request', minimum: 1, maximum: 50, default: 10 }),
    dryRun: SchemaProps.boolean({ description: 'Validate and stage without creating or mutating a referral; defaults to true', default: true }),
    confirmation: SchemaProps.boolean({ description: 'Explicit approval for a live referral or resource mutation', default: false }),
    confirmed: SchemaProps.boolean({ description: 'Alternate explicit approval flag for a live referral or resource mutation', default: false }),
    communicationChannel: SchemaProps.select(['email', 'sms', 'portal', 'voice'], { description: 'Patient communication channel for referral notifications', default: 'portal' }),
    communicationTemplateId: SchemaProps.reference('healthcare-message-templates', { description: 'Message template for patient referral notifications' }),
    communicationSubject: SchemaProps.text({ description: 'Subject line for patient referral communication' }),
    communicationConfirmation: SchemaProps.boolean({ description: 'Explicit approval for sending patient communication about the referral', default: false }),
    communicationConfirmed: SchemaProps.boolean({ description: 'Alternate explicit approval flag for patient communication', default: false }),
    context: SchemaProps.object({}, { description: 'Additional coordination context that does not replace required clinical inputs', additionalProperties: true }),
  }),
  outputSchema: healthcareResultSchema('Referral record, candidate resources, communication status, step results, and coverage'),
  triggers,
  confirmBeforeSend: true,
  manifest: {
    configSchema: referralConfig,
    healthcareHome: 'HEALTHCARE_HOME',
    lowerOrderTools: ['healthcare-records-scheduling-ops', 'healthcare-resource-coordination', 'healthcare-patient-communication'],
    confirmBeforeSend: true,
    ui: { view: 'care-resource-referral-coordination' },
    metadata: metadata
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const SAFETY = 'Decision support and care coordination only: do not diagnose, prescribe, change treatment, allocate clinical resources autonomously, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician or authorized care team must review all outputs and referrals.';

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
      const lowerOrderOperation = 'care-resource-referral';
      const missingInformation = [];
      if (!patientId) missingInformation.push('patient (patient identifier)');
      if (clinicalNeeds.length === 0) missingInformation.push('clinicalNeeds (at least one clinical need)');

      const stepStatus = { records_scheduling: 'not-attempted', resource_coordination: 'not-attempted', patient_communication: 'not-attempted' };
      const stepErrors = {};
      const stepsAttempted = [];
      const stepsSucceeded = [];
      const stepsFailed = [];
      const stepsUnavailable = [];

      function notConnected(title, body) {
        return { success: false, status: 'not-connected', connected: false, operation: 'refer', data: null, present: [{ id: 'not-connected', title: title, kind: 'text', body: body }], safetyBoundary: SAFETY };
      }

      function blocked(title, body, status) {
        return { success: false, status: status, connected: false, operation: 'refer', data: null, present: [{ id: 'blocked', title: title, kind: 'text', body: body }], safetyBoundary: SAFETY };
      }

      function done(success, status, bodyLines, extra) {
        const body = bodyLines.join(NL);
        const payload = {
          success: success,
          status: status,
          connected: success,
          operation: 'refer',
          data: Object.assign({ stepsAttempted: stepsAttempted, stepsSucceeded: stepsSucceeded, stepsFailed: stepsFailed, stepsUnavailable: stepsUnavailable, stepStatus: stepStatus, coverage: { attempted: stepsAttempted.length, succeeded: stepsSucceeded.length, failed: stepsFailed.length, unavailable: stepsUnavailable.length } }, extra && extra.data ? extra.data : (extra || {})),
          present: [{ id: 'report', title: 'Care referral coordination', kind: 'text', body: body }],
          safetyBoundary: SAFETY,
        };
        if (extra && extra.error) {
          payload.error = extra.error;
        }

        return payload;
      }

      if (missingInformation.length) {
        const lines = [];
        lines.push('Care referral coordination could not start: required information is missing.');
        lines.push('');
        lines.push('Missing: ' + missingInformation.join(', ') + '.');
        lines.push('Provide the patient identifier and at least one clinical need.');
        return notConnected('Input required', lines.join(NL));
      }

      if (urgency === 'emergency') {
        const lines = [];
        lines.push('Emergency care requires the approved clinical emergency pathway and authorized clinician coordination.');
        lines.push('This tool does not autonomously allocate or dispatch resources.');
        return blocked('Safety escalation', lines.join(NL), 'safety-escalation');
      }

      if (liveRequested && !confirmed) {
        const lines = [];
        lines.push('A live referral was requested but explicit confirmation was not received.');
        lines.push('No referral or resource mutation was performed.');
        return blocked('Confirmation required', lines.join(NL), 'confirmation-required');
      }

      if (!ctx.delegate) {
        const lines = [];
        lines.push('No lower-order healthcare tooling is available in this environment.');
        lines.push('The following connected tools were expected: healthcare-records-scheduling-ops, healthcare-resource-coordination, healthcare-patient-communication.');
        lines.push('No referral or resource record was created.');
        return notConnected('Not connected: no lower-order tool available', lines.join(NL));
      }

      try {
        // Step 1: records scheduling
        stepsAttempted.push('records_scheduling');
        const recordsResult = await ctx.delegate('healthcare-records-scheduling-ops', {
          operation: 'appointment-scheduler',
          patient: patientId,
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
          const err = (recordsResult && (recordsResult.error || recordsResult.message)) || 'healthcare records scheduling ops did not return a successful result';
          stepStatus.records_scheduling = 'failed';
          stepErrors.records_scheduling = err;
         stepsFailed.push('records_scheduling');
           const lines = [];
           lines.push('Referral coordination: did not complete.');
          lines.push('');
          lines.push('Step results:');
          lines.push('  - records_scheduling: FAILED (' + err + ')');
          lines.push('  - resource_coordination: not attempted');
          lines.push('  - patient_communication: not attempted');
          lines.push('');
          lines.push('No referral or resource record was created.');
          return done(false, 'failed', lines, { error: err, delegatedTo: ['records_scheduling', 'resource_coordination', 'patient_communication'], stepResults: { records_scheduling: recordsResult } });
          return;
        }
        stepStatus.records_scheduling = 'succeeded';
        stepsSucceeded.push('records_scheduling');

        // Step 2: resource coordination
        stepsAttempted.push('resource_coordination');
        const resourceResult = await ctx.delegate('healthcare-resource-coordination', {
          operation: lowerOrderOperation,
          patient: patientId,
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
          accessToken: (ctx.getCredential ? ctx.getCredential('accessToken') : undefined) || undefined,
        });
        if (!resourceResult || resourceResult.success === false) {
          const err = (resourceResult && (resourceResult.error || resourceResult.message)) || 'healthcare resource coordination tool did not return a successful result';
          stepStatus.resource_coordination = 'failed';
           stepErrors.resource_coordination = err;
           stepsFailed.push('resource_coordination');
           const lines = [];
           lines.push('Referral coordination: did not complete.');
          lines.push('');
          lines.push('Step results:');
          lines.push('  - records_scheduling: succeeded');
          lines.push('  - resource_coordination: FAILED (' + err + ')');
          lines.push('  - patient_communication: not attempted');
          lines.push('');
          lines.push('No referral or resource record was created.');
          return done(false, 'failed', lines, { error: err, delegatedTo: ['records_scheduling', 'resource_coordination', 'patient_communication'], stepResults: { records_scheduling: recordsResult, resource_coordination: resourceResult } });
          return;
        }
        stepStatus.resource_coordination = 'succeeded';
        stepsSucceeded.push('resource_coordination');

        const resourceData = resourceResult.data && typeof resourceResult.data === 'object' ? resourceResult.data : (resourceResult.response && resourceResult.response.data && typeof resourceResult.response.data === 'object' ? resourceResult.response.data : {});
        const candidates = Array.isArray(resourceData.candidates) ? resourceData.candidates : (Array.isArray(resourceData.matches) ? resourceData.matches : []);
        const referralRecord = resourceData.referral && typeof resourceData.referral === 'object' ? resourceData.referral : null;
        const referralStatus = resourceData.referralStatus || resourceData.status || null;
        const followUpRequired = Boolean(resourceData.followUpRequired);
        const followUpAt = resourceData.followUpAt || null;

        // Step 3: patient communication (staged/safe to attempt when dryRun or confirmed)
        let communicationResult = null;
        if (dryRun || communicationConfirmed || confirmed) {
          stepsAttempted.push('patient_communication');
          communicationResult = await ctx.delegate('healthcare-patient-communication', {
            operation: 'send',
            patient: patientId,
            channel: input.communicationChannel || 'portal',
            templateId: input.communicationTemplateId || 'referral-status-update',
            subject: input.communicationSubject || 'Care Referral Update',
            message: referralRecord ? 'Your care referral has been submitted for coordination. Referral status: ' + (referralStatus || 'pending') + '.' : 'Care referral coordination update available.',
            variables: { patientId, referralId: referralId || undefined, referralStatus: referralStatus || 'pending', operation: 'refer' },
            scheduledAt: followUpRequired && followUpAt ? followUpAt : undefined,
            priority: urgency === 'urgent' ? 'urgent' : 'routine',
            dryRun,
          });
          if (communicationResult && communicationResult.success) {
            stepStatus.patient_communication = 'succeeded';
            stepsSucceeded.push('patient_communication');
          } else {
            stepStatus.patient_communication = 'failed';
            const commErr = (communicationResult && (communicationResult.error || communicationResult.message)) || 'patient communication returned no successful result';
            stepErrors.patient_communication = commErr;
            stepsFailed.push('patient_communication');
          }
        } else {
          stepStatus.patient_communication = 'not-attempted';
          stepsUnavailable.push('patient_communication');
        }

        const allConnected = stepsFailed.length === 0;
        const partial = stepsFailed.length > 0 && stepsSucceeded.length > 0;

        const lines = [];
        if (allConnected) {
          lines.push('Referral coordination: completed successfully.');
        } else if (partial) {
          lines.push('Referral coordination: completed partially.');
        } else {
          lines.push('Referral coordination: did not complete.');
        }
        lines.push('');
        lines.push('Step results:');
        lines.push('  - records_scheduling: ' + stepStatus.records_scheduling);
        lines.push('  - resource_coordination: ' + stepStatus.resource_coordination);
        lines.push('  - patient_communication: ' + stepStatus.patient_communication);
        lines.push('');
        if (referralRecord) {
          lines.push('Referral record: present');
          if (referralStatus) lines.push('  Status: ' + referralStatus);
          if (followUpRequired) lines.push('  Follow-up required at: ' + (followUpAt || 'pending'));
        } else {
          lines.push('Referral record: not returned');
        }
        if (candidates.length > 0) {
          lines.push('Candidate resources (' + candidates.length + '):');
          candidates.slice(0, maxResults).forEach(function (c, i) {
            const name = (c && (c.name || c.id || c.resourceName)) || ('candidate ' + (i + 1));
            lines.push('  ' + (i + 1) + '. ' + name);
          });
        } else {
          lines.push('Candidate resources: none returned');
        }
        if (stepsFailed.length > 0) {
          lines.push('');
          lines.push('Failed steps and reasons:');
          stepsFailed.forEach(function (step) {
            lines.push('  - ' + step + ': ' + (stepErrors[step] || 'unknown error'));
          });
        }
        lines.push('');
        lines.push(SAFETY);

        const data = {
          referral: referralRecord,
          candidates,
          referralStatus,
          followUpRequired,
          followUpAt,
          resourceCount: candidates.length,
          communication: communicationResult && communicationResult.success
            ? ((communicationResult.response && communicationResult.response.data)
              || communicationResult.data
              || { channel: input.communicationChannel || 'portal', sent: true })
            : null,
          delegatedTo: ['records_scheduling', 'resource_coordination', 'patient_communication'],
          stepResults: { records_scheduling: recordsResult, resource_coordination: resourceResult, patient_communication: communicationResult },
        };
        return done(allConnected, allConnected ? 'ok' : (partial ? 'partial' : 'failed'), lines, data);
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        const lines = [];
        lines.push('Referral coordination: encountered an error.');
        lines.push('');
        lines.push('Error: ' + err);
        lines.push('');
        lines.push('Steps attempted: ' + (stepsAttempted.length ? stepsAttempted.join(', ') : 'none'));
        lines.push('Steps succeeded: ' + (stepsSucceeded.length ? stepsSucceeded.join(', ') : 'none'));
        lines.push('Steps failed: ' + (stepsFailed.length ? stepsFailed.join(', ') : 'none'));
        return done(false, 'error', lines, { error: err, delegatedTo: ['records_scheduling', 'resource_coordination', 'patient_communication'], stepResults: { error: err } });
      }
    },
  });
careResourceReferralCoordinator.configSchema = referralConfig;
withUxMetadata(careResourceReferralCoordinator.inputSchema as SchemaRecord);
if (careResourceReferralCoordinator.configSchema) withUxMetadata(careResourceReferralCoordinator.configSchema);

export { careResourceReferralCoordinator };
