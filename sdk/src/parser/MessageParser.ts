/**
 * MessageParser - Converts frontend text messages into structured action/payload objects
 * This is the critical missing piece that enables parameter passing from frontend to tools
 */

import { Tool } from '../Tool';

export interface ParsedMessage {
  action: string;
  toolName: string;
  payload: Record<string, any>;
  isStructured: boolean; // true if parsed from object, false if converted from text
  confidence: 'high' | 'medium' | 'low';
}

export interface MessageParserConfig {
  tools: Tool[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class MessageParser {
  private tools: Map<string, Tool>;
  private toolActions: Map<string, string[]> = new Map();
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(config: MessageParserConfig) {
    this.tools = new Map(config.tools.map(t => [t.name.toLowerCase(), t]));
    this.logLevel = config.logLevel || 'info';
    this.buildActionMap();
  }

  /**
   * Build a map of tool names to their available actions
   */
  private buildActionMap() {
    // Common action patterns by tool type
    const actionPatterns: Record<string, string[]> = {
      // Career Tools
      CareerPlanner: ['assessTrajectory', 'identifyOpportunities', 'analyzeCareerPathways', 'generateCareerReport', 'modelCareerScenarios'],
      SkillGapAnalyzer: ['analyzeSkillGap', 'identifyGaps', 'prioritizeGaps', 'recommendTraining', 'trackProgress'],
      ResumeOptimizer: ['optimizeResume', 'suggestImprovements', 'tailorToJob', 'analyzeATS', 'generateCoverLetter'],
      InterviewCoach: ['prepareForInterview', 'conductMockInterview', 'analyzeFeedback', 'suggestImprovements', 'generateScripts'],

      // CTO Tools
      KubernetesTool: ['deployService', 'monitorCluster', 'manageResources', 'troubleshoot', 'optimizePerformance'],
      CostOptimizationTool: ['analyzeCosts', 'identifyWaste', 'suggestOptimizations', 'estimateSavings', 'trackMetrics'],
      TeamMetricsTool: ['analyzeMetrics', 'trackPerformance', 'identifyBottlenecks', 'generateReports', 'benchmarkTeam'],
      IaCMonitoringTool: ['scanInfrastructure', 'detectDrift', 'suggestFixes', 'generateReports', 'auditCompliance'],
      DatabaseOperationsTool: ['executeQuery', 'optimizeDatabase', 'manageReplication', 'performBackup', 'restoreData'],
      DisasterRecoveryTool: ['testFailover', 'generateDRPlan', 'documentRecovery', 'runDrill', 'updateRPO'],

      // Content Tools
      ContentGenerationTool: ['generateContent', 'suggestTopics', 'tailorContent', 'optimizeForPlatform', 'generateVariations'],
      ContentAdaptationTool: ['adaptForAudience', 'translateTone', 'adjustLength', 'updateReferences', 'localize'],
      TrendAnalysisTool: ['analyzeTrends', 'identifyPatterns', 'predictFuture', 'compareIndustry', 'suggestContent'],
      AudienceInsightsTool: ['analyzeAudience', 'identifySegments', 'predictBehavior', 'generateProfiles', 'suggestEngagement'],
      SEOTool: ['optimizeForSEO', 'analyzeKeywords', 'suggestImprovements', 'trackRankings', 'auditContent'],
      SocialMediaTool: ['schedulePosts', 'analyzeEngagement', 'suggestBestTimes', 'generateHashtags', 'trackMetrics'],
      BlogPlatformTool: ['publishPost', 'manageComments', 'trackStats', 'suggestRelated', 'generateArchive'],
      VideoPlatformTool: ['uploadVideo', 'generateThumbnail', 'suggestTags', 'trackViews', 'analyzeEngagement'],
      AnalyticsTool: ['analyzeMetrics', 'trackPerformance', 'generateReports', 'comparePerformance', 'identifyTrends'],
      ContentPlannerTool: ['createPlan', 'schedulePosts', 'balanceContent', 'suggestTypes', 'trackProgress'],

      // Finance Tools
      FinancialAnalysisTool: ['analyzeTrends', 'calculateRatios', 'identifyAnomalies', 'generateInsights', 'forecastFuture'],
      PortfolioManagementTool: ['getPortfolio', 'addAsset', 'removeAsset', 'analyzePerformance', 'rebalancePortfolio'],

      // Shared Tools
      EmailTool: ['sendEmail', 'retrieveEmails', 'searchEmails', 'manageFolders', 'trackStatus'],
      CalendarTool: ['scheduleEvent', 'retrieveEvents', 'findAvailability', 'manageInvitations', 'updateReminders'],
      CRMTool: ['getCustomers', 'addCustomer', 'updateCustomer', 'analyzeSegments', 'trackLifecycle'],
      SlackTool: ['sendMessage', 'retrieveMessages', 'manageChannels', 'setReminder', 'shareFile'],

      // Support/Legal
      KnowledgeBaseTool: ['searchArticles', 'getArticleDetails', 'updateKnowledgeBase', 'generateFAQs', 'categorizeContent'],
      LegalResearchTool: ['searchCaseLaw', 'findPrecedents', 'getCaseDetails', 'analyzeTrends', 'generateCitations'],

      // HR/PM
      JiraTool: ['createIssue', 'getIssueDetails', 'updateIssue', 'closeIssue', 'trackProgress'],
      InterviewTool: ['scheduleInterview', 'generateQuestions', 'analyzeCandidates', 'trackFeedback', 'makeOffers'],
    };

    for (const [toolName, actions] of Object.entries(actionPatterns)) {
      this.toolActions.set(toolName.toLowerCase(), actions);
    }
  }

  /**
   * Parse a message (string or object) into structured action/payload
   */
  parse(message: string | object): ParsedMessage {
    try {
      // If already an object, validate and return
      if (typeof message === 'object' && message !== null) {
        return this.parseStructured(message as any);
      }

      // Parse text message
      return this.parseText(message as string);
    } catch (error) {
      this.log('error', `Failed to parse message: ${error}`);
      throw new Error(`Message parsing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse already-structured message object
   */
  private parseStructured(obj: any): ParsedMessage {
    const { action, toolName, payload } = obj;

    if (!action || !toolName) {
      throw new Error('Structured message must include action and toolName');
    }

    return {
      action,
      toolName: toolName.toLowerCase(),
      payload: payload || {},
      isStructured: true,
      confidence: 'high'
    };
  }

  /**
   * Parse text message into action/payload using heuristics
   * Examples:
   *  "Apply for Senior Engineer role at Google"
   *  "CareerPlanner: assess my trajectory as a Java dev"
   *  "What opportunities exist for my role?"
   */
  private parseText(text: string): ParsedMessage {
    const lowerText = text.toLowerCase();
    let toolName = '';
    let action = '';
    const payload: Record<string, any> = { userQuery: text };

    // Pattern 1: "ToolName: action parameters"
    const colonMatch = text.match(/^(\w+):\s*(.+)$/i);
    if (colonMatch) {
      toolName = colonMatch[1].toLowerCase();
      const remaining = colonMatch[2];
      action = this.extractAction(toolName, remaining);
      Object.assign(payload, this.extractParameters(remaining));
      return {
        action: action || 'default',
        toolName,
        payload,
        isStructured: false,
        confidence: 'medium'
      };
    }

    // Pattern 2: Common action verbs
    const verbPatterns = [
      /^(apply|submit)\s+for\s+(.+)/i,
      /^(create|generate|write|compose)\s+(.+)/i,
      /^(analyze|review|assess)\s+(.+)/i,
      /^(optimize|improve|enhance)\s+(.+)/i,
      /^(search|find|look for)\s+(.+)/i,
      /^(schedule|book|set up)\s+(.+)/i,
      /^(send|share|post)\s+(.+)/i,
    ];

    for (const pattern of verbPatterns) {
      const match = text.match(pattern);
      if (match) {
        const verb = match[1].toLowerCase();
        const context = match[2];
        
        // Map verb to action
        action = this.mapVerbToAction(verb);
        
        // Try to identify tool from context
        toolName = this.inferToolName(lowerText, context);
        
        if (toolName) {
          Object.assign(payload, this.extractParameters(context));
          return {
            action: action || 'default',
            toolName,
            payload,
            isStructured: false,
            confidence: 'medium'
          };
        }
      }
    }

    // Pattern 3: Question-based (e.g., "What opportunities exist?")
    if (text.includes('?')) {
      action = 'query';
      toolName = this.inferToolNameFromQuestion(lowerText);
      if (!toolName) toolName = 'generic';
      return {
        action,
        toolName,
        payload,
        isStructured: false,
        confidence: 'low'
      };
    }

    // Fallback: Try to infer everything from keywords
    toolName = this.inferToolNameFromKeywords(lowerText);
    action = 'execute';

    return {
      action,
      toolName: toolName || 'generic',
      payload,
      isStructured: false,
      confidence: 'low'
    };
  }

  /**
   * Extract action from remaining text
   */
  private extractAction(toolName: string, text: string): string {
    const actions = this.toolActions.get(toolName.toLowerCase()) || [];
    const lowerText = text.toLowerCase();

    for (const action of actions) {
      if (lowerText.includes(action.toLowerCase())) {
        return action;
      }
    }

    return '';
  }

  /**
   * Map verb to standard action
   */
  private mapVerbToAction(verb: string): string {
    const verbMap: Record<string, string> = {
      apply: 'submitApplication',
      submit: 'submitApplication',
      create: 'generate',
      generate: 'generate',
      write: 'generate',
      compose: 'generate',
      analyze: 'analyze',
      review: 'analyze',
      assess: 'analyze',
      optimize: 'optimize',
      improve: 'optimize',
      enhance: 'optimize',
      search: 'search',
      find: 'search',
      schedule: 'schedule',
      book: 'schedule',
      send: 'send',
      share: 'share',
      post: 'post',
    };

    return verbMap[verb] || verb;
  }

  /**
   * Infer tool name from context text
   */
  private inferToolName(text: string, context: string): string {
    const fullText = `${text} ${context}`.toLowerCase();

    const keywords: Record<string, string[]> = {
      CareerPlanner: ['career', 'job', 'role', 'trajectory', 'advancement', 'development'],
      ResumeOptimizer: ['resume', 'cv', 'application', 'job description', 'tailor', 'ats'],
      SkillGapAnalyzer: ['skill', 'gap', 'training', 'learn', 'develop', 'capability'],
      InterviewCoach: ['interview', 'mock', 'question', 'preparation', 'practice'],
      ContentGenerationTool: ['content', 'write', 'article', 'post', 'blog', 'copy'],
      TrendAnalysisTool: ['trend', 'popular', 'viral', 'emerging', 'analysis', 'pattern'],
      AudienceInsightsTool: ['audience', 'demographic', 'segment', 'insight', 'profile'],
      KubernetesTool: ['kubernetes', 'cluster', 'container', 'deployment', 'k8s', 'pod'],
      CostOptimizationTool: ['cost', 'budget', 'spending', 'optimization', 'waste', 'efficiency'],
      EmailTool: ['email', 'mail', 'send', 'inbox', 'compose'],
      CalendarTool: ['calendar', 'schedule', 'meeting', 'event', 'availability'],
      SlackTool: ['slack', 'message', 'channel', 'team', 'notification'],
      FinancialAnalysisTool: ['financial', 'finance', 'investment', 'portfolio', 'analysis'],
      LegalResearchTool: ['legal', 'law', 'case', 'precedent', 'contract', 'compliance'],
    };

    for (const [tool, keys] of Object.entries(keywords)) {
      if (keys.some(key => fullText.includes(key))) {
        return tool;
      }
    }

    return '';
  }

  /**
   * Infer tool name from question text
   */
  private inferToolNameFromQuestion(text: string): string {
    const questionPatterns: Record<string, string> = {
      'what|how|where|who|why': 'generic',
      'career|job|role|trajectory': 'CareerPlanner',
      'skill|learn|develop|training': 'SkillGapAnalyzer',
      'resume|cv|application': 'ResumeOptimizer',
      'interview|preparation|mock': 'InterviewCoach',
      'content|article|write|blog': 'ContentGenerationTool',
      'audience|demographic|segment': 'AudienceInsightsTool',
      'trend|popular|emerging': 'TrendAnalysisTool',
      'cost|budget|spending|efficiency': 'CostOptimizationTool',
      'kubernetes|cluster|container': 'KubernetesTool',
      'financial|investment|portfolio': 'FinancialAnalysisTool',
    };

    for (const [pattern, tool] of Object.entries(questionPatterns)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(text)) {
        return tool;
      }
    }

    return 'generic';
  }

  /**
   * Infer tool name from keywords
   */
  private inferToolNameFromKeywords(text: string): string {
    const toolKeywords: Record<string, string[]> = {
      CareerPlanner: ['career', 'job search', 'advancement'],
      ResumeOptimizer: ['resume', 'cv'],
      SkillGapAnalyzer: ['skill gap', 'training'],
      InterviewCoach: ['interview', 'mock interview'],
      ContentGenerationTool: ['content creation', 'write'],
      AudienceInsightsTool: ['audience', 'demographics'],
      TrendAnalysisTool: ['trends', 'trending'],
      KubernetesTool: ['kubernetes', 'k8s'],
      CostOptimizationTool: ['cost', 'budget'],
      EmailTool: ['email'],
      CalendarTool: ['calendar'],
      FinancialAnalysisTool: ['financial', 'investment'],
    };

    for (const [tool, keywords] of Object.entries(toolKeywords)) {
      if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
        return tool;
      }
    }

    return '';
  }

  /**
   * Extract parameters from text context
   */
  private extractParameters(context: string): Record<string, any> {
    const params: Record<string, any> = {};

    // Extract role mentions
    const roleMatch = context.match(/(?:as|for|role|position)?\s+(?:a\s+)?(\w+(?:\s+\w+)?)\s+(?:engineer|developer|manager|specialist|consultant)/i);
    if (roleMatch) {
      params.targetRole = roleMatch[1];
    }

    // Extract industry
    const industryMatch = context.match(/(?:in|for)\s+(?:the\s+)?(\w+)\s+(?:industry|sector|space)/i);
    if (industryMatch) {
      params.industry = industryMatch[1];
    }

    // Extract years of experience
    const yearsMatch = context.match(/(\d+)\s+years?\s+(?:of\s+)?(?:experience|exp)/i);
    if (yearsMatch) {
      params.yearsOfExperience = parseInt(yearsMatch[1]);
    }

    // Extract skills
    const skillMatch = context.match(/skills?:?\s*([^.]+)/i);
    if (skillMatch) {
      params.skills = skillMatch[1].split(/[,;]/).map(s => s.trim());
    }

    return params;
  }

  /**
   * Validate parsed message against tool schema
   */
  validateAgainstSchema(parsed: ParsedMessage): boolean {
    const tool = this.tools.get(parsed.toolName.toLowerCase());
    if (!tool) {
      this.log('warn', `Tool not found: ${parsed.toolName}`);
      return false;
    }

    // Basic validation - in production, use JSON schema validation
    if (!parsed.action) {
      this.log('warn', `No action specified for tool ${parsed.toolName}`);
      return false;
    }

    return true;
  }

  /**
   * Log helper
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] >= levels[this.logLevel]) {
      console.log(`[MessageParser:${level.toUpperCase()}] ${message}`);
    }
  }
}
