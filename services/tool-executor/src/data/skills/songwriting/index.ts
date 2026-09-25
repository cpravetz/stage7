import { Tool } from '../../../types';
import { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher } from '../creative';
import { SONGWRITER_GENRE_TREND_EVALUATOR } from './songwriter-genre-trend-evaluator';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher };
export { SONGWRITER_GENRE_TREND_EVALUATOR };

export const songwritingCanonicalSkills: Tool[] = [
  lyricProsodyEvaluator,
  musicalCoCreation,
  leadSheetDemoDispatcher,
  SONGWRITER_GENRE_TREND_EVALUATOR,
];

export const songwritingSkills: Tool[] = songwritingCanonicalSkills;

annotateStages(songwritingSkills, {
  'songwriting-lyric-prosody-evaluator': 'refine',
  'songwriting-musical-lyric-cocreation': 'draft',
  'songwriting-lead-sheet-demo-dispatcher': 'brief',
  'songwriter-genre-trend-evaluator': 'trend',
});

export const songwritingWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Songwriting',
  productObject: 'song',
  flow: 'trend → brief → draft → refine',
  stages: [
    { name: 'trend', description: 'Genre and trend evaluation', stageIds: ['songwriter-genre-trend-evaluator'] },
    { name: 'brief', description: 'Brief and lead sheet', stageIds: ['songwriting-lead-sheet-demo-dispatcher'] },
    { name: 'draft', description: 'Drafting and co-creation', stageIds: ['songwriting-musical-lyric-cocreation'] },
    { name: 'refine', description: 'Revision and refinement', stageIds: ['songwriting-lyric-prosody-evaluator'] },
  ],
}, songwritingSkills);
