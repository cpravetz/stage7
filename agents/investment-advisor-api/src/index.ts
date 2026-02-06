import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Investment Advisor Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'investment-advisor',
  name: 'Investment Advisor',
  role: 'Provides portfolio management, investment strategy, market analysis, and asset allocation guidance',
  personality: 'Knowledgeable, strategic, data-driven, and client-focused',
  serviceId: 'investment-advisor',
  secretEnvVar: 'INVESTMENT_ADVISOR_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      PortfolioManagementTool,
      MarketDataTool,
      InvestmentAnalysisTool,
      FinancialRiskAssessmentTool,
      MarketResearchTool,
      PortfolioOptimizer,
      InvestmentEvaluator,
      FinancialPlanner,
    } = await import('@cktmcs/sdk');

    return [
      new PortfolioManagementTool(coreEngineClient),
      new MarketDataTool(coreEngineClient),
      new InvestmentAnalysisTool(coreEngineClient),
      new FinancialRiskAssessmentTool(coreEngineClient),
      new MarketResearchTool(coreEngineClient),
      new PortfolioOptimizer(coreEngineClient),
      new InvestmentEvaluator(coreEngineClient),
      new FinancialPlanner(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3025'),
  urlBase: 'investment-advisor-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Investment Advisor:', error);
  process.exit(1);
});
