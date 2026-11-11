// @ts-nocheck

import { SchemaRecord } from '../../../types'
import { createDeclarativeCodeSkill, SchemaProps, createSchemaRecord } from '../../../adk/code-skill-factory'
import { healthcareResultSchema } from '../healthcare-contract'

function withUxMetadata(schema: SchemaRecord): SchemaRecord {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
  if (!properties) return schema
  Object.entries(properties).forEach(([key, property], index) => {
    if (!property || typeof property !== 'object') return
    property.title = property.title || key.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase())
    property.order = typeof property.order === 'number' ? property.order : index + 1
    property.hint = property.hint || property.description || 'See the tool documentation for details.'
  })
  return schema
}

const SAFETY_BOUNDARY = 'Decision support and education only: do not diagnose, prescribe, change treatment, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician must review all outputs.'
const metadata = { domain: 'healthcare', persistenceEnv: 'ASSISTANT_HOME', HEALTHCARE_HOME: 'ASSISTANT_HOME', homeEnv: 'ASSISTANT_HOME', healthcareHome: 'ASSISTANT_HOME', clinicalSafetyBoundary: SAFETY_BOUNDARY }
const triggers = [
  { kind: 'user' as const, phrase_examples: ['evaluate clinic workflow', 'review this clinical case', 'create a care plan', 'stage intake dispatch'] },
  { kind: 'schedule' as const, cadence: 'daily clinical operations review' },
  { kind: 'event' as const, on: 'intake submission, appointment change, care-plan request, or guideline update', eventId: 'healthcare.appointment.scheduled' },
  { kind: 'event' as const, eventSource: 'healthcare-collection-change', on: 'workflow, evidence, education, or intake data is available for review', externalEvent: true, eventId: 'healthcare.external.care_data.updated' },
]

const carePlanConfig = createSchemaRecord({
  healthcareHome: SchemaProps.text({ description: 'Healthcare workspace path or base URL; defaults to ASSISTANT_HOME' }),
  defaultLanguage: SchemaProps.text({ description: 'Default language for the educational briefing', default: 'English' }),
  requireClinicianReview: SchemaProps.boolean({ description: 'Require clinician review before using the briefing', default: true }),
})

