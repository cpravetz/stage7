import { Tool } from '../../../types';
import { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher } from '../creative';
import { SONGWRITER_GENRE_TREND_EVALUATOR } from './songwriter-genre-trend-evaluator';

export { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher };
export { SONGWRITER_GENRE_TREND_EVALUATOR };

export const songwritingCanonicalSkills: Tool[] = [
  lyricProsodyEvaluator,
  musicalCoCreation,
  leadSheetDemoDispatcher,
  SONGWRITER_GENRE_TREND_EVALUATOR,
];

export const songwritingSkills: Tool[] = songwritingCanonicalSkills;
