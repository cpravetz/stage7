import { Tool } from '../../types';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';

import { CREATE_ROADMAP } from './skills/create-roadmap';
import { PRODUCT_CALENDAR } from './tools/product-calendar';
import { PRODUCT_CONFLUENCE } from './tools/product-confluence';
import { PRODUCT_DATA_ANALYSIS_USER } from './skills/product-data-analysis-user';
import { PRODUCT_INSIGHTS_SCHEDULED } from './skills/product-insights-scheduled';
import { PRODUCT_JIRA } from './tools/product-jira';
import { PRODUCT_MARKDOWN_PARSING } from './tools/product-markdown-parsing';
import { PRODUCT_SLACK } from './tools/product-slack';
import { WRITE_PRD } from './skills/write-prd';
import { PRODUCT_DOMAIN_KNOWLEDGE, PRODUCT_EXTERNAL_TOOL_IDS, PRODUCT_TIER } from './product-contract';

const PRODUCT_SKILLS: Tool[] = [
    CREATE_ROADMAP,    WRITE_PRD,    PRODUCT_JIRA,    PRODUCT_CONFLUENCE,    PRODUCT_DATA_ANALYSIS_USER,    PRODUCT_INSIGHTS_SCHEDULED,    PRODUCT_SLACK,    PRODUCT_CALENDAR,    PRODUCT_MARKDOWN_PARSING,];
for (const s of PRODUCT_SKILLS) {
  if (PRODUCT_EXTERNAL_TOOL_IDS.has(s.id)) {
    s.isSkill = false;
  }
}
for (const s of PRODUCT_SKILLS) {
  if (PRODUCT_TIER[s.id]) {
    (s as Tool).tier = PRODUCT_TIER[s.id];
  }
  if (PRODUCT_DOMAIN_KNOWLEDGE) {
    (s as Tool).domainKnowledge = PRODUCT_DOMAIN_KNOWLEDGE;
  }
  // Represent-tier skills require confirmBeforeSend
  if ((s as Tool).tier === 'represent' && (s as Tool).confirmBeforeSend === undefined) {
    (s as Tool).confirmBeforeSend = true;
  }
}

export const productSkills = PRODUCT_SKILLS;

export const productWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Product',
  productObject: 'product / order',
  flow: 'plan → specify → analyze → deliver',
  skills: PRODUCT_SKILLS,
});
