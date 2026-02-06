import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Healthcare Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'healthcare-assistant',
  name: 'Healthcare Assistant',
  role: 'Assists with medical records, patient communication, and care planning',
  personality: 'Compassionate, professional, detail-oriented, and HIPAA-compliant',
  serviceId: 'healthcare-assistant',
  secretEnvVar: 'HEALTHCARE_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      MedicalRecordTool,
      PatientCommunicationTool,
      CarePlanTool,
      MedicalTriageTool,
      AppointmentScheduler,
      ScheduleOptimizer,
      RecordTaggingTool,
      RecordSearchTool,
      ResourceCoordinator,
      ResourceMatcher,
      CommunicationScheduler,
      MedicalRiskAssessmentTool,
      HealthcareAnalyticsTool,
    } = await import('@cktmcs/sdk');

    return [
      new MedicalRecordTool(coreEngineClient),
      new PatientCommunicationTool(coreEngineClient),
      new CarePlanTool(coreEngineClient),
      new MedicalTriageTool(coreEngineClient),
      new AppointmentScheduler(coreEngineClient),
      new ScheduleOptimizer(coreEngineClient),
      new RecordTaggingTool(coreEngineClient),
      new RecordSearchTool(coreEngineClient),
      new ResourceCoordinator(coreEngineClient),
      new ResourceMatcher(coreEngineClient),
      new CommunicationScheduler(coreEngineClient),
      new MedicalRiskAssessmentTool(coreEngineClient),
      new HealthcareAnalyticsTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3009'),
  urlBase: 'healthcare-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Healthcare Assistant:', error);
  process.exit(1);
});
