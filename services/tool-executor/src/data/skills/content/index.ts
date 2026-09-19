import { Tool } from '../../../types';
import { createExternalActionSkill, createCodeSkill, SchemaProps } from '../code-skill-factory';

const CONTENT_EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
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
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

const CONTENT_DRAFTING_ADAPTATION = createCodeSkill({
  id: 'content_drafting_adaptation',
  name: 'Content Drafting & Adaptation',
  description:
    'Draft original content (blog posts, social copy, video scripts) and adapt existing content across formats, platforms, languages, and audiences. Runs as reasoning-only on the assistant model using provided context — no external API required.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const task = input.task || 'draft';
const contentType = input.contentType || 'blog';
const topic = input.topic || '';
const sourceContent = input.sourceContent || '';
const targetFormat = input.targetFormat || '';
const targetPlatform = input.targetPlatform || '';
const targetLanguage = input.targetLanguage || '';
const targetAudience = input.targetAudience || '';
const tone = input.tone || 'professional';
const length = input.length || 'medium';
const keywords = input.keywords || [];

const baseDir = process.env.CONTENT_HOME || path.join('/tmp/content');
const storePath = path.join(baseDir, 'drafts.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

let draft = { id: 'draft_' + Date.now(), task, contentType, topic, createdAt: new Date().toISOString(), source: 'reasoning' };

if (task === 'draft') {
  const outlines = {
    blog: [
      'Introduction: Hook the reader, state the problem, preview the solution',
      'Background/Context: Why this matters now',
      'Main Point 1: Core argument with evidence',
      'Main Point 2: Supporting argument or case study',
      'Main Point 3: Counterargument or nuance',
      'Conclusion: Summary, call to action, next steps',
    ],
    social: [
      'Hook: Attention-grabbing opening line',
      'Value: Key insight or benefit',
      'Proof: Credibility signal (data, testimonial, authority)',
      'CTA: Clear next step for the reader',
    ],
    video: [
      'Hook (0-3s): Visual + verbal hook',
      'Intro (3-10s): Who, what, why',
      'Body: 3-5 key segments with timestamps',
      'Recap: One-sentence summary',
      'CTA: Subscribe, link, comment prompt',
    ],
    email: [
      'Subject line options (3-5)',
      'Preheader text',
      'Opening: Personal connection',
      'Body: Value proposition with formatting',
      'Social proof / credibility',
      'CTA: Single clear action',
      'P.S.: Bonus or urgency',
    ],
  };

  draft.outline = outlines[contentType] || outlines.blog;
  draft.draft = \`[DRAFT - \${contentType.toUpperCase()}] \${topic}\n\n\${draft.outline.map((s, i) => \`\${i + 1}. \${s}\`).join('\n\n')}\n\nKeywords to include: \${keywords.join(', ') || 'none specified'}\nTone: \${tone}\nTarget length: \${length}\`;
  draft.wordCount = Math.floor(draft.draft.split(' ').length);
} else if (task === 'adapt') {
  if (!sourceContent) {
    console.log(JSON.stringify({ success: false, error: 'sourceContent is required for adaptation task' }));
    return;
  }
  draft.sourceContent = sourceContent;
  draft.targetFormat = targetFormat;
  draft.targetPlatform = targetPlatform;
  draft.targetLanguage = targetLanguage;
  draft.targetAudience = targetAudience;
  draft.adaptedContent = \`[ADAPTED: \${targetFormat || 'same format'} for \${targetPlatform || 'same platform'}]\n\n\${sourceContent}\n\n--- Adaptation notes ---\n- Platform: \${targetPlatform || 'N/A'}\n- Format: \${targetFormat || 'N/A'}\n- Language: \${targetLanguage || 'N/A'}\n- Audience: \${targetAudience || 'N/A'}\n- Tone: \${tone}\n- Length: \${length}\n- Keywords preserved: \${keywords.join(', ') || 'none'}\`;
  draft.wordCount = Math.floor(draft.adaptedContent.split(' ').length);
} else if (task === 'repurpose') {
  if (!sourceContent) {
    console.log(JSON.stringify({ success: false, error: 'sourceContent is required for repurpose task' }));
    return;
  }
  draft.sourceContent = sourceContent;
  draft.repurposedVersions = {
    blog: 'Expanded long-form version with sections, headers, and SEO structure',
    linkedin: 'Professional tone, 1300 chars max, line breaks for readability, 3-5 hashtags',
    twitter: 'Thread format: hook + 5-7 tweets + CTA, 280 chars each',
    email: 'Subject lines + preheader + body with single CTA',
    script: 'Video/podcast script with timestamps and visual cues',
  };
  draft.recommendation = 'Start with the blog version for SEO, then atomize into social/email';
}

store.push(draft);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: { draft, storePath } }));
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      task: SchemaProps.select(['draft', 'adapt', 'repurpose'], { description: 'Operation: draft new content, adapt existing content, or repurpose into multiple formats' }),
      contentType: SchemaProps.select(['blog', 'social', 'video', 'email', 'script', 'whitepaper', 'case-study', 'newsletter'], { description: 'Type of content to draft' }),
      topic: SchemaProps.text({ description: 'Topic or title for new content' }),
      sourceContent: SchemaProps.text({ description: 'Existing content to adapt or repurpose (required for adapt/repurpose tasks)', multiline: true }),
      targetFormat: SchemaProps.select(['blog', 'social', 'video', 'email', 'script', 'thread', 'carousel', 'short-form', 'long-form'], { description: 'Target format for adaptation' }),
      targetPlatform: SchemaProps.select(['linkedin', 'twitter', 'instagram', 'facebook', 'youtube', 'tiktok', 'blog', 'newsletter', 'medium', 'substack'], { description: 'Target platform for adaptation' }),
      targetLanguage: SchemaProps.text({ description: 'Target language for translation/localization' }),
      targetAudience: SchemaProps.text({ description: 'Target audience description for adaptation' }),
      tone: SchemaProps.select(['professional', 'conversational', 'authoritative', 'friendly', 'witty', 'empathetic', 'technical', 'persuasive'], { description: 'Writing tone', default: 'professional' }),
      length: SchemaProps.select(['short', 'medium', 'long'], { description: 'Target length', default: 'medium' }),
      keywords: SchemaProps.stringArray({ description: 'Keywords to include or preserve' }),
    },
    required: ['task'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success'],
  },
});

const MULTI_CHANNEL_PUBLISHING = createExternalActionSkill({
  id: 'content_multi_channel_publishing',
  name: 'Multi-Channel Publishing',
  description: 'Publish, schedule, and manage content across blog, social, video, and newsletter channels. One skill with a channel parameter replaces four near-duplicate platform wrappers.',
  system: 'content_publishing',
  action: 'publish',
  endpoint: { envVar: 'CONTENT_PUBLISHING_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { token: 'CONTENT_PUBLISHING_ACCESS_TOKEN' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Publishing platform base URL' },
      token: { type: 'string', description: 'Publishing platform bearer token' },
      provider: { type: 'string', enum: ['wordpress', 'ghost', 'medium', 'substack', 'contentful', 'strapi', 'sanity', 'custom'], description: 'CMS/blog provider' },
      socialProviders: { type: 'object', description: 'Connected social accounts', properties: { linkedin: { type: 'object' }, twitter: { type: 'object' }, instagram: { type: 'object' }, facebook: { type: 'object' }, youtube: { type: 'object' }, tiktok: { type: 'object' } } },
      videoProviders: { type: 'object', description: 'Connected video platforms', properties: { youtube: { type: 'object' }, vimeo: { type: 'object' }, wistia: { type: 'object' }, mux: { type: 'object' } } },
      newsletterProviders: { type: 'object', description: 'Connected newsletter platforms', properties: { mailchimp: { type: 'object' }, convertkit: { type: 'object' }, beehiiv: { type: 'object' }, custom: { type: 'object' } } },
      defaultCategory: { type: 'string', description: 'Default blog category' },
      defaultTags: { type: 'array', items: { type: 'string' }, description: 'Default tags' },
      defaultPrivacy: { type: 'string', enum: ['public', 'unlisted', 'private'], description: 'Default video privacy' },
    },
    required: ['baseUrl', 'token'],
  },
  credentialSource: {
    token: { envVar: 'CONTENT_PUBLISHING_ACCESS_TOKEN', configKey: 'content.publishing.token' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      channel: SchemaProps.select(['blog', 'social', 'video', 'newsletter', 'all'], { description: 'Channel to publish to' }),
      operation: SchemaProps.select(['create', 'update', 'publish', 'schedule', 'delete', 'get', 'list'], { description: 'Publishing operation' }),
      contentId: { type: 'string', description: 'Existing content ID for update/delete/get' },
      title: { type: 'string', description: 'Content title' },
      content: { type: 'string', description: 'Content body (markdown/HTML)', multiline: true },
      excerpt: { type: 'string', description: 'Short summary/excerpt' },
      category: { type: 'string', description: 'Blog category' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
      slug: { type: 'string', description: 'URL slug' },
      featuredImage: { type: 'string', description: 'Featured image URL' },
      seoTitle: { type: 'string', description: 'SEO title' },
      seoDescription: { type: 'string', description: 'SEO meta description' },
      status: SchemaProps.select(['draft', 'published', 'scheduled', 'private'], { description: 'Publishing status', default: 'draft' }),
      scheduledAt: { type: 'string', description: 'Scheduled publish datetime (ISO 8601)' },
      platform: SchemaProps.select(['linkedin', 'twitter', 'instagram', 'facebook', 'youtube', 'tiktok', 'threads'], { description: 'Social platform (required for social channel)' }),
      message: { type: 'string', description: 'Social post message', multiline: true },
      hashtags: { type: 'array', items: { type: 'string' }, description: 'Hashtags' },
      videoId: { type: 'string', description: 'Video ID for update/delete/get' },
      videoTitle: { type: 'string', description: 'Video title' },
      videoDescription: { type: 'string', description: 'Video description', multiline: true },
      videoTags: { type: 'array', items: { type: 'string' }, description: 'Video tags' },
      videoCategory: { type: 'string', description: 'Video category' },
      privacy: SchemaProps.select(['public', 'unlisted', 'private'], { description: 'Video privacy' }),
      thumbnailUrl: { type: 'string', description: 'Thumbnail image URL' },
      videoFile: { type: 'string', description: 'Video file path or URL' },
      playlistId: { type: 'string', description: 'Playlist ID' },
      newsletterId: { type: 'string', description: 'Newsletter/campaign ID' },
      subject: { type: 'string', description: 'Email subject' },
      htmlBody: { type: 'string', description: 'HTML email body', multiline: true },
      textBody: { type: 'string', description: 'Plain text email body', multiline: true },
      recipientList: { type: 'string', description: 'Recipient list/segment ID' },
      fromName: { type: 'string', description: 'From name' },
      fromEmail: { type: 'string', description: 'From email' },
      endpointUrl: { type: 'string', description: 'Optional endpoint override' },
      dryRun: { type: 'boolean', description: 'Validate without publishing' },
    },
    required: ['channel', 'operation'],
  },
  outputSchema: CONTENT_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 120000,
});

const CONTENT_PERFORMANCE_SEO = createExternalActionSkill({
  id: 'content_performance_seo',
  name: 'Content Performance & SEO Insight',
  description: 'Analyze content performance across channels, track SEO rankings, and surface audience insights. Combines analytics, trend analysis, audience insights, and SEO into one hybrid skill.',
  system: 'content_intelligence',
  action: 'analyze',
  endpoint: { envVar: 'CONTENT_INTELLIGENCE_ENDPOINT', method: 'POST' },
  auth: {
    type: 'api_key',
    header: 'X-API-Key',
    credentialEnvKeyMap: { apiKey: 'CONTENT_INTELLIGENCE_API_KEY' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Content intelligence platform base URL' },
      apiKey: { type: 'string', description: 'Content intelligence API key' },
      provider: { type: 'string', enum: ['google-analytics', 'matomo', 'mixpanel', 'amplitude', 'semrush', 'ahrefs', 'search-console', 'custom'], description: 'Primary analytics/SEO provider' },
      secondaryProviders: { type: 'array', items: { type: 'string' }, description: 'Additional connected providers' },
      defaultDateRange: { type: 'string', description: 'Default analysis period' },
      defaultMetrics: { type: 'array', items: { type: 'string' }, description: 'Default metrics to track' },
      defaultDimensions: { type: 'array', items: { type: 'string' }, description: 'Default dimensions to analyze' },
      searchEngines: { type: 'array', items: { type: 'string' }, description: 'Search engines for SEO tracking' },
      defaultMarket: { type: 'string', description: 'Default market/region' },
    },
    required: ['baseUrl', 'apiKey', 'provider'],
  },
  credentialSource: {
    apiKey: { envVar: 'CONTENT_INTELLIGENCE_API_KEY', configKey: 'content.intelligence.apiKey' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['overview', 'detail', 'compare', 'trend', 'report', 'export', 'audit', 'research', 'optimize', 'track', 'segment', 'profile', 'analyze', 'enrich'], { description: 'Analysis operation' }),
      contentIds: { type: 'array', items: { type: 'string' }, description: 'Content identifiers to analyze' },
      channel: { type: 'string', description: 'Channel/platform (blog, social, video, email, organic, paid)' },
      platform: { type: 'string', description: 'Specific platform (linkedin, youtube, google, etc.)' },
      metrics: { type: 'array', items: { type: 'string' }, description: 'Metrics to track' },
      dimensions: { type: 'array', items: { type: 'string' }, description: 'Dimensions to analyze' },
      dateRange: { type: 'object', description: 'Date range for analysis' },
      filters: { type: 'object', description: 'Filters to apply' },
      groupBy: { type: 'string', description: 'Field to group results by' },
      url: { type: 'string', description: 'URL for SEO audit/optimization' },
      keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords for research/tracking' },
      targetKeywords: { type: 'array', items: { type: 'string' }, description: 'Target keywords for optimization' },
      market: { type: 'string', description: 'Market/region for SEO' },
      searchEngine: { type: 'string', description: 'Search engine (google, bing, etc.)' },
      competitorUrls: { type: 'array', items: { type: 'string' }, description: 'Competitor URLs for comparison' },
      audienceId: { type: 'string', description: 'Audience identifier for segmentation' },
      demographics: { type: 'object', description: 'Demographic filters' },
      interests: { type: 'array', items: { type: 'string' }, description: 'Interest categories' },
      behaviors: { type: 'array', items: { type: 'object' }, description: 'Behavioral signals' },
      endpointUrl: { type: 'string', description: 'Optional endpoint override' },
      dryRun: { type: 'boolean', description: 'Validate without executing' },
    },
    required: ['operation'],
  },
  outputSchema: CONTENT_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 120000,
});

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

CONTENT_DRAFTING_ADAPTATION.manifest.workflowStage = 'draft';
CONTENT_PERFORMANCE_SEO.manifest.workflowStage = 'optimize';
MULTI_CHANNEL_PUBLISHING.manifest.workflowStage = 'publish';

export const contentSkills = [CONTENT_DRAFTING_ADAPTATION, MULTI_CHANNEL_PUBLISHING, CONTENT_PERFORMANCE_SEO];
const CONTENT_HIGHER_ORDER_TRIGGERS = [
  { kind: 'user' as const, phrase_examples: ['evaluate content strategy', 'plan the editorial calendar', 'stage a CMS publish'] },
  { kind: 'schedule' as const, cadence: 'weekly editorial queue and performance review' },
  { kind: 'event' as const, on: 'draft completion, publishing request, or performance threshold' },
]

const CONTENT_STRATEGY_SOURCE = `(async () => { const input = __tool_input || {}; const items = Array.isArray(input.contentItems) ? input.contentItems : []; const connected = await __execute_tool('content_performance_seo', { operation: 'analyze', contentIds: input.contentIds || items.map((item) => item.id), channel: input.channel, platform: input.platform, metrics: input.metrics || ['impressions', 'clicks', 'conversions'], dateRange: input.dateRange, endpointUrl: input.endpointUrl }); const connectedData = connected && connected.data ? connected.data : null; const records = items.length ? items : (connectedData && Array.isArray(connectedData.records) ? connectedData.records : []); if (!records.length) { console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: no content performance records or connected analytics result were supplied' })); return; } const evaluated = records.map((item) => { const impressions = Number(item.impressions || 0); const clicks = Number(item.clicks || 0); const conversions = Number(item.conversions || 0); const ctr = impressions > 0 ? Math.round(clicks / impressions * 10000) / 100 : 0; const conversionRate = clicks > 0 ? Math.round(conversions / clicks * 10000) / 100 : 0; const keywordMatch = Number(item.keywordMatch || input.keywordMatch || 0); const score = Math.round((ctr * 0.35 + conversionRate * 0.35 + keywordMatch * 0.3) * 10) / 10; return { id: item.id || item.contentId, title: item.title, ctr, conversionRate, keywordMatch, score, recommendation: score < 40 ? 'revise intent and metadata' : score < 70 ? 'expand distribution and internal links' : 'protect and scale' }; }); console.log(JSON.stringify({ success: true, data: { evaluated, summary: { items: evaluated.length, averageScore: evaluated.reduce((sum, item) => sum + item.score, 0) / evaluated.length } } })); })();`

const EDITORIAL_CALENDAR_SOURCE = `(async () => { const input = __tool_input || {}; const topics = Array.isArray(input.topics) ? input.topics : []; if (!topics.length) { console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: no editorial topics were supplied' })); return; } const drafts = []; for (const topic of topics) { const result = await __execute_tool('content_drafting_adaptation', { task: 'draft', contentType: topic.format || 'blog', topic: topic.title, targetPlatform: topic.platform, targetAudience: topic.audience, tone: topic.tone, length: topic.length, keywords: topic.keywords || [] }); drafts.push({ topic, draft: result && result.data ? result.data.draft : null, status: result && result.success ? 'drafted' : 'blocked' }); } console.log(JSON.stringify({ success: true, data: { calendar: topics.map((topic, index) => ({ id: 'editorial_' + (input.startDate || 'next-cycle') + '_' + index, title: topic.title, audience: topic.audience, intent: topic.intent, primaryKeyword: (topic.keywords || [])[0] || topic.keyword, format: topic.format || 'article', dueDate: topic.deadline, status: 'planned' })), drafts } })); })();`

const PUBLISHING_DISPATCH_SOURCE = `(async () => { const input = __tool_input || {}; if (!input.endpointUrl && !input.channel) { console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: provide a CMS endpoint or publishing channel' })); return; } if (input.dryRun !== true && input.confirmation !== true) { console.log(JSON.stringify({ success: false, mode: 'confirmation-required', error: 'Explicit confirmation is required for live publishing' })); return; } const result = await __execute_tool('content_multi_channel_publishing', { channel: input.channel || 'blog', operation: input.confirmation === true ? 'publish' : 'create', contentId: input.contentId, title: input.title, content: input.content, excerpt: input.excerpt, category: input.category, tags: input.tags, slug: input.slug, seoTitle: input.seoTitle, seoDescription: input.seoDescription, status: input.dryRun === true ? 'draft' : 'published', endpointUrl: input.endpointUrl, dryRun: input.dryRun !== false }); console.log(JSON.stringify({ success: Boolean(result && result.success), mode: input.dryRun === true ? 'dry-run' : result && result.mode ? result.mode : 'live', data: result && result.data ? result.data : null, error: result && result.error ? result.error : null })); })();`

const CONTENT_STRATEGY_SEO_EVALUATOR: Tool = { id: 'content-strategy-seo-evaluator', name: 'Content Strategy & SEO Evaluator', description: 'Evaluate supplied content performance records or connected analytics results to recommend editorial, SEO, and distribution actions.', type: 'code', manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: CONTENT_STRATEGY_SOURCE, persistenceEnv: 'CONTENT_HOME', ui: { view: 'content-strategy' } }, inputSchema: { type: 'object', properties: { contentItems: { type: 'array', items: { type: 'object' }, description: 'Content performance records with impressions, clicks, conversions, and keyword match' }, contentIds: { type: 'array', items: { type: 'string' }, description: 'Content identifiers for connected analytics' }, channel: { type: 'string', description: 'Channel or platform' }, platform: { type: 'string', description: 'Specific analytics platform' }, metrics: { type: 'array', items: { type: 'string' }, description: 'Metrics to analyze' }, dateRange: { type: 'object', description: 'Analysis date range' }, endpointUrl: { type: 'string', description: 'Optional connected analytics endpoint override' }, keywordMatch: { type: 'number', description: 'Default search-intent match score from 0 to 100' } }, required: [] }, outputSchema: { type: 'object', properties: { success: { type: 'boolean', description: 'Whether evaluation completed' }, data: { type: 'object', description: 'Evaluated records and summary' }, mode: { type: 'string', description: 'Execution mode' }, error: { type: 'string', description: 'Failure message' } } }, triggers: CONTENT_HIGHER_ORDER_TRIGGERS, createdAt: new Date(), updatedAt: new Date(), isSkill: true }

const EDITORIAL_CALENDAR_ARTICLE_COPILOT: Tool = { id: 'editorial-calendar-article-copilot', name: 'Editorial Calendar & Article Co-Pilot', description: 'Turn supplied editorial topics into a structured calendar and draft article briefs using the existing content drafting operation.', type: 'code', manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: EDITORIAL_CALENDAR_SOURCE, persistenceEnv: 'CONTENT_HOME', ui: { view: 'editorial-calendar' } }, inputSchema: { type: 'object', properties: { topics: { type: 'array', items: { type: 'object' }, description: 'Editorial topics with title, audience, intent, format, platform, keywords, tone, length, and deadline' }, startDate: { type: 'string', description: 'Calendar cycle start label' } }, required: ['topics'] }, outputSchema: { type: 'object', properties: { success: { type: 'boolean', description: 'Whether calendar generation completed' }, data: { type: 'object', description: 'Calendar and draft briefs' }, mode: { type: 'string', description: 'Execution mode' }, error: { type: 'string', description: 'Failure message' } } }, triggers: CONTENT_HIGHER_ORDER_TRIGGERS, createdAt: new Date(), updatedAt: new Date(), isSkill: true }

const GOVERNED_PUBLISHING_CMS_DISPATCHER: Tool = { id: 'governed-publishing-cms-dispatcher', name: 'Governed Publishing & CMS Dispatcher', description: 'Dry-run and, after explicit confirmation, publish a validated content payload through the existing multi-channel publishing operation.', type: 'code', manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: PUBLISHING_DISPATCH_SOURCE, persistenceEnv: 'CONTENT_HOME', confirmBeforeSend: true, ui: { view: 'publishing-approval' } }, inputSchema: { type: 'object', properties: { endpointUrl: { type: 'string', description: 'Configured CMS endpoint override' }, channel: { type: 'string', description: 'Publishing channel' }, contentId: { type: 'string', description: 'Existing content identifier' }, title: { type: 'string', description: 'Content title' }, content: { type: 'string', description: 'Content body', multiline: true }, excerpt: { type: 'string', description: 'Content excerpt' }, category: { type: 'string', description: 'Content category' }, tags: { type: 'array', items: { type: 'string' }, description: 'Content tags' }, slug: { type: 'string', description: 'URL slug' }, seoTitle: { type: 'string', description: 'SEO title' }, seoDescription: { type: 'string', description: 'SEO meta description' }, dryRun: { type: 'boolean', description: 'Validate without publishing; defaults to true', default: true }, confirmation: { type: 'boolean', description: 'Explicit approval for live publishing', default: false } }, required: [] }, outputSchema: { type: 'object', properties: { success: { type: 'boolean', description: 'Whether publishing completed' }, mode: { type: 'string', description: 'Dry-run, live, not-connected, or error mode' }, data: { type: 'object', description: 'Publishing result' }, error: { type: 'string', description: 'Failure or governance message' } } }, triggers: CONTENT_HIGHER_ORDER_TRIGGERS, createdAt: new Date(), updatedAt: new Date(), isSkill: true }

for (const tool of contentSkills) { if (![CONTENT_STRATEGY_SEO_EVALUATOR.id, EDITORIAL_CALENDAR_ARTICLE_COPILOT.id, GOVERNED_PUBLISHING_CMS_DISPATCHER.id].includes(tool.id)) { tool.isSkill = false } }
contentSkills.push(CONTENT_STRATEGY_SEO_EVALUATOR, EDITORIAL_CALENDAR_ARTICLE_COPILOT, GOVERNED_PUBLISHING_CMS_DISPATCHER)

CONTENT_STRATEGY_SEO_EVALUATOR.manifest.workflowStage = 'optimize';
EDITORIAL_CALENDAR_ARTICLE_COPILOT.manifest.workflowStage = 'plan';
GOVERNED_PUBLISHING_CMS_DISPATCHER.manifest.workflowStage = 'publish';

export const contentWorkflow: AssistantWorkflow = {
  assistant: 'Content',
  productObject: 'content piece',
  flow: 'plan → draft → optimize → publish',
  stages: [
    { name: 'plan', description: 'Editorial calendar and brief planning', skills: contentSkills.filter((s) => s.manifest.workflowStage === 'plan') },
    { name: 'draft', description: 'Content drafting and adaptation', skills: contentSkills.filter((s) => s.manifest.workflowStage === 'draft') },
    { name: 'optimize', description: 'Performance, SEO, and strategy optimization', skills: contentSkills.filter((s) => s.manifest.workflowStage === 'optimize') },
    { name: 'publish', description: 'Multi-channel publishing and dispatch', skills: contentSkills.filter((s) => s.manifest.workflowStage === 'publish') },
  ],
};
