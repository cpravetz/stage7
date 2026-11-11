import { Tool } from '../../../types';

const now = () => new Date();

// Both reasoning Tools below feed their `summary` straight into a user-facing
// presentation card, so the model must return only the finished deliverable.
// Without this the raw reasoning trace leaked into the card: a mock-interview
// session opened with the model's "Thinking Process", and its closing lines were
// self-checks about hallucination rather than advice for the candidate.
const DELIVERABLE_ONLY_SYSTEM_PROMPT = [
  'You are an expert career coach.',
  'Reply with the finished deliverable only.',
  'Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique in the reply.',
  'Do not narrate what you are about to do or how you decided to do it.',
  'Write directly to the candidate in plain prose, with no meta-commentary about the response itself.',
].join(' ');

export const HR_RESUME_SCREENER: Tool = {
  id: 'hr-resume-screener',
  domainKnowledge: 'Resume screening and role-fit evaluation: skills matching, experience relevance, gap analysis, and hiring recommendations.',
  tier: 'advise',
  schemaVersion: 1,
  name: 'HR Resume Screener',
  description: 'Evaluate a resume against job requirements and return a structured fit assessment with score, matched keywords, gaps, summary, and recommendation.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'You are screening a candidate resume against job requirements. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "candidateName": "<string>",\n' +
      '  "score": <number 0-100>,\n' +
      '  "matched": ["<string>"],\n' +
      '  "partialMatched": ["<string>"],\n' +
      '  "gaps": ["<string>"],\n' +
      '  "summary": "<string>",\n' +
      '  "recommendation": "<string>",\n' +
      '  "resumeText": "<string>",\n' +
      '  "jobRequirements": "<string>"\n' +
      '}\n\n' +
      'Rules:\n' +
      '1. Compute a genuine fit assessment from the supplied resume text and job requirements. Do not return a default or placeholder score.\n' +
      '2. "score" must be an integer from 0 to 100 reflecting overall fit; never emit 0 or 100 by default — choose a value justified by the evidence.\n' +
      '3. "matched" lists requirements/keywords clearly satisfied by the resume. "partialMatched" lists requirements partially evidenced. "gaps" lists important requirements not evidenced.\n' +
      '4. "summary" is a concise written assessment of the candidate\'s fit.\n' +
      '5. "recommendation" states a clear hire/no-hire (or advance/hold/reject) recommendation with brief rationale.\n' +
      '6. Echo back "candidateName", "resumeText", and "jobRequirements" from the input for traceability.\n\n' +
      'Input:\n{{input}}',
    maxTokens: 2048,
    temperature: 0.3,
    optimizeFor: 'accuracy',
  },
  inputSchema: {
    type: 'object',
    properties: {
      resumeText: { type: 'string' },
      jobRequirements: { type: 'string' },
      candidateName: { type: 'string' },
    },
    required: ['resumeText', 'jobRequirements', 'candidateName'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      candidateName: { type: 'string' },
      score: { type: 'number' },
      matched: { type: 'array', items: { type: 'string' } },
      partialMatched: { type: 'array', items: { type: 'string' } },
      gaps: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
      recommendation: { type: 'string' },
      resumeText: { type: 'string' },
      jobRequirements: { type: 'string' },
    },
  },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};

export const HR_CANDIDATE_ASSESSOR: Tool = {
  id: 'hr-candidate-assessor',
  domainKnowledge: 'Candidate assessment: technical and soft skill evaluation, experience analysis, and overall hiring recommendation.',
  tier: 'advise',
  schemaVersion: 1,
  name: 'HR Candidate Assessor',
  description: 'Evaluate a candidate against supplied assessment criteria and return structured technical/soft skill matches, experience analysis, and recommendation.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'You are assessing a candidate against supplied criteria. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "candidateName": "<string>",\n' +
      '  "yearsExperience": <number>,\n' +
      '  "technicalSkillMatch": { "total": <number>, "found": ["<string>"], "missing": ["<string>"] },\n' +
      '  "softSkillMatch": { "total": <number>, "found": ["<string>"], "missing": ["<string>"] },\n' +
      '  "experienceMentioned": <boolean|null>,\n' +
      '  "overallAssessment": "<string>",\n' +
      '  "recommendation": "<string>",\n' +
      '  "resumeText": "<string>",\n' +
      '  "assessmentData": <object>\n' +
      '}\n\n' +
      'Rules:\n' +
      '1. Evaluate technical skills, soft skills, and experience level against the supplied assessment criteria using evidence from the resume.\n' +
      '2. "yearsExperience" is the best estimate of relevant years of experience evidenced in the resume (use 0 if none can be determined).\n' +
      '3. "technicalSkillMatch" and "softSkillMatch" must reflect each criterion in assessmentData: "total" is the number evaluated, "found" lists skills evidenced, "missing" lists skills not evidenced.\n' +
      '4. "experienceMentioned" is true if the requested experience level/requirement is evidenced, false if clearly not, or null if not specified.\n' +
      '5. "overallAssessment" summarizes strengths, weaknesses, and fit. "recommendation" states a clear recommendation with rationale.\n' +
      '6. Echo back "candidateName", "resumeText", and "assessmentData" from the input for traceability.\n\n' +
      'Input:\n{{input}}',
    maxTokens: 2048,
    temperature: 0.3,
    optimizeFor: 'accuracy',
  },
  inputSchema: {
    type: 'object',
    properties: {
      resumeText: { type: 'string' },
      candidateName: { type: 'string' },
      assessmentData: { type: 'object' },
    },
    required: ['resumeText', 'candidateName', 'assessmentData'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      candidateName: { type: 'string' },
      yearsExperience: { type: 'number' },
      technicalSkillMatch: { type: 'object' },
      softSkillMatch: { type: 'object' },
      experienceMentioned: { type: ['boolean', 'null'] },
      overallAssessment: { type: 'string' },
      recommendation: { type: 'string' },
      resumeText: { type: 'string' },
      assessmentData: { type: 'object' },
    },
  },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};
