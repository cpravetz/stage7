import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Sports Wager Advisor using the simplified SDK pattern
createQuickAssistant({
  id: 'sports-wager-advisor',
  name: 'Sports Wager Advisor',
  role: 'Provides comprehensive sports betting analysis, odds evaluation, risk assessment, and strategic wagering recommendations',
  personality: 'Analytical, data-driven, strategic, and responsible',
  serviceId: 'sports-wager-advisor',
  secretEnvVar: 'SPORTS_WAGER_ADVISOR_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      BettingRiskAssessmentTool,
      SportsDataAnalyzer,
      OddsDataCollector,
      ValueBettingAnalyzer,
      OddsComparisonTool,
      BettingPerformanceAnalyzer,
      BankrollManager,
      PerformanceOptimizer,
      SportsStatsCollector,
      PerformanceModelingTool,
      PredictionEngine,
      ResponsibleGamblingTool,
      GamblingRiskAnalyzer,
      ResponsibleGamblingPlanner,
      LiveSportsDataCollector,
      InGameAnalyzer,
      LiveBettingAdvisor,
    } = await import('@cktmcs/sdk');

    return [
      new BettingRiskAssessmentTool(coreEngineClient),
      new SportsDataAnalyzer(coreEngineClient),
      new OddsDataCollector(coreEngineClient),
      new ValueBettingAnalyzer(coreEngineClient),
      new OddsComparisonTool(coreEngineClient),
      new BettingPerformanceAnalyzer(coreEngineClient),
      new BankrollManager(coreEngineClient),
      new PerformanceOptimizer(coreEngineClient),
      new SportsStatsCollector(coreEngineClient),
      new PerformanceModelingTool(coreEngineClient),
      new PredictionEngine(coreEngineClient),
      new ResponsibleGamblingTool(coreEngineClient),
      new GamblingRiskAnalyzer(coreEngineClient),
      new ResponsibleGamblingPlanner(coreEngineClient),
      new LiveSportsDataCollector(coreEngineClient),
      new InGameAnalyzer(coreEngineClient),
      new LiveBettingAdvisor(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3020'),
  urlBase: 'sports-wager-advisor-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Sports Wager Advisor:', error);
  process.exit(1);
});
