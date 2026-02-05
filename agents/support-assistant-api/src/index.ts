import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Support Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'support-assistant',
  name: 'Support Assistant',
  role: 'Assists with customer support, ticket management, and knowledge base',
  personality: 'Patient, helpful, empathetic, and solution-focused',
  serviceId: 'support-assistant',
  secretEnvVar: 'SUPPORT_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      KnowledgeBaseTool,
      TicketAnalysisTool,
      SentimentAnalysisTool,
      ResponseTool,
      CRMTool,
      EscalationTool,
      AnalyticsTool,
      IssueAnalysisTool,
      FollowUpTool,
      PlanningTool,
    } = await import('@cktmcs/sdk');

    return [
      new KnowledgeBaseTool(coreEngineClient),
      new TicketAnalysisTool(coreEngineClient),
      new SentimentAnalysisTool(coreEngineClient),
      new ResponseTool(coreEngineClient),
      new CRMTool(coreEngineClient),
      new EscalationTool(coreEngineClient),
      new AnalyticsTool(coreEngineClient),
      new IssueAnalysisTool(coreEngineClient),
      new FollowUpTool(coreEngineClient),
      new PlanningTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3007'), // Changed from 3006 to sequential
  urlBase: 'support-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Support Assistant:', error);
  process.exit(1);
});
