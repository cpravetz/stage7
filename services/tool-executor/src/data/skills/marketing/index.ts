import { Tool } from '../../../types';
import { createCodeSkill, createExternalActionSkill, SchemaProps } from '../code-skill-factory';

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

const MARKETING_SKILLS: Tool[] = [
  {
    id: 'plan-campaign',
    name: 'Plan Campaign',
    description: 'Plan a marketing campaign with budget, channels, and timeline.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const product = input.product || '';
const budget = input.budget || 0;
const channels = input.channels || [];
const baseDir = process.env.MARKETING_HOME || path.join('/tmp/marketing');
const storePath = path.join(baseDir, 'campaigns.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const campaign = { id: 'campaign_' + Date.now(), product, budget, channels, timeline: [], kpis: [], createdAt: new Date().toISOString(), source: 'local' };
store.push(campaign);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { campaign, storePath } }));
` },
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
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: 'analyze-performance',
    name: 'Analyze Performance',
    description: 'Analyze campaign performance against KPIs.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const campaignId = input.campaign || '';
const metrics = input.metrics || [];
const baseDir = process.env.MARKETING_HOME || path.join('/tmp/marketing');
const storePath = path.join(baseDir, 'performance.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const analysis = { id: 'perf_' + Date.now(), campaignId, metrics, results: {}, createdAt: new Date().toISOString(), source: 'local' };
store.push(analysis);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { analysis, storePath } }));
` },
    inputSchema: {
      type: 'object',
      properties: {
        campaign: { type: 'string', description: 'Unique identifier of the campaign to analyze' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'List of metric names to evaluate (e.g., impressions, clicks, conversions, ROI)' },
      },
    },
    outputSchema: ANALYZE_PERFORMANCE_OUTPUT_SCHEMA,
    triggers: [
      { kind: 'user', phrase_examples: ["Analyze performance", "Check metrics", "Pull report"] },
    ],
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const MARKETING_EXTERNAL_SKILLS: Tool[] = [
  createExternalActionSkill({
    triggers: [
      { kind: 'user', phrase_examples: ["Generate content", "Draft post", "Create copy"] },
    ],
    id: 'marketing-content-generation',
    name: 'Marketing Content Generation',
    description: 'Create, revise, schedule, and publish campaign content through a configurable CMS or content platform.',
    system: 'cms',
    action: 'generate-content',
    endpoint: { envVar: 'MARKETING_CMS_ENDPOINT', method: 'POST' },
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
      { kind: 'user', phrase_examples: ["Post to social", "Schedule post", "Check social metrics"] },
    ],
    id: 'marketing-social-media',
    name: 'Marketing Social Media',
    description: 'Create, schedule, publish, and monitor social posts across configurable social media platforms.',
    system: 'social',
    action: 'publish-social',
    endpoint: { envVar: 'MARKETING_SOCIAL_ENDPOINT', method: 'POST' },
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
      { kind: 'user', phrase_examples: ["Audit SEO", "Check rankings", "Run keyword research"] },
    ],
    id: 'marketing-seo',
    name: 'Marketing SEO',
    description: 'Audit, research, optimize, and track search visibility through a configurable SEO system.',
    system: 'seo',
    action: 'optimize-seo',
    endpoint: { envVar: 'MARKETING_SEO_ENDPOINT', method: 'POST' },
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
    endpoint: { envVar: 'MARKETING_RESEARCH_ENDPOINT', method: 'POST' },
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
      { kind: 'user', phrase_examples: ["Analyze audience", "Check demographics", "Audience segmentation"] },
    ],
    id: 'marketing-audience-insights',
    name: 'Marketing Audience Insights',
    description: 'Segment audiences and analyze demographics, behavior, preferences, and campaign response signals.',
    system: 'audience-insights',
    action: 'analyze-audience',
    endpoint: { envVar: 'MARKETING_AUDIENCE_INSIGHTS_ENDPOINT', method: 'POST' },
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
      { kind: 'user', phrase_examples: ["Send email campaign", "Draft email", "Check email metrics"] },
    ],
    id: 'marketing-email',
    name: 'Marketing Email',
    description: 'Draft, schedule, send, and measure marketing email campaigns through a configurable email system.',
    system: 'email',
    action: 'send-email',
    endpoint: { envVar: 'MARKETING_EMAIL_ENDPOINT', method: 'POST' },
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
      { kind: 'user', phrase_examples: ["Upload document", "Tag asset", "Search documents"] },
    ],
    id: 'marketing-document-management',
    name: 'Marketing Document Management',
    description: 'Create, store, retrieve, and organize marketing assets and campaign documents in a configurable document system.',
    system: 'document-management',
    action: 'manage-document',
    endpoint: { envVar: 'MARKETING_DOCUMENT_ENDPOINT', method: 'POST' },
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

const MARKETING_CENTER = createCodeSkill({
  id: 'marketing-center',
  name: 'Marketing Center',
  description: 'Unified interface for marketing operations across content generation, social media, email, SEO, market research, audience insights, and document management. Dispatches to the appropriate external marketing skill based on the selected targetChannel.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
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
    console.log(JSON.stringify({ success: false, error: 'Unknown channel: ' + targetChannel }));
    return;
  }
  const result = await __execute_tool(toolId, data);
  console.log(JSON.stringify(result));
})()`,
    lowerOrderTools: [
      'marketing-content-generation',
      'marketing-social-media',
      'marketing-email',
      'marketing-seo',
      'marketing-market-research',
      'marketing-audience-insights',
      'marketing-document-management',
    ],
  },
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
    { kind: 'user', phrase_examples: ["Open marketing center", "Launch marketing operation", "Start marketing campaign"] },
  ],
});
MARKETING_CENTER.tier = 'represent';
MARKETING_CENTER.confirmBeforeSend = true;
MARKETING_CENTER.domainKnowledge = 'Marketing frameworks (AIDA, RACE, buyer journey), channel-specific best practices (SEO, paid social, email), content strategy, campaign measurement';

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
  'plan-campaign': 'aid',
  'analyze-performance': 'advise',
  'marketing-center': 'represent',
};
const MARKETING_DOMAIN_KNOWLEDGE = 'Marketing frameworks (AIDA, RACE, buyer journey), channel-specific best practices (SEO, paid social, email), content strategy, campaign measurement';
for (const s of MARKETING_SKILLS) {
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

MARKETING_SKILLS.push(MARKETING_CENTER);

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
  else if (s.id === 'marketing-center') s.manifest.workflowStage = 'plan';
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

export { MARKETING_CENTER };
export const marketingCenter = MARKETING_CENTER;

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
