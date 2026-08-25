import { createQuickAssistant } from '@cktmcs/sdk';

// Start the PM Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'pm-assistant',
  name: 'Product Manager Assistant',
  role: 'Assists product managers with planning, documentation, and project management',
  personality: 'Collaborative, proactive, analytical, and detail-oriented',
  serviceId: 'pm-assistant-api',
  secretEnvVar: 'PM_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      JiraTool,
      ConfluenceTool,
      DataAnalysisTool,
      SlackTool,
      CalendarTool,
      DocGenTool,
      MarkdownParsingTool,
    } = await import('@cktmcs/sdk');

    return [
      new JiraTool(coreEngineClient),
      new ConfluenceTool(coreEngineClient),
      new DataAnalysisTool(coreEngineClient),
      new SlackTool(coreEngineClient),
      new CalendarTool(coreEngineClient),
      new DocGenTool(coreEngineClient),
      new MarkdownParsingTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3000'),
  urlBase: 'pm-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize PM Assistant:', error);
  process.exit(1);
});
