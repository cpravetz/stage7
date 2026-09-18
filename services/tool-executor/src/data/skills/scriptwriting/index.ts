import { Tool } from '../../../types';
import { NARRATIVE_ARC_PACING_EVALUATOR } from './narrative-arc-pacing-evaluator';
import { SCENE_BEAT_DIALOGUE_COPILOT } from './scene-beat-dialogue-copilot';
import { SCRIPT_FORMATTING_SUBMISSION_MANAGER } from './script-formatting-submission-manager';
import { SCRIPTWRITER_GENRE_MARKET_EVALUATOR } from './scriptwriter-genre-market-evaluator';

export { NARRATIVE_ARC_PACING_EVALUATOR, SCENE_BEAT_DIALOGUE_COPILOT, SCRIPT_FORMATTING_SUBMISSION_MANAGER };
export { SCRIPTWRITER_GENRE_MARKET_EVALUATOR };

export const scriptwritingCanonicalSkills: Tool[] = [
  NARRATIVE_ARC_PACING_EVALUATOR,
  SCENE_BEAT_DIALOGUE_COPILOT,
  SCRIPT_FORMATTING_SUBMISSION_MANAGER,
  SCRIPTWRITER_GENRE_MARKET_EVALUATOR,
];

export const scriptwritingSkills: Tool[] = scriptwritingCanonicalSkills;
