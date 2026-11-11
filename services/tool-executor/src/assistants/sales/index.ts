import { Tool } from "../../types";
import { LEAD_DEAL_ADVISORY } from "./skills/lead-deal-advisory";
import { OUTREACH_DRAFTING } from "./skills/outreach-drafting";
import { PIPELINE_OPS } from "./skills/pipeline-ops";
import { ACCOUNT_BRIEF_GENERATOR } from './skills/account-brief';
import { CRM_SYNC } from './tools/sales-crm-sync';
import { SALES_OUTREACH_DRAFTER } from './tools/sales-lower-order-tools';
import { SALES_LEAD_DEAL_ADVISOR } from './tools/sales-lead-deal-advisory-tools';
import { createWorkflow } from '../../adk/workflow-common';

export const salesLowerOrderTools: Tool[] = [SALES_OUTREACH_DRAFTER, SALES_LEAD_DEAL_ADVISOR];

export const salesSkills: Tool[] = [
  LEAD_DEAL_ADVISORY,
  OUTREACH_DRAFTING,
  PIPELINE_OPS,
  ACCOUNT_BRIEF_GENERATOR,
  CRM_SYNC,
  ...salesLowerOrderTools,
];

export const salesWorkflow = createWorkflow({
  assistant: 'Sales',
  productObject: 'lead / opportunity',
  flow: 'discovery → proposal → close',
  skills: salesSkills,
});

export { SALES_OUTREACH_DRAFTER, SALES_LEAD_DEAL_ADVISOR };
