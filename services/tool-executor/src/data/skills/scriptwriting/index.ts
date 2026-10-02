import { Tool } from '../../../types';
import { NARRATIVE_ARC_PACING_EVALUATOR } from './narrative-arc-pacing-evaluator';
import { SCENE_BEAT_DIALOGUE_COPILOT } from './scene-beat-dialogue-copilot';
import { SCRIPT_FORMATTING_SUBMISSION_MANAGER } from './script-formatting-submission-manager';
import { SCRIPTWRITER_GENRE_MARKET_EVALUATOR_USER } from './scriptwriter-genre-market-evaluator';
import { SCRIPTWRITING_MARKET_REPORT_SCHEDULED } from './scriptwriting-market-report-scheduled';
import { createWorkflow, AssistantWorkflow } from '../workflow-common';

export { NARRATIVE_ARC_PACING_EVALUATOR, SCENE_BEAT_DIALOGUE_COPILOT, SCRIPT_FORMATTING_SUBMISSION_MANAGER };
export { SCRIPTWRITER_GENRE_MARKET_EVALUATOR_USER, SCRIPTWRITING_MARKET_REPORT_SCHEDULED };

export const scriptwritingCanonicalSkills: Tool[] = [
  NARRATIVE_ARC_PACING_EVALUATOR,
  SCENE_BEAT_DIALOGUE_COPILOT,
  SCRIPT_FORMATTING_SUBMISSION_MANAGER,
  SCRIPTWRITER_GENRE_MARKET_EVALUATOR_USER,
  SCRIPTWRITING_MARKET_REPORT_SCHEDULED,
];

export const scriptwritingSkills: Tool[] = scriptwritingCanonicalSkills;

export const scriptwritingWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Scriptwriting',
  productObject: 'script',
  flow: 'brief → draft → revise → finalize',
  skills: scriptwritingSkills,
});
