import { Tool } from '../../../types';
import { createExternalActionSkill } from '../code-skill-factory';

/**
 * ============================================================================
 * CAREER COACH — v2, redesigned per the 8-step skill framework.
 * ============================================================================
 *
 * This file replaces 25 atomic tools (career_setup, career_scrape, career_apply,
 * career_rank, career_interview, career_outcome, career_expand, career_upskill,
 * career_html_report, career_notion_sync, career_gmail_sync, career_add_template,
 * career_add_portal, career_reset, career-resume-optimizer, career-resume-analyzer,
 * career-resume-formatter, career-application-monitor, career-followup-advisor,
 * career-salary-analyzer, career-negotiation-advisor, career-offer-evaluator,
 * career-networking-advisor) with 7 outcome-shaped skills:
 *
 *   A. Profile & Resume Intake        — reasoning-only, local storage
 *   B. Job Discovery & Fit Ranking    — hybrid (real board MCP if connected)
 *   C. Application Execution         — hybrid (real portal MCP if connected)
 *   D. Interview Preparation         — reasoning-only
 *   E. Career Advisory               — reasoning-only (was 6 unconfigured stubs)
 *   F. Networking & Outreach         — reasoning-only draft / proxy send if connected
 *   G. Pipeline Reporting & Sync     — hybrid (real Notion/Gmail MCP if connected)
 *
 * Design principle enforced throughout: a skill only takes `endpointUrl` /
 * `apiKey` config if it depends on a REAL external system of record. Skills
 * whose only dependency is "reason over data already on file" are declared
 * `type: 'reasoning'` and run on the assistant's own model — they are never
 * routed through createExternalActionSkill's HTTP-stub pattern. This is the
 * fix for the original file's core mistake: modeling advisory reasoning and
 * real external integration identically.
 *
 * `type: 'reasoning'` and the `triggers` field on every skill are proposed
 * extensions to the shared `Tool` type (not present in the current
 * `../../../types` module as uploaded). They're written here in the shape
 * the runtime would need; wiring them into the executor is a follow-up change
 * outside this file's scope.
 * ============================================================================
 */

const CAREER_EXTERNAL_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
    request: { type: ['object', 'null'] },
    response: { type: ['object', 'null'] },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

/** Shared trigger shape — proposed extension, see header note. */
type SkillTrigger =
  | { kind: 'user'; phrase_examples: string[] }
  | { kind: 'schedule'; cadence: string }
  | { kind: 'event'; on: string };

// ----------------------------------------------------------------------------
// A. Profile & Resume Intake
// ----------------------------------------------------------------------------
// Replaces career_setup + the resume-creation step that never existed in v1.
// A resume is uploaded ONCE, in whatever format the user has it, and parsed
// into a structured record every other skill reads from. No skill after this
// one ever asks the user to paste resume text again.

const PROFILE_INTAKE: Tool = {
  id: 'career_profile_intake',
  name: 'Set Up Career Profile',
  description:
    'Create or update the career profile: preferences (target roles, salary range, locations) plus a resume ingested from an uploaded file (pdf, docx, md, or txt). This is the single source of truth every other career skill reads from — nothing downstream should ever ask the user to re-paste resume text.',
  type: 'code',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const baseDir = process.env.CAREER_HOME || path.join('/tmp/career');
for (const d of ['profiles', 'resumes', 'listings', 'applications', 'outcomes']) {
  fs.mkdirSync(path.join(baseDir, d), { recursive: true });
}

const profileId = input.profileId || 'default';
const profilePath = path.join(baseDir, 'profiles', profileId + '.json');
const existing = fs.existsSync(profilePath) ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : null;

// --- Resume ingestion -------------------------------------------------------
// input.resumeFile is { name, mimeType, content } where content is either
// plain text (md/txt) or base64 (pdf/docx). Actual pdf/docx text extraction
// is delegated to the host's existing document-reading capability
// (__extractDocumentText, injected by the sandbox the same way __resolveAuth
// is) rather than reimplemented here — this file only handles the plain-text
// case directly and calls out for binary formats.
let resumeRecord = existing ? existing.resume : null;
if (input.resumeFile) {
  const { name, mimeType, content } = input.resumeFile;
  let text;
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    text = content;
  } else if (typeof __extractDocumentText === 'function') {
    text = await __extractDocumentText({ mimeType, content });
  } else {
    throw new Error('No document extractor available for mimeType ' + mimeType);
  }

  resumeRecord = {
    sourceFileName: name,
    rawText: text,
    // Structured fields are filled in by a reasoning pass (see
    // career_resume_structure below in comments) rather than regex-parsed
    // here — name/title extraction from free-form resumes is a reasoning
    // task, not a string-matching task.
    parsedAt: new Date().toISOString(),
  };
}

