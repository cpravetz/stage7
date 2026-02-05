import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Legal Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'legal-assistant',
  name: 'Legal Assistant',
  role: 'Assists with legal research, contract analysis, and compliance',
  personality: 'Precise, thorough, professional, and detail-oriented',
  serviceId: 'legal-assistant',
  secretEnvVar: 'LEGAL_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      LegalResearchTool,
      ContractAnalysisTool,
      ComplianceTool,
      CaseManagementTool,
      LegalTemplateTool,
      StatuteDatabaseTool,
      DocumentTaggingTool,
      CaseSearchTool,
      LegalRiskAssessmentTool,
      EDiscoveryTool,
    } = await import('@cktmcs/sdk');

    return [
      new LegalResearchTool(coreEngineClient),
      new ContractAnalysisTool(coreEngineClient),
      new ComplianceTool(coreEngineClient),
      new CaseManagementTool(coreEngineClient),
      new LegalTemplateTool(coreEngineClient),
      new StatuteDatabaseTool(coreEngineClient),
      new DocumentTaggingTool(coreEngineClient),
      new CaseSearchTool(coreEngineClient),
      new LegalRiskAssessmentTool(coreEngineClient),
      new EDiscoveryTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3008'),
  urlBase: 'legal-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Legal Assistant:', error);
  process.exit(1);
});
