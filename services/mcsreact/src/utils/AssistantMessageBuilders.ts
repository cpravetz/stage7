/**
 * AssistantMessageBuilders - Domain-specific message builders for each assistant
 * Extends MessageBuilder with helper methods for common tools in each domain
 */

import { MessageBuilder, buildToolMessage, ToolParameter, PostOfficeMessage } from './MessageBuilder';

/**
 * Career Assistant message builders
 */
export class CareerAssistantMessageBuilder {
  static updateProfile(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      currentRole?: string;
      yearsExperience?: number;
      skills?: string[];
      certifications?: string[];
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'career-assistant',
      toolName: 'CareerRoadmapGenerator',
      methodName: 'updateProfile',
      options,
    });
  }

  static analyzeResume(
    missionId: string,
    clientId: string,
    conversationId: string,
    resumeContent?: string,
    options?: {
      targetRole?: string;
      evaluateMetrics?: string[];
      formatChecks?: boolean;
      compareToRole?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'career-assistant',
      toolName: 'ResumeAnalyzer',
      methodName: 'analyzeResume',
      options: {
        resumeContent,
        ...options,
      },
    });
  }

  static trackApplication(
    missionId: string,
    clientId: string,
    conversationId: string,
    applicationId: string,
    options?: {
      organizationMethod?: 'byDate' | 'byCompany' | 'byRole' | 'byLocation';
      groupByStatus?: boolean;
      sortBy?: string;
      includePrioritization?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'career-assistant',
      toolName: 'ApplicationTracker',
      methodName: 'trackApplication',
      options: {
        applicationId,
        ...options,
      },
    });
  }

  static generateDevelopmentPlan(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      planType?: 'shortTerm' | 'mediumTerm' | 'longTerm';
      focusAreas?: ('technical' | 'leadership' | 'interpersonal')[];
      includeTimeline?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'career-assistant',
      toolName: 'DevelopmentPlanner',
      methodName: 'generatePlan',
      options,
    });
  }
}

/**
 * Investment Advisor Assistant message builders
 */
export class InvestmentAdvisorMessageBuilder {
  static analyzePortfolio(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      optimizationMethod?: 'meanVariance' | 'blackLitterman' | 'riskParity';
      includeConstraintVisualization?: boolean;
      generateAlternatives?: boolean;
      riskAversion?: number;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'investment-advisor',
      toolName: 'PortfolioManagementTool',
      methodName: 'analyzePortfolio',
      options,
    });
  }

  static analyzeGoals(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      assumptions?: string[];
      timeHorizon?: string;
      investmentStyle?: 'aggressive' | 'moderate' | 'conservative';
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'investment-advisor',
      toolName: 'InvestmentStrategyTool',
      methodName: 'analyzeGoals',
      options,
    });
  }

  static assessRisk(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      exposureMetrics?: ('delta' | 'beta' | 'volatility' | 'vAR' | 'cVAR')[];
      benchmarkComparison?: boolean;
      stressTestScenarios?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'investment-advisor',
      toolName: 'FinancialRiskAssessmentTool',
      methodName: 'assessRisk',
      options,
    });
  }
}

/**
 * Finance Assistant message builders
 */
export class FinanceAssistantMessageBuilder {
  static analyzePortfolio(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      optimizationMethod?: 'meanVariance' | 'blackLitterman' | 'riskParity';
      includeConstraintVisualization?: boolean;
      generateAlternatives?: boolean;
      riskAversion?: number;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'finance-assistant',
      toolName: 'PortfolioOptimizationTool',
      methodName: 'analyzePortfolio',
      options,
    });
  }

  static analyzeGoals(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      assumptions?: string[];
      includeInflation?: boolean;
      considerTaxes?: boolean;
      fundingMethods?: ('certification' | 'course' | 'bootcamp')[];
      timeHorizon?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'finance-assistant',
      toolName: 'FinancialGoalAnalyzer',
      methodName: 'analyzeGoals',
      options,
    });
  }

  static assessRisk(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      exposureMetrics?: ('delta' | 'beta' | 'volatility' | 'vAR' | 'cVAR')[];
      benchmarkComparison?: boolean;
      stressTestScenarios?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'finance-assistant',
      toolName: 'PortfolioRiskAnalyzer',
      methodName: 'assessRisk',
      options,
    });
  }
}