const healthcarePatientCarePlanEducationalBriefingCopilot = createDeclarativeCodeSkill({
  id: 'healthcare-patient-care-plan-educational-briefing-copilot',
  isSkill: true,
  name: 'Patient Care Plan & Educational Briefing Co-Pilot',
  description: 'Generate a structured, plain-language care-plan briefing from supplied clinician-authored condition, goals, medications, and education topics without changing treatment.',
  persistenceEnvVar: 'ASSISTANT_HOME',
  tier: 'aid',
  domainKnowledge: 'Care plan development, medication management, and patient education briefing',
  inputSchema: createSchemaRecord({
    condition: SchemaProps.text({ description: 'Condition or care need supplied by the clinician' }),
    careNeed: SchemaProps.text({ description: 'Optional alternate label for the care need' }),
    goals: SchemaProps.stringArray({ description: 'Patient or clinician goals' }),
    medications: SchemaProps.objectArray(SchemaProps.object({
      name: SchemaProps.text({ description: 'Medication or therapy name' }),
      instruction: SchemaProps.text({ description: 'Clinician-provided instruction' }),
    }), { description: 'Current medications or therapies' }),
    educationTopics: SchemaProps.stringArray({ description: 'Topics to explain to the patient' }),
    followUp: SchemaProps.text({ description: 'Clinician-defined follow-up interval' }),
  }, { required: ['condition', 'goals', 'educationTopics'] }),
  outputSchema: healthcareResultSchema('Structured care plan: goals, medications, education topics, briefing, and safety boundary'),
  triggers,
  manifest: {
    configSchema: carePlanConfig,
    healthcareHome: 'ASSISTANT_HOME',
    ui: { view: 'care-plan' },
    metadata: metadata,
    lowerOrderTools: ['healthcare-care-plan-drafter'],
    actionLabel: 'Create care plan briefing',
  },
  handler: async function handler(input, ctx) {
    const NL = '\n';
    const SAFETY = SAFETY_BOUNDARY;

    function fail(status, message, title) {
      return {
        success: false,
        status: status,
        error: message,
        data: null,
        present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }],
      };
    }

    const condition = String(input.condition || input.careNeed || '');
    const goals = Array.isArray(input.goals) ? input.goals : [];
    const medications = Array.isArray(input.medications) ? input.medications : [];
    const educationTopics = Array.isArray(input.educationTopics) ? input.educationTopics : [];

    if (!condition || !goals.length || !educationTopics.length) {
      return fail('not-connected', 'Not connected: condition, goals, and education topics are required', 'Input required');
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
            systemPrompt: 'You are a clinical education and care-plan briefing assistant. Decision support and education only: do not diagnose, prescribe, or change treatment; a qualified clinician must review all outputs. Return only the finished JSON deliverable, no prose or fences.',
            prompt: prompt,
            options: { temperature: 0.3, maxTokens: 4096 },
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

    function parseDraft(value) {
      if (!value) return null;
      if (typeof value === 'object' && !Array.isArray(value) && (value.education || value.briefing || value.goals)) return value;
      const text = delegatedText(value);
      if (!text) return null;
      try { return JSON.parse(text); } catch {}
      const match = text.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch {} }
      return null;
    }

    const toolInput = {
      condition,
      careNeed: input.careNeed || null,
      goals,
      medications,
      educationTopics,
      followUp: input.followUp || null,
    };

    const brainPrompt =
      'You are drafting a plain-language patient care-plan educational briefing from the supplied input. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "condition": "<condition or care need>",\n' +
      '  "careNeed": "<care need label or null>",\n' +
      '  "goals": [ { "rank": 1, "goal": "<goal>", "measure": "<patient-reported or clinician-defined target>" } ],\n' +
      '  "medications": [ { "name": "<medication or therapy name>", "instruction": "<instruction copied verbatim from supplied input>" } ],\n' +
      '  "education": [ { "topic": "<supplied topic>", "format": "plain-language briefing", "note": "<short note>", "plainLanguageExplanation": "<genuine plain-language explanation a patient could understand for this topic>" } ],\n' +
      '  "briefing": {\n' +
      '    "purpose": "<plain-language purpose of this briefing>",\n' +
      '    "medicationSafety": "Medication details are copied from the supplied plan; do not start, stop, or change a dose from this briefing. A qualified clinician must review all medication instructions.",\n' +
      '    "teachBack": ["<teach-back question 1>", "<teach-back question 2>", "<teach-back question 3>"]\n' +
      '  },\n' +
      '  "disclaimer": "This briefing is for education and decision support only. Do not start, stop, or change treatment from this output. A qualified clinician must review all content.",\n' +
      '  "safetyBoundary": "Decision support and education only: do not diagnose, prescribe, change treatment, or make autonomous clinical decisions; a qualified clinician must review all outputs."\n' +
      '}\n\n' +
      'Rules — follow every one of them:\n' +
      '1. For each supplied education topic you MUST produce an actual plain-language explanation a patient could understand in "plainLanguageExplanation". Do NOT merely echo the topic names back.\n' +
      '2. "teachBack" must contain concrete teach-back questions that help confirm patient understanding of the plan, goals, medications (if any), and education topics.\n' +
      '3. Medication instructions must be copied verbatim from the supplied input; do not rephrase, add, or infer dosing. Always accompany medications with the safety note not to change doses. If no medications are supplied, return an empty medications array and state in medicationSafety that none were supplied and to verify with the prescribing clinician.\n' +
      '4. Goals must be ranked and include a reasonable patient-reported or clinician-defined measure.\n' +
      '5. Decision support and education only: do not diagnose, prescribe, or change treatment. A qualified clinician must review all outputs.\n' +
      '6. Use only information present in the supplied input; do not invent clinical details.\n\n' +
      'Input:\n' + JSON.stringify(toolInput, null, 2);

    let parsed = null;
    let via = null;
    try {
      const raw = await withDeadline(ctx.delegate('healthcare-care-plan-drafter', toolInput), DELEGATED_TIMEOUT_MS);
      const payload = unwrapDelegated(raw);
      parsed = parseDraft(payload);
      if (parsed) via = 'delegated';
    } catch (e) {
      parsed = null;
    }

    if (!parsed) {
      const direct = await callBrain(brainPrompt);
      parsed = parseDraft(direct);
      if (parsed) via = 'brain';
    }

    if (!parsed) {
      const lines = [
        'No care-plan briefing was produced. The assistant model did not return a usable briefing.',
        '',
        'Nothing was generated. Retry, or check the Brain activity log.',
        '',
        SAFETY,
      ];
      return {
        success: false,
        status: 'not-connected',
        data: null,
        error: 'Not connected: no usable care-plan briefing could be generated',
        present: [{ id: 'notice', title: 'No briefing available', kind: 'text', body: lines.join(NL) }],
      };
    }

    const outCondition = parsed.condition || condition;
    const outCareNeed = parsed.careNeed != null ? parsed.careNeed : (input.careNeed || null);
    const outGoals = Array.isArray(parsed.goals) && parsed.goals.length
      ? parsed.goals
      : goals.map((g, i) => ({ rank: i + 1, goal: String(g), measure: 'patient-reported or clinician-defined target' }));
    const outMedications = Array.isArray(parsed.medications) ? parsed.medications : medications.map((m) => ({
      name: typeof m === 'string' ? m : ((m && m.name) || 'unnamed therapy'),
      instruction: typeof m === 'string' ? '' : String((m && m.instruction) || ''),
    }));
    const outEducation = Array.isArray(parsed.education) ? parsed.education : educationTopics.map((t) => ({
      topic: String(t),
      format: 'plain-language briefing',
      note: 'Topic supplied by the clinician.',
      plainLanguageExplanation: String(t),
    }));
    const outBriefing = parsed.briefing && typeof parsed.briefing === 'object' ? parsed.briefing : {
      purpose: 'This briefing summarizes the supplied care plan for ' + outCondition + '.',
      medicationSafety: outMedications.length
        ? 'Medication details are copied from the supplied plan; do not start, stop, or change a dose from this briefing. A qualified clinician must review all medication instructions.'
        : 'No medications were supplied. Verify with the prescribing clinician before taking or changing any medication.',
      teachBack: ['Please describe the plan in your own words.', 'What questions or concerns should the care team address?'],
    };
    const outDisclaimer = parsed.disclaimer || 'This briefing is for education and decision support only. Do not start, stop, or change treatment from this output. A qualified clinician must review all content.';
    const outSafety = parsed.safetyBoundary || SAFETY;

    const lines = [];
    lines.push('Patient care-plan briefing for: ' + outCondition);
    if (via) lines.push('Generated via ' + via + ' call.');
    lines.push('');
    lines.push('Care goals (' + outGoals.length + '):');
    outGoals.forEach(function (g) {
      const rank = g && g.rank != null ? g.rank : '';
      const goal = g && g.goal != null ? String(g.goal) : String(g);
      const measure = g && g.measure ? '  [measure: ' + g.measure + ']' : '';
      lines.push('  ' + rank + '. ' + goal + measure);
    });
    lines.push('');
    if (outMedications.length > 0) {
      lines.push('Medications / therapies (' + outMedications.length + '):');
      outMedications.forEach(function (m) {
        const name = m && m.name ? String(m.name) : 'unnamed therapy';
        const instruction = m && m.instruction ? String(m.instruction) : '';
        lines.push('  - ' + name + (instruction ? '  (' + instruction + ')' : ''));
      });
      lines.push('  ' + (outBriefing.medicationSafety || 'Medication details are copied from the supplied plan; do not start, stop, or change a dose from this briefing.'));
      lines.push('');
    } else {
      lines.push('Medications / therapies: none supplied. Verify with the prescribing clinician.');
      lines.push('  ' + (outBriefing.medicationSafety || 'No medications were supplied. Verify with the prescribing clinician before taking or changing any medication.'));
      lines.push('');
    }
    lines.push('Education topics (' + outEducation.length + '):');
    outEducation.forEach(function (t, i) {
      const topic = t && t.topic ? String(t.topic) : String(t);
      const explanation = t && t.plainLanguageExplanation ? String(t.plainLanguageExplanation) : '';
      lines.push('  ' + (i + 1) + '. ' + topic);
      if (explanation) {
        explanation.split(NL).forEach(function (l) { if (l) lines.push('     ' + l); });
      }
    });
    lines.push('');
    lines.push(outBriefing.purpose || 'This briefing summarizes the supplied care plan for ' + outCondition + '.');
    lines.push('');
    lines.push('Teach-back questions:');
    const teachBack = Array.isArray(outBriefing.teachBack) && outBriefing.teachBack.length
      ? outBriefing.teachBack
      : ['Please describe the plan in your own words.', 'What questions or concerns should the care team address?'];
    teachBack.forEach(function (q) { lines.push('  - ' + String(q)); });
    lines.push('');
    lines.push(outDisclaimer);
    lines.push('');
    lines.push(outSafety);

    return {
      success: true,
      status: 'ok',
      data: {
        condition: outCondition,
        careNeed: outCareNeed,
        goals: outGoals,
        medications: outMedications,
        education: outEducation,
        briefing: {
          purpose: outBriefing.purpose || 'This briefing summarizes the supplied care plan for ' + outCondition + '.',
          medicationSafety: outBriefing.medicationSafety || (outMedications.length
            ? 'Medication details are copied from the supplied plan; do not start, stop, or change a dose from this briefing. A qualified clinician must review all medication instructions.'
            : 'No medications were supplied. Verify with the prescribing clinician before taking or changing any medication.'),
          teachBack: teachBack,
        },
        disclaimer: outDisclaimer,
        safetyBoundary: outSafety,
      },
      present: [
        { id: 'briefing', title: 'Care plan briefing', kind: 'text', body: lines.join(NL) },
      ],
    };
  }
})

healthcarePatientCarePlanEducationalBriefingCopilot.configSchema = carePlanConfig

withUxMetadata(healthcarePatientCarePlanEducationalBriefingCopilot.inputSchema as SchemaRecord)
if (healthcarePatientCarePlanEducationalBriefingCopilot.configSchema) withUxMetadata(healthcarePatientCarePlanEducationalBriefingCopilot.configSchema)

export { healthcarePatientCarePlanEducationalBriefingCopilot }
