import { Tool } from '../../../types';
import { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher } from '../creative';
import { songwriterGenreTrendEvaluator } from '../creative/songwriter-genre-trend-evaluator';
import { createWorkflow, AssistantWorkflow } from '../workflow-common';

export { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher };
export { songwriterGenreTrendEvaluator };

export const songwritingCanonicalSkills: Tool[] = [
  lyricProsodyEvaluator,
  musicalCoCreation,
  leadSheetDemoDispatcher,
  songwriterGenreTrendEvaluator,
];

export const songwritingSkills: Tool[] = songwritingCanonicalSkills;

export const songwritingWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Songwriting',
  productObject: 'song',
  flow: 'trend → brief → draft → refine',
  skills: songwritingSkills,
});
