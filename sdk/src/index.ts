// Entry point for the Assistant SDK (Layer 2)
// This file will export the core classes: Assistant, Tool, Conversation, HumanInTheLoop.

export * from './Assistant';
export * from './Tool';
export * from './Conversation';
export * from './HumanInTheLoop';
export * from './types'; // For common interfaces like JsonSchema, ConversationEvent etc.
export * from './HttpCoreEngineClient'; // Export the concrete client implementation
export * from './additionalEndpoints';
export * from './parser/MessageParser'; // Export message parser for API middleware

// NEW: Export simplified assistant creation utilities
export * from './QuickAssistant';
export * from './AssistantMiddleware';
export * from './AssistantWebSocket';
export * from './LibrarianClient';

// Re-export AssistantServer for backward compatibility
export { createAssistantServer } from './AssistantServer';

// Re-export specific tool implementations
// PM Assistant tools
export * from './tools/JiraTool';
export * from './tools/ConfluenceTool';
export * from './tools/DataAnalysisTool';
export * from './tools/SlackTool';
export * from './tools/CalendarTool';
export * from './tools/ApplicationMonitor';
export * from './tools/ApplicationTracker';
export * from './tools/AppointmentScheduler';

// Sales Assistant tools
export * from './tools/CRMTool';
export * from './tools/EmailTool';
export * from './tools/AnalyticsTool';
export * from './tools/NegotiationAdvisor';
export * from './tools/FollowUpTool';
export * from './tools/IssueAnalysisTool'
export * from './tools/OfferEvaluator';

// Marketing Assistant tools
export * from './tools/ContentGenerationTool';
export * from './tools/ContentPlannerTool';
export * from './tools/SocialMediaTool';
export * from './tools/SEOTool';
export * from './tools/MarketResearchTool';
export * from './tools/MarketAnalysisTool';

// HR Assistant tools
export * from './tools/ATSTool';
export * from './tools/ResumeAnalysisTool';
export * from './tools/InterviewTool';
export * from './tools/LeadershipAssessmentTool';
export * from './tools/SalaryAnalyzer';
export * from './tools/HiringAnalyticsTool';
export * from './tools/JobMatchingTool';

// Finance Assistant tools
export * from './tools/FinancialAnalysisTool';
export * from './tools/PortfolioManagementTool';
export * from './tools/MarketDataTool';
export * from './tools/ReportingTool';
export * from './tools/FinancialPlanner';
export * from './tools/InvestmentAnalysisTool';
export * from './tools/InvestmentEducator';
export * from './tools/InvestmentEvaluator';
export * from './tools/PortfolioOptimizer';
export * from './tools/RiskMitigationPlanner';
export * from './tools/FinancialRiskAssessmentTool';
export * from './tools/FinancialModelingTool';
export * from './tools/FinancialDataTool';

// Support Assistant tools
export * from './tools/KnowledgeBaseTool';
export * from './tools/TicketAnalysisTool';
export * from './tools/SentimentAnalysisTool';
export * from './tools/ResponseTool';
export * from './tools/EscalationTool';
export * from './tools/FeedbackAnalysisTool';

// Legal Assistant tools
export * from './tools/LegalResearchTool';
export * from './tools/CaseSearchTool';
export * from './tools/ContractAnalysisTool';
export * from './tools/ComplianceTool';
export * from './tools/CaseManagementTool';
export * from './tools/LegalComplianceTool';
export * from './tools/EDiscoveryTool';
export * from './tools/LegalTemplateTool';
export * from './tools/LegalRiskAssessmentTool';
export * from './tools/RegulatoryTool';
export * from './tools/StatuteDatabaseTool';

// Healthcare Assistant tools
export * from './tools/MedicalRecordTool';
export * from './tools/PatientCommunicationTool';
export * from './tools/CarePlanTool';
export * from './tools/MedicalRiskAssessmentTool';
export * from './tools/HealthcareAnalyticsTool';
export * from './tools/MedicalTriageTool';

// Education Assistant tools
export * from './tools/CurriculumPlanner';
export * from './tools/AssessmentGenerator';
export * from './tools/LearningAnalyticsTool';
export * from './tools/LearningStyleAnalyzer';
export * from './tools/KnowledgeAssessmentTool';
export * from './tools/AdaptationEngine';
export * from './tools/PerformanceAnalyzer';
export * from './tools/ProgressTracker';
export * from './tools/ResourceOrganizer';
export * from './tools/ResourceTagger';
export * from './tools/ResourceAnalyzer';
export * from './tools/ContentCreator';
export * from './tools/MultimediaIntegrator';
export * from './tools/AccessibilityChecker';
export * from './tools/MotivationAnalyzer';
export * from './tools/EngagementPlanner';
export * from './tools/ActivityDesigner';

