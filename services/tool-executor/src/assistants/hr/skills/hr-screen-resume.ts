// @ts-nocheck

import { SchemaProps, createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';
import { HR_DOMAIN_KNOWLEDGE, hrResultSchema } from '../hr-contract';

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
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      defaultEndpoint: SchemaProps.url({ description: 'Default screening and scheduling endpoint URL' }),
      apiKey: { ...SchemaProps.password({ description: 'Applicant tracking system API key' }), isSecret: true },
      maxRetryAttempts: SchemaProps.number({ description: 'Retry attempts on scheduling failure', default: 1000 }),
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
  tier: 'advise',
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  triggers: [
    { kind: 'user', phrase_examples: ['Screen this resume for role fit'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const _hrHome = process.env.HR_HOME;
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
            systemPrompt: 'You are an HR resume screener. Return only the finished JSON assessment, no prose or fences.',
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
      if (typeof value === 'object' && value.score != null) return value;
      const text = delegatedText(value);
      if (!text) return null;
      try { return JSON.parse(text); } catch {}
      const match = text.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch {} }
      return null;
    }

    const toolInput = { resumeText, jobRequirements, candidateName };
    const brainPrompt =
      'Screen this candidate resume against the job requirements. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences — with shape: ' +
      '{"candidateName":"<string>","score":<0-100>,"matched":["<string>"],"partialMatched":["<string>"],"gaps":["<string>"],"summary":"<string>","recommendation":"<string>","resumeText":"<string>","jobRequirements":"<string>"}. ' +
      'Compute a genuine fit assessment; never emit a score of 0 or 100 by default.\nInput:\n' +
      JSON.stringify(toolInput, null, 2);

    let parsed = null;
    try {
      const raw = await withDeadline(ctx.delegate('hr-resume-screener', toolInput), DELEGATED_TIMEOUT_MS);
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
        error: 'Resume screening is unavailable; the assistant model did not return a usable assessment',
        present: [ctx.render.text('notice', 'Not Connected', 'Resume screening requires a configured assistant model. Contact your administrator to set brainEndpoint in this Skill\'s configuration and verify model availability.')],
      };
    }

    const screening = {
      id: 'screen_' + Date.now(),
      candidateName: parsed.candidateName || candidateName,
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      matched: Array.isArray(parsed.matched) ? parsed.matched : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      partialMatched: Array.isArray(parsed.partialMatched) ? parsed.partialMatched : [],
      summary: parsed.summary || '',
      recommendation: parsed.recommendation || '',
      resumeText: parsed.resumeText || resumeText,
      jobRequirements: parsed.jobRequirements || jobRequirements,
      createdAt: new Date().toISOString(),
      source: 'brain-delegation',
    };

    const store = ctx.store.load('screening', []);
    store.push(screening);
    ctx.store.save('screening', store);

    const storePath = ctx.store.getFilePath('screening');
    const reqWordsCount = jobRequirements.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean).length;

    const lines = [
      'Resume Screening Report: ' + screening.candidateName,
      '',
      'Match Score: ' + screening.score + '/100',
      'Matched Requirements: ' + screening.matched.length + (reqWordsCount ? ' of ' + reqWordsCount : ''),
      'Gaps Identified: ' + screening.gaps.length,
      '',
    ];
    if (screening.summary) {
      lines.push('Summary:');
      lines.push(screening.summary);
      lines.push('');
    }
    if (screening.recommendation) {
      lines.push('Recommendation:');
      lines.push(screening.recommendation);
      lines.push('');
    }
    if (screening.matched.length > 0) {
      lines.push('Matched Keywords:');
      screening.matched.forEach((m) => lines.push('  - ' + m));
      lines.push('');
    }
    if (screening.partialMatched.length > 0) {
      lines.push('Partially Matched Keywords:');
      screening.partialMatched.forEach((m) => lines.push('  - ' + m));
      lines.push('');
    }
    if (screening.gaps.length > 0) {
      lines.push('Missing Keywords (Gaps):');
      screening.gaps.forEach((g) => lines.push('  - ' + g));
      lines.push('');
    }
    lines.push('Source: Assistant model assessment (brain delegation with fallback)');
    lines.push('Scope: Assessment derived from the resume and job requirements you supplied.');

    return {
      success: true,
      status: dryRun || !confirmation ? 'dry-run' : 'ok',
      data: { screening, storePath },
      error: null,
      present: [ctx.render.text('report', 'Screening Result', lines)],
    };
  },
});
