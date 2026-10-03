import { createExternalActionSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { CONTENT_EXTERNAL_OUTPUT_SCHEMA } from './content-external-schema';

/**
 * Lower-order publishing tool. This is the transport layer: it signs and sends the request and
 * returns the platform's response verbatim. It deliberately does not render a report — the
 * governance skill that calls it is responsible for turning the outcome into something a person
 * reads, and it does that from this tool's real response.
 */
export const MULTI_CHANNEL_PUBLISHING = createExternalActionSkill({
  id: 'content-multi-channel-publishing',
  name: 'Multi-Channel Publishing',
  description: 'Publish, schedule, and manage content across blog, social, video, and newsletter channels. One skill with a channel parameter replaces four near-duplicate platform wrappers.',
  system: 'content_publishing',
  action: 'publish',
  endpoint: { configKey: 'CONTENT_PUBLISHING_ENDPOINT', method: 'POST' },
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
      dryRun: { type: 'boolean', description: 'Validate without publishing' },
    },
    required: ['channel'],
  },
  outputSchema: CONTENT_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 120000,
  // This is a live write and it is directly invocable: `isSkill: false` means
  // routes/tools.ts does not require assistant context to run it, so
  // POST /tools/content-multi-channel-publishing/execute reaches the CMS with
  // status "published" and no approval anywhere in the path. Being the dispatcher's
  // transport is not the same as being reachable only through the dispatcher.
  // The gate is enforced here rather than inherited, and approval propagation
  // (ToolExecutor.nestedExecutorCallback carrying an approved parent's
  // confirmation into the callee) is what keeps the approved publish path working.
  confirmBeforeSend: true,
  manifest: { confirmBeforeSend: true },
  isSkill: false,
});
