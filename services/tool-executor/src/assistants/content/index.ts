import { Tool } from '../../types';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';
import { CONTENT_DRAFTING_ADAPTATION } from './tools/content-drafting-adaptation';
import { CONTENT_PERFORMANCE_SEO } from './tools/content-performance-seo';
import { CONTENT_STRATEGY_SEO_EVALUATOR } from './skills/content-strategy-seo-evaluator';
import { EDITORIAL_CALENDAR_ARTICLE_COPILOT } from './skills/editorial-calendar-article-copilot';
import { GOVERNED_PUBLISHING_CMS_DISPATCHER } from './skills/governed-publishing-cms-dispatcher';
import { MULTI_CHANNEL_PUBLISHING } from './tools/content-multi-channel-publishing';

export {
  CONTENT_DRAFTING_ADAPTATION,
  CONTENT_PERFORMANCE_SEO,
  CONTENT_STRATEGY_SEO_EVALUATOR,
  EDITORIAL_CALENDAR_ARTICLE_COPILOT,
  GOVERNED_PUBLISHING_CMS_DISPATCHER,
  MULTI_CHANNEL_PUBLISHING,
};

/** Lower-order tools the represent-tier skills delegate to. Not skills in their own right. */
const CONTENT_SUPPORT_TOOLS: Tool[] = [
  CONTENT_DRAFTING_ADAPTATION,
  MULTI_CHANNEL_PUBLISHING,
  CONTENT_PERFORMANCE_SEO,
];

/** The Content Creator's own skills: the three tools in its catalog entry. */
const CONTENT_CANONICAL_SKILLS: Tool[] = [
  CONTENT_STRATEGY_SEO_EVALUATOR,
  EDITORIAL_CALENDAR_ARTICLE_COPILOT,
  GOVERNED_PUBLISHING_CMS_DISPATCHER,
];

export const contentSkills: Tool[] = [...CONTENT_SUPPORT_TOOLS, ...CONTENT_CANONICAL_SKILLS];

export const contentWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Content',
  productObject: 'content piece',
  flow: 'plan → draft → optimize → publish',
  skills: contentSkills,
});
