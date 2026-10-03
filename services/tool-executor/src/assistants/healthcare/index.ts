import { Tool } from '../../types';

import { createWorkflow } from '../../adk/workflow-common';

import { healthcareClinicalPracticeWorkflowEvaluator } from './skills/healthcare-clinical-practice-workflow-evaluator';
import { healthcareClinicalDecisionSupportEvaluator } from './skills/healthcare-clinical-decision-support-evaluator';
import { healthcarePatientCarePlanEducationalBriefingCopilot } from './skills/healthcare-patient-care-plan-educational-briefing-copilot';
import { APPOINTMENT_PATIENT_INTAKE_DISPATCHER as healthcareAppointmentPatientIntakeDispatcher } from './skills/healthcare-appointment-patient-intake-dispatcher';
import { careResourceReferralCoordinator } from './skills/care-resource-referral-coordinator';
import { CLINICAL_DECISION_SUPPORT } from './tools/healthcare-clinical-decision-support';
import { OPERATIONAL_ANALYTICS } from './tools/healthcare-operational-analytics';
import { PATIENT_COMMUNICATION } from './tools/healthcare-patient-communication';
import { RECORDS_SCHEDULING_OPS } from './tools/healthcare-records-scheduling-ops';
import { RESOURCE_COORDINATION } from './tools/healthcare-resource-coordination';

export const healthcareSkills: Tool[] = [
  { ...CLINICAL_DECISION_SUPPORT, isSkill: false },
  { ...RECORDS_SCHEDULING_OPS, isSkill: false },
  { ...PATIENT_COMMUNICATION, isSkill: false },
  { ...RESOURCE_COORDINATION, isSkill: false },
  { ...OPERATIONAL_ANALYTICS, isSkill: false },
  { ...healthcareClinicalPracticeWorkflowEvaluator, isSkill: true },
  { ...healthcareClinicalDecisionSupportEvaluator, isSkill: true },
  { ...healthcarePatientCarePlanEducationalBriefingCopilot, isSkill: true },
  { ...healthcareAppointmentPatientIntakeDispatcher, isSkill: true },
  { ...careResourceReferralCoordinator, isSkill: true },
];

export const healthcareCanonicalSkills: Tool[] = [
  { ...healthcareClinicalPracticeWorkflowEvaluator, isSkill: true },
  { ...healthcareClinicalDecisionSupportEvaluator, isSkill: true },
  { ...healthcarePatientCarePlanEducationalBriefingCopilot, isSkill: true },
  { ...healthcareAppointmentPatientIntakeDispatcher, isSkill: true },
  { ...careResourceReferralCoordinator, isSkill: true },
];

const ALL_HEALTHCARE_SKILLS: Tool[] = [...healthcareSkills];

export const healthcareWorkflow = createWorkflow({
  assistant: 'Healthcare',
  productObject: 'patient',
  flow: 'review → scheduling → coordination',
  skills: ALL_HEALTHCARE_SKILLS,
});
