import { Tool } from '../../types';
import { financeModelingAnalysisSkill } from './skills/finance-modeling-analysis';
import { riskRegulatoryAdvisorySkill } from './skills/risk-regulatory-advisory';
import { budgetTrackingSkill } from './skills/budget-tracking';
import { reportingDataOpsSkill } from './skills/reporting-data-ops';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';

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
