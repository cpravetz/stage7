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

export const contentSkills = [CONTENT_DRAFTING_ADAPTATION, MULTI_CHANNEL_PUBLISHING, CONTENT_PERFORMANCE_SEO];