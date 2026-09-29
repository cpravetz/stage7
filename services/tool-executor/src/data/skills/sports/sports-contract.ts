/**
 * Domain-local output contract for the Sports Analyst skills.
 *
 * This is the shape every sports skill returns, expressed in terms of the
 * generic presentation contract in the shared type package. It lives inside
 * the sports domain on purpose: the core executor and renderer know only
 * that a result may carry a list of presentation blocks, and this module is
 * what binds that generic shape to how the sports skills are expected to be
 * written.
 *
 * DEC-010 isolation is enforced here at the contract level: the performance
 * group and the wagering group carry different safety boundaries, and no
 * skill may cross the boundary. A performance skill never emits wagering
 * language; a wagering skill never emits performance language.
 */

// ---------------------------------------------------------------------------
// Safety boundaries
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Presentation schema (generic contract, no skill-specific knowledge)
// ---------------------------------------------------------------------------

export const SPORTS_PRESENT_SCHEMA = {
  type: 'array',
  description: 'User-formatted blocks conforming to the generic presentation contract',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
      kind: { type: 'string' },
    },
    required: ['id', 'body'],
  },
};

// ---------------------------------------------------------------------------
// Result schema
// ---------------------------------------------------------------------------

export const sportsResultSchema = (dataDescription: string, group: 'performance' | 'wagering' = 'performance') => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the skill completed the work it claims to have done' },
    status: { type: ['string', 'null'], description: 'ok, partial, failed, blocked, not-connected, confirmation-required, or error' },
    data: { type: ['object', 'null'], description: dataDescription },
    error: { type: ['string', 'null'], description: 'Failure message' },
    present: SPORTS_PRESENT_SCHEMA,
    safetyBoundary: { type: 'string', description: 'The applicable safety boundary for this skill group' },
  },
  required: ['success', 'present'],
});

// ---------------------------------------------------------------------------
// Group membership (used by skills to select the right boundary at runtime)
// ---------------------------------------------------------------------------

export const SPORTS_PERFORMANCE_GROUP = ['sports-tactical-roster-evaluator', 'sports-battlecard-creator', 'sports-scouting-alert-dispatcher'];
export const SPORTS_WAGERING_GROUP = ['sports-matchup-odds-explainer', 'sports-bankroll-co-pilot', 'sports-line-alert-dispatcher', 'sports-ingame-predictive-modeling'];

export function sportsGroupFor(skillId: string): 'performance' | 'wagering' {
  return SPORTS_WAGERING_GROUP.includes(skillId) ? 'wagering' : 'performance';
}

export function sportsBoundaryFor(skillId: string): string {
  return sportsGroupFor(skillId) === 'wagering' ? SPORTS_WAGERING_BOUNDARY : SPORTS_PERFORMANCE_BOUNDARY;
}