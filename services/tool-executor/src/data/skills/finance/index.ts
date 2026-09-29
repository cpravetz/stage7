import { Tool } from '../../../types';
import { financeModelingAnalysisSkill } from './finance-modeling-analysis';
import { riskRegulatoryAdvisorySkill } from './risk-regulatory-advisory';
import { budgetTrackingSkill } from './budget-tracking';
import { reportingDataOpsSkill } from './reporting-data-ops';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const financeSkills: Tool[] = [
  financeModelingAnalysisSkill,
  riskRegulatoryAdvisorySkill,
  budgetTrackingSkill,
  reportingDataOpsSkill,
];

annotateStages(financeSkills, {
  'finance-modeling-analysis': 'research',
  'risk-regulatory-advisory': 'analyze',
  'budget-tracking': 'trade',
  'reporting-data-ops': 'report',
});

export const financeWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Finance',
  productObject: 'account / transaction',
  flow: 'research → analyze → trade → report',
  stages: [
    { name: 'research', description: 'Research and financial modeling', stageIds: ['finance-modeling-analysis'] },
    { name: 'analyze', description: 'Analysis and risk/regulatory advisory', stageIds: ['risk-regulatory-advisory'] },
    { name: 'trade', description: 'Budget tracking and variance control', stageIds: ['budget-tracking'] },
    { name: 'report', description: 'Reporting and data ops', stageIds: ['reporting-data-ops'] },
  ],
}, financeSkills);
