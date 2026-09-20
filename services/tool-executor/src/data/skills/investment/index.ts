import { Tool } from '../../../types';
import { INVESTMENT_MARKET_DATA } from './investment-market-data';
import { PORTFOLIO_RISK_ADVISORY } from './portfolio-risk-advisory';
import { RESEARCH_PLANNING } from './research-planning';
import { BILL_PAY_REBALANCING } from './bill-pay-rebalancing';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const investmentSkills: Tool[] = [
  INVESTMENT_MARKET_DATA,
  PORTFOLIO_RISK_ADVISORY,
  RESEARCH_PLANNING,
  BILL_PAY_REBALANCING,
];

annotateStages(investmentSkills, {
  'investment-market-data': 'research',
  'portfolio-risk-advisory': 'analyze',
  'research-planning': 'track',
  'bill-pay-rebalancing': 'trade',
});

export const investmentWorkflow = createWorkflow({
  assistant: 'Investment',
  productObject: 'portfolio / security',
  flow: 'research → analyze → trade → track',
  stages: [
    { name: 'research', description: 'Market research and data', stageIds: ['investment-market-data'] },
    { name: 'analyze', description: 'Portfolio analysis and risk', stageIds: ['portfolio-risk-advisory'] },
    { name: 'trade', description: 'Trading and rebalancing', stageIds: ['bill-pay-rebalancing'] },
    { name: 'track', description: 'Portfolio tracking and monitoring', stageIds: ['research-planning'] },
  ],
}, investmentSkills);