/**
 * Healthcare Assistant message builders
 */
export class HealthcareAssistantMessageBuilder {
  static analyzeTreatmentOutcomes(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      outcomeMetrics?: ('efficacy' | 'safety' | 'quality' | 'cost' | 'satisfaction')[];
      timeframe?: '30day' | '90day' | '1year' | 'all';
      compareToBaseline?: boolean;
      identifyOutliers?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'healthcare-assistant',
      toolName: 'HealthcareAnalyticsTool',
      methodName: 'analyzeTreatmentOutcomes',
      options,
    });
  }

  static identifyCareGaps(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      gapCategories?: ('preventive' | 'chronic' | 'acute' | 'followUp' | 'specialty')[];
      severityLevel?: 'high' | 'medium' | 'low' | 'all';
      prioritizeByPatients?: boolean;
      generateClosurePlans?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'healthcare-assistant',
      toolName: 'HealthcareAnalyticsTool',
      methodName: 'identifyCareGaps',
      options,
    });
  }
}

/**
 * Sales Assistant message builders
 */
export class SalesAssistantMessageBuilder {
  static createDeal(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      deal?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'PipelineManagementTool',
      methodName: 'createDeal',
      options,
    });
  }

  static updateDeal(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      dealId?: string;
      updates?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'PipelineManagementTool',
      methodName: 'updateDeal',
      options,
    });
  }

  static deleteDeal(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      dealId?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'PipelineManagementTool',
      methodName: 'deleteDeal',
      options,
    });
  }

  static createLead(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      lead?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'LeadManagementTool',
      methodName: 'createLead',
      options,
    });
  }

  static updateLead(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      leadId?: string;
      updates?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'LeadManagementTool',
      methodName: 'updateLead',
      options,
    });
  }

  static deleteLead(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      leadId?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'LeadManagementTool',
      methodName: 'deleteLead',
      options,
    });
  }

  static updateCustomer(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      customerId?: string;
      updates?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'CustomerManagementTool',
      methodName: 'updateCustomer',
      options,
    });
  }

  static createActivity(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      activity?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'ActivityTrackingTool',
      methodName: 'createActivity',
      options,
    });
  }

  static updateActivity(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      activityId?: string;
      updates?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'ActivityTrackingTool',
      methodName: 'updateActivity',
      options,
    });
  }

  static createForecast(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      forecast?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'SalesForecastingTool',
      methodName: 'createForecast',
      options,
    });
  }

  static updateForecast(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      forecastId?: string;
      updates?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'SalesForecastingTool',
      methodName: 'updateForecast',
      options,
    });
  }

  static generateReport(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      reportType?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'ReportingCenterTool',
      methodName: 'generateReport',
      options,
    });
  }

  static analyzeDeal(
    missionId: string,
    clientId: string,
    conversationId: string,
    dealId: string,
    options?: {
      evaluationCriteria?: string[];
      weightCriteria?: boolean;
      tradeoffTypes?: ('cost' | 'time' | 'quality' | 'risk' | 'scalability')[];
      riskProfile?: 'conservative' | 'moderate' | 'aggressive';
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'DecisionSupportTool',
      methodName: 'analyzeDeal',
      options: {
        dealId,
        ...options,
      },
    });
  }

  static analyzeMarket(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      analysisType?: string;
      timeFrame?: string;
      benchmarkIndex?: string;
      returnType?: string;
      adjustForInflation?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sales-assistant',
      toolName: 'InvestmentAnalysisTool',
      methodName: 'analyzeMarket',
      options,
    });
  }
}

