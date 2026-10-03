import { Tool } from '../../types';
import { INVESTMENT_MARKET_DATA } from './skills/investment-market-data';
import { PORTFOLIO_RISK_ADVISORY } from './skills/portfolio-risk-advisory';
import { RESEARCH_PLANNING } from './skills/research-planning';
import { BILL_PAY_REBALANCING } from './skills/bill-pay-rebalancing';
import { createWorkflow } from '../../adk/workflow-common';

export const investmentSkills: Tool[] = [
  INVESTMENT_MARKET_DATA,
  PORTFOLIO_RISK_ADVISORY,
  RESEARCH_PLANNING,
  BILL_PAY_REBALANCING,
];

export const investmentWorkflow = createWorkflow({
  assistant: 'Investment',
  productObject: 'portfolio / security',
  flow: 'research → analyze → trade → track',
  skills: investmentSkills,
});
