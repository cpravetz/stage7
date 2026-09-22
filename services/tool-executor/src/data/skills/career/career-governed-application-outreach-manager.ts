import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const GOVERNED_APPLICATION_OUTREACH_MANAGER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
let targetRoles = Array.isArray(input.targetRoles) ? input.targetRoles : [];
if (!targetRoles.length) {
  const pipeline = await __execute_tool('career_pipeline_report', {});
  if (pipeline && pipeline.success && pipeline.data) {
    const pipelineData = pipeline.data;
    if (Array.isArray(pipelineData.tracking)) {
      targetRoles = pipelineData.tracking.map((entry) => entry.jobId || entry.id).filter(Boolean);
    }
  }
}
  // Prepare application materials
  const prepare = await __execute_tool('career_profile_intake', {});
  if (!prepare || !prepare.success) {
    console.log(JSON.stringify({ success: false, mode: 'not-connected', error: prepare && prepare.error ? prepare.error : 'Not connected: profile intake required' }));
    return;
  }
  // Draft outreach / resume customizations
  const outreachDraft = await __execute_tool('career_networking_outreach', { targetCompany: input.targetCompany, targetPerson: input.targetPerson, relationshipStage: input.relationshipStage, channel: input.channel });
  const applyRes = await __execute_tool('career_apply_execute', { targetRoles, dryRun: input.dryRun !== false });

if ((!outreachDraft || !outreachDraft.success) && (!applyRes || !applyRes.success)) {
  console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: neither outreach drafting nor application execution is available' }));
  return;
}

const result = { outreach: outreachDraft && outreachDraft.data ? outreachDraft.data : null, applications: applyRes && applyRes.data ? applyRes.data : null, delegatedTo: ['career_networking_outreach', 'career_apply_execute'], generatedAt: new Date().toISOString() };

console.log(JSON.stringify({ success: true, data: result }));
})();`;

const GOVERNED_APPLICATION_OUTREACH_MANAGER_INPUT = {
  type: 'object',
  properties: {
    targetCompany: { type: 'string' },
    targetPerson: { type: 'string' },
    relationshipStage: { type: 'string' },
    channel: { type: 'string' },
    dryRun: { type: 'boolean' },
  },
  required: [],
};

const GOVERNED_APPLICATION_OUTREACH_MANAGER_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
  },
  required: ['success', 'data'],
};

const GOVERNED_APPLICATION_OUTREACH_MANAGER = createCodeSkill({
  id: 'career-governed-application-outreach-manager',
  name: 'Application & Outreach Manager',
  description: 'Customizes resumes and cover letters, drafts outreach messages, and stages submissions for your review before anything is sent, with a full audit log. Delegates to career_networking_outreach and career_apply_execute.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: GOVERNED_APPLICATION_OUTREACH_MANAGER_SOURCE,
    lowerOrderTools: ['career_networking_outreach', 'career_apply_execute'],
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    actionLabel: 'Prepare outreach & applications',
  },
  inputSchema: GOVERNED_APPLICATION_OUTREACH_MANAGER_INPUT,
  outputSchema: GOVERNED_APPLICATION_OUTREACH_MANAGER_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Prepare my outreach', 'Draft application packets', 'Stage outreach for review'] },
  ],
});

export { GOVERNED_APPLICATION_OUTREACH_MANAGER };
