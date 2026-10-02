import { Tool } from "../../../types";
import { SUPPORT_RESOLVE_TICKET, SUPPORT_SENTIMENT_ANALYSIS, SUPPORT_ISSUE_ANALYSIS, SUPPORT_SEARCH_KB } from "./ticket-understanding";
import { RESPONSE_DRAFTING_USER } from "./response-drafting";
import { RESPONSE_DRAFTING_NOTIFIER } from "./response-drafting-notifier";
import { TICKET_OPS } from "./ticket-ops";
import { ANALYTICS_PLANNING } from "./analytics-planning";
import { createWorkflow } from '../workflow-common';

// All 7 Support skills are canonical (isSkill=true). No base tools for Support per design.
export const supportCanonicalSkills: Tool[] = [
  SUPPORT_RESOLVE_TICKET,
  SUPPORT_SENTIMENT_ANALYSIS,
  SUPPORT_ISSUE_ANALYSIS,
  SUPPORT_SEARCH_KB,
  RESPONSE_DRAFTING_USER,
  RESPONSE_DRAFTING_NOTIFIER,
  TICKET_OPS,
  ANALYTICS_PLANNING,
];

export const supportLowerOrderTools: Tool[] = [];

export const supportSkills = [...supportCanonicalSkills, ...supportLowerOrderTools];

export const supportWorkflow = createWorkflow({
  assistant: 'Support',
  productObject: 'ticket / customer',
  flow: 'intake → triage → resolution → follow-up',
  skills: supportSkills,
});