/**
 * Legal Assistant message builders
 */
export class LegalAssistantMessageBuilder {
  static performEDiscovery(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      processingLevel?: 'basic' | 'intermediate' | 'advanced' | 'forensic';
      flagRelevantTerms?: boolean;
      detectPII?: boolean;
      extractMetadata?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'legal-assistant',
      toolName: 'EDiscoveryTool',
      methodName: 'performEDiscovery',
      options,
    });
  }

  static analyzeCompliance(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      regulationTypes?: ('eeoc' | 'ada' | 'gdpr' | 'complianceLocal')[];
      flagIssues?: boolean;
      provideRecommendations?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'legal-assistant',
      toolName: 'ComplianceTool',
      methodName: 'analyzeCompliance',
      options,
    });
  }
}

/**
 * HR Assistant message builders
 */
export class HRAssistantMessageBuilder {
  static analyzeHiringMetrics(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      analysisDepth?: 'summary' | 'detailed' | 'comprehensive';
      timeGranularity?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
      identifyTrends?: boolean;
      identifySeasonalPatterns?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'hr-assistant',
      toolName: 'HiringAnalyticsTool',
      methodName: 'analyzeMetrics',
      options,
    });
  }

  static feedbackCollection(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      collectionMethod?: '360' | 'survey' | 'interview' | 'focus_group' | 'mixed';
      confidentiality?: 'anonymous' | 'confidential' | 'identified';
      includeDownward?: boolean;
      includeUpward?: boolean;
      includePeer?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'hr-assistant',
      toolName: 'FeedbackCollector',
      methodName: 'collectFeedback',
      options,
    });
  }
}

/**
 * Sports Betting Assistant message builders
 */
export class SportsBettingAssistantMessageBuilder {
  static collectOddsData(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      updateFrequency?: 'realtime' | 'hourly' | 'daily';
      validateAccuracy?: boolean;
      detectArbitrageOpportunities?: boolean;
      generateComparativeReport?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sports-wager-advisor-api',
      toolName: 'OddsDataCollector',
      methodName: 'collectOdds',
      options,
    });
  }

  static assessBettingRisk(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      profilerType?: 'standardized' | 'behavioral' | 'ASTI';
      includeHistoricalContext?: boolean;
      assessIncreasingBets?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sports-wager-advisor-api',
      toolName: 'BettingRiskAssessmentTool',
      methodName: 'assessRisk',
      options,
    });
  }

  static manageBankroll(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      unitSizingMethod?: 'percentageBased' | 'fixedAmount' | 'kellyFraction' | 'conservative';
      kellyFractionValue?: number;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'sports-wager-advisor-api',
      toolName: 'BankrollManager',
      methodName: 'manageBankroll',
      options,
    });
  }
}

/**
 * Event Assistant message builders
 */
export class EventAssistantMessageBuilder {
  static monitorEvent(
    missionId: string,
    clientId: string,
    conversationId: string,
    eventId: string,
    options?: {
      updateFrequency?: 'realtime' | 'hourly' | 'daily';
      alertOnDelay?: boolean;
      trackBy?: string;
      completionThreshold?: number;
      flagIssues?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'event-assistant',
      toolName: 'EventMonitorTool',
      methodName: 'monitorEvent',
      options: {
        eventId,
        ...options,
      },
    });
  }

  static scheduleEventCommunication(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      optimizationGoal?: 'engagement' | 'compliance' | 'costReduction';
      channelPreferences?: ('sms' | 'email' | 'push' | 'voice')[];
      scheduleMessages?: boolean;
      optimizeCommunicationTiming?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'event-assistant',
      toolName: 'CommunicationScheduler',
      methodName: 'scheduleCommunication',
      options,
    });
  }
}

/**
 * Education Assistant message builders
 */
