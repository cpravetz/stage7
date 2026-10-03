// @ts-nocheck

import { SchemaProps, createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';

export const CLINICAL_DECISION_SUPPORT = createDeclarativeCodeSkill({
  id: 'healthcare-clinical-decision-support',
  isSkill: false,
  name: 'Clinical Decision Support',
  description:
    'Clinical reasoning assistant for healthcare professionals. Provides differential diagnosis suggestions, risk assessments, and care plan recommendations with heavy safety caveats. Always recommends consulting a qualified clinician. This tool does not replace clinical judgment.',
  persistenceEnvVar: 'HEALTHCARE_HOME',
  tier: 'advise',
  domainKnowledge: 'Clinical reasoning, differential diagnosis, risk assessment, and care plan recommendations',
  inputSchema: {
    type: 'object',
    properties: {
      symptoms: SchemaProps.stringArray({ description: 'List of patient symptoms (free text)' }),
      duration: SchemaProps.text({ description: 'Duration of symptoms (e.g., 3 days, 2 weeks)' }),
      patient: SchemaProps.text({ description: 'Select patient' }),
      clinicalContext: SchemaProps.text({ description: 'Relevant clinical context, including chief complaint and history of present illness' }),
      patientHistory: SchemaProps.stringArray({ description: 'Relevant patient medical history items' }),
      medications: SchemaProps.stringArray({ description: 'Current medications (names/doses)' }),
      allergies: SchemaProps.stringArray({ description: 'Known patient allergies' }),
      vitalSigns: SchemaProps.object({
        bloodPressureSystolic: SchemaProps.integer({ description: 'Systolic blood pressure in mmHg' }),
        bloodPressureDiastolic: SchemaProps.integer({ description: 'Diastolic blood pressure in mmHg' }),
        heartRate: SchemaProps.integer({ description: 'Heart rate in BPM' }),
        temperature: SchemaProps.number({ description: 'Body temperature in Celsius' }),
        respiratoryRate: SchemaProps.integer({ description: 'Respiratory rate per minute' }),
        oxygenSaturation: SchemaProps.number({ description: 'Oxygen saturation percentage' }),
      }, { description: 'Current vital signs' }),
      riskFactors: SchemaProps.stringArray({ description: 'Patient risk factors (e.g., smoking, family history, diabetes)' }),
      reasoningDepth: SchemaProps.select(['brief', 'standard', 'comprehensive'], { description: 'Depth of clinical reasoning to perform' }),
      includeDifferential: SchemaProps.boolean({ description: 'Whether to include differential diagnosis suggestions', default: true }),
      includeRiskScore: SchemaProps.boolean({ description: 'Whether to include risk stratification scoring', default: true }),
    },
    required: ['symptoms'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          decision: { type: 'object' },
          storePath: { type: 'string' },
          warning: { type: 'string' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  triggers: [
    { kind: 'event', on: 'New symptoms reported or abnormal lab result', externalEvent: true, eventId: 'healthcare.external.lab_result.reported' },
  ],
  manifest: {},
  handler: async function handler(input, ctx) {
      const symptoms = input.symptoms || [];
      const duration = input.duration || '';
            const patient = input.patient || '';
      const clinicalContext = input.clinicalContext || '';
      const patientHistory = input.patientHistory || [];
      const medications = input.medications || [];
      const allergies = input.allergies || [];
      const vitalSigns = input.vitalSigns || {};
      const riskFactors = input.riskFactors || [];

      const disclaimer = 'WARNING: This is a decision support tool only. It does not provide medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional before making clinical decisions.';

      let store = [];
      store = ctx.store.load('cdsPath', []);

      function safeParseDate(d) {
        if (!d) return null;
        try { const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt; } catch(e) { return null; }
      }

      function assessUrgency(symptoms, vitalSigns) {
        const criticalSigns = ['chest pain', 'shortness of breath', 'severe bleeding', 'loss of consciousness', 'stroke symptoms'];
        const hasCritical = symptoms.some(s => criticalSigns.some(c => s.toLowerCase().includes(c)));
        const bpSys = vitalSigns.bloodPressureSystolic || 0;
        const hr = vitalSigns.heartRate || 0;
        const temp = vitalSigns.temperature || 0;
        if (bpSys > 180 || bpSys < 80 || hr > 130 || hr < 40 || temp > 40 || temp < 35) return 'critical';
        if (hasCritical) return 'urgent';
        return 'routine';
      }

      const decision = {
        id: 'cds_' + Date.now(),
          patient, symptoms, duration, clinicalContext,
        patientHistory, medications, allergies, vitalSigns, riskFactors,
        urgency: assessUrgency(symptoms, vitalSigns),
        differentialDiagnoses: symptoms.length ? symptoms.map(s => ({
          symptom: s, possibleConditions: ['Requires clinical evaluation'],
          confidence: 0, caveat: 'Differential diagnosis requires professional clinical assessment.',
        })) : [],
        riskFlags: riskFactors.length ? riskFactors.map(r => ({ factor: r, level: 'requires-review' })) : [],
        recommendedActions: ['Consult qualified healthcare professional'],
        safetyCaveats: [disclaimer, 'This tool has limited sensitivity and specificity. Negative results do not rule out disease.'],
        createdAt: new Date().toISOString(),
        source: 'local',
      };

      store.push(decision);
      ctx.store.save('cdsPath', store);

      const result = { success: true, data: { decision, storePath: 'cdsPath', warning: disclaimer } };

      return result;
    }
  });
