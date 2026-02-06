import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Finance Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'finance-assistant',
  name: 'Finance Assistant',
  role: 'Assists with enterprise financial analysis, budgeting, forecasting, and financial reporting for CFOs and financial analysts',
  personality: 'Analytical, precise, trustworthy, and detail-oriented',
  serviceId: 'finance-assistant',
  secretEnvVar: 'FINANCE_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      FinancialAnalysisTool,
      ReportingTool,
      FinancialDataTool,
      FinancialModelingTool,
      FinancialRiskAssessmentTool,
      BudgetTrackerTool,
      DataCleaningTool,
      RegulatoryTool,
      DocumentManagementTool,
    } = await import('@cktmcs/sdk');

    return [
      new FinancialAnalysisTool(coreEngineClient),
      new ReportingTool(coreEngineClient),
      new FinancialDataTool(coreEngineClient),
      new FinancialModelingTool(coreEngineClient),
      new FinancialRiskAssessmentTool(coreEngineClient),
      new BudgetTrackerTool(coreEngineClient),
      new DataCleaningTool(coreEngineClient),
      new RegulatoryTool(coreEngineClient),
      new DocumentManagementTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3006'), // Changed from 3005 to avoid conflict with sales-assistant
  urlBase: 'finance-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Finance Assistant:', error);
  process.exit(1);
});
