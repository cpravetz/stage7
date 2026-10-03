// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { careerResultSchema } from '../career-contract';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const PIPELINE_OUTCOME_TRACKER_INPUT = {
type: 'object',
properties: {
targetRole: { type: 'string', description: 'Job title or role identifier to track or record an outcome for', 'x-referenceSource': 'career-job-discovery-fit-ranking', 'x-referenceValueField': 'title', 'x-referenceLabel': 'your job search results' },
company: { type: 'string', description: 'Company name for the application', 'x-referenceSource': 'career-job-discovery-fit-ranking', 'x-referenceValueField': 'company', 'x-referenceLabel': 'your job search results' },
status: { type: 'string', enum: ['applied', 'interviewing', 'offer', 'rejected', 'withdrawn', 'accepted', 'no-response'], description: 'Application outcome status', default: 'applied' },
feedback: { type: 'string', description: 'Interview or application feedback', multiline: true },
appliedAt: { type: 'string', format: 'date-time', description: 'When the application was submitted' },
offerDetails: { type: 'object', description: 'Offer details if applicable' },
},
};

const PIPELINE_OUTCOME_TRACKER = createDeclarativeCodeSkill({
id: 'career-pipeline-outcome-tracker',
name: 'Pipeline & Outcome Tracker',
description: 'Tracks application statuses, records outcomes and feedback, and combines pipeline reporting with outcome history. Delegates to career-pipeline-report and career-outcome, with honest not-connected fallbacks for either dependency.',
persistenceEnvVar: 'CAREER_HOME',
inputSchema: PIPELINE_OUTCOME_TRACKER_INPUT,
outputSchema: careerResultSchema('Pipeline data, outcome recording results, role info, and stale follow-ups'),
triggers: [
{ kind: 'user', phrase_examples: ['How is my pipeline', 'What needs follow-up', 'Track my outcomes'] },
],
tier: 'aid',
domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
isSkill: true,
manifest: {
  configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
  lowerOrderTools: ['career-pipeline-report', 'career-outcome'],
  actionLabel: 'Show pipeline & record outcome'
},
handler: async function handler(input, ctx) {
    const NL = '\n';

    const present = [];

    let store = ctx.store.load('trackingPath', []);
    if (!Array.isArray(store)) store = [];

    const pipeline = await ctx.delegate('career-pipeline-report', {});
    if (!pipeline || pipeline.success === false) {
    const lines = ['Your Application Pipeline'];
    lines.push('===========================');
    lines.push('');
    lines.push('Pipeline reporting is not available. No application data could be loaded.');
    if (input.targetRole) {
      lines.push('');
      lines.push('You entered:');
      lines.push('  Role: ' + input.targetRole);
      if (input.company) lines.push('  Company: ' + input.company);
      if (input.status) lines.push('  Status: ' + input.status);
      lines.push('');
      lines.push('Since no pipeline data is available, this entry will be stored as a new application.');
      const entry = {
        id: 'app_' + Date.now(),
        jobId: input.targetRole,
        title: input.targetRole,
        company: input.company || '',
        role: input.targetRole,
        status: input.status || 'applied',
        appliedAt: input.appliedAt || new Date().toISOString(),
        source: 'user-entry',
        note: input.feedback || '',
      };
      store.push(entry);
      ctx.store.save('trackingPath', store);
      lines.push('');
      lines.push('Stored new application entry.');
      lines.push('  Role: ' + entry.role);
      lines.push('  Company: ' + entry.company);
      lines.push('  Status: ' + entry.status);
      return { success: true, status: 'ok', data: { pipeline: null, outcomes: { totalOutcomes: 1 }, role: { jobId: entry.jobId, jobTitle: entry.title, company: entry.company }, staleFollowUps: [], note: 'Entry stored locally; pipeline report tool was unavailable.', delegatedTo: ['career-pipeline-report'], generatedAt: new Date().toISOString() }, error: null, present: [{ id: 'pipeline', title: 'Pipeline & Outcome', kind: 'text', body: lines.join(NL) }] };
      return;
    }
    return { success: false, status: 'not-connected', data: null, error: 'Pipeline reporting is not available and no role was provided to store', present: [{ id: 'error', title: 'Not Connected', kind: 'text', body: 'Pipeline reporting is not available. Provide a target role and company to track an application.' }] };
    return;
    }
    const pipelineData = pipeline.data && typeof pipeline.data === 'object' ? pipeline.data : {};
    const tracking = Array.isArray(pipelineData.tracking) ? pipelineData.tracking : [];
    // Recording an outcome always requires knowing which role it belongs to: match by
    // targetRole against the job identifier.
    let matchedEntry = null;
    if (input.targetRole) {
    matchedEntry = tracking.find((entry) => (entry.jobId || entry.id || entry.identifier) === input.targetRole) || null;
    if (!matchedEntry) {
      // Try matching by title/company as a fallback.
      matchedEntry = tracking.find((entry) => entry.title === input.targetRole || entry.company === input.company) || null;
    }
    }
    if (!input.targetRole) {
    const lines = ['Your Application Pipeline'];
    lines.push('===========================');
    lines.push('');
    lines.push('No target role provided; nothing to track.');
    if (tracking.length > 0) {
      lines.push('');
      lines.push('Your current applications:');
      tracking.slice(0, 20).forEach(function (t) {
        lines.push('  ' + (t.title || t.role || t.jobId || 'Untitled') + ' at ' + (t.company || 'Unknown') + ' — ' + (t.status || 'unknown'));
      });
    } else {
      lines.push('');
      lines.push('No applications in your pipeline yet. Add one by providing a target role and company.');
    }
    return { success: true, status: 'ok', data: { pipeline: pipelineData, outcomes: {}, role: null, staleFollowUps: [], note: 'No targetRole provided; nothing to track', delegatedTo: ['career-pipeline-report'], generatedAt: new Date().toISOString() }, error: null, present: [{ id: 'pipeline', title: 'Pipeline & Outcome Tracker', kind: 'text', body: lines.join(NL) }] };
    return;
    }
    if (input.targetRole && !matchedEntry) {
    const lines = ['Your Application Pipeline'];
    lines.push('===========================');
    lines.push('');
    lines.push('Application: ' + input.targetRole + (input.company ? ' at ' + input.company : ''));
    lines.push('Status: ' + (input.status || 'applied'));
    if (input.feedback) lines.push('Feedback: ' + input.feedback);
    lines.push('');
    lines.push('No existing pipeline entry matched this role. Stored as a new application.');
    const entry = {
      id: 'app_' + Date.now(),
      jobId: input.targetRole,
      title: input.targetRole,
      company: input.company || '',
      role: input.targetRole,
      status: input.status || 'applied',
      appliedAt: input.appliedAt || new Date().toISOString(),
      source: 'user-entry',
      note: input.feedback || '',
    };
    store.push(entry);
    ctx.store.save('trackingPath', store);
    return { success: true, status: 'ok', data: { pipeline: pipelineData, outcomes: { totalOutcomes: 1 }, role: { jobId: entry.jobId, jobTitle: entry.title, company: entry.company }, staleFollowUps: [], note: 'New application recorded for ' + entry.title, delegatedTo: ['career-pipeline-report'], generatedAt: new Date().toISOString() }, error: null, present: [{ id: 'pipeline', title: 'Pipeline & Outcome Tracker', kind: 'text', body: lines.join(NL) }] };
    return;
    }
    const outcome = await ctx.delegate('career-outcome', {
     applicationId: matchedEntry.jobId || matchedEntry.id || matchedEntry.identifier || input.targetRole || '',
     jobTitle: matchedEntry.title || matchedEntry.jobTitle || (matchedEntry.job && matchedEntry.job.title) || '',
     company: matchedEntry.company || (matchedEntry.job && matchedEntry.job.company) || input.company || '',
     status: input.status || '',
     feedback: input.feedback || '',
     offerDetails: input.offerDetails || null,
    });
    if (!outcome || outcome.success === false) {
    const lines = ['Your Application Pipeline'];
    lines.push('===========================');
    lines.push('');
    lines.push('Application: ' + input.targetRole + (input.company ? ' at ' + input.company : ''));
    if (input.feedback) lines.push('Feedback: ' + input.feedback);
    lines.push('');
    lines.push('Pipeline data was loaded, but outcome tracking is not available.');
    lines.push('');
    lines.push('Existing pipeline entries:');
    tracking.slice(0, 20).forEach(function (t) {
      lines.push('  ' + (t.title || t.role || t.jobId || 'Untitled') + ' at ' + (t.company || 'Unknown') + ' — ' + (t.status || 'unknown'));
    });
    return { success: true, status: 'ok', data: { pipeline: pipelineData, outcomes: {}, role: { jobId: matchedEntry ? (matchedEntry.jobId || matchedEntry.id || matchedEntry.identifier) : input.targetRole, jobTitle: matchedEntry ? (matchedEntry.title || matchedEntry.jobTitle || '') : input.targetRole, company: matchedEntry ? (matchedEntry.company || '') : (input.company || '') }, staleFollowUps: pipelineData.staleFollowUps || [], note: 'Pipeline loaded but outcome tracking unavailable', delegatedTo: ['career-pipeline-report'], generatedAt: new Date().toISOString() }, error: null, present: [{ id: 'pipeline', title: 'Pipeline & Outcome Tracker', kind: 'text', body: lines.join(NL) }] };
    return;
    }
    const outcomeData = outcome.data && typeof outcome.data === 'object' ? outcome.data : {};
    const roleInfo = {
    jobId: matchedEntry.jobId || matchedEntry.id || matchedEntry.identifier || input.targetRole,
    jobTitle: matchedEntry.title || matchedEntry.jobTitle || (matchedEntry.job && matchedEntry.job.title) || input.targetRole,
    company: matchedEntry.company || (matchedEntry.job && matchedEntry.job.company) || input.company || '',
    };
    const hasPipelineData = Boolean(pipelineData) && (Number.isFinite(pipelineData.total) || tracking.length || Object.keys(pipelineData.byStatus || {}).length > 0);
    const hasOutcomeData = Number.isFinite(outcomeData.totalOutcomes) || outcomeData.outcome || Array.isArray(outcomeData.outcomes);
    if (!hasPipelineData && !hasOutcomeData) {
    return { success: false, status: 'not-connected', data: null, error: 'Not connected: pipeline reporting and outcome tracking yielded no data', present: [{ id: 'error', title: 'Not Connected', kind: 'text', body: 'No pipeline data or outcome records were found. Add an application to get started.' }] };
    return;
    }

    // Build present blocks
    const presentBlocks = [];
    const bodyLines = ['Your Application Pipeline'];
    bodyLines.push('===========================');
    bodyLines.push('');
    bodyLines.push('Application: ' + (roleInfo.jobTitle || 'Unknown') + (roleInfo.company ? ' at ' + roleInfo.company : ''));
    bodyLines.push('Status: ' + (input.status || 'updated'));
    if (input.feedback) bodyLines.push('Feedback: ' + input.feedback);
    bodyLines.push('');
    if (tracking.length > 0) {
    bodyLines.push('Your Applications:');
    tracking.slice(0, 50).forEach(function (t) {
      const appliedDate = t.appliedAt ? new Date(t.appliedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
      const sal = t.salary ? ' • ' + t.salary : '';
      bodyLines.push('  ' + (t.title || t.role || 'Untitled') + ' at ' + (t.company || 'Unknown') + ' — ' + (t.status || 'unknown') + (appliedDate ? ' (' + appliedDate + ')' : ''));
    });
    bodyLines.push('');
    const byStatus = {};
    tracking.forEach(function (t) { const s = t.status || 'unknown'; byStatus[s] = (byStatus[s] || 0) + 1; });
    bodyLines.push('By Status:');
    Object.keys(byStatus).forEach(function (s) { bodyLines.push('  ' + s + ': ' + byStatus[s]); });
    } else {
    bodyLines.push('No applications in your pipeline.');
    }
    bodyLines.push('');
    if (outcomeData && Object.keys(outcomeData).length > 0) {
    bodyLines.push('Outcome recorded successfully.');
    }
    present.push({ id: 'pipeline', title: 'Pipeline & Outcome', kind: 'text', body: bodyLines.join(NL) });

    const staleFollowUps = pipelineData.staleFollowUps || [];
    if (staleFollowUps.length > 0) {
    const staleLines = ['Follow-ups needed:'];
    staleFollowUps.forEach(function (t) {
      staleLines.push('  ' + (t.title || t.role || 'Untitled') + ' at ' + (t.company || 'Unknown') + ' — applied ' + (t.appliedAt ? new Date(t.appliedAt).toLocaleDateString() : 'unknown date'));
    });
    present.push({ id: 'stale', title: 'Stale Follow-ups', kind: 'text', body: staleLines.join(NL) });
    }

    return { success: true, status: 'ok', data: { pipeline: pipelineData, outcomes: outcomeData, role: roleInfo, staleFollowUps, delegatedTo: ['career-pipeline-report', 'career-outcome'], generatedAt: new Date().toISOString() }, error: null, present: present };
  }
});
PIPELINE_OUTCOME_TRACKER.configSchema = CAREER_WRAPPER_CONFIG_SCHEMA;
PIPELINE_OUTCOME_TRACKER.configSchema = PIPELINE_OUTCOME_TRACKER.manifest.configSchema as SchemaRecord;

export { PIPELINE_OUTCOME_TRACKER };
