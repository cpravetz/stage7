import { Tool } from '../../types';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';

import { ANALYZE_PERFORMANCE } from './skills/analyze-performance';
import { MARKETING_CENTER } from './skills/campaign-execution-orchestrator';
import { MARKETING_AUDIENCE_INSIGHTS } from './skills/marketing-audience-insights';
import { MARKETING_CONTENT_GENERATION } from './tools/marketing-content-generation';
import { MARKETING_DOCUMENT_MANAGEMENT } from './tools/marketing-document-management';
import { MARKETING_EMAIL } from './tools/marketing-email';
import { MARKETING_MARKET_RESEARCH } from './skills/marketing-market-research';
import { MARKETING_REPORTS_SCHEDULED } from './skills/marketing-reports-scheduled';
import { MARKETING_SEO } from './skills/marketing-seo';
import { MARKETING_SOCIAL_MEDIA } from './tools/marketing-social-media';
import { PLAN_CAMPAIGN } from './skills/plan-campaign';
import { MARKETING_DOMAIN_KNOWLEDGE, MARKETING_EXTERNAL_TOOL_IDS, MARKETING_TIER } from './marketing-contract';

const MARKETING_SKILLS: Tool[] = [PLAN_CAMPAIGN, ANALYZE_PERFORMANCE];

const MARKETING_EXTERNAL_SKILLS: Tool[] = [
    MARKETING_CONTENT_GENERATION,    MARKETING_SOCIAL_MEDIA,    MARKETING_SEO,    MARKETING_MARKET_RESEARCH,    MARKETING_AUDIENCE_INSIGHTS,    MARKETING_EMAIL,    MARKETING_DOCUMENT_MANAGEMENT,];

MARKETING_CENTER.tier = 'represent';
MARKETING_CENTER.confirmBeforeSend = true;
MARKETING_CENTER.domainKnowledge = 'Marketing frameworks (AIDA, RACE, buyer journey), channel-specific best practices (SEO, paid social, email), content strategy, campaign measurement';
MARKETING_CENTER.isSkill = true;
for (const s of MARKETING_EXTERNAL_SKILLS) {
  if (MARKETING_EXTERNAL_TOOL_IDS.has(s.id)) {
    s.isSkill = false;
  }
}
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

// The former `marketingCenter` alias is gone: it named a Skill id that no
// longer exists after the Class 4 decomposition, and nothing imported it.
export { MARKETING_CENTER, MARKETING_REPORTS_SCHEDULED };

export const marketingWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Marketing',
  productObject: 'campaign',
  flow: 'plan → create → publish → analyze',
  skills: marketingSkills,
});
