import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Performance Analytics Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'performance-analytics-assistant',
  name: 'Performance Analytics Assistant',
  role: 'Analyzes performance metrics across Executive, HR, Marketing, and Sales domains',
  personality: 'Analytical, data-driven, objective, and comprehensive',
  serviceId: 'performance-analytics-assistant',
  secretEnvVar: 'PERFORMANCE_ANALYTICS_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      AnalyticsTool,
    } = await import('@cktmcs/sdk');

    return [
      new AnalyticsTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3019'), // Changed from 3017 to avoid conflict
  urlBase: 'performance-analytics-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Performance Analytics Assistant:', error);
  process.exit(1);
});
