// @ts-nocheck

import { SchemaProps, createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';
import { HR_DOMAIN_KNOWLEDGE, hrResultSchema } from '../hr-contract';

// ============================================================================
// SKILL 2: hr-assess-candidate (Represent)
// Event trigger: "New application received"
// ============================================================================

export const HR_ASSESS_CANDIDATE = createDeclarativeCodeSkill({
  id: 'hr-assess-candidate',
  name: 'Assess Candidate Skills and Experience',
  description: 'Evaluates candidate technical skills, soft skills, and experience against assessment criteria. Triggered on new application received.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      defaultEndpoint: SchemaProps.url({ description: 'Default screening and scheduling endpoint URL' }),
      maxRetryAttempts: SchemaProps.number({ description: 'Retry attempts on scheduling failure', default: 3 }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute for scheduling API', default: 60 }),
    },
  },
  endpointConfigKey: 'defaultEndpoint',
  inputSchema: {
    type: 'object',
    properties: {
      resumeText: SchemaProps.text({ description: 'Resume text to assess' }),
      candidateName: SchemaProps.text({ description: 'Candidate full name' }),
      assessmentData: SchemaProps.object({
        technicalSkills: SchemaProps.stringArray({ description: 'Technical skills to assess against resume' }),
        softSkills: SchemaProps.stringArray({ description: 'Soft skills to assess against resume' }),
        experience: SchemaProps.text({ description: 'Experience level to check for in resume' }),
      }, { description: 'Assessment criteria and data for candidate evaluation' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
    required: ['resumeText', 'candidateName', 'assessmentData'],
  },
  outputSchema: hrResultSchema('Assessment record with technical/soft skill match, years of experience, and persistence path'),
  tier: 'represent',
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  manifest: { emitEvent: 'hr.candidate_assessment.recorded' },
  triggers: [
    // User, not Event: assessment needs the resume text and candidate name, and
    // there is no wired intake that supplies them, so only a person can run it.
    { kind: 'user', phrase_examples: ['Assess this candidate against the role', 'Score this resume', 'Produce interview assessment scores'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const resumeText = String(input.resumeText || '');
    const candidateName = String(input.candidateName || '');
    const assessmentData = input.assessmentData || {};
    const dryRun = input.dryRun !== false;

    if (!resumeText || !candidateName || !assessmentData || Object.keys(assessmentData).length === 0) {
      const missing = [
        !resumeText ? 'resumeText' : null,
        !candidateName ? 'candidateName' : null,
        (!assessmentData || Object.keys(assessmentData).length === 0) ? 'assessmentData' : null,
      ].filter(Boolean).join(', ');
      return {
  success: false,
  status: 'error',
  data: null,
  error: missing + ' is required',
  present: [ctx.render.text('notice', 'Missing input', missing + ' is required')]
};
    }

    function assessCandidate(resume: string, data: any) {
      const words = resume.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
      const technicalSkills = data.technicalSkills || [];
      const softSkills = data.softSkills || [];
      const experience = data.experience || '';
      const yearsMatch = resume.match(/([0-9]+)[+]? *(?:years?|yrs?)/i);
      const yearsExp = yearsMatch ? parseInt(yearsMatch[1], 10) : 0;
      const techFound = technicalSkills.filter((s: string) => words.includes(s.toLowerCase()));
      const softFound = softSkills.filter((s: string) => words.includes(s.toLowerCase()));
      return {
        yearsExperience: yearsExp,
        technicalSkillMatch: { total: technicalSkills.length, found: techFound, missing: technicalSkills.filter((s: string) => !words.includes(s.toLowerCase())) },
        softSkillMatch: { total: softSkills.length, found: softFound, missing: softSkills.filter((s: string) => !words.includes(s.toLowerCase())) },
        experienceMentioned: experience ? resume.toLowerCase().includes(experience.toLowerCase()) : null,
      };
    }

    const assessment = assessCandidate(resumeText, assessmentData);
    const record = {
      id: 'assess_' + Date.now(),
      candidateName,
      assessment,
      createdAt: new Date().toISOString(),
      source: 'local',
    };

    const store = ctx.store.load('screening', []);
    store.push(record);
    ctx.store.save('screening', store);

    const storePath = ctx.store.getFilePath('screening');

    const lines = [
      'Candidate Assessment Report: ' + candidateName,
      '',
      'Years of Experience (extracted from resume): ' + assessment.yearsExperience,
      '',
      'Technical Skills: ' + assessment.technicalSkillMatch.found.length + ' of ' + assessment.technicalSkillMatch.total + ' matched',
    ];
    if (assessment.technicalSkillMatch.found.length > 0) {
      lines.push('  Found: ' + assessment.technicalSkillMatch.found.join(', '));
    }
    if (assessment.technicalSkillMatch.missing.length > 0) {
      lines.push('  Missing: ' + assessment.technicalSkillMatch.missing.join(', '));
    }
    lines.push('');
    lines.push('Soft Skills: ' + assessment.softSkillMatch.found.length + ' of ' + assessment.softSkillMatch.total + ' matched');
    if (assessment.softSkillMatch.found.length > 0) {
      lines.push('  Found: ' + assessment.softSkillMatch.found.join(', '));
    }
    if (assessment.softSkillMatch.missing.length > 0) {
      lines.push('  Missing: ' + assessment.softSkillMatch.missing.join(', '));
    }
    lines.push('');
    lines.push('Experience Mentioned: ' + (assessment.experienceMentioned === true ? 'Yes' : assessment.experienceMentioned === false ? 'No' : 'Not specified'));
    lines.push('');
    lines.push('Source: Local keyword analysis (no external API)');
    lines.push('Scope: Every figure is computed from the resume and assessment criteria you supplied.');

    return {
      success: true,
      status: dryRun ? 'dry-run' : 'ok',
      data: { record, storePath },
      error: null,
      present: [ctx.render.text('report', 'Assessment Result', lines)],
    };
  },
});
