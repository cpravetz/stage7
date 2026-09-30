import { Tool } from '../../../types';
import { createWorkflow } from '../workflow-common';
import { AssistantWorkflow } from '../workflow-common';
import { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher } from './songwriter-skills';
import { songwriterGenreTrendEvaluator } from './songwriter-genre-trend-evaluator';


export { songwriterGenreTrendEvaluator, lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher };

songwriterGenreTrendEvaluator.manifest.workflowStage = 'trend';
musicalCoCreation.manifest.workflowStage = 'create';
leadSheetDemoDispatcher.manifest.workflowStage = 'format';
lyricProsodyEvaluator.manifest.workflowStage = 'evaluate';

export const songwriterSkills = [songwriterGenreTrendEvaluator, leadSheetDemoDispatcher, musicalCoCreation, lyricProsodyEvaluator];

export const songwriterWorkflow = createWorkflow({
  assistant: 'Songwriter',
  productObject: 'song',
  flow: 'trend → create → format → evaluate',
  stages: [
    { name: 'trend', description: 'Genre and market trend analysis to inform songwriting direction', stageIds: ['songwriter_genre_trend_evaluator'] },
    { name: 'create', description: 'Musical and lyric co-creation with chords, structure, and hook generation', stageIds: ['songwriting_musical_lyric_cocreation'] },
    { name: 'format', description: 'Lead sheet formatting and demo asset dispatch', stageIds: ['songwriting_lead_sheet_demo_dispatcher'] },
    { name: 'evaluate', description: 'Lyric and prosody evaluation with revision recommendations', stageIds: ['songwriting_lyric_prosody_evaluator'] },
  ],
}, songwriterSkills);