export class EducationAssistantMessageBuilder {
  static generateMaterials(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      materialsTypes?: ('handout' | 'slides' | 'workbook' | 'reference')[];
      educationLevel?: string;
      includeAnswers?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'education-assistant',
      toolName: 'ContentCreator',
      methodName: 'generateMaterials',
      options,
    });
  }

  static createCurriculum(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      planType?: 'detailed' | 'phased' | 'agile' | 'waterfall';
      includeTimelines?: boolean;
      includeResources?: boolean;
      assignOwnership?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'education-assistant',
      toolName: 'DevelopmentPlanner',
      methodName: 'createCurriculum',
      options,
    });
  }
}

/**
 * Marketing Assistant message builders
 */
export class MarketingAssistantMessageBuilder {
  static analyzeCampaign(
    missionId: string,
    clientId: string,
    conversationId: string,
    campaignId: string,
    options?: {
      metricsType?: 'engagement' | 'reach' | 'conversion' | 'roi' | 'all';
      timeRange?: 'week' | 'month' | 'quarter' | 'year';
      compareToBaseline?: boolean;
      identifyTrends?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'marketing-assistant',
      toolName: 'AnalyticsTool',
      methodName: 'analyzeCampaign',
      options: {
        campaignId,
        ...options,
      },
    });
  }
}

/**
 * Support Assistant message builders
 */
export class SupportAssistantMessageBuilder {
  static trackCase(
    missionId: string,
    clientId: string,
    conversationId: string,
    caseId: string,
    options?: {
      organizationScheme?: 'chronological' | 'byType' | 'byParty' | 'byIssue';
      groupRelatedDocs?: boolean;
      generateFolderStructure?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'support-assistant',
      toolName: 'CaseManagementTool',
      methodName: 'trackCase',
      options: {
        caseId,
        ...options,
      },
    });
  }
}

/**
 * Content Creator Assistant message builders
 */
export class ContentCreatorAssistantMessageBuilder {
  static generateContent(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      contentType?: string;
      topic?: string;
      platforms?: string[];
      targetAudience?: string;
      tone?: string;
      goal?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'content-creator-assistant',
      toolName: 'ContentGenerationTool',
      methodName: 'generateContent',
      options,
    });
  }

  static analyzeTrends(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      contentGoals?: string[];
      targetAudience?: string;
      timeframe?: string;
      includeRegional?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'content-creator-assistant',
      toolName: 'TrendAnalysisTool',
      methodName: 'analyzeTrends',
      options,
    });
  }

  static analyzeAudience(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      audience?: string;
      generateInsights?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'content-creator-assistant',
      toolName: 'AnalyticsTool',
      methodName: 'analyzeAudience',
      options,
    });
  }

  static saveContent(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      contentId?: string;
      title?: string;
      platform?: string;
      status?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'content-creator-assistant',
      toolName: 'ContentGenerationTool',
      methodName: 'saveContent',
      options,
    });
  }

  static deleteContent(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      contentId?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'content-creator-assistant',
      toolName: 'ContentGenerationTool',
      methodName: 'deleteContent',
      options,
    });
  }

  static removeGoal(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      goalId?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'content-creator-assistant',
      toolName: 'ContentGenerationTool',
      methodName: 'removeGoal',
      options,
    });
  }
}

/**
 * Executive Coach Assistant message builders
 */
export class ExecutiveCoachAssistantMessageBuilder {
  static startAssessment(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: any
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'executive-assistant',
      toolName: 'LeadershipAssessmentTool',
      methodName: 'startAssessment',
      options,
    });
  }

  static updateAssessment(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      assessmentId?: string;
      updates?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'executive-assistant',
      toolName: 'LeadershipAssessmentTool',
      methodName: 'updateAssessment',
      options,
    });
  }

  static createPlan(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      plan?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'executive-assistant',
      toolName: 'DevelopmentPlanningTool',
      methodName: 'createPlan',
      options,
    });
  }

  static updatePlan(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      planId?: string;
      updates?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'executive-assistant',
      toolName: 'DevelopmentPlanningTool',
      methodName: 'updatePlan',
      options,
    });
  }
}

