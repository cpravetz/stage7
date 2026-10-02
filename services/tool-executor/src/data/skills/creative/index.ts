
import { createWorkflow } from '../workflow-common';

import { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher } from './songwriter-skills';
import { songwriterGenreTrendEvaluator } from './songwriter-genre-trend-evaluator';

export { songwriterGenreTrendEvaluator, lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher };

export const songwriterSkills = [songwriterGenreTrendEvaluator, leadSheetDemoDispatcher, musicalCoCreation, lyricProsodyEvaluator];

export const songwriterWorkflow = createWorkflow({
  assistant: 'Songwriter',
  productObject: 'song',
  flow: 'trend → create → format → evaluate',
  skills: songwriterSkills,
});
