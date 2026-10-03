/**
 * Backwards-compatible aggregate entry point.
 *
 * Assistant blueprints now live in `src/assistants/<assistant-id>/`
 * (ADK_OVERVIEW.md §2.1) and the harness itself in `src/adk/`. This module is the
 * historical import path kept working: it re-exports both and holds no logic of
 * its own.
 *
 * New code should import from `../../adk` or `../../assistants/<id>` directly.
 */

import { AssistantWorkflow } from '../../adk/workflow-common';

export { emailIntegrationSkill } from '../../adk/shared/email';

export { analyticsSkills, analyticsWorkflow } from '../../assistants/analytics';
export { careerCanonicalSkills, careerSkills, careerWorkflow } from '../../assistants/career';
export { contentSkills, contentWorkflow } from '../../assistants/content';
export { ctoCanonicalSkills, ctoSkills, ctoWorkflow } from '../../assistants/cto';
export { educationCanonicalSkills, educationSkills, educationWorkflow } from '../../assistants/education';
export { eventSkills, eventWorkflow } from '../../assistants/event';
export { executiveSkills, executiveWorkflow } from '../../assistants/executive';
export { financeSkills, financeWorkflow } from '../../assistants/finance';
export { healthcareCanonicalSkills, healthcareSkills, healthcareWorkflow } from '../../assistants/healthcare';
export { hotelSkills, hotelWorkflow } from '../../assistants/hotel';
export { hrCanonicalSkills, hrSkills, hrWorkflow } from '../../assistants/hr';
export { investmentSkills, investmentWorkflow } from '../../assistants/investment';
export { legalSkills, legalWorkflow } from '../../assistants/legal';
export { marketingSkills, marketingWorkflow } from '../../assistants/marketing';
export { productSkills, productWorkflow } from '../../assistants/product';
export { restaurantCanonicalSkills, restaurantSkills, restaurantWorkflow } from '../../assistants/restaurant';
export { salesSkills, salesWorkflow } from '../../assistants/sales';
export { scriptwritingSkills, scriptwritingWorkflow } from '../../assistants/scriptwriting';
export { songwritingSkills, songwritingWorkflow } from '../../assistants/songwriting';
export { sportsSkills, sportsWorkflow } from '../../assistants/sports';
export { supportSkills, supportWorkflow } from '../../assistants/support';

export {
  assistantRegistries,
  detectOverlappingSkills,
  getAssistantByName,
  getAssistantsByObject,
  getAssistantsWithSkillCount,
  getOverlappingSkills,
  getRetainedOverlapDecision,
  getRetainedOverlapDecisionIds,
  getRetainedOverlapDecisions,
} from '../../adk/registry';

import { analyticsWorkflow } from '../../assistants/analytics';
import { careerWorkflow } from '../../assistants/career';
import { contentWorkflow } from '../../assistants/content';
import { ctoWorkflow } from '../../assistants/cto';
import { educationWorkflow } from '../../assistants/education';
import { eventWorkflow } from '../../assistants/event';
import { executiveWorkflow } from '../../assistants/executive';
import { financeWorkflow } from '../../assistants/finance';
import { healthcareWorkflow } from '../../assistants/healthcare';
import { hotelWorkflow } from '../../assistants/hotel';
import { hrWorkflow } from '../../assistants/hr';
import { investmentWorkflow } from '../../assistants/investment';
import { legalWorkflow } from '../../assistants/legal';
import { marketingWorkflow } from '../../assistants/marketing';
import { productWorkflow } from '../../assistants/product';
import { restaurantWorkflow } from '../../assistants/restaurant';
import { salesWorkflow } from '../../assistants/sales';
import { scriptwritingWorkflow } from '../../assistants/scriptwriting';
import { songwritingWorkflow } from '../../assistants/songwriting';
import { sportsWorkflow } from '../../assistants/sports';
import { supportWorkflow } from '../../assistants/support';

export const allWorkflows: AssistantWorkflow[] = [
  ctoWorkflow,
  healthcareWorkflow,
  hrWorkflow,
  educationWorkflow,
  marketingWorkflow,
  productWorkflow,
  contentWorkflow,
  careerWorkflow,
  restaurantWorkflow,
  salesWorkflow,
  supportWorkflow,
  sportsWorkflow,
  eventWorkflow,
  executiveWorkflow,
  financeWorkflow,
  hotelWorkflow,
  investmentWorkflow,
  legalWorkflow,
  songwritingWorkflow,
  scriptwritingWorkflow,
  analyticsWorkflow,
];
