import { Tool } from '../../../types';
import { buildModelSkill } from './finance-build-model';
import { analyzeInvestmentSkill } from './finance-analyze-investment';
import { riskAssessmentSkill } from './finance-risk-assessment';
import { regulatoryComplianceSkill } from './finance-regulatory-compliance';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const financeSkills: Tool[] = [
  buildModelSkill,
  analyzeInvestmentSkill,
  riskAssessmentSkill,
  regulatoryComplianceSkill,
];

annotateStages(financeSkills, {
  'finance-build-model': 'research',
  'finance-analyze-investment': 'analyze',
  'finance-risk-assessment': 'analyze',
  'finance-regulatory-compliance': 'report',
});

export const financeWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Finance',
  productObject: 'account / transaction',
  flow: 'research → analyze → trade → report',
  stages: [
    { name: 'research', description: 'Research and data gathering', stageIds: ['finance-build-model'] },
    { name: 'analyze', description: 'Analysis and risk assessment', stageIds: ['finance-analyze-investment', 'finance-risk-assessment'] },
    { name: 'trade', description: 'Trade planning and execution', stageIds: [] },
    { name: 'report', description: 'Reporting and tracking', stageIds: ['finance-regulatory-compliance'] },
  ],
}, financeSkills);
