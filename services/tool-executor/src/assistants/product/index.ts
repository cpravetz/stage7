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
import { DELIVERY_SYNC } from './skills/product-delivery-sync-orchestrator';
import { PRODUCT_DOMAIN_KNOWLEDGE } from './product-contract';

const PRODUCT_SKILLS: Tool[] = [
    DELIVERY_SYNC,
    CREATE_ROADMAP,    WRITE_PRD,    PRODUCT_JIRA,    PRODUCT_CONFLUENCE,    PRODUCT_DATA_ANALYSIS_USER,    PRODUCT_INSIGHTS_SCHEDULED,    PRODUCT_SLACK,    PRODUCT_CALENDAR,    PRODUCT_MARKDOWN_PARSING,];
// Tier and isSkill are declared where each capability is defined. Domain
// knowledge is descriptive rather than policy, so the shared default is filled in
// for the capabilities that do not carry their own.
for (const s of PRODUCT_SKILLS) {
  if (PRODUCT_DOMAIN_KNOWLEDGE && !(s as Tool).domainKnowledge) {
    (s as Tool).domainKnowledge = PRODUCT_DOMAIN_KNOWLEDGE;
  }
}

export const productSkills = PRODUCT_SKILLS;

export const productWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Product',
  productObject: 'product / order',
  flow: 'plan → specify → analyze → deliver',
  skills: PRODUCT_SKILLS,
});
