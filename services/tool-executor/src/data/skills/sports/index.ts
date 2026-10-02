
import { TACTICAL_ROSTER_EVALUATOR } from "./sports-tactical-roster-evaluator";
import { BATTLECARD_CREATOR } from "./sports-battlecard-creator";
import { SCOUTING_ALERT_DISPATCHER } from "./sports-scouting-alert-dispatcher";
import { MATCHUP_ODDS_EXPLAINER } from "./sports-matchup-odds-explainer";
import { BANKROLL_CO_PILOT } from "./sports-bankroll-co-pilot";
import { SPORTS_PREDICTOR_AD_HOC } from "./sports-ingame-predictive-modeling";
import { SPORTS_INGAME_PREDICTIVE_MODELING_SCHEDULED } from "./sports-ingame-predictive-modeling-scheduled";
import { LINE_ALERT_DISPATCHER } from "./sports-line-alert-dispatcher";
import { createWorkflow } from '../workflow-common';

export const sportsSkills = [
  TACTICAL_ROSTER_EVALUATOR,
  BATTLECARD_CREATOR,
  SCOUTING_ALERT_DISPATCHER,
  MATCHUP_ODDS_EXPLAINER,
  BANKROLL_CO_PILOT,
  LINE_ALERT_DISPATCHER,
  SPORTS_PREDICTOR_AD_HOC,
  SPORTS_INGAME_PREDICTIVE_MODELING_SCHEDULED,
];

export const sportsWorkflow = createWorkflow({
  assistant: 'Sports',
  productObject: 'game / matchup',
  flow: 'research → odds → analysis',
  skills: sportsSkills,
});