/**
 * Restaurant Operations Assistant message builders
 */
export class RestaurantOperationsAssistantBuilder {
  static createReservation(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      guestName?: string;
      partySize?: number;
      date?: string;
      time?: string;
      specialRequests?: string;
      status?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'ReservationsTool',
      methodName: 'createReservation',
      options,
    });
  }

  static updateReservation(
    missionId: string,
    clientId: string,
    conversationId: string,
    reservationId: string,
    options?: {
      guestName?: string;
      partySize?: number;
      date?: string;
      time?: string;
      specialRequests?: string;
      status?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'ReservationsTool',
      methodName: 'updateReservation',
      options: {
        reservationId,
        ...options,
      },
    });
  }

  static cancelReservation(
    missionId: string,
    clientId: string,
    conversationId: string,
    reservationId: string,
    options?: any
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'ReservationsTool',
      methodName: 'cancelReservation',
      options: {
        reservationId,
        ...options,
      },
    });
  }

  static assignTable(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      reservationId?: string;
      tableNumber?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'TableManagementTool',
      methodName: 'assignTable',
      options,
    });
  }

  static updateTableStatus(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      tableNumber?: string;
      status?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'TableManagementTool',
      methodName: 'updateTableStatus',
      options,
    });
  }

  static scheduleStaff(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      staffId?: string;
      date?: string;
      startTime?: string;
      endTime?: string;
      role?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'StaffSchedulingTool',
      methodName: 'scheduleStaff',
      options,
    });
  }

  static updateStaffAvailability(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      staffId?: string;
      available?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'StaffSchedulingTool',
      methodName: 'updateAvailability',
      options,
    });
  }

  static createOrder(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      tableNumber?: string;
      items?: any[];
      priority?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'KitchenOperationsTool',
      methodName: 'createOrder',
      options,
    });
  }

  static updateOrderStatus(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      orderId?: string;
      status?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'KitchenOperationsTool',
      methodName: 'updateOrderStatus',
      options,
    });
  }

  static updateInventory(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      itemId?: string;
      quantity?: number;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'InventoryManagementTool',
      methodName: 'updateInventory',
      options,
    });
  }

  static createPurchaseOrder(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      itemId?: string;
      quantity?: number;
      vendor?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'InventoryManagementTool',
      methodName: 'createPurchaseOrder',
      options,
    });
  }

  static updateMenuItem(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      itemId?: string;
      name?: string;
      price?: number;
      description?: string;
      available?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'MenuManagementTool',
      methodName: 'updateMenuItem',
      options,
    });
  }

  static addMenuItem(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      name?: string;
      category?: string;
      price?: number;
      description?: string;
      ingredients?: string;
      available?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'MenuManagementTool',
      methodName: 'addMenuItem',
      options,
    });
  }

  static getFinancialAnalytics(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      timeRange?: string;
      metricsType?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'FinancialAnalyticsTool',
      methodName: 'getAnalytics',
      options,
    });
  }

  static addFeedback(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      guestName?: string;
      rating?: number;
      comments?: string;
      date?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'GuestFeedbackTool',
      methodName: 'addFeedback',
      options,
    });
  }

  static respondToFeedback(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      feedbackId?: string;
      response?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'restaurant-ops-assistant',
      toolName: 'GuestFeedbackTool',
      methodName: 'respondToFeedback',
      options,
    });
  }
}

/**
 * CTO Assistant message builders
 */
export class CTOAssistantMessageBuilder {
  static analyzeArchitecture(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      analysisType?: 'scalability' | 'security' | 'performance' | 'cost';
      focusAreas?: string[];
      generateRecommendations?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'cto-assistant',
      toolName: 'ArchitectureTool',
      methodName: 'analyzeArchitecture',
      options,
    });
  }

  static evaluateStrategy(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      strategyType?: 'technology' | 'team' | 'budget' | 'timeline';
      includeRiskAssessment?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'cto-assistant',
      toolName: 'StrategyTool',
      methodName: 'evaluateStrategy',
      options,
    });
  }
}

