import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Executive Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'executive-assistant',
  name: 'Executive Assistant',
  role: 'Assists executives with decision support, performance analysis, and strategic planning',
  personality: 'Professional, strategic, discreet, and highly organized',
  serviceId: 'executive-assistant',
  secretEnvVar: 'EXECUTIVE_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      DecisionSupportTool,
      ExecutivePerformanceAnalyzer,
      CalendarTool,
      EmailTool,
      LeadershipAssessmentTool,
      FeedbackAnalysisTool,
      SkillGapAnalyzer,
      DevelopmentPlanner,
      ResourceRecommender,
      ExecutiveRiskAssessmentTool,
      ScenarioModeler,
      FeedbackCollector,
      ImprovementPlanner,
      CommunicationAnalyzer,
      EQAssessmentTool,
      CommunicationCoach,
      CareerPlanner,
      PresenceAnalyzer,
      CareerRoadmapGenerator,
    } = await import('@cktmcs/sdk');

    return [
      new DecisionSupportTool(coreEngineClient),
      new ExecutivePerformanceAnalyzer(coreEngineClient),
      new CalendarTool(coreEngineClient),
      new EmailTool(coreEngineClient),
      new LeadershipAssessmentTool(coreEngineClient),
      new FeedbackAnalysisTool(coreEngineClient),
      new SkillGapAnalyzer(coreEngineClient),
      new DevelopmentPlanner(coreEngineClient),
      new ResourceRecommender(coreEngineClient),
      new ExecutiveRiskAssessmentTool(coreEngineClient),
      new ScenarioModeler(coreEngineClient),
      new FeedbackCollector(coreEngineClient),
      new ImprovementPlanner(coreEngineClient),
      new CommunicationAnalyzer(coreEngineClient),
      new EQAssessmentTool(coreEngineClient),
      new CommunicationCoach(coreEngineClient),
      new CareerPlanner(coreEngineClient),
      new PresenceAnalyzer(coreEngineClient),
      new CareerRoadmapGenerator(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3012'),
  urlBase: 'executive-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Executive Assistant:', error);
  process.exit(1);
});
