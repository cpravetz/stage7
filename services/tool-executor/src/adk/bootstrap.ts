/**
 * Catalog bootstrap.
 *
 * This is the one place that knows how each Assistant's `index.ts` is wired.
 * Every other module — the validator CLI, the catalog, anything that needs the
 * full capability set — goes through `buildCatalog`, so there is a single
 * definition of what ships.
 *
 * `<id>Skills` is the Assistant's complete capability set: the canonical Skills
 * that mount an Overview panel and the lower-order Tools that do not. Which is
 * which is declared per capability by `isSkill` on the Tool itself, never by
 * which array it happens to sit in — several Assistants export a combined array
 * and derive their canonical subset from that.
 */

import * as path from 'path';
import type { Tool } from '../types';
import {
  ASSISTANT_IDS,
  createCatalog,
  registerAssistant,
  type AssistantCatalog,
  type AssistantId,
} from './catalog';
import type { AssistantWorkflow } from './workflow-common';

import * as analytics from '../assistants/analytics';
import * as career from '../assistants/career';
import * as content from '../assistants/content';
import * as cto from '../assistants/cto';
import * as education from '../assistants/education';
import * as event from '../assistants/event';
import * as executive from '../assistants/executive';
import * as finance from '../assistants/finance';
import * as healthcare from '../assistants/healthcare';
import * as hotel from '../assistants/hotel';
import * as hr from '../assistants/hr';
import * as investment from '../assistants/investment';
import * as legal from '../assistants/legal';
import * as marketing from '../assistants/marketing';
import * as product from '../assistants/product';
import * as restaurant from '../assistants/restaurant';
import * as sales from '../assistants/sales';
import * as scriptwriting from '../assistants/scriptwriting';
import * as songwriting from '../assistants/songwriting';
import * as sports from '../assistants/sports';
import * as support from '../assistants/support';

/**
 * Assistant id -> its module and workflow.
 *
 * Typed as a record over `AssistantId` rather than an array so that adding an
 * id to `ASSISTANT_IDS` without wiring its module here is a compile error, not a
 * silently missing Assistant at runtime.
 */
const REGISTRY: Record<AssistantId, { module: { [k: string]: unknown }; workflow: AssistantWorkflow }> = {
  analytics: { module: analytics, workflow: analytics.analyticsWorkflow },
  career: { module: career, workflow: career.careerWorkflow },
  content: { module: content, workflow: content.contentWorkflow },
  cto: { module: cto, workflow: cto.ctoWorkflow },
  education: { module: education, workflow: education.educationWorkflow },
  event: { module: event, workflow: event.eventWorkflow },
  executive: { module: executive, workflow: executive.executiveWorkflow },
  finance: { module: finance, workflow: finance.financeWorkflow },
  healthcare: { module: healthcare, workflow: healthcare.healthcareWorkflow },
  hotel: { module: hotel, workflow: hotel.hotelWorkflow },
  hr: { module: hr, workflow: hr.hrWorkflow },
  investment: { module: investment, workflow: investment.investmentWorkflow },
  legal: { module: legal, workflow: legal.legalWorkflow },
  marketing: { module: marketing, workflow: marketing.marketingWorkflow },
  product: { module: product, workflow: product.productWorkflow },
  restaurant: { module: restaurant, workflow: restaurant.restaurantWorkflow },
  sales: { module: sales, workflow: sales.salesWorkflow },
  scriptwriting: { module: scriptwriting, workflow: scriptwriting.scriptwritingWorkflow },
  songwriting: { module: songwriting, workflow: songwriting.songwritingWorkflow },
  sports: { module: sports, workflow: sports.sportsWorkflow },
  support: { module: support, workflow: support.supportWorkflow },
};

function skillsFor(id: AssistantId): Tool[] {
  const skills = REGISTRY[id].module[`${id}Skills`];
  if (!Array.isArray(skills)) {
    throw new Error(
      `Assistant "${id}" does not export a "${id}Skills" array. ` +
        'Every Assistant index must export its complete capability set under that name.',
    );
  }
  return skills as Tool[];
}

/**
 * Builds the catalog over every Assistant that ships.
 *
 * A folder that fails to load throws here rather than being skipped, so
 * `adk:validate` and the service agree on the same set.
 */
export function buildCatalog(): AssistantCatalog {
  const catalog = createCatalog();

  for (const id of ASSISTANT_IDS) {
    const { workflow } = REGISTRY[id];
    registerAssistant(catalog, {
      id,
      skills: skillsFor(id),
      productObject: workflow.productObject,
      flow: workflow.flow,
    });
  }

  return catalog;
}

/** Root of the Assistants folder, for tools that need to read it directly. */
export function assistantsRoot(): string {
  return path.join(__dirname, '..', 'assistants');
}
