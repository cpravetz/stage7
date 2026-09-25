import { Tool, SchemaRecord } from '../../../types'
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

const carePlanSource = `(async () => {   const input = typeof __tool_input !== 'undefined' ? __tool_input : {};   const healthcareHome = process.env.HEALTHCARE_HOME || '/tmp/healthcare';   const condition = String(input.condition || input.careNeed || '');   const goals = Array.isArray(input.goals) ? input.goals : [];   const medications = Array.isArray(input.medications) ? input.medications : [];   const educationTopics = Array.isArray(input.educationTopics) ? input.educationTopics : [];   if (!condition || !goals.length || !educationTopics.length) {     console.log(JSON.stringify({ success: false, status: 'not-connected', error: 'Not connected: condition, goals, and education topics are required' }));     return;   }   const medicationLines = medications.map((medication) => {     const name = typeof medication === 'string' ? medication : ((medication && medication.name) || 'unnamed therapy');     const instruction = typeof medication === 'string' ? '' : String((medication && medication.instruction) || '');     return { name, instruction: instruction || 'verify the instruction with the prescribing clinician' };   });   const topicLines = educationTopics.map((topic) => ({ topic: String(topic), format: 'plain-language briefing', content: 'Explain only the supplied clinician-approved topic and invite questions.' }));   const result = {     success: true,     status: 'local',     data: {       condition,       goals: goals.map((goal, index) => ({ rank: index + 1, goal: String(goal), measure: 'patient-reported or clinician-defined target' })),       medications: medicationLines,       education: topicLines,       briefing: {         purpose: 'This briefing summarizes the supplied care plan for ' + condition + '.',         medicationSafety: 'Medication details are copied from the supplied plan; do not start, stop, or change a dose from this briefing.',         teachBack: ['Please describe the plan in your own words.', 'What questions or concerns should the care team address?']       },       disclaimer: 'This briefing is for education and decision support only. Do not start, stop, or change treatment from this output. A qualified clinician must review all content.'     },     warning: 'Decision support and education only: do not diagnose, prescribe, change treatment, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician must review all outputs.'   };   console.log(JSON.stringify(result)); })()`

const carePlanConfig = createSchemaRecord({
  healthcareHome: SchemaProps.text({ description: 'Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME' }),
  defaultLanguage: SchemaProps.text({ description: 'Default language for the educational briefing', default: 'English' }),
  requireClinicianReview: SchemaProps.boolean({ description: 'Require clinician review before using the briefing', default: true }),
})

const healthcarePatientCarePlanEducationalBriefingCopilot = createCodeSkill({
  id: 'healthcare-patient-care-plan-educational-briefing-copilot',
  name: 'Patient Care Plan & Educational Briefing Co-Pilot',
  description: 'Generate a structured, plain-language care-plan briefing from supplied clinician-authored condition, goals, medications, and education topics without changing treatment.',
  tier: 'aid',
  domainKnowledge: 'Care plan development, medication management, and patient education briefing',
  manifest: { sourceCode: carePlanSource, configSchema: carePlanConfig, persistenceEnv: 'HEALTHCARE_HOME', healthcareHome: HEALTHCARE_HOME, ui: { view: 'care-plan' }, metadata },
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
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the briefing was generated' }),
    data: SchemaProps.object({}, { description: 'Structured care plan and educational briefing' }),
    warning: SchemaProps.text({ description: 'Clinical safety disclaimer' }),
    error: SchemaProps.text({ description: 'Failure message' }),
  }, { required: ['success', 'data'] }),
  triggers,
})

healthcarePatientCarePlanEducationalBriefingCopilot.configSchema = carePlanConfig

withUxMetadata(healthcarePatientCarePlanEducationalBriefingCopilot.inputSchema as SchemaRecord)
withUxMetadata(healthcarePatientCarePlanEducationalBriefingCopilot.outputSchema as SchemaRecord)
if (healthcarePatientCarePlanEducationalBriefingCopilot.configSchema) withUxMetadata(healthcarePatientCarePlanEducationalBriefingCopilot.configSchema)

export { healthcarePatientCarePlanEducationalBriefingCopilot }
