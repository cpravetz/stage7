import { PRESENT_SCHEMA, resultSchema, EXTERNAL_ACTION_OUTPUT_SCHEMA } from '../shared/skill-result-contract';

const SPORTS_PERFORMANCE_BOUNDARY =
  'This analysis is derived from the inputs you supplied and local computation only. ' +
  'It is for coaching and tactical planning, not financial advice. Statistics shown are the ' +
  'numbers you provided, not predictions of future results. When an external sports data feed ' +
  'is not configured, the skill reports which values came from local input and which would have ' +
  'come from outside. No result is stated as certain before it has occurred.';

const SPORTS_WAGERING_BOUNDARY =
  'All odds and bankroll analysis is provided for entertainment and educational purposes only. ' +
  'It is not betting advice, not financial advice, and not a recommendation to wager. Expected ' +
  'value and probability figures are estimates derived from the odds you supplied; they do not ' +
  'guarantee outcomes. This tool never places bets and never accesses sportsbook accounts. ' +
  'Please gamble responsibly: set limits, take breaks, and never wager more than you can afford to lose.';

export const SPORTS_SAFETY_BOUNDARY = SPORTS_PERFORMANCE_BOUNDARY;
export const SPORTS_PERFORMANCE_SAFETY_BOUNDARY = SPORTS_PERFORMANCE_BOUNDARY;
export const SPORTS_WAGERING_SAFETY_BOUNDARY = SPORTS_WAGERING_BOUNDARY;

export const SPORTS_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const SPORTS_PERFORMANCE_GROUP = ['sports-tactical-roster-evaluator', 'sports-battlecard-creator', 'sports-scouting-alert-dispatcher'];
export const SPORTS_WAGERING_GROUP = ['sports-matchup-odds-explainer', 'sports-bankroll-co-pilot', 'sports-line-alert-dispatcher', 'sports-predictor-ad-hoc', 'sports-ingame-predictive-modeling-scheduled'];

export function sportsGroupFor(skillId: string): 'performance' | 'wagering' {
  return SPORTS_WAGERING_GROUP.includes(skillId) ? 'wagering' : 'performance';
}

export function sportsBoundaryFor(skillId: string): string {
  return sportsGroupFor(skillId) === 'wagering' ? SPORTS_WAGERING_BOUNDARY : SPORTS_PERFORMANCE_BOUNDARY;
}

export const sportsResultSchema = (dataDescription: string, group: 'performance' | 'wagering' = 'performance') => {
  const boundary = sportsBoundaryFor(group);
  return resultSchema(dataDescription, { extraStatuses: ['error'], safetyBoundary: boundary });
};

export const SPORTS_EXTERNAL_OUTPUT_SCHEMA = EXTERNAL_ACTION_OUTPUT_SCHEMA;
