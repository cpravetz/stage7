import { Tool } from "../../../types";
import { TACTICAL_ROSTER_EVALUATOR } from "./sports-tactical-roster-evaluator";
import { BATTLECARD_CREATOR } from "./sports-battlecard-creator";
import { SCOUTING_ALERT_DISPATCHER } from "./sports-scouting-alert-dispatcher";
import { MATCHUP_ODDS_EXPLAINER } from "./sports-matchup-odds-explainer";
import { BANKROLL_CO_PILOT } from "./sports-bankroll-co-pilot";
import { LINE_ALERT_DISPATCHER } from "./sports-line-alert-dispatcher";
import { annotateStages, createWorkflow, AssistantWorkflow } from "../workflow-common";

export const sportsSkills = [
  TACTICAL_ROSTER_EVALUATOR,
  BATTLECARD_CREATOR,
  SCOUTING_ALERT_DISPATCHER,
  MATCHUP_ODDS_EXPLAINER,
  BANKROLL_CO_PILOT,
  LINE_ALERT_DISPATCHER,
];

annotateStages(sportsSkills, {
  'sports-tactical-roster-evaluator': 'analysis',
  'sports-battlecard-creator': 'analysis',
  'sports-scouting-alert-dispatcher': 'research',
  'sports-matchup-odds-explainer': 'odds',
  'sports-bankroll-co-pilot': 'odds',
  'sports-line-alert-dispatcher': 'research',
});

export const sportsWorkflow = createWorkflow({
  assistant: 'Sports',
  productObject: 'game / matchup',
  flow: 'research → odds → analysis',
  stages: [
    { name: 'research', description: 'Research and scouting', stageIds: ['sports-scouting-alert-dispatcher', 'sports-line-alert-dispatcher'] },
    { name: 'odds', description: 'Odds analysis and bankroll management', stageIds: ['sports-matchup-odds-explainer', 'sports-bankroll-co-pilot'] },
    { name: 'analysis', description: 'Tactical analysis and battlecard creation', stageIds: ['sports-tactical-roster-evaluator', 'sports-battlecard-creator'] },
  ],
}, sportsSkills);
