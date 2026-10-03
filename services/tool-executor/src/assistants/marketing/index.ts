import { Tool } from '../../types';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';

import { ANALYZE_PERFORMANCE } from './skills/analyze-performance';
import { MARKETING_CENTER } from './skills/marketing-campaign-execution-orchestrator';
import { MARKETING_AUDIENCE_INSIGHTS } from './skills/marketing-audience-insights';
import { MARKETING_CONTENT_GENERATION } from './tools/marketing-content-generation';
import { MARKETING_DOCUMENT_MANAGEMENT } from './tools/marketing-document-management';
import { MARKETING_EMAIL } from './tools/marketing-email';
import { MARKETING_MARKET_RESEARCH } from './skills/marketing-market-research';
import { MARKETING_REPORTS_SCHEDULED } from './skills/marketing-reports-scheduled';
import { MARKETING_SEO } from './skills/marketing-seo';
import { MARKETING_SOCIAL_MEDIA } from './tools/marketing-social-media';
import { PLAN_CAMPAIGN } from './skills/plan-campaign';
import { MARKETING_DOMAIN_KNOWLEDGE } from './marketing-contract';

const MARKETING_SKILLS: Tool[] = [PLAN_CAMPAIGN, ANALYZE_PERFORMANCE];

const MARKETING_EXTERNAL_SKILLS: Tool[] = [
    MARKETING_CONTENT_GENERATION,    MARKETING_SOCIAL_MEDIA,    MARKETING_SEO,    MARKETING_MARKET_RESEARCH,    MARKETING_AUDIENCE_INSIGHTS,    MARKETING_EMAIL,    MARKETING_DOCUMENT_MANAGEMENT,];

if (!MARKETING_CENTER.domainKnowledge) {
  MARKETING_CENTER.domainKnowledge = 'Marketing frameworks (AIDA, RACE, buyer journey), channel-specific best practices (SEO, paid social, email), content strategy, campaign measurement';
}
// Tier and isSkill are declared where each capability is defined, so they are no
// longer re-applied from a table here: a second table could disagree with the
// definition site and the gate would follow whichever ran last. Domain knowledge
// is descriptive rather than policy, so the shared default is still filled in.
for (const s of [...MARKETING_SKILLS, ...MARKETING_EXTERNAL_SKILLS]) {
  if (MARKETING_DOMAIN_KNOWLEDGE && !(s as Tool).domainKnowledge) {
    (s as Tool).domainKnowledge = MARKETING_DOMAIN_KNOWLEDGE;
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
