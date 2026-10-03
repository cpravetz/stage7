import { Tool } from "../../types";
import { LEAD_DEAL_ADVISORY } from "./skills/lead-deal-advisory";
import { OUTREACH_DRAFTING } from "./skills/outreach-drafting";
import { PIPELINE_OPS } from "./skills/pipeline-ops";
import { ACCOUNT_BRIEF_GENERATOR } from './skills/account-brief';
import { CRM_SYNC } from './tools/crm-sync';
import { createWorkflow } from '../../adk/workflow-common';

export const salesSkills: Tool[] = [
  LEAD_DEAL_ADVISORY,
  OUTREACH_DRAFTING,
  PIPELINE_OPS,
  ACCOUNT_BRIEF_GENERATOR,
  CRM_SYNC,
];

export const salesWorkflow = createWorkflow({
  assistant: 'Sales',
  productObject: 'lead / opportunity',
  flow: 'discovery → proposal → close',
  skills: salesSkills,
});
