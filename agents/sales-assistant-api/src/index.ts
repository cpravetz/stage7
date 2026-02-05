import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Sales Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'sales-assistant',
  name: 'Sales Assistant',
  role: 'Assists with sales tasks, CRM management, and lead tracking',
  personality: 'Professional, proactive, results-oriented, and persuasive',
  serviceId: 'sales-assistant-api',
  secretEnvVar: 'SALES_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      CRMTool,
      EmailTool,
      CalendarTool,
      AnalyticsTool,
      DocumentManagementTool,
    } = await import('@cktmcs/sdk');

    return [
      new CRMTool(coreEngineClient),
      new EmailTool(coreEngineClient),
      new CalendarTool(coreEngineClient),
      new AnalyticsTool(coreEngineClient),
      new DocumentManagementTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3005'),
  urlBase: 'sales-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Sales Assistant:', error);
  process.exit(1);
});
