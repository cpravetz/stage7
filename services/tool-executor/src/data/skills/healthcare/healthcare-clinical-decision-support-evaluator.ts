import { SchemaRecord } from '../../../types'
import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory'

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

const decisionSource = `(async () => {   const input = typeof __tool_input !== 'undefined' ? __tool_input : {};   const healthcareHome = process.env.HEALTHCARE_HOME || '/tmp/healthcare';   const patient = input.patient && typeof input.patient === 'object' ? input.patient : {};   const symptoms = Array.isArray(patient.symptoms) ? patient.symptoms : (Array.isArray(input.symptoms) ? input.symptoms : []);   const history = Array.isArray(patient.history) ? patient.history : (Array.isArray(input.history) ? input.history : []);   const guidelines = Array.isArray(input.guidelines) ? input.guidelines : [];   if (!symptoms.length || !guidelines.length) {     console.log(JSON.stringify({ success: false, status: 'not-connected', error: 'Not connected: patient symptoms and evidence-based guideline inputs are required' }));     return;   }   const redFlags = symptoms.filter((item) => /chest pain|difficulty breathing|stroke|severe bleed|unconscious|suicidal/i.test(String(item)));   const considerations = guidelines.map((guideline) => {     const item = guideline && typeof guideline === 'object' ? guideline : {};     const keywords = Array.isArray(item.keywords) ? item.keywords : [];     const relevance = symptoms.filter((symptom) => keywords.some((keyword) => String(symptom).toLowerCase().includes(String(keyword).toLowerCase()))).length;     return { guideline: item.name || 'unnamed guideline', relevance, pathway: item.pathway || 'clinician review required', evidenceLevel: item.evidenceLevel || 'not supplied' };   }).sort((left, right) => right.relevance - left.relevance || String(left.guideline).localeCompare(String(right.guideline)));   const result = {     success: true,     status: 'local',     data: {       patientAge: patient.age === undefined ? null : Number(patient.age),       symptoms,       history,       redFlags,       considerations,       escalation: redFlags.length ? 'urgent clinician or emergency-pathway review required' : 'routine clinician review',       patientSpecificConsiderations: 'Synthesize the supplied symptoms and history against each guideline pathway; rank by keyword relevance and flag any red-flag symptoms for urgent escalation.',       safetyBoundary: 'Decision support and education only: do not diagnose, prescribe, change treatment, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician must review all outputs.'     },     warning: 'Decision support and education only: do not diagnose, prescribe, change treatment, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician must review all outputs.'   };   console.log(JSON.stringify(result)); })();`

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
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the synthesis completed' }),
    data: SchemaProps.object({}, { description: 'Provider-facing considerations and safety boundary' }),
    warning: SchemaProps.text({ description: 'Clinical safety disclaimer' }),
    error: SchemaProps.text({ description: 'Failure message' }),
  }, { required: ['success', 'data'] }),
  triggers,
})

healthcareClinicalDecisionSupportEvaluator.configSchema = decisionConfig
withUxMetadata(healthcareClinicalDecisionSupportEvaluator.inputSchema as SchemaRecord)
withUxMetadata(healthcareClinicalDecisionSupportEvaluator.outputSchema as SchemaRecord)
if (healthcareClinicalDecisionSupportEvaluator.configSchema) withUxMetadata(healthcareClinicalDecisionSupportEvaluator.configSchema)
