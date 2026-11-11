import { Tool } from "../../types";
import { SUPPORT_RESOLVE_TICKET } from "./skills/ticket-understanding";
import { SUPPORT_SENTIMENT_ANALYSIS, SUPPORT_ISSUE_ANALYSIS, SUPPORT_SEARCH_KB } from "./tools/ticket-analysis";
import { SUPPORT_RESPONSE_DRAFTER } from "./tools/support-lower-order-tools";
import { RESPONSE_DRAFTING_USER } from "./skills/response-drafting";
import { RESPONSE_DRAFTING_NOTIFIER } from "./skills/response-drafting-notifier";
import { TICKET_OPS } from "./skills/ticket-ops";
import { ANALYTICS_PLANNING } from "./skills/analytics-planning";
import { createWorkflow } from '../../adk/workflow-common';

// The five Support Skills carry the entry points; lower-order tools are reached
// only by delegation from skills.
export const supportCanonicalSkills: Tool[] = [
  SUPPORT_RESOLVE_TICKET,
  RESPONSE_DRAFTING_USER,
  RESPONSE_DRAFTING_NOTIFIER,
  TICKET_OPS,
  ANALYTICS_PLANNING,
];

export const supportLowerOrderTools: Tool[] = [
  SUPPORT_SENTIMENT_ANALYSIS,
  SUPPORT_ISSUE_ANALYSIS,
  SUPPORT_SEARCH_KB,
  SUPPORT_RESPONSE_DRAFTER,
];

export const supportSkills = [...supportCanonicalSkills, ...supportLowerOrderTools];

export { SUPPORT_RESPONSE_DRAFTER };

export const supportWorkflow = createWorkflow({
  assistant: 'Support',
  productObject: 'ticket / customer',
  flow: 'intake → triage → resolution → follow-up',
  skills: supportSkills,
});
