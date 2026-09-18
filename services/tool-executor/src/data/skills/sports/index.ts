import { Tool } from '../../../types';
import { TACTICAL_ROSTER_EVALUATOR } from './sports-tactical-roster-evaluator';
import { BATTLECARD_CREATOR } from './sports-battlecard-creator';
import { SCOUTING_ALERT_DISPATCHER } from './sports-scouting-alert-dispatcher';
import { MATCHUP_ODDS_EXPLAINER } from './sports-matchup-odds-explainer';
import { BANKROLL_CO_PILOT } from './sports-bankroll-co-pilot';
import { LINE_ALERT_DISPATCHER } from './sports-line-alert-dispatcher';

export const sportsSkills = [
  TACTICAL_ROSTER_EVALUATOR,
  BATTLECARD_CREATOR,
  SCOUTING_ALERT_DISPATCHER,
  MATCHUP_ODDS_EXPLAINER,
  BANKROLL_CO_PILOT,
  LINE_ALERT_DISPATCHER,
];