// Event Assistant tools
export * from './tools/VenueFinderTool';
export * from './tools/VendorCoordinatorTool';
export * from './tools/AttendeeTrackerTool';
export * from './tools/BudgetTrackerTool';
export * from './tools/CheckInTool';
export * from './tools/VendorDatabaseTool';
export * from './tools/PaymentTool';

// Executive Assistant tools
export * from './tools/DecisionSupportTool';
export * from './tools/ExecutivePerformanceAnalyzer';
export * from './tools/ExecutiveRiskAssessmentTool';
export * from './tools/ScenarioModeler';

// Career Assistant tools
export * from './tools/CareerPlanner';
export * from './tools/SkillGapAnalyzer';
export * from './tools/ResumeOptimizer';
export * from './tools/ResumeFormatter';
export * from './tools/ResumeAnalyzer';
export * from './tools/InterviewCoach';
export * from './tools/CareerDeveloper';
export * from './tools/CareerRoadmapGenerator';
export * from './tools/CommunicationCoach';
export * from './tools/NetworkingAdvisor';
export * from './tools/JobBoardTool';
export * from './tools/JobMarketAnalyzer';
export * from './tools/MockInterviewTool';
export * from './tools/InterviewQuestionGenerator';
export * from './tools/LinkedInTool';

// Utility tools
export * from './tools/DocumentationParserTool';
export * from './tools/FileManagementTool';
export * from './tools/MarkdownParsingTool';
export * from './tools/DocGenTool';
export * from './tools/RecordSearchTool';
export * from './tools/RecordTaggingTool';
export * from './tools/DocumentManagementTool';
export * from './tools/DocumentTaggingTool';
export * from './tools/DataCleaningTool';
export * from './tools/DecisionAnalysisTool';
export * from './tools/GoalTracker';
export * from './tools/PlanningTool';
export * from './tools/CommunicationAnalyzer';
export * from './tools/CommunicationScheduler';

// CTO Assistant tools
export * from './tools/KubernetesTool';
export * from './tools/CostOptimizationTool';
export * from './tools/TeamMetricsTool';
export * from './tools/IaCMonitoringTool';
export * from './tools/DatabaseOperationsTool';
export * from './tools/ServiceMeshTool';
export * from './tools/DisasterRecoveryTool';
export * from './tools/EventMonitorTool';
export * from './tools/management/DatadogTool';
export * from './tools/management/GitHubTool';
export * from './tools/management/AWSTool';
export * from './tools/management/GCPTool';
export * from './tools/management/AzureTool';
export * from './tools/management/PagerDutyTool';

// Restaurant Operations Assistant tools
export * from './tools/restaurant/ReservationSystemTool';
export * from './tools/restaurant/TableManagementTool';
export * from './tools/restaurant/GuestProfileTool';
export * from './tools/restaurant/ServiceFlowTool';
export * from './tools/restaurant/FloorManagementTool';
export * from './tools/restaurant/StaffSchedulerTool';
export * from './tools/restaurant/DemandForecastTool';
export * from './tools/restaurant/LaborAnalyticsTool';
export * from './tools/restaurant/ServerCommunicationTool';
export * from './tools/restaurant/PrepSchedulerTool';
export * from './tools/restaurant/KitchenDisplayTool';
export * from './tools/restaurant/StationCoordinatorTool';
export * from './tools/restaurant/RecipeManagementTool';
export * from './tools/restaurant/RecipeCostingTool';
export * from './tools/restaurant/MenuEngineeringTool';
export * from './tools/restaurant/MenuOptimizerTool';
export * from './tools/restaurant/PricingStrategyTool';
export * from './tools/restaurant/InventoryTool';
export * from './tools/restaurant/PurchaseOrderTool';
export * from './tools/restaurant/SupplierManagementTool';
export * from './tools/restaurant/OrderOptimizerTool';
export * from './tools/restaurant/WasteManagementTool';
export * from './tools/restaurant/PriceTrackingTool';
export * from './tools/restaurant/FinancialAnalyticsTool';
export * from './tools/restaurant/VarianceAnalysisTool';
export * from './tools/restaurant/TrendAnalysisTool';
export * from './tools/restaurant/SalesAnalyticsTool';
export * from './tools/restaurant/ReservationAnalyticsTool';
export * from './tools/restaurant/TableTurnoverTool';
export * from './tools/restaurant/QualityControlTool';
export * from './tools/restaurant/GuestFeedbackTool';