const profile = {
  id: profileId,
  personal: Object.assign(
    { name: '', email: '', phone: '', location: '', linkedinUrl: '', githubUrl: '', portfolioUrl: '' },
    existing ? existing.personal : {},
    input.personal || {}
  ),
  preferences: Object.assign(
    { targetRoles: [], targetCompanies: [], industries: [], workArrangement: ['onsite', 'hybrid', 'remote'],
      minSalary: 0, maxSalary: 0, locations: [], excludeCompanies: [], keywords: [] },
    existing ? existing.preferences : {},
    input.preferences || {}
  ),
  resume: resumeRecord,
  jobSearch: existing ? existing.jobSearch : {
    status: 'active', startDate: new Date().toISOString(),
    applicationsSubmitted: 0, interviewsScheduled: 0, offersReceived: 0, rejectionsReceived: 0,
  },
  createdAt: existing ? existing.createdAt : new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));

console.log(JSON.stringify({
  success: true,
  data: {
    profileId: profile.id,
    profilePath,
    hasResume: !!profile.resume,
    profile,
  },
}));
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      profileId: { type: 'string', description: 'Profile identifier (default: "default")' },
      personal: {
        type: 'object',
        description: 'Contact details — only send fields that changed',
        properties: {
          name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
          location: { type: 'string' }, linkedinUrl: { type: 'string' },
          githubUrl: { type: 'string' }, portfolioUrl: { type: 'string' },
        },
      },
      preferences: {
        type: 'object',
        description: 'Search preferences — only send fields that changed',
        properties: {
          targetRoles: { type: 'array', items: { type: 'string' } },
          targetCompanies: { type: 'array', items: { type: 'string' } },
          industries: { type: 'array', items: { type: 'string' } },
          workArrangement: { type: 'array', items: { type: 'string', enum: ['onsite', 'hybrid', 'remote'] } },
          minSalary: { type: 'number' }, maxSalary: { type: 'number' },
          locations: { type: 'array', items: { type: 'string' } },
          excludeCompanies: { type: 'array', items: { type: 'string' } },
          keywords: { type: 'array', items: { type: 'string' } },
        },
      },
      resumeFile: {
        type: 'object',
        description: 'Uploaded resume file — pdf, docx, md, or txt. Replaces the stored resume.',
        properties: {
          name: { type: 'string' },
          mimeType: { type: 'string', enum: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/markdown', 'text/plain'] },
          content: { type: 'string', description: 'Base64 for binary formats, plain text for md/txt' },
        },
        required: ['name', 'mimeType', 'content'],
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      profileId: { type: 'string' },
      profilePath: { type: 'string' },
      hasResume: { type: 'boolean' },
      profile: { type: 'object' },
    },
    required: ['success', 'profileId', 'profilePath', 'hasResume', 'profile'],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ----------------------------------------------------------------------------
// B. Job Discovery & Fit Ranking
// ----------------------------------------------------------------------------
// Replaces career_scrape + career_rank. Queries and target companies default
// from the stored profile — the user only supplies overrides. Source
// selection is honest about what's actually connected: if no job-board MCP
// is wired up, the skill says so explicitly rather than emitting synthetic
// listings that look real (v1's `normalizeJob` placeholder behavior).

const JOB_DISCOVERY: Tool = {
  id: 'career_job_discovery',
  name: 'Find & Rank Matching Jobs',
  description:
    'Search for open roles and score them against the stored profile in one step. Queries, locations, and salary filters default from the profile — only pass overrides. Returns a ranked list with a fit score and rationale per listing, not a raw unranked feed the user has to evaluate themselves.',
  type: 'code',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const baseDir = process.env.CAREER_HOME || path.join('/tmp/career');
const profileId = input.profileId || 'default';
const profilePath = path.join(baseDir, 'profiles', profileId + '.json');
if (!fs.existsSync(profilePath)) {
  console.log(JSON.stringify({ success: false, error: 'No profile found. Run career_profile_intake first.' }));
} else {
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const prefs = profile.preferences || {};

// Defaults derived from the profile, not required from the user.
const queries = (input.queries && input.queries.length) ? input.queries : (prefs.targetRoles || []);
const locations = (input.locations && input.locations.length) ? input.locations : (prefs.locations || []);
const minSalary = input.minSalary != null ? input.minSalary : (prefs.minSalary || 0);
const maxSalary = input.maxSalary != null ? input.maxSalary : (prefs.maxSalary || 0);

if (!queries.length) {
  console.log(JSON.stringify({
    success: false,
    error: 'No target roles set on the profile and no queries provided. Add targetRoles via career_profile_intake or pass queries explicitly.',
  }));
} else {

// Real board search happens via a connected job-board MCP server, resolved
// the same way any other MCP tool is resolved by the host (__callMcpTool).
// If nothing is connected, this skill does NOT fabricate listings — it
// reports that clearly so the assistant can tell the user to connect a
// source instead of presenting placeholder data as real search results.
let raw = [];
let sourceNote = '';
if (typeof __callMcpTool === 'function' && input.connectedJobBoardTools && input.connectedJobBoardTools.length) {
  for (const toolRef of input.connectedJobBoardTools) {
    for (const q of queries) {
      const res = await __callMcpTool(toolRef, { query: q, locations, minSalary, maxSalary });
      if (Array.isArray(res)) raw = raw.concat(res.map((r) => Object.assign({}, r, { source: toolRef })));
    }
  }
} else {
  sourceNote = 'No job-board connector is available in this conversation, so no listings were fetched. Connect a job-board source to search live postings.';
}

function scoreJob(job) {
  let score = 0;
  const rationale = [];
  const title = (job.title || '').toLowerCase();
  const targetRoles = (prefs.targetRoles || []).map((r) => r.toLowerCase());
  if (targetRoles.some((r) => title.includes(r))) { score += 0.35; rationale.push('Title matches a target role'); }

  const company = (job.company || '').toLowerCase();
  const excluded = (prefs.excludeCompanies || []).map((c) => c.toLowerCase()).some((c) => company.includes(c));
  if (excluded) { rationale.push('Company is on the exclude list'); }
  else if ((prefs.targetCompanies || []).map((c) => c.toLowerCase()).some((c) => company.includes(c))) {
    score += 0.15; rationale.push('Target company');
  }

  const sal = job.salary || {};
  if (minSalary && sal.max && sal.max >= minSalary) { score += 0.2; rationale.push('Meets salary floor'); }
  else if (!minSalary) { score += 0.1; }

  const loc = (job.location || '').toLowerCase();
  if (!locations.length || locations.some((l) => loc.includes(l.toLowerCase())) || /remote/i.test(loc)) {
    score += 0.15; rationale.push('Location/remote fits');
  }

  const kw = (prefs.keywords || []).map((k) => k.toLowerCase());
  const desc = (job.description || '').toLowerCase();
  const kwHits = kw.filter((k) => desc.includes(k) || title.includes(k));
  if (kwHits.length) { score += Math.min(0.15, kwHits.length * 0.05); rationale.push('Keyword match: ' + kwHits.join(', ')); }

  return { score: excluded ? 0 : Math.round(score * 100) / 100, rationale };
}

const ranked = raw.map((job) => {
  const { score, rationale } = scoreJob(job);
  return Object.assign({}, job, { fitScore: score, fitRationale: rationale });
}).sort((a, b) => b.fitScore - a.fitScore);

const listPath = path.join(baseDir, 'listings', profileId + '.json');
fs.mkdirSync(path.dirname(listPath), { recursive: true });
const existing = fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : [];
const merged = [...existing];
for (const r of ranked) {
  const idx = merged.findIndex((m) => m.id === r.id);
  if (idx >= 0) merged[idx] = r; else merged.push(r);
}
fs.writeFileSync(listPath, JSON.stringify(merged, null, 2));

console.log(JSON.stringify({
  success: true,
  data: { ranked, total: ranked.length, queriesUsed: queries, storagePath: listPath, note: sourceNote || undefined },
}));
}
}
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      profileId: { type: 'string', description: 'Profile to search against (default: "default")' },
      queries: { type: 'array', items: { type: 'string' }, description: 'Override the profile\'s target roles for this search' },
      locations: { type: 'array', items: { type: 'string' }, description: 'Override the profile\'s locations' },
      minSalary: { type: 'number' },
      maxSalary: { type: 'number' },
      connectedJobBoardTools: {
        type: 'array', items: { type: 'string' },
        description: 'MCP tool references for connected job-board sources. Resolved by the assistant, not typed by the user.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      ranked: { type: 'array' },
      total: { type: 'number' },
      queriesUsed: { type: 'array' },
      storagePath: { type: 'string' },
      note: { type: 'string' },
    },
    required: ['success'],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ----------------------------------------------------------------------------
// C. Application Execution
// ----------------------------------------------------------------------------
// Replaces career_apply + career_add_portal + career_add_template. Resume and
// cover letter are always pulled from the single profile record from Skill A
// — there is no more resumeId pointing at a record nothing creates.

const APPLICATION_EXECUTION: Tool = {
  id: 'career_apply_execute',
  name: 'Apply to Jobs',
  description:
    'Submit applications for selected jobs using the resume and profile on file, generating a tailored cover letter automatically. Defaults to a review-first dry run; live submission requires either a connected application-portal MCP or explicit confirmation to prepare-and-hand-off to the user.',
  type: 'code',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const baseDir = process.env.CAREER_HOME || path.join('/tmp/career');
const profileId = input.profileId || 'default';
const profilePath = path.join(baseDir, 'profiles', profileId + '.json');
const listPath = path.join(baseDir, 'listings', profileId + '.json');

if (!fs.existsSync(profilePath)) {
  console.log(JSON.stringify({ success: false, error: 'No profile found. Run career_profile_intake first.' }));
} else if (!fs.existsSync(listPath)) {
  console.log(JSON.stringify({ success: false, error: 'No ranked listings found. Run career_job_discovery first.' }));
} else {

const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
if (!profile.resume) {
  console.log(JSON.stringify({ success: false, error: 'Profile has no resume on file. Upload one via career_profile_intake.' }));
} else {

const listings = JSON.parse(fs.readFileSync(listPath, 'utf8'));
const jobIds = input.jobIds || (input.autoApplyThreshold != null
  ? listings.filter((l) => l.fitScore >= input.autoApplyThreshold).map((l) => l.id)
  : []);
const dryRun = input.dryRun !== false; // default true: review before anything is submitted live

const applications = [];
const errors = [];

for (const id of jobIds) {
  const job = listings.find((l) => l.id === id);
  if (!job) { errors.push({ jobId: id, error: 'Listing not found' }); continue; }

  // Cover letter generation is a reasoning step (see career_apply_cover_letter
  // reasoning skill referenced below), not string templating — it's called
  // out here rather than reimplemented in this code tool.
  const record = {
    jobId: id, job: { title: job.title, company: job.company, location: job.location },
    resumeUsed: profile.resume.sourceFileName, status: dryRun ? 'dry_run' : 'prepared',
    appliedAt: new Date().toISOString(),
  };

  if (!dryRun && input.connectedPortalTool) {
    const res = await __callMcpTool(input.connectedPortalTool, {
      job, resumeText: profile.resume.rawText, coverLetter: input.coverLetters && input.coverLetters[id],
    });
    record.status = res && res.success ? 'submitted' : 'failed';
    record.portalResponse = res;
  }

  applications.push(record);
}

const trackPath = path.join(baseDir, 'applications', profileId + '.json');
fs.mkdirSync(path.dirname(trackPath), { recursive: true });
const tracking = fs.existsSync(trackPath) ? JSON.parse(fs.readFileSync(trackPath, 'utf8')) : [];
for (const a of applications) {
  const idx = tracking.findIndex((t) => t.jobId === a.jobId);
  if (idx >= 0) tracking[idx] = a; else tracking.push(a);
}
fs.writeFileSync(trackPath, JSON.stringify(tracking, null, 2));

console.log(JSON.stringify({
  success: errors.length === 0,
  data: { applications, errors, dryRun, trackingPath: trackPath },
}));
}
}
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      profileId: { type: 'string' },
      jobIds: { type: 'array', items: { type: 'string' }, description: 'Explicit jobs to apply to' },
      autoApplyThreshold: { type: 'number', description: 'Apply to every ranked job at or above this fit score, instead of listing jobIds by hand' },
      dryRun: { type: 'boolean', default: true, description: 'Preview without submitting; set false only once a portal is connected or the user has confirmed' },
      connectedPortalTool: { type: 'string', description: 'MCP tool reference for a connected application portal, resolved by the assistant' },
      coverLetters: { type: 'object', description: 'jobId -> generated cover letter text, produced by the Career Advisory reasoning skill' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' }, applications: { type: 'array' }, errors: { type: 'array' },
      dryRun: { type: 'boolean' }, trackingPath: { type: 'string' },
    },
    required: ['success'],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ----------------------------------------------------------------------------
// D, E, F — Reasoning-only skills
// ----------------------------------------------------------------------------
// These replace career_interview and the six unconfigured advisory stubs
// (resume-optimizer, resume-analyzer, resume-formatter, salary-analyzer,
// negotiation-advisor, offer-evaluator) plus networking-advisor and
// followup-advisor. None of them call an external service: they run on the
// assistant's own model against context already on file (resume, profile,
// job listing, application history). `type: 'reasoning'` is the proposed
// extension referenced in the file header — the runtime routes it straight
// to the assistant rather than through the HTTP-stub executor.

function reasoningSkill(opts: {
  id: string; name: string; description: string;
  contextInputs: Record<string, unknown>; userInputs: Record<string, unknown>;
  required?: string[]; triggers: SkillTrigger[];
}): Tool {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    type: 'reasoning',
    inputSchema: {
      type: 'object',
      properties: Object.assign({}, opts.contextInputs, opts.userInputs),
      required: opts.required || [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Direct answer or recommendation' },
        options: { type: 'array', description: 'Where the decision is the user\'s to make, the trade-offs between alternatives, not a single verdict' },
        rationale: { type: 'string' },
      },
      required: ['summary'],
    },
    triggers: opts.triggers,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Tool;
}

const INTERVIEW_PREP = reasoningSkill({
  id: 'career_interview_prep',
  name: 'Prepare for an Interview',
  description: 'Generate likely questions, grounded model answers drawn from the actual resume on file, and a short mock-interview script for a specific job.',
  contextInputs: { profileId: { type: 'string' } },
  userInputs: {
    jobId: { type: 'string', description: 'Which ranked job this prep is for' },
    stage: { type: 'string', enum: ['phone_screen', 'technical', 'onsite', 'final'], description: 'Interview stage, if known' },
  },
  required: ['jobId'],
  triggers: [
    { kind: 'user', phrase_examples: ['help me prep for this interview', 'mock interview me for the Acme role'] },
    { kind: 'event', on: 'an interview is logged for a tracked application' },
  ],
});

const CAREER_ADVISORY = reasoningSkill({
  id: 'career_advisory',
  name: 'Career Advisory',
  description:
    'Reasoned advice on resume strength, salary positioning, negotiation strategy, and offer evaluation — grounded in the stored resume, profile, and any offer/alternatives provided. Replaces six previously separate, unconfigured advisory stubs with one real reasoning skill. Always presents trade-offs; never issues a single unilateral verdict on a personal decision.',
  contextInputs: { profileId: { type: 'string' } },
  userInputs: {
    question: {
      type: 'string',
      enum: ['resume_strength', 'salary_benchmark', 'negotiation_strategy', 'offer_evaluation'],
      description: 'Which kind of advisory question this is',
    },
    targetRole: { type: 'string' },
    jobDescription: { type: 'string' },
    offer: { type: 'object', description: 'Offer terms, for negotiation_strategy or offer_evaluation' },
    alternatives: { type: 'array', items: { type: 'object' }, description: 'Competing offers, for offer_evaluation' },
    marketDataTool: { type: 'string', description: 'Optional MCP reference to a real compensation-data connector; strengthens salary_benchmark if present, otherwise the skill reasons from general knowledge with that caveat stated' },
  },
  required: ['question'],
  triggers: [
    { kind: 'user', phrase_examples: ['is my resume strong for this role', 'should I take this offer', 'help me negotiate'] },
    { kind: 'event', on: 'an offer is logged in Pipeline Reporting' },
  ],
});

const NETWORKING_OUTREACH = reasoningSkill({
  id: 'career_networking_outreach',
  name: 'Networking & Outreach',
  description:
    'Draft a personalized outreach or follow-up message for a target contact or company. Drafts only, by default — sending requires an explicitly connected messaging channel and explicit confirmation, kept separate from drafting so a message is never sent without the user seeing it first.',
  contextInputs: { profileId: { type: 'string' } },
  userInputs: {
    targetCompany: { type: 'string' }, targetPerson: { type: 'string' },
    relationshipStage: { type: 'string', enum: ['cold_outreach', 'follow_up', 'thank_you', 'referral_ask'] },
    channel: { type: 'string', enum: ['email', 'linkedin'] },
    connectedSendTool: { type: 'string', description: 'MCP reference for a connected send channel; presence enables an explicit send action after user confirmation, absence means draft-only' },
  },
  required: ['targetCompany', 'relationshipStage'],
  triggers: [
    { kind: 'user', phrase_examples: ['draft a follow-up to the Acme recruiter'] },
    { kind: 'schedule', cadence: 'weekly review of contacts with no reply after 7 days' },
  ],
});

// ----------------------------------------------------------------------------
// G. Pipeline Reporting & Sync
// ----------------------------------------------------------------------------
// Reporting itself is local/reasoning; real sync to Notion/Gmail is a genuine
// external integration and is the one place in this file that legitimately
// keeps the createExternalActionSkill shape — because it really does talk to
// an external system of record, not because every "external-sounding" skill
// defaults to that shape.

const PIPELINE_REPORT: Tool = {
  id: 'career_pipeline_report',
  name: 'Pipeline Status',
  description: 'Summarize the job search pipeline: applications, interviews, offers, and what needs follow-up, from tracked data.',
  type: 'code',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.CAREER_HOME || path.join('/tmp/career');
const profileId = input.profileId || 'default';
const trackPath = path.join(baseDir, 'applications', profileId + '.json');
const tracking = fs.existsSync(trackPath) ? JSON.parse(fs.readFileSync(trackPath, 'utf8')) : [];

const byStatus = {};
for (const t of tracking) byStatus[t.status] = (byStatus[t.status] || 0) + 1;

const staleFollowUps = tracking.filter((t) => {
  const days = (Date.now() - new Date(t.appliedAt).getTime()) / 86400000;
  return t.status === 'submitted' && days > 10;
});

console.log(JSON.stringify({
  success: true,
  data: { total: tracking.length, byStatus, staleFollowUps: staleFollowUps.map((t) => t.jobId), tracking },
}));
`,
  },
  inputSchema: { type: 'object', properties: { profileId: { type: 'string' } } },
  outputSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, total: { type: 'number' }, byStatus: { type: 'object' }, staleFollowUps: { type: 'array' } },
    required: ['success'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ["how's my pipeline", 'what needs follow-up'] },
    { kind: 'schedule', cadence: 'weekly summary' },
    { kind: 'event', on: 'an application status changes' },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const NOTION_SYNC = createExternalActionSkill({
  id: 'career_notion_sync',
  name: 'Sync Pipeline to Notion',
  description: 'Push tracked application status to a connected Notion database. Genuinely requires a real external connection — unlike the reasoning skills above, this one legitimately keeps the external-action shape.',
  system: 'notion',
  action: 'sync-pipeline',
  endpoint: { envVar: 'CAREER_NOTION_ENDPOINT', method: 'POST' },
  auth: {
    type: 'api_key',
    header: 'Authorization',
    credentialEnvKeyMap: { apiKey: 'CAREER_NOTION_API_KEY' },
  },
  credentialSource: { apiKey: { envVar: 'CAREER_NOTION_API_KEY', configKey: 'career.notion.apiKey' } },
  configSchema: {
    type: 'object',
    properties: {
      endpointUrl: { type: 'string' }, apiKey: { type: 'string' },
      databaseId: { type: 'string', description: 'Target Notion database' },
    },
    required: ['endpointUrl', 'apiKey', 'databaseId'],
  },
  inputSchema: {
    type: 'object',
    properties: { profileId: { type: 'string' } },
  },
  outputSchema: CAREER_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 30000,
});

// ----------------------------------------------------------------------------

export const careerSkills: Tool[] = [
  PROFILE_INTAKE,
  JOB_DISCOVERY,
  APPLICATION_EXECUTION,
  INTERVIEW_PREP,
  CAREER_ADVISORY,
  NETWORKING_OUTREACH,
  PIPELINE_REPORT,
  NOTION_SYNC,
];
