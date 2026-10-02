import { Tool } from "../../../types";
import { LEAD_DEAL_ADVISORY } from "./lead-deal-advisory";
import { OUTREACH_DRAFTING } from "./outreach-drafting";
import { PIPELINE_OPS } from "./pipeline-ops";
import { createWorkflow } from '../workflow-common';

export const salesSkills: Tool[] = [
  LEAD_DEAL_ADVISORY,
  OUTREACH_DRAFTING,
  PIPELINE_OPS,
];

export const salesWorkflow = createWorkflow({
  assistant: 'Sales',
  productObject: 'lead / opportunity',
  flow: 'discovery → proposal → close',
  skills: salesSkills,
});
