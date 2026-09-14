import { Tool } from '../../../types';
import { createExternalActionSkill } from '../code-skill-factory';

const SUPPORT_SKILLS: Tool[] = [
  {
    id: 'resolve-ticket',
    name: 'Resolve Ticket',
    description: 'Resolve a support ticket with issue and resolution.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const ticketId = input.ticketId || '';
const issue = input.issue || '';
const baseDir = process.env.SUPPORT_HOME || path.join('/tmp/support');
const storePath = path.join(baseDir, 'tickets.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const ticket = { id: 'ticket_' + Date.now(), ticketId, issue, resolution: '', status: 'open', createdAt: new Date().toISOString(), source: 'local' };
store.push(ticket);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { ticket, storePath } }));
` },
    inputSchema: { type: 'object', properties: { ticketId: { type: 'string', description: 'Unique identifier for the ticket' }, issue: { type: 'string', description: 'Issue description to resolve' } } },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean', description: 'Whether the ticket was resolved successfully' }, ticket: { type: 'object', description: 'The resolved ticket object' }, storePath: { type: 'string', description: 'File path where the ticket was stored' } } },
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: 'search-kb',
    name: 'Search Knowledge Base',
    description: 'Search the support knowledge base for articles.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const query = input.query || '';
const baseDir = process.env.SUPPORT_HOME || path.join('/tmp/support');
const storePath = path.join(baseDir, 'kb.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const results = store.filter((a) => a.title.toLowerCase().includes(query.toLowerCase()) || a.body.toLowerCase().includes(query.toLowerCase()));
console.log(JSON.stringify({ success: true, data: { query, results, storePath } }));
` },
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query string' } } },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean', description: 'Whether the search succeeded' }, results: { type: 'array', description: 'Matching knowledge base articles' }, storePath: { type: 'string', description: 'File path where the knowledge base is stored' } } },
    createdAt: new Date(), updatedAt: new Date(),
  },
  createExternalActionSkill({
    id: 'support-sentiment-analysis',
    name: 'Sentiment Analysis',
    description: 'Analyze customer sentiment from support tickets, chats, and feedback using an external sentiment analysis service.',
    system: 'Sentiment Analysis',
    action: 'analyze',
    endpoint: { envVar: 'SUPPORT_SENTIMENT_BASE_URL', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: { envVar: 'SUPPORT_SENTIMENT_API_KEY' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Base URL for the sentiment analysis API' },
        apiKey: { type: 'string', description: 'API key for authentication' },
        sentimentModels: { type: 'array', items: { type: 'object' }, description: 'Configured sentiment analysis models' },
        languageConfigs: { type: 'object', description: 'Language-specific sentiment analysis settings' },
        thresholdRules: { type: 'object', description: 'Sentiment score thresholds and classification rules' },
        alertTriggers: { type: 'array', items: { type: 'object' }, description: 'Conditions that trigger sentiment alerts' },
      },
    },
    credentialSource: {
      apiKey: { envVar: 'SUPPORT_SENTIMENT_API_KEY' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to analyze for sentiment' },
        source: { type: 'string', enum: ['ticket', 'chat', 'email', 'survey', 'review'], description: 'Source of the text' },
        language: { type: 'string', description: 'Language code (e.g., en, es, fr)' },
      },
      required: ['text'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: { type: 'object' },
        response: {
          type: ['object', 'null'],
          properties: {
            sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral', 'mixed'] },
            score: { type: 'number', description: 'Sentiment score from -1 to 1' },
            confidence: { type: 'number', description: 'Confidence level 0-1' },
            emotions: { type: 'array', items: { type: 'string' } },
            keywords: { type: 'array', items: { type: 'string' } },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'support-response',
    name: 'Response Generator',
    description: 'Generate contextual support responses using an external AI-powered response generation service.',
    system: 'Response Generator',
    action: 'generate',
    endpoint: { envVar: 'SUPPORT_RESPONSE_BASE_URL', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: { envVar: 'SUPPORT_RESPONSE_API_TOKEN' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Base URL for the response generation API' },
        apiToken: { type: 'string', description: 'Bearer token for authentication' },
        responseTemplates: { type: 'array', items: { type: 'object' }, description: 'Reusable response templates' },
        toneProfiles: { type: 'array', items: { type: 'object' }, description: 'Configured response tone profiles' },
        kbIntegration: { type: 'object', description: 'Knowledge base integration settings' },
        qualityRules: { type: 'object', description: 'Response quality and compliance rules' },
      },
    },
    credentialSource: {
      token: { envVar: 'SUPPORT_RESPONSE_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: { type: 'string', description: 'Ticket identifier for the response' },
        customerMessage: { type: 'string', description: 'Customer message to respond to' },
        ticketContext: { type: 'object', description: 'Ticket context and history' },
        tone: { type: 'string', enum: ['professional', 'friendly', 'empathetic', 'technical'], default: 'empathetic', description: 'Tone of the generated response' },
        template: { type: 'string', description: 'Response template to use' },
        includeKB: { type: 'boolean', default: true, description: 'Whether to include knowledge base references' },
      },
      required: ['customerMessage'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: { type: 'object' },
        response: {
          type: ['object', 'null'],
          properties: {
            response: { type: 'string' },
            alternatives: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number' },
            suggestedActions: { type: 'array', items: { type: 'string' } },
            kbReferences: { type: 'array', items: { type: 'string' } },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'support-crm',
    name: 'CRM Integration',
    description: 'Sync support tickets, customer data, and interactions with an external CRM system.',
    system: 'CRM',
    action: 'sync',
    endpoint: { envVar: 'SUPPORT_CRM_BASE_URL', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: { envVar: 'SUPPORT_CRM_API_KEY' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Base URL for the CRM API' },
        apiKey: { type: 'string', description: 'API key for authentication' },
        syncRules: { type: 'object', description: 'Rules for synchronizing support and CRM records' },
        fieldMappings: { type: 'object', description: 'Mappings between support and CRM fields' },
        duplicateHandling: { type: 'object', description: 'Duplicate record detection and resolution settings' },
        conflictResolution: { type: 'object', description: 'Rules for resolving synchronization conflicts' },
      },
    },
    credentialSource: {
      apiKey: { envVar: 'SUPPORT_CRM_API_KEY' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create', 'read', 'update', 'delete', 'sync'], description: 'CRUD operation to perform' },
        entity: { type: 'string', enum: ['ticket', 'customer', 'contact', 'account', 'interaction'], description: 'Entity type to operate on' },
        data: { type: 'object', description: 'Data payload for the operation' },
        filters: { type: 'object', description: 'Filters for read/query operations' },
      },
      required: ['operation', 'entity'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: { type: 'object' },
        response: {
          type: ['object', 'null'],
          properties: {
            record: { type: 'object' },
            records: { type: 'array', items: { type: 'object' } },
            count: { type: 'number' },
            syncStatus: { type: 'string' },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'support-escalation',
    name: 'Escalation Manager',
    description: 'Manage ticket escalations, routing, and SLA tracking using an external escalation service.',
    system: 'Escalation',
    action: 'manage',
    endpoint: { envVar: 'SUPPORT_ESCALATION_BASE_URL', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: { envVar: 'SUPPORT_ESCALATION_API_TOKEN' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Base URL for the escalation API' },
        apiToken: { type: 'string', description: 'Bearer token for authentication' },
        slaPolicies: { type: 'array', items: { type: 'object' }, description: 'Service-level agreement policies' },
        routingRules: { type: 'array', items: { type: 'object' }, description: 'Escalation and assignment routing rules' },
        notificationConfigs: { type: 'object', description: 'Escalation notification settings' },
        teamHierarchies: { type: 'array', items: { type: 'object' }, description: 'Support team and escalation hierarchies' },
      },
    },
    credentialSource: {
      token: { envVar: 'SUPPORT_ESCALATION_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create', 'read', 'update', 'assign', 'reassign', 'acknowledge', 'resolve'], description: 'Escalation operation to perform' },
        ticketId: { type: 'string', description: 'Ticket identifier' },
        escalationLevel: { type: 'number', minimum: 1, maximum: 5, description: 'Escalation level (1-5)' },
        assignedTo: { type: 'string', description: 'Person or team assigned' },
        reason: { type: 'string', description: 'Reason for escalation' },
        slaBreach: { type: 'boolean', description: 'Whether SLA has been breached' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Ticket priority level' },
      },
      required: ['operation', 'ticketId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: { type: 'object' },
        response: {
          type: ['object', 'null'],
          properties: {
            escalation: { type: 'object' },
            history: { type: 'array', items: { type: 'object' } },
            slaStatus: { type: 'string' },
            nextAction: { type: 'string' },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'support-analytics',
    name: 'Support Analytics',
    description: 'Query support metrics, trends, and performance reports from an external analytics platform.',
    system: 'Analytics',
    action: 'query',
    endpoint: { envVar: 'SUPPORT_ANALYTICS_BASE_URL', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: { envVar: 'SUPPORT_ANALYTICS_API_KEY' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Base URL for the analytics API' },
        apiKey: { type: 'string', description: 'API key for authentication' },
        reportTemplates: { type: 'array', items: { type: 'object' }, description: 'Reusable analytics report templates' },
        dashboardConfigs: { type: 'object', description: 'Analytics dashboard layout and widget settings' },
        cohortDefinitions: { type: 'array', items: { type: 'object' }, description: 'Reusable customer and ticket cohort definitions' },
        forecastModels: { type: 'array', items: { type: 'object' }, description: 'Forecasting models used by analytics queries' },
      },
    },
    credentialSource: {
      apiKey: { envVar: 'SUPPORT_ANALYTICS_API_KEY' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Analytics query or metric name' },
        filters: {
          type: 'object',
          description: 'Filters for the analytics query',
          properties: {
            dateRange: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
            channel: { type: 'array', items: { type: 'string' } },
            agent: { type: 'array', items: { type: 'string' } },
            category: { type: 'array', items: { type: 'string' } },
            priority: { type: 'array', items: { type: 'string' } },
          },
        },
        granularity: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day', description: 'Time granularity for the data' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'List of metrics to retrieve' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: { type: 'object' },
        response: {
          type: ['object', 'null'],
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            summary: { type: 'object' },
            trends: { type: 'array', items: { type: 'object' } },
            comparisons: { type: 'object' },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'support-issue-analysis',
    name: 'Issue Analysis',
    description: 'Analyze support issues for root cause, patterns, and classification using an external issue analysis service.',
    system: 'Issue Analysis',
    action: 'analyze',
    endpoint: { envVar: 'SUPPORT_ISSUE_ANALYSIS_BASE_URL', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: { envVar: 'SUPPORT_ISSUE_ANALYSIS_API_KEY' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Base URL for the issue analysis API' },
        apiKey: { type: 'string', description: 'API key for authentication' },
        classificationTaxonomy: { type: 'object', description: 'Issue classification categories and hierarchy' },
        rootCauseLibrary: { type: 'array', items: { type: 'object' }, description: 'Known root causes and remediation guidance' },
        patternDetectors: { type: 'array', items: { type: 'object' }, description: 'Configured issue pattern detection rules' },
        similarityIndex: { type: 'object', description: 'Issue similarity scoring and indexing settings' },
      },
    },
    credentialSource: {
      apiKey: { envVar: 'SUPPORT_ISSUE_ANALYSIS_API_KEY' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: { type: 'string', description: 'Ticket identifier' },
        issueText: { type: 'string', description: 'Issue text to analyze' },
        customerInfo: { type: 'object', description: 'Customer information context' },
        productContext: { type: 'object', description: 'Product context for the issue' },
        history: { type: 'array', items: { type: 'object' }, description: 'Historical ticket data' },
        analysisType: { type: 'string', enum: ['root_cause', 'classification', 'pattern_detection', 'similarity', 'prediction'], description: 'Type of analysis to perform' },
      },
      required: ['issueText'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: { type: 'object' },
        response: {
          type: ['object', 'null'],
          properties: {
            rootCause: { type: 'string' },
            category: { type: 'string' },
            subCategory: { type: 'string' },
            confidence: { type: 'number' },
            similarIssues: { type: 'array', items: { type: 'object' } },
            suggestedResolution: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            urgency: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'support-follow-up',
    name: 'Follow-up Manager',
    description: 'Schedule, track, and automate customer follow-ups using an external follow-up service.',
    system: 'Follow-up',
    action: 'manage',
    endpoint: { envVar: 'SUPPORT_FOLLOWUP_BASE_URL', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: { envVar: 'SUPPORT_FOLLOWUP_API_TOKEN' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Base URL for the follow-up API' },
        apiToken: { type: 'string', description: 'Bearer token for authentication' },
        followUpTemplates: { type: 'array', items: { type: 'object' }, description: 'Reusable follow-up message templates' },
        schedulingRules: { type: 'object', description: 'Follow-up timing and recurrence rules' },
        channelConfigs: { type: 'object', description: 'Communication channel connection and delivery settings' },
        automationTriggers: { type: 'array', items: { type: 'object' }, description: 'Events that trigger automated follow-ups' },
      },
    },
    credentialSource: {
      token: { envVar: 'SUPPORT_FOLLOWUP_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['schedule', 'send', 'cancel', 'reschedule', 'get_status', 'list'], description: 'Follow-up operation to perform' },
        ticketId: { type: 'string', description: 'Ticket identifier' },
        customerId: { type: 'string', description: 'Customer identifier' },
        followUpType: { type: 'string', enum: ['satisfaction', 'resolution_check', 'upsell', 'renewal', 'custom'], description: 'Type of follow-up' },
        schedule: { type: 'object', description: 'Schedule configuration', properties: { at: { type: 'string' }, delay: { type: 'string' }, recurring: { type: 'boolean' } } },
        channel: { type: 'string', enum: ['email', 'sms', 'in_app', 'phone', 'chat'], description: 'Communication channel' },
        template: { type: 'string', description: 'Template for the follow-up message' },
        customMessage: { type: 'string', description: 'Custom follow-up message' },
      },
      required: ['operation'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: { type: 'object' },
        response: {
          type: ['object', 'null'],
          properties: {
            followUp: { type: 'object' },
            followUps: { type: 'array', items: { type: 'object' } },
            status: { type: 'string' },
            sentAt: { type: 'string' },
            response: { type: 'object' },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'support-planning',
    name: 'Support Planning',
    description: 'Plan support capacity, staffing, and resource allocation using an external planning service.',
    system: 'Support Planning',
    action: 'plan',
    endpoint: { envVar: 'SUPPORT_PLANNING_BASE_URL', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: { envVar: 'SUPPORT_PLANNING_API_KEY' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Base URL for the planning API' },
        apiKey: { type: 'string', description: 'API key for authentication' },
        capacityModels: { type: 'array', items: { type: 'object' }, description: 'Support capacity and staffing models' },
        forecastingMethods: { type: 'array', items: { type: 'object' }, description: 'Demand forecasting methods and parameters' },
        optimizationAlgorithms: { type: 'array', items: { type: 'object' }, description: 'Resource allocation optimization algorithms' },
        scenarioLibrary: { type: 'object', description: 'Reusable planning scenarios and assumptions' },
      },
    },
    credentialSource: {
      apiKey: { envVar: 'SUPPORT_PLANNING_API_KEY' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['forecast', 'capacity', 'schedule', 'optimize', 'report'], description: 'Planning operation to perform' },
        timeRange: { type: 'object', description: 'Time range for the planning', properties: { start: { type: 'string' }, end: { type: 'string' } } },
        channels: { type: 'array', items: { type: 'string' }, description: 'Support channels to include' },
        teamSize: { type: 'number', description: 'Team size for capacity planning' },
        constraints: { type: 'object', description: 'Planning constraints' },
        historicalData: { type: 'array', items: { type: 'object' }, description: 'Historical data for forecasting' },
        goals: { type: 'object', description: 'Planning goals and targets' },
      },
      required: ['operation'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: { type: 'object' },
        response: {
          type: ['object', 'null'],
          properties: {
            forecast: { type: 'object' },
            capacityPlan: { type: 'object' },
            schedule: { type: 'array', items: { type: 'object' } },
            recommendations: { type: 'array', items: { type: 'string' } },
            metrics: { type: 'object' },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 60000,
  }),
];

export const supportSkills = SUPPORT_SKILLS;
