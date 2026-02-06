import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Marketing Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'marketing-assistant',
  name: 'Marketing Assistant',
  role: 'Assists with marketing campaigns, content creation, and social media',
  personality: 'Creative, data-driven, engaging, and strategic',
  serviceId: 'marketing-assistant',
  secretEnvVar: 'MARKETING_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      ContentGenerationTool,
      SocialMediaTool,
      SEOTool,
      AnalyticsTool,
      MarketResearchTool,
      AudienceInsightsTool,
      EmailTool,
      DocumentManagementTool,
    } = await import('@cktmcs/sdk');

    return [
      new ContentGenerationTool(coreEngineClient),
      new SocialMediaTool(coreEngineClient),
      new SEOTool(coreEngineClient),
      new AnalyticsTool(coreEngineClient),
      new MarketResearchTool(coreEngineClient),
      new AudienceInsightsTool(coreEngineClient),
      new EmailTool(coreEngineClient),
      new DocumentManagementTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3003'),
  urlBase: 'marketing-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Marketing Assistant:', error);
  process.exit(1);
});
