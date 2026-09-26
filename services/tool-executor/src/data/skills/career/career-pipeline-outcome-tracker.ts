import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const PIPELINE_OUTCOME_TRACKER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const pipeline = await __execute_tool('career-pipeline-report', {});
if (!pipeline || pipeline.success === false) {
  console.log(JSON.stringify({ success: false, error: pipeline && pipeline.error ? pipeline.error : 'Pipeline reporting is not available' }));
  return;
}
const pipelineData = pipeline.data && typeof pipeline.data === 'object' ? pipeline.data : {};
const tracking = Array.isArray(pipelineData.tracking) ? pipelineData.tracking : [];
// Recording an outcome always requires knowing which role it belongs to: match by
// targetRole against the job identifier.
let matchedEntry = null;
if (input.targetRole) {
  matchedEntry = tracking.find((entry) => (entry.jobId || entry.id || entry.identifier) === input.targetRole) || null;
}
if (!input.targetRole) {
  console.log(JSON.stringify({ success: true, data: { pipeline: pipelineData, outcomes: {}, role: null, note: 'No targetRole provided; nothing to track', staleFollowUps: pipelineData.staleFollowUps || [], delegatedTo: ['career-pipeline-report'], generatedAt: new Date().toISOString() } }));
  return;
}
if (input.targetRole && !matchedEntry) {
  console.log(JSON.stringify({ success: true, data: { pipeline: pipelineData, outcomes: {}, role: { jobId: null, jobTitle: null, company: null }, note: 'No pipeline entry matched the given targetRole', staleFollowUps: pipelineData.staleFollowUps || [], delegatedTo: ['career-pipeline-report'], generatedAt: new Date().toISOString() } }));
  return;
}
const outcome = await __execute_tool('career-outcome', {
   applicationId: matchedEntry.jobId || matchedEntry.id || matchedEntry.identifier || input.targetRole || '',
   jobTitle: matchedEntry.title || matchedEntry.jobTitle || (matchedEntry.job && matchedEntry.job.title) || '',
   company: matchedEntry.company || (matchedEntry.job && matchedEntry.job.company) || input.company || '',
   status: input.status || '',
   feedback: input.feedback || '',
   offerDetails: input.offerDetails || null,
  });
if (!outcome || outcome.success === false) {
  console.log(JSON.stringify({ success: false, error: outcome && outcome.error ? outcome.error : 'Outcome tracking failed' }));
  return;
}
const outcomeData = outcome.data && typeof outcome.data === 'object' ? outcome.data : {};
const hasPipelineData = Boolean(pipelineData) && (Number.isFinite(pipelineData.total) || tracking.length || Object.keys(pipelineData.byStatus || {}).length > 0);
const hasOutcomeData = Number.isFinite(outcomeData.totalOutcomes) || outcomeData.outcome || Array.isArray(outcomeData.outcomes);
if (!hasPipelineData && !hasOutcomeData) {
console.log(JSON.stringify({ success: false, status: 'not-connected', error: 'Not connected: pipeline reporting and outcome tracking yielded no data' }));
return;
}
console.log(JSON.stringify({ success: true, data: { pipeline: pipelineData, outcomes: outcomeData, role: { jobId: matchedEntry.jobId || matchedEntry.id || matchedEntry.identifier, jobTitle: matchedEntry.title || matchedEntry.jobTitle || (matchedEntry.job && matchedEntry.job.title) || '', company: matchedEntry.company || (matchedEntry.job && matchedEntry.job.company) || '' }, staleFollowUps: pipelineData.staleFollowUps || [], delegatedTo: ['career-pipeline-report', 'career-outcome'], generatedAt: new Date().toISOString() } }));
})();`;

const PIPELINE_OUTCOME_TRACKER_INPUT = {
type: 'object',
properties: {
targetRole: { type: 'string', description: 'Job identifier (jobId) to record an outcome for, from Job Discovery or Apply to Jobs' },
company: { type: 'string', description: 'Company name, for reference' },
status: { type: 'string', description: 'Application outcome status' },
feedback: { type: 'string', description: 'Interview or application feedback', multiline: true },
offerDetails: { type: 'object', description: 'Offer details if applicable' },
},
};

const PIPELINE_OUTCOME_TRACKER_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
status: { type: 'string', description: 'Execution status' },
data: {
type: 'object',
properties: {
pipeline: { type: 'object' },
outcomes: { type: 'object' },
role: { type: 'object', properties: { jobId: { type: 'string' }, jobTitle: { type: 'string' }, company: { type: 'string' } } },
staleFollowUps: { type: 'array' },
delegatedTo: { type: 'array', items: { type: 'string' } },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string' },
},
required: ['success', 'data'],
};

const PIPELINE_OUTCOME_TRACKER = createCodeSkill({
id: 'career-pipeline-outcome-tracker',
name: 'Pipeline & Outcome Tracker',
description: 'Tracks application statuses, records outcomes and feedback, and combines pipeline reporting with outcome history. Delegates to career-pipeline-report and career-outcome, with honest not-connected fallbacks for either dependency.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: PIPELINE_OUTCOME_TRACKER_SOURCE,
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
lowerOrderTools: ['career-pipeline-report', 'career-outcome'],
 actionLabel: 'Show pipeline & record outcome',
},
inputSchema: PIPELINE_OUTCOME_TRACKER_INPUT,
outputSchema: PIPELINE_OUTCOME_TRACKER_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['How is my pipeline', 'What needs follow-up', 'Track my outcomes'] },
],
isSkill: true,
});
PIPELINE_OUTCOME_TRACKER.configSchema = PIPELINE_OUTCOME_TRACKER.manifest.configSchema as SchemaRecord;

export { PIPELINE_OUTCOME_TRACKER };
