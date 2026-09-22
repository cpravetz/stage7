import { Tool } from "../../../types";
import { TICKET_UNDERSTANDING } from "./ticket-understanding";
import { RESPONSE_DRAFTING } from "./response-drafting";
import { TICKET_OPS } from "./ticket-ops";
import { ANALYTICS_PLANNING } from "./analytics-planning";
import { annotateStages, createWorkflow, AssistantWorkflow } from "../workflow-common";

export const supportSkills = [
  TICKET_UNDERSTANDING,
  RESPONSE_DRAFTING,
  TICKET_OPS,
  ANALYTICS_PLANNING,
];

annotateStages(supportSkills, {
  'ticket-understanding': 'intake',
  'response-drafting': 'triage',
  'ticket-ops': 'resolution',
  'analytics-planning': 'follow-up',
});

export const supportWorkflow = createWorkflow({
  assistant: 'Support',
  productObject: 'ticket / customer',
  flow: 'intake → triage → resolution → follow-up',
  stages: [
    { name: 'intake', description: 'Ticket intake and understanding', stageIds: ['ticket-understanding'] },
    { name: 'triage', description: 'Response drafting and ticket triage', stageIds: ['response-drafting'] },
    { name: 'resolution', description: 'Ticket resolution operations', stageIds: ['ticket-ops'] },
    { name: 'follow-up', description: 'Analytics and follow-up planning', stageIds: ['analytics-planning'] },
  ],
}, supportSkills);
