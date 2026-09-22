import { Tool } from "../../../types";
import { LEAD_DEAL_ADVISORY } from "./lead-deal-advisory";
import { OUTREACH_DRAFTING } from "./outreach-drafting";
import { PIPELINE_OPS } from "./pipeline-ops";
import { annotateStages, createWorkflow, AssistantWorkflow } from "../workflow-common";

export const salesSkills: Tool[] = [
  LEAD_DEAL_ADVISORY,
  OUTREACH_DRAFTING,
  PIPELINE_OPS,
];

annotateStages(salesSkills, {
  'lead-deal-advisory': 'discovery',
  'outreach-drafting': 'proposal',
  'pipeline-ops': 'close',
});

export const salesWorkflow = createWorkflow({
  assistant: 'Sales',
  productObject: 'lead / opportunity',
  flow: 'discovery → proposal → close',
  stages: [
    { name: 'discovery', description: 'Lead discovery and research', stageIds: ['lead-deal-advisory'] },
    { name: 'proposal', description: 'Proposal drafting and outreach', stageIds: ['outreach-drafting'] },
    { name: 'close', description: 'Deal closing and pipeline operations', stageIds: ['pipeline-ops'] },
  ],
}, salesSkills);
