import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Content Creator Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'content-creator-assistant',
  name: 'Content Creator Assistant',
  role: 'Assists with content creation, social media, and marketing campaigns',
  personality: 'Creative, data-driven, and strategic',
  serviceId: 'content-creator-assistant',
  secretEnvVar: 'CONTENT_CREATOR_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      TrendAnalysisTool,
      AudienceInsightsTool,
      ContentGenerationTool,
      ContentAdaptationTool,
      SEOTool,
      SocialMediaTool,
      BlogPlatformTool,
      VideoPlatformTool,
      AnalyticsTool,
      ContentPlannerTool,
    } = await import('@cktmcs/sdk');

    return [
      new TrendAnalysisTool(coreEngineClient),
      new AudienceInsightsTool(coreEngineClient),
      new ContentGenerationTool(coreEngineClient),
      new ContentAdaptationTool(coreEngineClient),
      new SEOTool(coreEngineClient),
      new SocialMediaTool(coreEngineClient),
      new BlogPlatformTool(coreEngineClient),
      new VideoPlatformTool(coreEngineClient),
      new AnalyticsTool(coreEngineClient),
      new ContentPlannerTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3014'),
  urlBase: 'content-creator-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Content Creator Assistant:', error);
  process.exit(1);
});
