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
  'songwriting_lyric_prosody_evaluator': 'refine',
  'songwriting_musical_lyric_cocreation': 'draft',
  'songwriting_lead_sheet_demo_dispatcher': 'brief',
  'songwriter_genre_trend_evaluator': 'trend',
});

export const songwritingWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Songwriting',
  productObject: 'song',
  flow: 'trend → brief → draft → refine',
  stages: [
    { name: 'trend', description: 'Genre and trend evaluation', stageIds: ['songwriter_genre_trend_evaluator'] },
    { name: 'brief', description: 'Brief and lead sheet', stageIds: ['songwriting_lead_sheet_demo_dispatcher'] },
    { name: 'draft', description: 'Drafting and co-creation', stageIds: ['songwriting_musical_lyric_cocreation'] },
    { name: 'refine', description: 'Revision and refinement', stageIds: ['songwriting_lyric_prosody_evaluator'] },
  ],
}, songwritingSkills);
