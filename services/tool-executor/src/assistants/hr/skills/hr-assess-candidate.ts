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
      maxRetryAttempts: SchemaProps.number({ description: 'Retry attempts on scheduling failure', default: 1000 }),
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
    const _hrHome = process.env.HR_HOME;
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

    const DELEGATED_TIMEOUT_MS = Number(ctx.config?.delegatedTimeoutMs) > 0
      ? Number(ctx.config?.delegatedTimeoutMs)
      : 24000;

    function unwrapDelegated(res) {
      if (!res || typeof res !== 'object') return null;
      if (res.status === 'failed') return null;
      if (res.success === false) return null;
      if (res.success === true) {
        const data = res.data;
        if (data && typeof data === 'object') return data;
        return data != null ? { summary: data } : null;
      }
      if (res.status === 'completed') {
        const out = res.output;
        if (out && typeof out === 'object') {
          if (out.success === false) return null;
          return (out.data && typeof out.data === 'object') ? out.data : out;
        }
        if (typeof out === 'string' && out.trim()) return { summary: out };
      }
      return null;
    }

    function delegatedText(payload) {
      if (!payload) return null;
      if (typeof payload === 'string') return cleanDelegatedText(payload);
      if (typeof payload !== 'object') return null;
      if (typeof payload.summary === 'string' && payload.summary.trim()) return cleanDelegatedText(payload.summary);
      if (typeof payload._raw === 'string' && payload._raw.trim()) return cleanDelegatedText(payload._raw);
      return null;
    }

    function cleanDelegatedText(text) {
      if (!text) return null;
      let body = text;
      const thinkingIdx = body.indexOf('Thinking Process:');
      if (thinkingIdx >= 0) {
        const nextSection = body.indexOf('\n\n', thinkingIdx);
        if (nextSection < 0) return null;
        body = body.slice(nextSection + 2);
      }
      const selfCheckIdx = body.indexOf('Self-Check:');
      if (selfCheckIdx >= 0) body = body.slice(0, selfCheckIdx);
      const hallucinationIdx = body.indexOf('Hallucination');
      if (hallucinationIdx >= 0 && /hallucinat/i.test(body.slice(hallucinationIdx))) {
        body = body.slice(0, hallucinationIdx);
      }
      body = body.trim();
      return body ? body : null;
    }

    function brainBaseUrl() {
      return String(ctx.config?.brainEndpoint || 'http://brain:3100').trim();
    }

    async function callBrain(prompt) {
      const base = brainBaseUrl();
      if (!base) return null;
      try {
        const res = await fetch(base + '/api/brain/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt: 'You are an HR candidate assessor. Return only the finished JSON assessment, no prose or fences.',
            prompt: prompt,
            options: { temperature: 0.3, maxTokens: 2048 },
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.content || data.summary || null;
      } catch (e) {
        return null;
      }
    }

    function withDeadline(promise, ms) {
      return new Promise(function (resolve) {
        let done = false;
        const timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
        Promise.resolve(promise).then(
          function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
          function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } }
        );
      });
    }

    function parseAssessment(value) {
      if (!value) return null;
      if (typeof value === 'object' && (value.technicalSkillMatch || value.yearsExperience != null)) return value;
      const text = delegatedText(value);
      if (!text) return null;
      try { return JSON.parse(text); } catch {}
      const match = text.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch {} }
      return null;
    }

    const toolInput = { resumeText, candidateName, assessmentData };
    const brainPrompt =
      'Assess this candidate against the supplied criteria. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences — with shape: ' +
      '{"candidateName":"<string>","yearsExperience":<number>,"technicalSkillMatch":{"total":<number>,"found":["<string>"],"missing":["<string>"]},"softSkillMatch":{"total":<number>,"found":["<string>"],"missing":["<string>"]},"experienceMentioned":<boolean|null>,"overallAssessment":"<string>","recommendation":"<string>","resumeText":"<string>","assessmentData":<object>}. ' +
      'Evaluate technical skills, soft skills, and experience level from the resume and criteria.\nInput:\n' +
      JSON.stringify(toolInput, null, 2);

    let parsed = null;
    try {
      const raw = await withDeadline(ctx.delegate('hr-candidate-assessor', toolInput), DELEGATED_TIMEOUT_MS);
      const payload = unwrapDelegated(raw);
      parsed = parseAssessment(payload);
    } catch (e) {
      parsed = null;
    }

    if (!parsed) {
      const direct = await callBrain(brainPrompt);
      parsed = parseAssessment(direct);
    }

    if (!parsed) {
      return {
        success: false,
        status: 'not-connected',
        data: null,
        error: 'Candidate assessment is unavailable; the assistant model did not return a usable assessment',
        present: [ctx.render.text('notice', 'Not Connected', 'Candidate assessment requires a configured assistant model. Contact your administrator to set brainEndpoint in this Skill\'s configuration and verify model availability.')],
      };
    }

    const assessment = {
      yearsExperience: typeof parsed.yearsExperience === 'number' ? parsed.yearsExperience : 0,
      technicalSkillMatch: parsed.technicalSkillMatch && typeof parsed.technicalSkillMatch === 'object'
        ? parsed.technicalSkillMatch
        : { total: 0, found: [], missing: [] },
      softSkillMatch: parsed.softSkillMatch && typeof parsed.softSkillMatch === 'object'
        ? parsed.softSkillMatch
        : { total: 0, found: [], missing: [] },
      experienceMentioned: parsed.experienceMentioned === null || typeof parsed.experienceMentioned === 'boolean' ? parsed.experienceMentioned : null,
      overallAssessment: parsed.overallAssessment || '',
      recommendation: parsed.recommendation || '',
    };

    const record = {
      id: 'assess_' + Date.now(),
      candidateName: parsed.candidateName || candidateName,
      assessment,
      resumeText: parsed.resumeText || resumeText,
      assessmentData: parsed.assessmentData || assessmentData,
      createdAt: new Date().toISOString(),
      source: 'brain-delegation',
    };

    const store = ctx.store.load('screening', []);
    store.push(record);
    ctx.store.save('screening', store);

    const storePath = ctx.store.getFilePath('screening');

    const tech = assessment.technicalSkillMatch || { total: 0, found: [], missing: [] };
    const soft = assessment.softSkillMatch || { total: 0, found: [], missing: [] };
    const techFound = Array.isArray(tech.found) ? tech.found : [];
    const techMissing = Array.isArray(tech.missing) ? tech.missing : [];
    const softFound = Array.isArray(soft.found) ? soft.found : [];
    const softMissing = Array.isArray(soft.missing) ? soft.missing : [];

    const lines = [
      'Candidate Assessment Report: ' + record.candidateName,
      '',
      'Years of Experience (assessed): ' + assessment.yearsExperience,
      '',
      'Technical Skills: ' + techFound.length + ' of ' + (tech.total || 0) + ' matched',
    ];
    if (techFound.length > 0) {
      lines.push('  Found: ' + techFound.join(', '));
    }
    if (techMissing.length > 0) {
      lines.push('  Missing: ' + techMissing.join(', '));
    }
    lines.push('');
    lines.push('Soft Skills: ' + softFound.length + ' of ' + (soft.total || 0) + ' matched');
    if (softFound.length > 0) {
      lines.push('  Found: ' + softFound.join(', '));
    }
    if (softMissing.length > 0) {
      lines.push('  Missing: ' + softMissing.join(', '));
    }
    lines.push('');
    lines.push('Experience Mentioned: ' + (assessment.experienceMentioned === true ? 'Yes' : assessment.experienceMentioned === false ? 'No' : 'Not specified'));
    if (assessment.overallAssessment) {
      lines.push('');
      lines.push('Overall Assessment:');
      lines.push(assessment.overallAssessment);
    }
    if (assessment.recommendation) {
      lines.push('');
      lines.push('Recommendation:');
      lines.push(assessment.recommendation);
    }
    lines.push('');
    lines.push('Source: Assistant model assessment (brain delegation with fallback)');
    lines.push('Scope: Assessment derived from the resume and assessment criteria you supplied.');

    return {
      success: true,
      status: dryRun ? 'dry-run' : 'ok',
      data: { record, storePath },
      error: null,
      present: [ctx.render.text('report', 'Assessment Result', lines)],
    };
  },
});