// Content-creator tools (re-exported with Creator prefix for backward compatibility)
export { ContentGenerationTool } from './tools/ContentGenerationTool';
export { ContentPlannerTool } from './tools/ContentPlannerTool';
export { SocialMediaTool } from './tools/SocialMediaTool';
export { SEOTool } from './tools/SEOTool';
export { AnalyticsTool } from './tools/AnalyticsTool';
export { BlogPlatformTool } from './tools/BlogPlatformTool';
export { VideoPlatformTool } from './tools/VideoPlatformTool';
export { ContentAdaptationTool } from './tools/ContentAdaptationTool';
export { AudienceInsightsTool } from './tools/AudienceInsightsTool';
export { TrendAnalysisTool } from './tools/TrendAnalysisTool';

// Scriptwriter and Songwriter Assistant tools
export * from './tools/AssessmentTool';
export * from './tools/EQAssessmentTool';

// Hotel Operations Assistant tools
export * from './tools/hotel/RoomAssignmentTool';
export * from './tools/hotel/BillingTool';
export * from './tools/hotel/RevenueTool';
export * from './tools/hotel/ReservationCoordinator';
export * from './tools/hotel/HousekeepingScheduler';
export * from './tools/hotel/MaintenanceTool';
export * from './tools/hotel/RoomStatusTool';
export * from './tools/hotel/ConciergeKnowledgeTool';
export * from './tools/hotel/ExternalBookingTool';
export * from './tools/hotel/LocalInformationTool';
export * from './tools/hotel/GuestServiceTool';
export * from './tools/hotel/TaskDispatchTool';
export * from './tools/hotel/IssueTrackerTool';
export * from './tools/hotel/GuestCommunicationTool';
export * from './tools/hotel/OperationalAnalyticsTool';
export * from './tools/hotel/StaffPerformanceTool';
export * from './tools/hotel/InventoryManagementTool';

// Hotel-specific tools (explicit exports to avoid conflicts)
export { GuestProfileTool as HotelGuestProfileTool } from './tools/hotel/GuestProfileTool';
export { ReservationSystemTool as HotelReservationSystemTool } from './tools/hotel/ReservationSystemTool';

// Sports Wager Advisor tools
export * from './tools/BettingRiskAssessmentTool';
export * from './tools/SportsDataAnalyzer';
export * from './tools/OddsDataCollector';
export * from './tools/ValueBettingAnalyzer';
export * from './tools/OddsComparisonTool';
export * from './tools/BettingPerformanceAnalyzer';
export * from './tools/BankrollManager';
export * from './tools/PerformanceOptimizer';
export * from './tools/SportsStatsCollector';
export * from './tools/PerformanceModelingTool';
export * from './tools/PredictionEngine';
export * from './tools/ResponsibleGamblingTool';
export * from './tools/GamblingRiskAnalyzer';
export * from './tools/ResponsibleGamblingPlanner';
export * from './tools/LiveSportsDataCollector';
export * from './tools/InGameAnalyzer';
export * from './tools/LiveBettingAdvisor';

// Additional specialized tools
export * from './tools/DevelopmentPlanner';
export * from './tools/ImprovementPlanner';
export * from './tools/FeedbackCollector';
export * from './tools/FollowupAdvisor';
export * from './tools/SeatingTool';
export * from './tools/ResourceCoordinator';
export * from './tools/ResourceMatcher';
export * from './tools/ResourceRecommender';
export * from './tools/PortfolioAnalyzer';
export * from './tools/PortfolioOptimizationTool';
export * from './tools/PortfolioRiskAnalyzer';
export * from './tools/MarketDataCollector';
export * from './tools/InvestmentTrendAnalysisTool';
export * from './tools/MarketAnalysisTool';
export * from './tools/ScenarioAnalyzer';
export * from './tools/ScheduleOptimizer';
export * from './tools/PresenceAnalyzer';
export * from './tools/SkillAnalysisTool';
export * from './tools/ContractTool';

export * from './AssistantServer';
export * from './tools/management';

// Simplified exports for backward compatibility
export * from './Assistant';
export * from './Tool';
export * from './Conversation';
export * from './HumanInTheLoop';
export * from './types';
export * from './HttpCoreEngineClient';

