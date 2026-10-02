// @ts-nocheck
import { Tool } from '../../../types';
import { createDeclarativeCodeSkill, createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const PLAN_CAMPAIGN_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    campaign: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        product: { type: 'string' },
        budget: { type: 'number' },
        channels: { type: 'array', items: { type: 'string' } },
        timeline: { type: 'array' },
        kpis: { type: 'array' },
        createdAt: { type: 'string' },
        source: { type: 'string' },
      },
    },
    storePath: { type: 'string' },
  },
  required: ['success', 'campaign', 'storePath'],
};

const ANALYZE_PERFORMANCE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    analysis: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        campaignId: { type: 'string' },
        metrics: { type: 'array', items: { type: 'string' } },
        results: { type: 'object' },
        createdAt: { type: 'string' },
        source: { type: 'string' },
      },
    },
    storePath: { type: 'string' },
  },
  required: ['success', 'analysis', 'storePath'],
};

const EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: { type: 'string', enum: ['success', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'status', 'system', 'action', 'request', 'response', 'error'],
};

const PLAN_CAMPAIGN = createDeclarativeCodeSkill({
  id: 'plan-campaign',
  name: 'Plan Campaign',
  description: 'Plan a marketing campaign with budget, channels, and timeline.',
  persistenceEnvVar: 'MARKETING_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      product: { type: 'string', description: 'Name or description of the product being marketed' },
      budget: { type: 'number', description: 'Total budget allocated for the campaign in currency units' },
      channels: { type: 'array', items: { type: 'string' }, description: 'List of marketing channels to use (e.g., email, social, search, display)' },
    },
  },
  outputSchema: PLAN_CAMPAIGN_OUTPUT_SCHEMA,
  triggers: [
    { kind: 'user', phrase_examples: ["Plan a campaign", "Define campaign", "Create campaign plan"] },
  ],
  manifest: {},
  handler: async function handler(input, ctx) {
      const product = input.product || '';
      const budget = input.budget || 0;
      const channels = input.channels || [];

      const store = ctx.store.load('campaigns', []);
      const campaign = { id: 'campaign_' + Date.now(), product: product, budget: budget, channels: channels, timeline: [], kpis: [], createdAt: new Date().toISOString(), source: 'local' };
      store.push(campaign);
      ctx.store.save('campaigns', store);

      return { success: true, data: { campaign: campaign, storePath: ctx.store.getFilePath('campaigns') } };
    }
  });

const ANALYZE_PERFORMANCE = createDeclarativeCodeSkill({
  id: 'analyze-performance',
  name: 'Analyze Performance',
  description: 'Analyze campaign performance against KPIs.',
  persistenceEnvVar: 'MARKETING_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      campaign: { type: 'string', description: 'Unique identifier of the campaign to analyze' },
      metrics: { type: 'array', items: { type: 'string' }, description: 'List of metric names to evaluate (e.g., impressions, clicks, conversions, ROI)' },
    },
  },
  outputSchema: ANALYZE_PERFORMANCE_OUTPUT_SCHEMA,
  triggers: [
    { kind: 'schedule', cadence: 'Periodic campaign performance review' },
  ],
  manifest: {},
  handler: async function handler(input, ctx) {
      const campaignId = input.campaign || '';
      const metrics = input.metrics || [];

      const store = ctx.store.load('performance', []);
      const analysis = { id: 'perf_' + Date.now(), campaignId: campaignId, metrics: metrics, results: {}, createdAt: new Date().toISOString(), source: 'local' };
      store.push(analysis);
      ctx.store.save('performance', store);

      return { success: true, data: { analysis: analysis, storePath: ctx.store.getFilePath('performance') } };
    }
  });

const MARKETING_SKILLS: Tool[] = [PLAN_CAMPAIGN, ANALYZE_PERFORMANCE];

