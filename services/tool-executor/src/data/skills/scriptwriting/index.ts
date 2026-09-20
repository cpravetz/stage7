import { Tool } from '../../../types';
import { NARRATIVE_ARC_PACING_EVALUATOR } from './narrative-arc-pacing-evaluator';
import { SCENE_BEAT_DIALOGUE_COPILOT } from './scene-beat-dialogue-copilot';
import { SCRIPT_FORMATTING_SUBMISSION_MANAGER } from './script-formatting-submission-manager';
import { SCRIPTWRITER_GENRE_MARKET_EVALUATOR } from './scriptwriter-genre-market-evaluator';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export { NARRATIVE_ARC_PACING_EVALUATOR, SCENE_BEAT_DIALOGUE_COPILOT, SCRIPT_FORMATTING_SUBMISSION_MANAGER };
export { SCRIPTWRITER_GENRE_MARKET_EVALUATOR };

export const scriptwritingCanonicalSkills: Tool[] = [
  NARRATIVE_ARC_PACING_EVALUATOR,
  SCENE_BEAT_DIALOGUE_COPILOT,
  SCRIPT_FORMATTING_SUBMISSION_MANAGER,
  SCRIPTWRITER_GENRE_MARKET_EVALUATOR,
];

export const scriptwritingSkills: Tool[] = scriptwritingCanonicalSkills;

annotateStages(scriptwritingSkills, {
  'scriptwriting_narrative_arc_pacing_evaluator': 'brief',
  'scriptwriting_scene_beat_dialogue_copilot': 'draft',
  'scriptwriting_script_formatting_submission_manager': 'finalize',
  'scriptwriting_genre_market_evaluator': 'revise',
});

export const scriptwritingWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Scriptwriting',
  productObject: 'script',
  flow: 'brief → draft → revise → finalize',
  stages: [
    { name: 'brief', description: 'Brief and narrative arc evaluation', stageIds: ['scriptwriting_narrative_arc_pacing_evaluator'] },
    { name: 'draft', description: 'Scene, beat, and dialogue drafting', stageIds: ['scriptwriting_scene_beat_dialogue_copilot'] },
    { name: 'revise', description: 'Genre and market evaluation for revision', stageIds: ['scriptwriting_genre_market_evaluator'] },
    { name: 'finalize', description: 'Formatting and submission', stageIds: ['scriptwriting_script_formatting_submission_manager'] },
  ],
}, scriptwritingSkills);
