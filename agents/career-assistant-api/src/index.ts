import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Career Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'career-assistant',
  name: 'Career Assistant',
  role: 'Assists with career planning, skill development, and job search',
  personality: 'Supportive, motivating, insightful, and goal-oriented',
  serviceId: 'career-assistant',
  secretEnvVar: 'CAREER_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      CareerPlanner,
      SkillGapAnalyzer,
      ResumeOptimizer,
      InterviewCoach,
      JobMarketAnalyzer,
      JobMatchingTool,
      ResumeAnalyzer,
      ResumeFormatter,
      ApplicationTracker,
      ApplicationMonitor,
      FollowupAdvisor,
      InterviewQuestionGenerator,
      MockInterviewTool,
      SalaryAnalyzer,
      NegotiationAdvisor,
      OfferEvaluator,
      CareerDeveloper,
      NetworkingAdvisor,
    } = await import('@cktmcs/sdk');

    return [
      new CareerPlanner(coreEngineClient),
      new SkillGapAnalyzer(coreEngineClient),
      new ResumeOptimizer(coreEngineClient),
      new InterviewCoach(coreEngineClient),
      new JobMarketAnalyzer(coreEngineClient),
      new JobMatchingTool(coreEngineClient),
      new ResumeAnalyzer(coreEngineClient),
      new ResumeFormatter(coreEngineClient),
      new ApplicationTracker(coreEngineClient),
      new ApplicationMonitor(coreEngineClient),
      new FollowupAdvisor(coreEngineClient),
      new InterviewQuestionGenerator(coreEngineClient),
      new MockInterviewTool(coreEngineClient),
      new SalaryAnalyzer(coreEngineClient),
      new NegotiationAdvisor(coreEngineClient),
      new OfferEvaluator(coreEngineClient),
      new CareerDeveloper(coreEngineClient),
      new NetworkingAdvisor(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3013'),
  urlBase: 'career-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Career Assistant:', error);
  process.exit(1);
});