/**
 * Customer Support Assistant message builders
 */
export class CustomerSupportAssistantMessageBuilder {
  static trackCase(
    missionId: string,
    clientId: string,
    conversationId: string,
    caseId: string,
    options?: {
      organizationScheme?: 'chronological' | 'byType' | 'byParty' | 'byIssue';
      groupRelatedDocs?: boolean;
      generateFolderStructure?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'support-assistant',
      toolName: 'CaseManagementTool',
      methodName: 'trackCase',
      options: {
        caseId,
        ...options,
      },
    });
  }
}

/**
 * Hotel Operations Assistant message builders
 */
export class HotelOperationsAssistantMessageBuilder {
  static createReservation(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      guestName?: string;
      partySize?: number;
      date?: string;
      time?: string;
      specialRequests?: string;
      status?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'hotel-ops-assistant',
      toolName: 'ReservationsTool',
      methodName: 'createReservation',
      options,
    });
  }

  static updateReservation(
    missionId: string,
    clientId: string,
    conversationId: string,
    reservationId: string,
    options?: {
      guestName?: string;
      partySize?: number;
      date?: string;
      time?: string;
      specialRequests?: string;
      status?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'hotel-ops-assistant',
      toolName: 'ReservationsTool',
      methodName: 'updateReservation',
      options: {
        reservationId,
        ...options,
      },
    });
  }

  static assignRoom(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      guestId?: string;
      roomNumber?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'hotel-ops-assistant',
      toolName: 'RoomManagementTool',
      methodName: 'assignRoom',
      options,
    });
  }

  static createGuestRequest(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      guestId?: string;
      requestType?: string;
      description?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'hotel-ops-assistant',
      toolName: 'GuestServicesTool',
      methodName: 'createRequest',
      options,
    });
  }

  static manageReservations(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      reservationId?: string;
      action?: 'create' | 'update' | 'cancel' | 'check-in' | 'check-out';
      reservationData?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'hotel-ops-assistant',
      toolName: 'ReservationsTool',
      methodName: 'manageReservations',
      options,
    });
  }

  static manageStaff(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      staffId?: string;
      action?: 'assign' | 'reassign' | 'schedule' | 'update';
      staffData?: any;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'hotel-ops-assistant',
      toolName: 'StaffManagementTool',
      methodName: 'manageStaff',
      options,
    });
  }

  static monitorOperations(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      metricsType?: 'occupancy' | 'revenue' | 'performance' | 'guest-satisfaction';
      timeRange?: 'daily' | 'weekly' | 'monthly';
      analyzeData?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'hotel-ops-assistant',
      toolName: 'OperationalAnalyticsTool',
      methodName: 'monitorOperations',
      options,
    });
  }
}

/**
 * Performance Analytics Assistant message builders
 */
export class PerformanceAnalyticsAssistantMessageBuilder {
  static analyzeMetrics(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      metricsType?: 'financial' | 'operational' | 'customer' | 'employee';
      timeRange?: 'week' | 'month' | 'quarter' | 'year';
      identifyTrends?: boolean;
      generateInsights?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'performance-analytics-api',
      toolName: 'AnalyticsTool',
      methodName: 'analyzeMetrics',
      options,
    });
  }

  static generateReport(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      reportType?: 'summary' | 'detailed' | 'executive';
      includeVisualizations?: boolean;
      targetAudience?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'performance-analytics-api',
      toolName: 'ReportGenerator',
      methodName: 'generateReport',
      options,
    });
  }
}

/**
 * PM (Product Manager) Assistant message builders
 */
