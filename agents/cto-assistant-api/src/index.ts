import { createQuickAssistant } from '@cktmcs/sdk';

// Start the CTO Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'cto-assistant',
  name: 'CTO Assistant',
  role: 'Provides a unified command center for a CTO to monitor, manage, and strategize across Software Engineering, Security & Compliance, and Cloud Operations.',
  personality: 'Data-driven, analytical, and proactive. Concise, precise, and capable of synthesizing complex technical and operational data into high-level, actionable insights.',
  serviceId: 'cto-assistant',
  secretEnvVar: 'CTO_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      JiraTool,
      DatadogTool,
      GitHubTool,
      AWSTool,
      GCPTool,
      AzureTool,
      PagerDutyTool,
      KubernetesTool,
      CostOptimizationTool,
      TeamMetricsTool,
      IaCMonitoringTool,
      DatabaseOperationsTool,
      ServiceMeshTool,
      DisasterRecoveryTool,
    } = await import('@cktmcs/sdk');

    return [
      new JiraTool(coreEngineClient),
      new DatadogTool(coreEngineClient),
      new GitHubTool(coreEngineClient),
      new AWSTool(coreEngineClient),
      new GCPTool(coreEngineClient),
      new AzureTool(coreEngineClient),
      new PagerDutyTool(coreEngineClient),
      new KubernetesTool(coreEngineClient),
      new CostOptimizationTool(coreEngineClient),
      new TeamMetricsTool(coreEngineClient),
      new IaCMonitoringTool(coreEngineClient),
      new DatabaseOperationsTool(coreEngineClient),
      new ServiceMeshTool(coreEngineClient),
      new DisasterRecoveryTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3021'),
  urlBase: 'cto-assistant',
}).catch((error: Error) => {
  console.error('Failed to initialize CTO Assistant:', error);
  process.exit(1);
});
