// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill } from '../code-skill-factory';
import { HR_DOMAIN_KNOWLEDGE, hrResultSchema } from './hr-contract';

// ============================================================================
// SKILL 1: hr-screen-resume (Represent)
// User trigger: "Screen this resume for role fit"
// ============================================================================

export const HR_SCREEN_RESUME = createDeclarativeCodeSkill({
  id: 'hr-screen-resume',
  name: 'Screen Resume for Role Fit',
  description: 'Filters inbound applicant profiles against role criteria and computes match score. Dry-run mode and explicit confirmation required.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating scheduling requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      defaultEndpoint: SchemaProps.url({ description: 'Default screening and scheduling endpoint URL' }),
  apiKey: SchemaProps.password({ description: 'Applicant tracking system API key' }),
      maxRetryAttempts: SchemaProps.number({ description: 'Retry attempts on scheduling failure', default: 3 }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute for scheduling API', default: 60 }),
    },
  },
  endpointConfigKey: 'defaultEndpoint',
  inputSchema: {
    type: 'object',
    properties: {
      resumeText: SchemaProps.text({ description: 'Resume text to screen against job requirements' }),
      jobRequirements: SchemaProps.text({ description: 'Job requirements to match resume against' }),
      candidateName: SchemaProps.text({ description: 'Candidate full name' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing scheduling; defaults to true', default: true }),
      confirmation: SchemaProps.boolean({ description: 'Explicit approval for live scheduling dispatch', default: false }),
    },
    required: ['resumeText', 'jobRequirements', 'candidateName'],
  },
  outputSchema: hrResultSchema('Screening record with match score, matched keywords, gaps, and persistence path'),
  tier: 'represent',
  confirmBeforeSend: true,
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  triggers: [
    { kind: 'user', phrase_examples: ['Screen this resume for role fit'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const resumeText = String(input.resumeText || '');
    const jobRequirements = String(input.jobRequirements || '');
    const candidateName = String(input.candidateName || '');
    const dryRun = input.dryRun !== false;
    const confirmation = input.confirmation === true;

    if (!resumeText || !jobRequirements || !candidateName) {
      const missing = [
        !resumeText ? 'resumeText' : null,
        !jobRequirements ? 'jobRequirements' : null,
        !candidateName ? 'candidateName' : null,
      ].filter(Boolean).join(', ');
      return {
  success: false,
  status: 'error',
  data: null,
  error: missing + ' is required',
  present: [ctx.render.text('notice', 'Missing input', missing + ' is required')]
};
    }

    function computeScore(resume: string, requirements: string) {
      const resumeWords = resume.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
      const reqWords = requirements.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
      if (!reqWords.length) return { score: 0, matched: [], gaps: [], partialMatched: [] };
      const exactMatched = reqWords.filter((w) => resumeWords.includes(w));
      const partialMatched = reqWords.filter((w) => !exactMatched.includes(w) && w.length >= 3 && resumeWords.some((rw) => rw.includes(w)));
      const matched = [...exactMatched, ...partialMatched];
      const raw = (matched.length / reqWords.length) * 100;
      const score = Math.max(1, Math.round(raw)) || 0;
      const gaps = reqWords.filter((w) => !matched.includes(w));
      return { score: Math.min(100, score), matched, gaps, partialMatched };
    }

    const { score, matched, gaps, partialMatched } = computeScore(resumeText, jobRequirements);

    const store = ctx.store.load('screening', []);
    const screening = {
      id: 'screen_' + Date.now(),
      candidateName,
      score,
      matched,
      gaps,
      partialMatched,
      createdAt: new Date().toISOString(),
      source: 'local',
    };
    store.push(screening);
    ctx.store.save('screening', store);

    const storePath = ctx.store.getFilePath('screening');
    const reqWordsCount = jobRequirements.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean).length;

    const lines = [
      'Resume Screening Report: ' + candidateName,
      '',
      'Match Score: ' + score + '/100',
      'Matched Requirements: ' + matched.length + ' of ' + reqWordsCount,
      'Gaps Identified: ' + gaps.length,
      '',
    ];
    if (matched.length > 0) {
      lines.push('Matched Keywords:');
      matched.forEach((m) => lines.push('  - ' + m));
      lines.push('');
    }
    if (partialMatched.length > 0) {
      lines.push('Partially Matched Keywords:');
      partialMatched.forEach((m) => lines.push('  - ' + m));
      lines.push('');
    }
    if (gaps.length > 0) {
      lines.push('Missing Keywords (Gaps):');
      gaps.forEach((g) => lines.push('  - ' + g));
      lines.push('');
    }
    lines.push('Source: Local keyword analysis (no external API)');
    lines.push('Scope: Every figure is computed from the resume and job requirements you supplied.');

    return {
      success: true,
      status: dryRun || !confirmation ? 'dry-run' : 'ok',
      data: { screening, storePath },
      error: null,
      present: [ctx.render.text('report', 'Screening Result', lines)],
    };
  },
});
