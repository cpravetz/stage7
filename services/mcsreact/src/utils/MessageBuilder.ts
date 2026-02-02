/**
 * MessageBuilder - Constructs properly formatted tool invocation messages
 * for sending to the postoffice with full routing and parameter information
 */

export interface ToolParameter {
  [key: string]: any;
}

export interface ToolInvocationMessage {
  type: 'toolInvocation';
  missionId: string;
  clientId: string;
  destinationApi: string;
  toolName: string;
  methodName: string;
  parameters: {
    conversationId: string;
    options?: ToolParameter;
  };
  metadata?: {
    timestamp: string;
    source: string;
  };
}

export interface PostOfficeMessage {
  type: 'userMessage';
  sender: 'user';
  recipient: 'MissionControl';
  content: ToolInvocationMessage;
  clientId: string;
}

/**
 * Build a tool invocation message for sending to PostOffice
 */
export class MessageBuilder {
  static buildToolInvocation(
    missionId: string,
    clientId: string,
    destinationApi: string,
    toolName: string,
    methodName: string,
    conversationId: string,
    options?: ToolParameter,
    metadata?: { timestamp?: string; source?: string }
  ): PostOfficeMessage {
    return {
      type: 'userMessage',
      sender: 'user',
      recipient: 'MissionControl',
      content: {
        type: 'toolInvocation',
        missionId,
        clientId,
        destinationApi,
        toolName,
        methodName,
        parameters: {
          conversationId,
          ...(options && { options }),
        },
        metadata: {
          timestamp: metadata?.timestamp || new Date().toISOString(),
          source: metadata?.source || 'web-ui',
        },
      },
      clientId,
    };
  }

