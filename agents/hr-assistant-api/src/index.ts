import { createQuickAssistant } from '@cktmcs/sdk';

// Start the HR Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'hr-assistant',
  name: 'HR Assistant',
  role: 'Assists with recruitment, candidate management, and hiring',
  personality: 'Empathetic, organized, professional, and detail-oriented',
  serviceId: 'hr-assistant',
  secretEnvVar: 'HR_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      ATSTool,
      ResumeAnalysisTool,
      InterviewTool,
      EmailTool,
      JobBoardTool,
      LinkedInTool,
      HiringAnalyticsTool,
      AssessmentTool,
      ComplianceTool,
      CalendarTool,
    } = await import('@cktmcs/sdk');

    return [
      new ATSTool(coreEngineClient),
      new ResumeAnalysisTool(coreEngineClient),
      new InterviewTool(coreEngineClient),
      new EmailTool(coreEngineClient),
      new JobBoardTool(coreEngineClient),
      new LinkedInTool(coreEngineClient),
      new HiringAnalyticsTool(coreEngineClient),
      new AssessmentTool(coreEngineClient),
      new ComplianceTool(coreEngineClient),
      new CalendarTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3004'),
  urlBase: 'hr-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize HR Assistant:', error);
  process.exit(1);
});
