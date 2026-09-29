import { SchemaRecord } from '../../../types'
import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory'
import { healthcareResultSchema } from './healthcare-contract'

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

const HEALTHCARE_HOME = process.env.HEALTHCARE_HOME || '/tmp/healthcare'
const SAFETY_BOUNDARY = 'Decision support and education only: do not diagnose, prescribe, change treatment, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician must review all outputs.'
const metadata = { domain: 'healthcare', persistenceEnv: 'HEALTHCARE_HOME', HEALTHCARE_HOME, homeEnv: 'HEALTHCARE_HOME', healthcareHome: HEALTHCARE_HOME, clinicalSafetyBoundary: SAFETY_BOUNDARY }
const triggers = [
  { kind: 'user' as const, phrase_examples: ['evaluate clinic workflow', 'review this clinical case', 'create a care plan', 'stage intake dispatch'] },
  { kind: 'schedule' as const, cadence: 'daily clinical operations review' },
  { kind: 'event' as const, on: 'intake submission, appointment change, care-plan request, or guideline update' },
  { kind: 'data' as const, condition: 'workflow, evidence, education, or intake data is available for review' },
]

const decisionSource = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';
  const SAFETY = ${JSON.stringify(SAFETY_BOUNDARY)};

  function fail(status, message, title) {
    console.log(JSON.stringify({
      success: false,
      status: status,
      error: message,
      data: null,
      present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }],
    }));
  }

  const patient = input.patient && typeof input.patient === 'object' ? input.patient : {};
  const symptoms = Array.isArray(patient.symptoms) ? patient.symptoms : (Array.isArray(input.symptoms) ? input.symptoms : []);
  const history = Array.isArray(patient.history) ? patient.history : (Array.isArray(input.history) ? input.history : []);
  const guidelines = Array.isArray(input.guidelines) ? input.guidelines : [];

  if (!symptoms.length || !guidelines.length) {
    fail('not-connected', 'Not connected: patient symptoms and evidence-based guideline inputs are required', 'Input required');
    return;
  }

  const redFlags = symptoms.filter((item) => /chest pain|difficulty breathing|stroke|severe bleed|unconscious|suicidal/i.test(String(item)));
  const considerations = guidelines.map((guideline) => {
    const item = guideline && typeof guideline === 'object' ? guideline : {};
    const keywords = Array.isArray(item.keywords) ? item.keywords : [];
    const relevance = symptoms.filter((symptom) => keywords.some((keyword) => String(symptom).toLowerCase().includes(String(keyword).toLowerCase()))).length;
    return { guideline: item.name || 'unnamed guideline', relevance, pathway: item.pathway || 'clinician review required', evidenceLevel: item.evidenceLevel || 'not supplied' };
  }).sort((left, right) => right.relevance - left.relevance || String(left.guideline).localeCompare(String(right.guideline)));

  const escalation = redFlags.length ? 'urgent clinician or emergency-pathway review required' : 'routine clinician review';
  const patientAge = patient.age === undefined ? null : Number(patient.age);
  const ageText = patientAge !== null ? 'age ' + patientAge : 'this patient';

  // ---- Report ------------------------------------------------------------------
  const lines = [];
  lines.push('Summary: clinical decision-support review for ' + ageText + ' reporting ' + symptoms.length + ' symptom(s) and ' + guidelines.length + ' evidence-based guideline(s).');
  lines.push('');
  if (redFlags.length > 0) {
    lines.push('Red-flag symptom(s) identified: ' + redFlags.map(String).join(', ') + '.');
    lines.push('Escalation recommendation: ' + escalation + '.');
  } else {
    lines.push('No red-flag symptom(s) identified. Escalation recommendation: ' + escalation + '.');
  }
  lines.push('');
  const scored = considerations.filter(function (c) { return c.relevance > 0; });
  if (scored.length > 0) {
    lines.push('Guideline considerations (ranked by keyword relevance):');
    scored.forEach(function (c, i) {
      lines.push('  ' + (i + 1) + '. ' + c.guideline + ' - ' + c.relevance + ' of ' + symptoms.length + ' symptom(s) matched; pathway: ' + c.pathway + '; evidence level: ' + c.evidenceLevel);
    });
  } else {
    lines.push('No guideline keyword matched the supplied symptoms. All ' + guidelines.length + ' guideline(s) returned zero keyword relevance.');
  }
  lines.push('');
  lines.push('Relevant patient history: ' + (history.length ? history.join('; ') : 'none supplied'));
  lines.push('');
  lines.push(SAFETY);

  console.log(JSON.stringify({
    success: true,
    status: 'local',
    data: {
      patientAge: patientAge,
      symptoms: symptoms,
      history: history,
      redFlags: redFlags,
      considerations: considerations,
      escalation: escalation,
      patientSpecificConsiderations: 'Synthesized ' + symptoms.length + ' symptom(s) against ' + guidelines.length + ' evidence-based guideline(s); ' + redFlags.length + ' red-flag symptom(s) identified; escalation: ' + escalation,
      safetyBoundary: SAFETY,
    },
    present: [
      { id: 'summary', title: 'Clinical decision-support review', kind: 'text', body: lines.join(NL) },
    ],
  }));
})();`;

const decisionConfig = createSchemaRecord({
  healthcareHome: SchemaProps.text({ description: 'Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME' }),
  minimumEvidenceSources: SchemaProps.integer({ description: 'Minimum supplied evidence sources for a reviewable synthesis', default: 1 }),
  requireClinicianReview: SchemaProps.boolean({ description: 'Keep all decision-support output provider-review only', default: true }),
})

export const healthcareClinicalDecisionSupportEvaluator = createCodeSkill({
  id: 'healthcare-clinical-decision-support-evaluator',
  name: 'Clinical Decision-Support Evaluator',
  description: 'Synthesize supplied patient symptoms, history, and evidence-based guideline inputs into provider-facing considerations with explicit safety boundaries and no autonomous diagnosis.',
  tier: 'advise',
  domainKnowledge: 'Clinical symptom assessment, patient history analysis, and evidence-based guideline synthesis',
  manifest: { sourceCode: decisionSource, configSchema: decisionConfig, persistenceEnv: 'HEALTHCARE_HOME', healthcareHome: HEALTHCARE_HOME, ui: { view: 'clinical-decision-support' }, metadata },
  inputSchema: createSchemaRecord({
    patient: SchemaProps.object({
      age: SchemaProps.integer({ description: 'Patient age in years' }),
      symptoms: SchemaProps.stringArray({ description: 'Patient-reported symptoms' }),
      history: SchemaProps.stringArray({ description: 'Relevant medical history' }),
    }, { description: 'Patient context for evaluation' }),
    symptoms: SchemaProps.stringArray({ description: 'Optional top-level symptom list' }),
    history: SchemaProps.stringArray({ description: 'Optional top-level history list' }),
    guidelines: SchemaProps.objectArray(SchemaProps.object({
      name: SchemaProps.text({ description: 'Guideline or evidence source name' }),
      keywords: SchemaProps.stringArray({ description: 'Symptom keywords covered by the guideline' }),
      pathway: SchemaProps.text({ description: 'Supplied care pathway for clinician review' }),
      evidenceLevel: SchemaProps.text({ description: 'Evidence level supplied by the user' }),
    }), { description: 'Evidence-based guideline inputs' }),
  }, { required: ['patient', 'guidelines'] }),
  outputSchema: healthcareResultSchema('Provider-facing considerations: symptoms, red flags, ranked guideline matches, escalation, and safety boundary'),
  triggers,
})

healthcareClinicalDecisionSupportEvaluator.configSchema = decisionConfig
withUxMetadata(healthcareClinicalDecisionSupportEvaluator.inputSchema as SchemaRecord)
if (healthcareClinicalDecisionSupportEvaluator.configSchema) withUxMetadata(healthcareClinicalDecisionSupportEvaluator.configSchema)