const MARKETING_EXTERNAL_SKILLS: Tool[] = [
  createExternalActionSkill({
    triggers: [
      { kind: 'event', on: 'Content brief received for campaign asset creation' },
    ],
    id: 'marketing-content-generation',
    name: 'Marketing Content Generation',
    description: 'Create, revise, schedule, and publish campaign content through a configurable CMS or content platform.',
    system: 'cms',
    action: 'generate-content',
    // Writes campaign content into a connected CMS. The sibling channels
    // (social, email, document-management) all gate their live dispatch, so
    // this one must too.
    confirmBeforeSend: true,
    endpoint: { configKey: 'MARKETING_CMS_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'MARKETING_CMS_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'MARKETING_CMS_API_KEY', configKey: 'cms.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'CMS base URL' },
        apiKey: { type: 'string', description: 'CMS API key' },
        provider: { type: 'string', enum: ['contentful', 'sanity', 'wordpress', 'custom'] },
        defaultLocale: { type: 'string' },
        contentModels: { type: 'array', items: { type: 'string' }, description: 'Available content models/fields' },
        brandGuidelines: { type: 'object', description: 'Brand guidelines configuration' },
        approvalWorkflow: { type: 'object', description: 'Content approval workflow configuration' },
        publishingCalendar: { type: 'string', description: 'Publishing calendar identifier' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        contentType: { type: 'string', description: 'Type of content (e.g., blog, landing-page, ad-copy, email)' },
        title: { type: 'string', description: 'Content title or headline' },
        body: { type: 'string', description: 'Full content body text' },
        content: { type: 'string', description: 'Alternative field for content body' },
        topic: { type: 'string', description: 'Main topic or subject of the content' },
        audience: { type: 'string', description: 'Target audience description' },
        tone: { type: 'string', description: 'Desired tone of voice (e.g., professional, casual, persuasive)' },
        locale: { type: 'string', description: 'Content locale/language code' },
        campaign: { type: 'string', description: 'Associated campaign identifier' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    triggers: [
      { kind: 'schedule', cadence: 'Scheduled social content publishing' },
    ],
    id: 'marketing-social-media',
    name: 'Marketing Social Media',
    description: 'Create, schedule, publish, and monitor social posts across configurable social media platforms.',
    system: 'social',
    action: 'publish-social',
    endpoint: { configKey: 'MARKETING_SOCIAL_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'MARKETING_SOCIAL_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'MARKETING_SOCIAL_ACCESS_TOKEN', configKey: 'social.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Social publishing system base URL' },
        token: { type: 'string', description: 'Social platform access token' },
        provider: { type: 'string', enum: ['linkedin', 'x', 'facebook', 'instagram', 'tiktok', 'custom'] },
        defaultAccount: { type: 'string' },
        platformConfigs: { type: 'object', description: 'Platform-specific configurations' },
        contentLibrary: { type: 'object', description: 'Content library configuration' },
        engagementRules: { type: 'array', items: { type: 'object' }, description: 'Engagement rules and policies' },
        analyticsIntegration: { type: 'object', description: 'Analytics integration settings' },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Target social platform (e.g., linkedin, x, facebook, instagram, tiktok)' },
        content: { type: 'string', description: 'Post content/text' },
        message: { type: 'string', description: 'Alternative field for post content' },
        campaign: { type: 'string', description: 'Associated campaign identifier' },
        scheduledAt: { type: 'string', description: 'ISO timestamp for scheduled publishing' },
        media: { type: 'array', items: { type: 'object' }, description: 'Array of media attachments (images, videos)' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    triggers: [
      { kind: 'schedule', cadence: 'Periodic SEO audit' },
    ],
    id: 'marketing-seo',
    name: 'Marketing SEO',
    description: 'Audit, research, optimize, and track search visibility through a configurable SEO system.',
    system: 'seo',
    // 'optimize' is a change verb, not a read verb. The generated transport POSTs
    // the whole input (url, keywords, content, market, ...) to the provider with no
    // read-only constraint anywhere in the source, and every provider named in
    // configSchema (google-search-console, semrush, ahrefs) exposes a write surface
    // (property settings, sitemap submit, project/metadata changes). `isSkill: false`
    // also means this tool is directly executable with no approval in the path.
    // Gating it here is safe: an approved marketing-center propagates its
    // confirmation into this callee (ToolExecutor.nestedExecutorCallback).
    action: 'optimize-seo',
    confirmBeforeSend: true,
    endpoint: { configKey: 'MARKETING_SEO_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'MARKETING_SEO_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'MARKETING_SEO_API_KEY', configKey: 'seo.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'SEO platform base URL' },
        apiKey: { type: 'string', description: 'SEO platform API key' },
        provider: { type: 'string', enum: ['semrush', 'ahrefs', 'google-search-console', 'custom'] },
        defaultMarket: { type: 'string' },
        keywordDatabase: { type: 'object', description: 'Keyword database configuration' },
        competitorTracking: { type: 'object', description: 'Competitor tracking settings' },
        technicalAuditConfig: { type: 'object', description: 'Technical SEO audit configuration' },
        rankingRules: { type: 'array', items: { type: 'object' }, description: 'Ranking rule definitions' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL for SEO analysis or optimization' },
        keywords: { type: 'array', items: { type: 'string' }, description: 'List of target keywords' },
        content: { type: 'string', description: 'Content to optimize or analyze' },
        market: { type: 'string', description: 'Target market/region (e.g., US, UK, global)' },
        searchEngine: { type: 'string', description: 'Target search engine (e.g., google, bing, yandex)' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    triggers: [
      { kind: 'user', phrase_examples: ["Research market", "Competitor analysis", "Market survey"] },
    ],
    id: 'marketing-market-research',
    name: 'Marketing Market Research',
    description: 'Search markets, competitors, trends, and customer signals through configurable research providers.',
    system: 'research',
    action: 'market-research',
    endpoint: { configKey: 'MARKETING_RESEARCH_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { accessToken: 'MARKETING_RESEARCH_ACCESS_TOKEN' },
    },
    credentialSource: {
      accessToken: { envVar: 'MARKETING_RESEARCH_ACCESS_TOKEN', configKey: 'research.accessToken' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Market research system base URL' },
        accessToken: { type: 'string', description: 'Research provider access token' },
        providers: { type: 'array', items: { type: 'string' } },
        defaultMarkets: { type: 'array', items: { type: 'string' } },
        researchMethodologies: { type: 'array', items: { type: 'string' }, description: 'Available research methodologies' },
        dataSources: { type: 'array', items: { type: 'object' }, description: 'Configured data sources' },
        trendModels: { type: 'array', items: { type: 'string' }, description: 'Trend analysis models' },
        reportTemplates: { type: 'array', items: { type: 'string' }, description: 'Available report templates' },
      },
      required: ['baseUrl', 'accessToken'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Research query or topic' },
        market: { type: 'string', description: 'Target market/region to research' },
        competitors: { type: 'array', items: { type: 'string' }, description: 'List of competitor names or domains to analyze' },
        dateRange: { type: 'object', description: 'Date range for research (e.g., { start: "2024-01-01", end: "2024-12-31" })' },
        filters: { type: 'object', description: 'Additional filters for the research query' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    triggers: [
      { kind: 'schedule', cadence: 'Ongoing audience segment monitoring' },
    ],
    id: 'marketing-audience-insights',
    name: 'Marketing Audience Insights',
    description: 'Segment audiences and analyze demographics, behavior, preferences, and campaign response signals.',
    system: 'audience-insights',
    action: 'analyze-audience',
    endpoint: { configKey: 'MARKETING_AUDIENCE_INSIGHTS_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'MARKETING_AUDIENCE_INSIGHTS_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'MARKETING_AUDIENCE_INSIGHTS_API_KEY', configKey: 'audienceInsights.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Audience insights platform base URL' },
        apiKey: { type: 'string', description: 'Audience insights API key' },
        provider: { type: 'string', enum: ['google-analytics', 'segment', 'salesforce', 'custom'] },
        defaultSegment: { type: 'string' },
        segmentationModels: { type: 'array', items: { type: 'string' }, description: 'Available segmentation models' },
        behaviorPredictors: { type: 'array', items: { type: 'object' }, description: 'Behavior predictor configurations' },
        privacyControls: { type: 'object', description: 'Privacy and compliance controls' },
        enrichmentSources: { type: 'array', items: { type: 'string' }, description: 'Data enrichment sources' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        audienceId: { type: 'string', description: 'Identifier of the audience segment to analyze' },
        demographics: { type: 'object', description: 'Demographic filters (age, gender, location, income, etc.)' },
        behaviors: { type: 'array', items: { type: 'object' }, description: 'Behavioral signals to analyze (purchases, page views, engagement)' },
        campaign: { type: 'string', description: 'Associated campaign identifier for response analysis' },
        dateRange: { type: 'object', description: 'Date range for analysis (e.g., { start: "2024-01-01", end: "2024-12-31" })' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    triggers: [
      { kind: 'event', on: 'Campaign content is ready to send' },
    ],
    id: 'marketing-email',
    name: 'Marketing Email',
    description: 'Draft, schedule, send, and measure marketing email campaigns through a configurable email system.',
    system: 'email',
    action: 'send-email',
    endpoint: { configKey: 'MARKETING_EMAIL_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'Authorization',
      credentialEnvKeyMap: { apiKey: 'MARKETING_EMAIL_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'MARKETING_EMAIL_API_KEY', configKey: 'email.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Email platform base URL' },
        apiKey: { type: 'string', description: 'Email platform API key' },
        provider: { type: 'string', enum: ['sendgrid', 'mailgun', 'ses', 'brevo', 'custom'] },
        fromAddress: { type: 'string' },
        templates: { type: 'object' },
        deliverabilityConfig: { type: 'object', description: 'Email deliverability configuration' },
        automationWorkflows: { type: 'array', items: { type: 'object' }, description: 'Email automation workflows' },
        abTestFramework: { type: 'object', description: 'A/B testing framework settings' },
        complianceRules: { type: 'array', items: { type: 'string' }, description: 'Email compliance rules (e.g., CAN-SPAM, GDPR)' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
        subject: { type: 'string', description: 'Email subject line' },
        htmlBody: { type: 'string', description: 'HTML email body content' },
        textBody: { type: 'string', description: 'Plain text email body content' },
        templateId: { type: 'string', description: 'Pre-defined email template identifier' },
        templateData: { type: 'object', description: 'Data variables for template rendering' },
        campaign: { type: 'string', description: 'Associated campaign identifier' },
        attachments: { type: 'array', items: { type: 'object' }, description: 'Email attachments metadata' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    triggers: [
      { kind: 'event', on: 'Document update received for marketing asset' },
    ],
    id: 'marketing-document-management',
    name: 'Marketing Document Management',
    description: 'Create, store, retrieve, and organize marketing assets and campaign documents in a configurable document system.',
    system: 'document-management',
    action: 'manage-document',
    endpoint: { configKey: 'MARKETING_DOCUMENT_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'MARKETING_DOCUMENT_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'MARKETING_DOCUMENT_ACCESS_TOKEN', configKey: 'documentManagement.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Document management system base URL' },
        token: { type: 'string', description: 'Document system bearer token' },
        provider: { type: 'string', enum: ['google-drive', 'sharepoint', 'dropbox', 'box', 'custom'] },
        defaultFolder: { type: 'string' },
        assetTaxonomy: { type: 'object', description: 'Asset classification taxonomy' },
        versionControl: { type: 'object', description: 'Version control settings' },
        rightsManagement: { type: 'object', description: 'Digital rights management settings' },
        collaborationWorkflows: { type: 'array', items: { type: 'object' }, description: 'Collaboration workflow definitions' },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'object', description: 'Document object to create or update' },
        documentId: { type: 'string', description: 'Unique identifier of the document' },
        folderId: { type: 'string', description: 'Target folder identifier' },
        name: { type: 'string', description: 'Document name or title' },
        contentType: { type: 'string', description: 'MIME type or content type of the document' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
];

/**
 * Ad-hoc half of the marketing-center decomposition. It was event-triggered
 * ("Delivery sync event from planning or analytics") while requiring a
 * targetChannel the sync event does not carry. This half is the user-triggered
 * dispatcher; marketing-reports-scheduled owns the recurring report path.
 */
const MARKETING_CENTER = createDeclarativeCodeSkill({
  id: 'marketing-analysis-user',
  name: 'Marketing Analysis',
  description: 'Unified interface for ad-hoc marketing operations across content generation, social media, email, SEO, market research, audience insights, and document management. Dispatches to the appropriate external marketing skill based on the selected targetChannel.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: {
    type: 'object',
    properties: {
      targetChannel: SchemaProps.select(['content-generation', 'social-media', 'email', 'seo', 'market-research', 'audience-insights', 'document-management'], { description: 'Which marketing channel to dispatch to' }),
      data: { type: ['object', 'null'] as const, description: 'Parameters forwarded to the selected marketing channel' },
    },
    required: ['targetChannel'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      system: { type: 'string' },
      action: { type: 'string' },
      result: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'system', 'action'],
  },
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Draft this campaign for social',
        'Run SEO for this page',
        'Research this market',
      ],
    },
  ],
  manifest: {
    lowerOrderTools: [
      'marketing-content-generation',
      'marketing-social-media',
      'marketing-email',
      'marketing-seo',
      'marketing-market-research',
      'marketing-audience-insights',
      'marketing-document-management',
    ]
  },
  handler: async function handler(input, ctx) {
      const targetChannel = input.targetChannel || 'content-generation';
      const data = input.data || {};
      const toolMap = {
        'content-generation': 'marketing-content-generation',
        'social-media': 'marketing-social-media',
        'email': 'marketing-email',
        'seo': 'marketing-seo',
        'market-research': 'marketing-market-research',
        'audience-insights': 'marketing-audience-insights',
        'document-management': 'marketing-document-management',
      };
      const toolId = toolMap[targetChannel];
      if (!toolId) {
        // A bare `return` here emitted no output envelope, so an unknown channel
        // surfaced as a bare {status, error} with no explanation.
        return {
          success: false,
          status: 'error',
          system: 'marketing-analysis-user',
          action: targetChannel,
          data: null,
          error: `Unknown targetChannel: ${targetChannel}`,
          present: [
            ctx.render.text(
              'notice',
              'Unknown channel',
              `Cannot dispatch "${targetChannel}". Expected one of: ${Object.keys(toolMap).join(', ')}.`,
            ),
          ],
        };
      }
      const result = await ctx.delegate(toolId, data);
      const ok = Boolean(result) && result.success !== false;
      return {
        success: ok,
        data: result ? result.data : null,
        error: result?.error ?? (ok ? null : 'The dispatched tool returned no result'),
        status: result?.status ?? (ok ? 'ok' : 'error'),
        delegatedTo: toolId,
        generatedAt: new Date().toISOString(),
        // Without this, a failed dispatch showed an empty result area.
        present: [
          ok
            ? ctx.render.text('report', 'Marketing Dispatch', ['Dispatched to ' + toolId, '', String(result?.data ?? '(no payload returned)')])
            : ctx.render.text('not-connected', 'Dispatch failed', toolId + ' did not produce a result: ' + String(result?.error ?? 'unknown error')),
        ],
      };
    }
  });
/**
 * Scheduled half of the marketing-center decomposition.
 *
 * Produces the recurring campaign report over the configured campaigns and
 * channels. `campaignIds` is a required selector so the report has a bounded
 * scope rather than reporting on every campaign the account holds.
 */
const MARKETING_REPORTS_SCHEDULED = createDeclarativeCodeSkill({
  id: 'marketing-reports-scheduled',
  name: 'Marketing Reports',
  description: 'Scheduled campaign report across the configured campaigns and channels, dispatched to the analytics channel.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: {
    type: 'object',
    properties: {
      runReason: SchemaProps.text({ description: 'Why this run was invoked (schedule, manual)' }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      status: { type: 'string' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'status'],
  },
  configSchema: {
    type: 'object',
    properties: {
      campaignIds: { type: 'array', items: { type: 'string' }, description: 'Campaigns this report covers' },
      channels: { type: 'array', items: { type: 'string' }, description: 'Channels to report on per campaign' },
      reportCadence: { type: 'string', description: 'Cron expression or schedule id for this report' },
    },
    required: ['campaignIds'],
    additionalProperties: false,
  },
  triggers: [
    { kind: 'schedule', cadence: 'Weekly campaign report' },
  ],
  isSkill: true,
  tier: 'advise',
  domainKnowledge: 'Marketing frameworks (AIDA, RACE, buyer journey), channel-specific best practices (SEO, paid social, email), content strategy, campaign measurement',
  manifest: {
    lowerOrderTools: ['marketing-market-research', 'marketing-audience-insights'],
  },
  handler: async function handler(input, ctx) {
    const campaignIds = Array.isArray(ctx.config?.campaignIds) ? ctx.config.campaignIds.map(String) : [];
    const channels = Array.isArray(ctx.config?.channels) ? ctx.config.channels.map(String) : [];
    const reportCadence = typeof ctx.config?.reportCadence === 'string' ? ctx.config.reportCadence : null;
    const runReason = typeof input?.runReason === 'string' ? input.runReason : 'schedule';

    if (!campaignIds.length) {
      return {
        success: false,
        status: 'not-configured',
        error: 'No campaigns configured. Set config.campaignIds before this Skill can run.',
        present: [ctx.render.text('notice', 'No campaigns configured', 'Set config.campaignIds before the scheduled marketing report can run.')],
      };
    }

    const reports: Array<Record<string, unknown>> = [];
    // A campaign counts as failed when the call throws OR when the callee comes
    // back having produced nothing. Counting only the throw path let this Skill
    // report success:true while 0 of 2 campaigns actually reported.
    const failed: string[] = [];
    for (const campaignId of campaignIds) {
      try {
        const result = await ctx.delegate('marketing-market-research', { campaignId, channels, reportCadence, runReason });
        const ok = Boolean(result) && result.success !== false;
        if (!ok) failed.push(campaignId);
        reports.push({
          campaignId,
          success: ok,
          status: result?.status ?? null,
          data: result?.data ?? null,
          error: result?.error ?? 'callee returned no report',
        });
      } catch (err) {
        // Recorded rather than swallowed, so a report that covers nothing cannot
        // read as a report that found nothing.
        failed.push(campaignId);
        reports.push({ campaignId, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const succeeded = reports.filter((r) => r.success === true).length;
    return {
      // A run that produced no reports at all is not a clean run, whatever the
      // call path returned.
      success: failed.length === 0 && succeeded > 0,
      status: failed.length === 0 ? (succeeded > 0 ? 'ok' : 'empty') : 'partial',
      data: { campaignIds, channels, reportCadence, runReason, requested: campaignIds.length, succeeded, failed, reports },
      error: failed.length ? `No report for: ${failed.join(', ')}` : null,
      present: [
        ctx.render.text('report', 'Marketing Campaign Report', `${succeeded}/${campaignIds.length} configured campaign(s) reported${failed.length ? `; ${failed.length} failed` : ''}.`),
      ],
    };
  },
});

MARKETING_CENTER.tier = 'represent';
MARKETING_CENTER.confirmBeforeSend = true;
MARKETING_CENTER.domainKnowledge = 'Marketing frameworks (AIDA, RACE, buyer journey), channel-specific best practices (SEO, paid social, email), content strategy, campaign measurement';
MARKETING_CENTER.isSkill = true;

// Mark the 7 external marketing skills as lower-order base tools (isSkill:false)
const MARKETING_EXTERNAL_TOOL_IDS = new Set([
  'marketing-content-generation',
  'marketing-social-media',
  'marketing-email',
  'marketing-seo',
  'marketing-market-research',
  'marketing-audience-insights',
  'marketing-document-management',
]);
for (const s of MARKETING_EXTERNAL_SKILLS) {
  if (MARKETING_EXTERNAL_TOOL_IDS.has(s.id)) {
    s.isSkill = false;
  }
}

// Set tiers and domainKnowledge for all marketing skills
const MARKETING_TIER: Record<string, 'advise' | 'aid' | 'represent'> = {
  'plan-campaign': 'advise',
  'analyze-performance': 'advise',
  'marketing-analysis-user': 'represent',
  'marketing-reports-scheduled': 'advise',
  'marketing-content-generation': 'aid',
  'marketing-social-media': 'represent',
  'marketing-email': 'represent',
  'marketing-seo': 'aid',
  'marketing-market-research': 'aid',
  'marketing-audience-insights': 'aid',
  'marketing-document-management': 'represent',
};
const MARKETING_DOMAIN_KNOWLEDGE = 'Marketing frameworks (AIDA, RACE, buyer journey), channel-specific best practices (SEO, paid social, email), content strategy, campaign measurement';
for (const s of [...MARKETING_SKILLS, ...MARKETING_EXTERNAL_SKILLS]) {
  if (MARKETING_TIER[s.id]) {
    (s as Tool).tier = MARKETING_TIER[s.id];
  }
  if (MARKETING_DOMAIN_KNOWLEDGE) {
    (s as Tool).domainKnowledge = MARKETING_DOMAIN_KNOWLEDGE;
  }
  if ((s as Tool).tier === 'represent' && (s as Tool).confirmBeforeSend === undefined) {
    (s as Tool).confirmBeforeSend = true;
  }
}

MARKETING_SKILLS.push(MARKETING_CENTER, MARKETING_REPORTS_SCHEDULED);

export const marketingSkills = [...MARKETING_SKILLS, ...MARKETING_EXTERNAL_SKILLS];

export interface WorkflowStage {
  name: string;
  description: string;
  skills: Tool[];
}

export interface AssistantWorkflow {
  assistant: string;
  productObject: string;
  flow: string;
  stages: WorkflowStage[];
}

MARKETING_SKILLS.forEach((s) => {
  if (s.id === 'plan-campaign') s.manifest.workflowStage = 'plan';
  else if (s.id === 'analyze-performance') s.manifest.workflowStage = 'analyze';
  else if (s.id === 'marketing-analysis-user') s.manifest.workflowStage = 'plan';
  else if (s.id === 'marketing-reports-scheduled') s.manifest.workflowStage = 'plan';
});

MARKETING_EXTERNAL_SKILLS.forEach((s) => {
  if (s.id === 'marketing-content-generation') s.manifest.workflowStage = 'create';
  else if (s.id === 'marketing-social-media') s.manifest.workflowStage = 'publish';
  else if (s.id === 'marketing-seo') s.manifest.workflowStage = 'create';
  else if (s.id === 'marketing-market-research') s.manifest.workflowStage = 'create';
  else if (s.id === 'marketing-audience-insights') s.manifest.workflowStage = 'plan';
  else if (s.id === 'marketing-email') s.manifest.workflowStage = 'publish';
  else if (s.id === 'marketing-document-management') s.manifest.workflowStage = 'publish';
});

// The former `marketingCenter` alias is gone: it named a Skill id that no
// longer exists after the Class 4 decomposition, and nothing imported it.
export { MARKETING_CENTER, MARKETING_REPORTS_SCHEDULED };

export const marketingWorkflow: AssistantWorkflow = {
  assistant: 'Marketing',
  productObject: 'campaign',
  flow: 'plan → create → publish → analyze',
  stages: [
    { name: 'plan', description: 'Campaign planning and audience targeting', skills: marketingSkills.filter((s) => s.manifest.workflowStage === 'plan') },
    { name: 'create', description: 'Content creation, SEO, research, and insights', skills: marketingSkills.filter((s) => s.manifest.workflowStage === 'create') },
    { name: 'publish', description: 'Content publishing, email, and asset management', skills: marketingSkills.filter((s) => s.manifest.workflowStage === 'publish') },
    { name: 'analyze', description: 'Performance analysis and reporting', skills: marketingSkills.filter((s) => s.manifest.workflowStage === 'analyze') },
  ],
};
