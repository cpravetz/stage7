import { Tool } from '../../../types';
import { modelingAnalysisSkill } from './finance-modeling-analysis';
import { reportingDataOpsSkill } from './reporting-data-ops';
import { riskRegulatorySkill } from './risk-regulatory-advisory';
import { budgetTrackingSkill } from './budget-tracking';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const financeSkills: Tool[] = [
  modelingAnalysisSkill,
  reportingDataOpsSkill,
  riskRegulatorySkill,
  budgetTrackingSkill,
];

annotateStages(financeSkills, {
  'finance-modeling-analysis': 'research',
  'reporting-data-ops': 'report',
  'risk-regulatory-advisory': 'analyze',
  'budget-tracking': 'trade',
});

export const financeWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Finance',
  productObject: 'account / transaction',
  flow: 'research → analyze → trade → report',
  stages: [
    { name: 'research', description: 'Research and data gathering', stageIds: ['finance-modeling-analysis'] },
    { name: 'analyze', description: 'Analysis and risk assessment', stageIds: ['risk-regulatory-advisory'] },
    { name: 'trade', description: 'Trade planning and execution', stageIds: ['budget-tracking'] },
    { name: 'report', description: 'Reporting and tracking', stageIds: ['reporting-data-ops'] },
  ],
}, financeSkills);
