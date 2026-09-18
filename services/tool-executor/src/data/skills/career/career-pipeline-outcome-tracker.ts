import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const PIPELINE_OUTCOME_TRACKER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const pipeline = await __execute_tool('career_pipeline_report', {});
if (!pipeline || pipeline.success === false || pipeline.error) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: pipeline && pipeline.error ? pipeline.error : 'Not connected: pipeline reporting returned no data; track applications first' }));
return;
}
const pipelineData = pipeline.data && typeof pipeline.data === 'object' ? pipeline.data : {};
const outcome = await __execute_tool('career_outcome', {
  jobId: input.jobId || '',
  status: input.status || '',
  feedback: input.feedback || '',
  offerDetails: input.offerDetails || null,
});
if (!outcome || outcome.success === false || outcome.error) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: outcome && outcome.error ? outcome.error : 'Not connected: outcome tracking returned no data' }));
return;
}
const outcomeData = outcome.data && typeof outcome.data === 'object' ? outcome.data : {};
const hasPipelineData = Boolean(pipelineData) && (Number.isFinite(pipelineData.total) || Array.isArray(pipelineData.tracking) || Object.keys(pipelineData.byStatus || {}).length > 0);
const hasOutcomeData = Number.isFinite(outcomeData.totalOutcomes) || outcomeData.outcome || Array.isArray(outcomeData.outcomes);
if (!hasPipelineData && !hasOutcomeData) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: pipeline reporting and outcome tracking yielded no data' }));
return;
}
console.log(JSON.stringify({ success: true, data: { pipeline: pipelineData, outcomes: outcomeData, staleFollowUps: pipelineData.staleFollowUps || [], delegatedTo: ['career_pipeline_report', 'career_outcome'], generatedAt: new Date().toISOString() } }));
})();`;

const PIPELINE_OUTCOME_TRACKER_INPUT = {
type: 'object',
properties: {
jobId: { type: 'string', description: 'Job identifier for the outcome to record' },
status: { type: 'string', description: 'Application outcome status' },
feedback: { type: 'string', description: 'Interview or application feedback' },
offerDetails: { type: 'object', description: 'Offer details if applicable' },
},
};

const PIPELINE_OUTCOME_TRACKER_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
mode: { type: 'string' },
data: {
type: 'object',
properties: {
pipeline: { type: 'object' },
outcomes: { type: 'object' },
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
description: 'Tracks application statuses, records outcomes and feedback, and combines pipeline reporting with outcome history. Delegates to career_pipeline_report and career_outcome, with honest not-connected fallbacks for either dependency.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: PIPELINE_OUTCOME_TRACKER_SOURCE,
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
lowerOrderTools: ['career_pipeline_report', 'career_outcome'],
 actionLabel: 'Show pipeline & record outcome',
},
inputSchema: PIPELINE_OUTCOME_TRACKER_INPUT,
outputSchema: PIPELINE_OUTCOME_TRACKER_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['How is my pipeline', 'What needs follow-up', 'Track my outcomes'] },
{ kind: 'schedule', cadence: 'Weekly pipeline summary' },
{ kind: 'event', on: 'An application status changes' },
],
});
PIPELINE_OUTCOME_TRACKER.configSchema = PIPELINE_OUTCOME_TRACKER.manifest.configSchema as SchemaRecord;

export { PIPELINE_OUTCOME_TRACKER };

