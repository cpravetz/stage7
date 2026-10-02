import { Tool } from '../../../types';
import { financeModelingAnalysisSkill } from './finance-modeling-analysis';
import { riskRegulatoryAdvisorySkill } from './risk-regulatory-advisory';
import { budgetTrackingSkill } from './budget-tracking';
import { reportingDataOpsSkill } from './reporting-data-ops';
import { createWorkflow, AssistantWorkflow } from '../workflow-common';

export const financeSkills: Tool[] = [
  financeModelingAnalysisSkill,
  riskRegulatoryAdvisorySkill,
  budgetTrackingSkill,
  reportingDataOpsSkill,
];

export const financeWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Finance',
  productObject: 'account / transaction',
  flow: 'research → analyze → trade → report',
  skills: financeSkills,
});
