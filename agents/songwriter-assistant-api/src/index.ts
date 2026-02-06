import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Songwriter Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'songwriter-assistant',
  name: 'Songwriter Assistant',
  role: 'Assists with songwriting, lyrics, and musical composition',
  personality: 'Creative, inspirational, and knowledgeable about music theory and composition',
  serviceId: 'songwriter-assistant',
  secretEnvVar: 'SONGWRITER_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      ContentGenerationTool,
      TrendAnalysisTool,
    } = await import('@cktmcs/sdk');

    return [
      new ContentGenerationTool(coreEngineClient),
      new TrendAnalysisTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3015'), // Changed from 3014 to avoid conflict with content-creator
  urlBase: 'songwriter-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Songwriter Assistant:', error);
  process.exit(1);
});