  /**
   * Helper to build TrendAnalysisTool message
   */
  static trendAnalysisTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    destinationApi: string = 'content-creator-assistant',
    options?: {
      contentGoals?: string[];
      targetAudience?: string;
      timeframe?: string;
      includeRegional?: boolean;
    }
  ): PostOfficeMessage {
    return this.buildToolInvocation(
      missionId,
      clientId,
      destinationApi,
      'TrendAnalysisTool',
      'getTrendingTopics',
      conversationId,
      options
    );
  }

  /**
   * Helper to build ContentGenerationTool message
   */
  static contentGenerationTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    destinationApi: string = 'content-creator-assistant',
    options?: {
      contentType?: string;
      topic?: string;
      platforms?: string[];
      targetAudience?: string;
      tone?: string;
      length?: 'short' | 'medium' | 'long';
    }
  ): PostOfficeMessage {
    return this.buildToolInvocation(
      missionId,
      clientId,
      destinationApi,
      'ContentGenerationTool',
      'generateContent',
      conversationId,
      options
    );
  }

  /**
   * Helper to build AnalyticsTool message
   */
  static analyticsTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    destinationApi: string = 'content-creator-assistant',
    options?: {
      platforms?: string[];
      timeRange?: string;
      contentGoals?: string[];
      targetAudience?: string;
      metrics?: string[];
    }
  ): PostOfficeMessage {
    return this.buildToolInvocation(
      missionId,
      clientId,
      destinationApi,
      'AnalyticsTool',
      'getEngagementMetrics',
      conversationId,
      options
    );
  }

  /**
   * Helper to build SEOTool message
   */
  static seoTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    destinationApi: string = 'content-creator-assistant',
    options?: {
      keywords?: string[];
      targetRanking?: number;
      competitorUrls?: string[];
      includeBacklinkAnalysis?: boolean;
      generateSuggestions?: boolean;
    }
  ): PostOfficeMessage {
    return this.buildToolInvocation(
      missionId,
      clientId,
      destinationApi,
      'SEOTool',
      'analyzePerformance',
      conversationId,
      options
    );
  }

  /**
   * Helper to build SocialMediaTool message
   */
  static socialMediaTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    destinationApi: string = 'content-creator-assistant',
    options?: {
      platforms?: string[];
      timeframe?: string;
      contentTypes?: string[];
      engagementMetrics?: boolean;
    }
  ): PostOfficeMessage {
    return this.buildToolInvocation(
      missionId,
      clientId,
      destinationApi,
      'SocialMediaTool',
      'analyzePerformance',
      conversationId,
      options
    );
  }

  // ==================== CAREER ASSISTANT ====================
  static careerPlanner(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'career-assistant', 'CareerPlanner', 'createPlan', conversationId, options);
  }

  static skillGapAnalyzer(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'career-assistant', 'SkillGapAnalyzer', 'analyzeGaps', conversationId, options);
  }

  static resumeOptimizer(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'career-assistant', 'ResumeOptimizer', 'optimizeResume', conversationId, options);
  }

  static interviewCoach(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'career-assistant', 'InterviewCoach', 'conductMockInterview', conversationId, options);
  }

  // ==================== CTO ASSISTANT ====================
  static jiraTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'cto-assistant', 'JiraTool', 'listIssues', conversationId, options);
  }

  static datadogTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'cto-assistant', 'DatadogTool', 'getMetrics', conversationId, options);
  }

  static kubernetesTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'cto-assistant', 'KubernetesTool', 'checkHealth', conversationId, options);
  }

  // ==================== EVENT ASSISTANT ====================
  static venueFinder(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'event-assistant', 'VenueFinderTool', 'findVenues', conversationId, options);
  }

  static vendorCoordinator(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'event-assistant', 'VendorCoordinatorTool', 'manageVendors', conversationId, options);
  }

  static budgetTracker(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'event-assistant', 'BudgetTrackerTool', 'trackBudget', conversationId, options);
  }

  // ==================== EDUCATION ASSISTANT ====================
  static curriculumPlanner(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'education-assistant', 'CurriculumPlanner', 'createCurriculum', conversationId, options);
  }

  static assessmentGenerator(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'education-assistant', 'AssessmentGenerator', 'generateAssessment', conversationId, options);
  }

  // ==================== EXECUTIVE ASSISTANT ====================
  static decisionSupportTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'executive-assistant', 'DecisionSupportTool', 'analyzeDecisions', conversationId, options);
  }

  static calendarTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'executive-assistant', 'CalendarTool', 'manageCalendar', conversationId, options);
  }

  // ==================== FINANCE ASSISTANT ====================
  static financialAnalysisTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'finance-assistant', 'FinancialAnalysisTool', 'analyzeFinances', conversationId, options);
  }

  static portfolioManagementTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'finance-assistant', 'PortfolioManagementTool', 'managePortfolio', conversationId, options);
  }

  static marketDataTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'finance-assistant', 'MarketDataTool', 'getMarketData', conversationId, options);
  }

  // ==================== HEALTHCARE ASSISTANT ====================
  static medicalRecordTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'healthcare-assistant', 'MedicalRecordTool', 'manageMedicalRecords', conversationId, options);
  }

  static carePlanTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'healthcare-assistant', 'CarePlanTool', 'createCarePlan', conversationId, options);
  }

  // ==================== HOTEL OPS ASSISTANT ====================
  static roomAssignmentTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'hotel-ops-assistant', 'RoomAssignmentTool', 'assignRoom', conversationId, options);
  }

  static hotelGuestProfileTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'hotel-ops-assistant', 'HotelGuestProfileTool', 'manageGuestProfile', conversationId, options);
  }

  static billingTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'hotel-ops-assistant', 'BillingTool', 'manageBilling', conversationId, options);
  }

  // ==================== HR ASSISTANT ====================
  static atsTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'hr-assistant', 'ATSTool', 'manageJobs', conversationId, options);
  }

  static resumeAnalysisTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'hr-assistant', 'ResumeAnalysisTool', 'analyzeResumes', conversationId, options);
  }

  static interviewTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'hr-assistant', 'InterviewTool', 'scheduleInterview', conversationId, options);
  }

  // ==================== LEGAL ASSISTANT ====================
  static caseManagementTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'legal-assistant', 'CaseManagementTool', 'manageCases', conversationId, options);
  }

  static contractAnalysisTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'legal-assistant', 'ContractAnalysisTool', 'analyzeContract', conversationId, options);
  }

  static complianceTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'legal-assistant', 'ComplianceTool', 'checkCompliance', conversationId, options);
  }

  // ==================== MARKETING ASSISTANT ====================
  static contentGenerationToolMarketing(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'marketing-assistant', 'ContentGenerationTool', 'generateContent', conversationId, options);
  }

  static socialMediaToolMarketing(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'marketing-assistant', 'SocialMediaTool', 'manageSocialMedia', conversationId, options);
  }

  static seoToolMarketing(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'marketing-assistant', 'SEOTool', 'optimizeForSEO', conversationId, options);
  }

  static analyticsToolMarketing(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'marketing-assistant', 'AnalyticsTool', 'analyzeMetrics', conversationId, options);
  }

  // ==================== PM ASSISTANT ====================
  static jiraToolPM(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'pm-assistant', 'JiraTool', 'manageProjects', conversationId, options);
  }

  static confluenceTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'pm-assistant', 'ConfluenceTool', 'manageDocumentation', conversationId, options);
  }

  static dataAnalysisTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'pm-assistant', 'DataAnalysisTool', 'analyzeData', conversationId, options);
  }

  // ==================== RESTAURANT OPS ASSISTANT ====================
  static reservationSystemTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'restaurant-ops-assistant', 'ReservationSystemTool', 'manageReservations', conversationId, options);
  }

  static tableManagementTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'restaurant-ops-assistant', 'TableManagementTool', 'assignTables', conversationId, options);
  }

  // ==================== SUPPORT ASSISTANT ====================
  static ticketAnalysisTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'support-assistant', 'TicketAnalysisTool', 'analyzeTickets', conversationId, options);
  }

  static sentimentAnalysisTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'support-assistant', 'SentimentAnalysisTool', 'analyzeSentiment', conversationId, options);
  }

  // ==================== SCRIPTWRITER ASSISTANT ====================
  static contentGenerationToolScriptwriter(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'scriptwriter-assistant', 'ContentGenerationTool', 'generateScript', conversationId, options);
  }

  // ==================== SONGWRITER ASSISTANT ====================
  static contentGenerationToolSongwriter(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'songwriter-assistant', 'ContentGenerationTool', 'generateSong', conversationId, options);
  }

  // ==================== SALES ASSISTANT ====================
  static crmTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'sales-assistant', 'CRMTool', 'manageCRM', conversationId, options);
  }

  // ==================== PERFORMANCE ANALYTICS ====================
  static performanceAnalyticsTool(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'performance-analytics-api', 'PerformanceAnalyticsTool', 'analyzePerformance', conversationId, options);
  }

  // ==================== SPORTS WAGER ADVISOR ====================
  static sportsDataAnalyzer(
    missionId: string,
    clientId: string,
    conversationId: string,
    options?: ToolParameter
  ): PostOfficeMessage {
    return this.buildToolInvocation(missionId, clientId, 'sports-wager-advisor-api', 'SportsDataAnalyzer', 'analyzeOdds', conversationId, options);
  }
}

/**
 * Generic helper for any tool in any assistant
 */
export function buildToolMessage(
  missionId: string,
  clientId: string,
  conversationId: string,
  config: {
    destinationApi: string;
    toolName: string;
    methodName: string;
    options?: ToolParameter;
  }
): PostOfficeMessage {
  return MessageBuilder.buildToolInvocation(
    missionId,
    clientId,
    config.destinationApi,
    config.toolName,
    config.methodName,
    conversationId,
    config.options
  );
}
