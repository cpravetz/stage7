import { Tool } from '../../types';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';

import { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher } from './skills/songwriter-skills';
import { songwriterGenreTrendEvaluator } from './skills/songwriter-genre-trend-evaluator';

export { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher, songwriterGenreTrendEvaluator };

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

export const songwritingLowerOrderTools: Tool[] = [];

export const songwritingSkills: Tool[] = [...songwritingCanonicalSkills, ...songwritingLowerOrderTools];

export const songwritingWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Songwriting',
  productObject: 'song',
  flow: 'trend → brief → draft → refine',
  skills: songwritingSkills,
});

// The pre-merge names. The Songwriter capabilities were originally developed
// under a `creative` namespace; these aliases keep both spellings resolving to
// the same definitions rather than maintaining two.
export const songwriterSkills = songwritingSkills;
export const songwriterWorkflow = songwritingWorkflow;
