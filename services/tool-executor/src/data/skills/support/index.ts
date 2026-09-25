import { Tool } from "../../../types";
import { SUPPORT_RESOLVE_TICKET, SUPPORT_SENTIMENT_ANALYSIS, SUPPORT_ISSUE_ANALYSIS, SUPPORT_SEARCH_KB } from "./ticket-understanding";
import { RESPONSE_DRAFTING } from "./response-drafting";
import { TICKET_OPS } from "./ticket-ops";
import { ANALYTICS_PLANNING } from "./analytics-planning";
import { annotateStages, createWorkflow, AssistantWorkflow } from "../workflow-common";

export const supportSkills = [
  SUPPORT_RESOLVE_TICKET,
  SUPPORT_SENTIMENT_ANALYSIS,
  SUPPORT_ISSUE_ANALYSIS,
  SUPPORT_SEARCH_KB,
  RESPONSE_DRAFTING,
  TICKET_OPS,
  ANALYTICS_PLANNING,
];

annotateStages(supportSkills, {
  'support-resolve-ticket': 'intake',
  'support-sentiment-analysis': 'intake',
  'support-issue-analysis': 'intake',
  'support-search-kb': 'intake',
  'response-drafting': 'triage',
  'ticket-ops': 'resolution',
  'analytics-planning': 'follow-up',
});

export const supportWorkflow = createWorkflow({
  assistant: 'Support',
  productObject: 'ticket / customer',
  flow: 'intake → triage → resolution → follow-up',
  stages: [
    { name: 'intake', description: 'Ticket intake and understanding', stageIds: ['support-resolve-ticket', 'support-sentiment-analysis', 'support-issue-analysis', 'support-search-kb'] },
    { name: 'triage', description: 'Response drafting and ticket triage', stageIds: ['response-drafting'] },
    { name: 'resolution', description: 'Ticket resolution operations', stageIds: ['ticket-ops'] },
    { name: 'follow-up', description: 'Analytics and follow-up planning', stageIds: ['analytics-planning'] },
  ],
}, supportSkills);
