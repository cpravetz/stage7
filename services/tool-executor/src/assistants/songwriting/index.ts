import { Tool } from '../../types';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';

import { lyricProsodyEvaluator, musicalCoCreation } from './skills/songwriter-skills';
import { leadSheetDemoDispatcher } from './skills/songwriting_lead_sheet_demo_dispatcher';
import { songwriterGenreTrendEvaluator } from './skills/songwriter-genre-trend-evaluator';
import { SONGWRITING_LYRIC_CO_CREATION } from './tools/songwriting-lower-order-tools';

export { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher, songwriterGenreTrendEvaluator };
export { SONGWRITING_LYRIC_CO_CREATION };

/**
 * All four songwriting capabilities are user-facing, so all four mount an
 * Overview panel. Genre trending, co-creation, chart formatting and prosody
 * review are four different jobs a songwriter arrives with; none of them is an
 * internal step inside another.
 */
export const songwritingCanonicalSkills: Tool[] = [
  lyricProsodyEvaluator,
  musicalCoCreation,
  leadSheetDemoDispatcher,
  songwriterGenreTrendEvaluator,
];

export const songwritingLowerOrderTools: Tool[] = [SONGWRITING_LYRIC_CO_CREATION];

export const songwritingSkills: Tool[] = [...songwritingCanonicalSkills];

export const songwritingWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Songwriting',
  productObject: 'song',
  flow: 'trend → brief → draft → refine',
  skills: [...songwritingSkills, ...songwritingLowerOrderTools],
});

// The pre-merge names. The Songwriter capabilities were originally developed
// under a `creative` namespace; these aliases keep both spellings resolving to
// the same definitions rather than maintaining them.
export const songwriterSkills = songwritingSkills;
export const songwriterWorkflow = songwritingWorkflow;