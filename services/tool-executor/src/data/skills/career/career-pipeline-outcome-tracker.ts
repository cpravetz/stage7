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
const tracking = Array.isArray(pipelineData.tracking) ? pipelineData.tracking : [];
// Recording an outcome always requires knowing which role it belongs to: match by
// jobId if given, otherwise by jobTitle (+ optional company) rather than guessing the first row.
let matchedEntry = null;
if (input.targetRole) {
  matchedEntry = tracking.find((entry) => (entry.jobId || entry.id) === input.targetRole) || null;
} else if (input.jobTitle) {
  matchedEntry = tracking.find((entry) => String(entry.title || entry.jobTitle || '').toLowerCase() === String(input.jobTitle).toLowerCase()
    && (!input.company || String(entry.company || '').toLowerCase() === String(input.company).toLowerCase())) || null;
}
if (!input.targetRole && !input.jobTitle) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Provide a targetRole or a jobTitle so this outcome can be tied to the correct role' }));
return;
}
if ((input.targetRole || input.jobTitle) && !matchedEntry) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: no pipeline entry matched the given targetRole/jobTitle; check Job Discovery & Fit Ranking or Apply to Jobs history' }));
return;
}
const outcome = await __execute_tool('career_outcome', {
   applicationId: matchedEntry.jobId || matchedEntry.id || input.targetRole || '',
   jobTitle: matchedEntry.title || matchedEntry.jobTitle || input.jobTitle || '',
   company: matchedEntry.company || input.company || '',
   status: input.status || '',
   feedback: input.feedback || '',
   offerDetails: input.offerDetails || null,
  });
if (!outcome || outcome.success === false || outcome.error) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: outcome && outcome.error ? outcome.error : 'Not connected: outcome tracking returned no data' }));
return;
}
const outcomeData = outcome.data && typeof outcome.data === 'object' ? outcome.data : {};
const hasPipelineData = Boolean(pipelineData) && (Number.isFinite(pipelineData.total) || tracking.length || Object.keys(pipelineData.byStatus || {}).length > 0);
const hasOutcomeData = Number.isFinite(outcomeData.totalOutcomes) || outcomeData.outcome || Array.isArray(outcomeData.outcomes);
if (!hasPipelineData && !hasOutcomeData) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: pipeline reporting and outcome tracking yielded no data' }));
return;
}
console.log(JSON.stringify({ success: true, data: { pipeline: pipelineData, outcomes: outcomeData, role: { jobId: matchedEntry.jobId || matchedEntry.id, jobTitle: matchedEntry.title || matchedEntry.jobTitle, company: matchedEntry.company }, staleFollowUps: pipelineData.staleFollowUps || [], delegatedTo: ['career_pipeline_report', 'career_outcome'], generatedAt: new Date().toISOString() } }));
})();`;

const PIPELINE_OUTCOME_TRACKER_INPUT = {
type: 'object',
properties: {
targetRole: { type: 'string', description: 'Role to record an outcome for (from Job Discovery or Apply to Jobs)' },
jobTitle: { type: 'string', description: 'Job title to match instead of targetRole' },
company: { type: 'string', description: 'Company name, used with jobTitle to disambiguate' },
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

