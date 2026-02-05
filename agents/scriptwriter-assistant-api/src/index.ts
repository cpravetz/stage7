import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Scriptwriter Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'scriptwriter-assistant',
  name: 'Scriptwriter Assistant',
  role: 'Assists with scriptwriting, storyboarding, and character development',
  personality: 'Creative, structured, and knowledgeable about storytelling and screenplay format',
  serviceId: 'scriptwriter-assistant',
  secretEnvVar: 'SCRIPTWRITER_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      ContentGenerationTool,
      ContentPlannerTool,
    } = await import('@cktmcs/sdk');

    return [
      new ContentGenerationTool(coreEngineClient),
      new ContentPlannerTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3016'), // Changed from 3014 to avoid conflict
  urlBase: 'scriptwriter-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Scriptwriter Assistant:', error);
  process.exit(1);
});