export class PmAssistantMessageBuilder {
  static createEpic(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      epicName?: string;
      description?: string;
      priority?: 'high' | 'medium' | 'low';
      estimatedDuration?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'pm-assistant',
      toolName: 'EpicPlanner',
      methodName: 'createEpic',
      options,
    });
  }

  static trackProgress(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      projectId?: string;
      includeBurndown?: boolean;
      identifyBlockers?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'pm-assistant',
      toolName: 'ProgressTracker',
      methodName: 'trackProgress',
      options,
    });
  }
}

/**
 * Scriptwriter Assistant message builders
 */
export class ScriptwriterAssistantMessageBuilder {
  static createScene(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      sceneNumber?: number;
      setting?: string;
      characters?: string[];
      description?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'scriptwriter-assistant-api',
      toolName: 'ScenePlanner',
      methodName: 'createScene',
      options,
    });
  }

  static writeDialogue(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      characterName?: string;
      dialogueText?: string;
      action?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'scriptwriter-assistant-api',
      toolName: 'DialogueWriter',
      methodName: 'writeDialogue',
      options,
    });
  }

  static analyzeScript(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      analysisType?: 'structure' | 'pacing' | 'dialogue' | 'characterArc' | 'overall';
      includeRecommendations?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'scriptwriter-assistant-api',
      toolName: 'ScriptAnalyzer',
      methodName: 'analyzeScript',
      options,
    });
  }
}

/**
 * Songwriter Assistant message builders
 */
export class SongwriterAssistantMessageBuilder {
  static writeLyrics(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      section?: 'verse' | 'chorus' | 'bridge' | 'outro';
      theme?: string;
      tone?: string;
      length?: number;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'songwriter-assistant-api',
      toolName: 'LyricsWriter',
      methodName: 'writeLyrics',
      options,
    });
  }

  static composeMelody(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      key?: string;
      tempo?: number;
      style?: string;
      description?: string;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'songwriter-assistant-api',
      toolName: 'MelodyComposer',
      methodName: 'composeMelody',
      options,
    });
  }

  static analyzeSong(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: {
      analysisType?: 'harmony' | 'rhythm' | 'lyricsQuality' | 'overall';
      includeRecommendations?: boolean;
    }
  ): PostOfficeMessage {
    return buildToolMessage(missionId, clientId, conversationId, {
      destinationApi: 'songwriter-assistant-api',
      toolName: 'SongAnalyzer',
      methodName: 'analyzeSong',
      options,
    });
  }
}

// Export all builders as a convenient registry
export const AssistantMessageBuilders = {
  Career: CareerAssistantMessageBuilder,
  Finance: FinanceAssistantMessageBuilder,
  InvestmentAdvisor: InvestmentAdvisorMessageBuilder,
  Healthcare: HealthcareAssistantMessageBuilder,
  Sales: SalesAssistantMessageBuilder,
  Legal: LegalAssistantMessageBuilder,
  HR: HRAssistantMessageBuilder,
  SportsBetting: SportsBettingAssistantMessageBuilder,
  Event: EventAssistantMessageBuilder,
  Education: EducationAssistantMessageBuilder,
  Marketing: MarketingAssistantMessageBuilder,
  Support: SupportAssistantMessageBuilder,
  ContentCreator: ContentCreatorAssistantMessageBuilder,
  ExecutiveCoach: ExecutiveCoachAssistantMessageBuilder,
  RestaurantOperations: RestaurantOperationsAssistantBuilder,
  CTO: CTOAssistantMessageBuilder,
  CustomerSupport: CustomerSupportAssistantMessageBuilder,
  HotelOperations: HotelOperationsAssistantMessageBuilder,
  PerformanceAnalytics: PerformanceAnalyticsAssistantMessageBuilder,
  PM: PmAssistantMessageBuilder,
  Scriptwriter: ScriptwriterAssistantMessageBuilder,
  Songwriter: SongwriterAssistantMessageBuilder,
};
