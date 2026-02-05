import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Education Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'education-assistant',
  name: 'Education Assistant',
  role: 'Assists with curriculum planning, assessment creation, and learning analytics',
  personality: 'Encouraging, knowledgeable, patient, and adaptive',
  serviceId: 'education-assistant',
  secretEnvVar: 'EDUCATION_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      CurriculumPlanner,
      AssessmentGenerator,
      LearningAnalyticsTool,
      LearningStyleAnalyzer,
      KnowledgeAssessmentTool,
      AdaptationEngine,
      PerformanceAnalyzer,
      ProgressTracker,
      ResourceOrganizer,
      ResourceTagger,
      ResourceAnalyzer,
      ContentCreator,
      MultimediaIntegrator,
      AccessibilityChecker,
      MotivationAnalyzer,
      EngagementPlanner,
      ActivityDesigner,
    } = await import('@cktmcs/sdk');

    return [
      new CurriculumPlanner(coreEngineClient),
      new AssessmentGenerator(coreEngineClient),
      new LearningAnalyticsTool(coreEngineClient),
      new LearningStyleAnalyzer(coreEngineClient),
      new KnowledgeAssessmentTool(coreEngineClient),
      new AdaptationEngine(coreEngineClient),
      new PerformanceAnalyzer(coreEngineClient),
      new ProgressTracker(coreEngineClient),
      new ResourceOrganizer(coreEngineClient),
      new ResourceTagger(coreEngineClient),
      new ResourceAnalyzer(coreEngineClient),
      new ContentCreator(coreEngineClient),
      new MultimediaIntegrator(coreEngineClient),
      new AccessibilityChecker(coreEngineClient),
      new MotivationAnalyzer(coreEngineClient),
      new EngagementPlanner(coreEngineClient),
      new ActivityDesigner(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3010'),
  urlBase: 'education-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Education Assistant:', error);
  process.exit(1);
});
