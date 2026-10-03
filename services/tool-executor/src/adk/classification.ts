/**
 * The v9 blueprint classification.
 *
 * ADK_OVERVIEW.md §2.4 assigns each Skill exactly one risk tier, and §3.1 draws
 * the `isSkill` boundary. This table is the expected answer for every capability
 * the ADK ships, transcribed from `docs/assistants_design_0922_v9.md`.
 *
 * It exists so the classification can be *checked* rather than merely asserted.
 * Every Skill file declares its own `tier` and `isSkill` — that is the
 * definition site and the source of truth — and `adk:validate` plus
 * `adk-classification.test.ts` compare what was declared against this table. A
 * Skill that quietly drifts from the blueprint design fails a test instead of
 * shipping a different risk profile than the one that was reviewed.
 *
 * Tiers are the reason this table is worth pinning: a `represent` Skill is gated
 * before its handler runs, and an `aid` Skill is not. Moving one Skill between
 * the two is a change in what a user is asked to approve, so it is a spec
 * change and has to be made here deliberately.
 */

import type { GovernanceTier } from './types';

export interface SkillClassification {
  tier: GovernanceTier;
  isSkill: boolean;
}

/**
 * Capability id → tier and UI classification.
 *
 * `isSkill: true` entries mount an Overview panel and are the canonical,
 * user-facing entry points. `isSkill: false` entries are lower-order tools
 * reachable only from inside a higher-order Skill.
 */
export const SKILL_CLASSIFICATION: Record<string, SkillClassification> = {
  // --- career -------------------------------------------------------------
  'career-job-market-positioning-evaluator': { tier: 'advise', isSkill: true },
  'career-job-discovery-fit-ranking': { tier: 'advise', isSkill: true },
  'career-resume-template-manager': { tier: 'aid', isSkill: true },
  'career-interview-compensation-battlecard-creator': { tier: 'aid', isSkill: true },
  'career-interview-practice-mock-interviewer': { tier: 'aid', isSkill: true },
  'career-governed-application-outreach-manager': { tier: 'represent', isSkill: true },
  'career-application-execution-orchestrator': { tier: 'represent', isSkill: true },
  'career-portal-recruiter-workflow': { tier: 'represent', isSkill: true },
  'career-pipeline-outcome-tracker': { tier: 'aid', isSkill: true },
  'career-upskill-role-targeted-learning-planner': { tier: 'advise', isSkill: true },
  'career-profile-intake': { tier: 'advise', isSkill: false },
  'career-job-discovery': { tier: 'advise', isSkill: false },
  'career-application-execution': { tier: 'represent', isSkill: false },
  'career-rank': { tier: 'advise', isSkill: false },
  'career-outcome': { tier: 'advise', isSkill: false },
  'career-pipeline-report': { tier: 'advise', isSkill: false },
  'career-interview-prep': { tier: 'advise', isSkill: false },
  'career-advisory': { tier: 'advise', isSkill: false },
  'career-networking-outreach': { tier: 'represent', isSkill: false },
  'career-add-template': { tier: 'aid', isSkill: false },

  // --- executive ----------------------------------------------------------
  'executive-leadership-advisory': { tier: 'advise', isSkill: true },
  'executive-dev-career': { tier: 'advise', isSkill: true },
  'executive-feedback': { tier: 'advise', isSkill: true },
  'executive-risk-scenario': { tier: 'advise', isSkill: true },
  'executive-speech-communication-copilot': { tier: 'aid', isSkill: true },
  'executive-time-strategic-focus-proxy': { tier: 'advise', isSkill: true },

  // --- sales --------------------------------------------------------------
  'lead-deal-advisory': { tier: 'advise', isSkill: true },
  'outreach-drafting': { tier: 'aid', isSkill: true },
  'sales-account-brief-generator': { tier: 'aid', isSkill: true },
  'pipeline-ops': { tier: 'represent', isSkill: true },
  'sales_crm_sync': { tier: 'represent', isSkill: false },

  // --- event --------------------------------------------------------------
  'event-planning-budgeting': { tier: 'advise', isSkill: true },
  'event-vendor-contract-management': { tier: 'represent', isSkill: true },
  'event-checkin-guest': { tier: 'represent', isSkill: true },
  'event-update-seating': { tier: 'represent', isSkill: true },
  'event-log-incident': { tier: 'represent', isSkill: true },

  // --- restaurant ---------------------------------------------------------
  'restaurant-menu-engineering-cost-strategist': { tier: 'advise', isSkill: true },
  'restaurant-shift-prep-list-copilot': { tier: 'aid', isSkill: true },
  'restaurant-manage-reservation': { tier: 'represent', isSkill: true },
  'restaurant-update-guest-profile': { tier: 'aid', isSkill: true },
  'restaurant-supply-chain-inventory-reorder-manager': { tier: 'represent', isSkill: true },
  'restaurant-financial-forecast-evaluator': { tier: 'advise', isSkill: true },

  // --- content ------------------------------------------------------------
  'content-strategy-seo-evaluator': { tier: 'advise', isSkill: true },
  'editorial-calendar-article-copilot': { tier: 'aid', isSkill: true },
  'governed-publishing-cms-dispatcher': { tier: 'represent', isSkill: true },
  'content-performance-seo': { tier: 'advise', isSkill: false },
  'content-drafting-adaptation': { tier: 'aid', isSkill: false },
  'content-multi-channel-publishing': { tier: 'represent', isSkill: false },

  // --- songwriter ---------------------------------------------------------
  songwriter_genre_trend_evaluator: { tier: 'advise', isSkill: true },
  songwriting_lead_sheet_demo_dispatcher: { tier: 'aid', isSkill: true },
  songwriting_musical_lyric_cocreation: { tier: 'aid', isSkill: true },
  songwriting_lyric_prosody_evaluator: { tier: 'advise', isSkill: true },

  // --- scriptwriter -------------------------------------------------------
  'scriptwriting-genre-market-evaluator-user': { tier: 'advise', isSkill: true },
  'scriptwriting-market-report-scheduled': { tier: 'advise', isSkill: true },
  'scriptwriting-scene-beat-dialogue-copilot': { tier: 'aid', isSkill: true },
  'scriptwriting-narrative-arc-pacing-evaluator': { tier: 'advise', isSkill: true },
  'scriptwriting-script-formatting-submission-manager': { tier: 'represent', isSkill: true },

  // --- sports -------------------------------------------------------------
  // Group A — performance. No wagering context, ever.
  'sports-tactical-roster-evaluator': { tier: 'advise', isSkill: true },
  'sports-battlecard-creator': { tier: 'aid', isSkill: true },
  'sports-scouting-alert-dispatcher': { tier: 'represent', isSkill: true },
  // Group B — wagering.
  'sports-matchup-odds-explainer': { tier: 'advise', isSkill: true },
  'sports-bankroll-co-pilot': { tier: 'aid', isSkill: true },
  'sports-line-alert-dispatcher': { tier: 'represent', isSkill: true },
  'sports-predictor-ad-hoc': { tier: 'advise', isSkill: true },
  'sports-ingame-predictive-modeling-scheduled': { tier: 'advise', isSkill: true },

  // --- finance ------------------------------------------------------------
  'finance-modeling-analysis': { tier: 'advise', isSkill: true },
  'risk-regulatory-advisory': { tier: 'advise', isSkill: true },
  'budget-tracking': { tier: 'represent', isSkill: true },
  'reporting-data-ops': { tier: 'represent', isSkill: true },

  // --- wealth (investment) ------------------------------------------------
  'investment-market-data': { tier: 'represent', isSkill: true },
  'portfolio-risk-advisory': { tier: 'advise', isSkill: true },
  'bill-pay-rebalancing': { tier: 'represent', isSkill: true },
  'research-planning': { tier: 'aid', isSkill: true },

  // --- healthcare ---------------------------------------------------------
  'healthcare-clinical-practice-workflow-evaluator': { tier: 'advise', isSkill: true },
  'healthcare-clinical-decision-support-evaluator': { tier: 'advise', isSkill: true },
  'healthcare-patient-care-plan-educational-briefing-copilot': { tier: 'aid', isSkill: true },
  'healthcare-appointment-patient-intake-dispatcher': { tier: 'represent', isSkill: true },
  'care-resource-referral-coordinator': { tier: 'represent', isSkill: true },
  'healthcare-clinical-decision-support': { tier: 'advise', isSkill: false },
  'healthcare-operational-analytics': { tier: 'advise', isSkill: false },
  'healthcare-patient-communication': { tier: 'represent', isSkill: false },
  'healthcare-records-scheduling-ops': { tier: 'represent', isSkill: false },
  'healthcare-resource-coordination': { tier: 'represent', isSkill: false },

  // --- hotel --------------------------------------------------------------
  'hotel-revenue-performance-advisory': { tier: 'advise', isSkill: true },
  'hotel-guest-experience': { tier: 'aid', isSkill: true },
  'hotel-reservations-manager': { tier: 'represent', isSkill: true },
  'hotel-guest-profile-manager': { tier: 'aid', isSkill: true },
  'hotel-maintenance-dispatcher': { tier: 'represent', isSkill: true },
  'hotel-room-status-manager': { tier: 'represent', isSkill: true },
  'hotel-housekeeping-manager': { tier: 'represent', isSkill: true },
  'hotel-inventory-manager': { tier: 'represent', isSkill: true },

  // --- education ----------------------------------------------------------
  'education-learner-insight': { tier: 'advise', isSkill: true },
  'education-adaptive-personalization': { tier: 'advise', isSkill: true },
  'education-lesson-assessment-drafting-user': { tier: 'represent', isSkill: true },
  'education-lesson-assessment-drafting-scheduled': { tier: 'represent', isSkill: true },
  'education-resource-library': { tier: 'represent', isSkill: true },

  // --- hr -----------------------------------------------------------------
  'hr-screen-resume': { tier: 'advise', isSkill: true },
  'hr-assess-candidate': { tier: 'represent', isSkill: true },
  'hr-draft-jd-interview-kit': { tier: 'aid', isSkill: true },
  'hr-interview-scheduling-user': { tier: 'aid', isSkill: true },
  'hr-interview-scheduling-automated': { tier: 'aid', isSkill: true },
  'hr-compliance-check': { tier: 'advise', isSkill: true },
  'hr-hiring-analytics': { tier: 'advise', isSkill: true },

  // --- product ------------------------------------------------------------
  'create-roadmap': { tier: 'advise', isSkill: true },
  'write-prd': { tier: 'aid', isSkill: true },
  'product-data-analysis-user': { tier: 'advise', isSkill: true },
  'product-insights-scheduled': { tier: 'advise', isSkill: true },
  'product-delivery-sync-orchestrator': { tier: 'represent', isSkill: true },
  'product-jira': { tier: 'represent', isSkill: false },
  'product-confluence': { tier: 'represent', isSkill: false },
  'product-slack': { tier: 'represent', isSkill: false },
  'product-calendar': { tier: 'represent', isSkill: false },
  'product-markdown-parsing': { tier: 'represent', isSkill: false },

  // --- marketing ----------------------------------------------------------
  'plan-campaign': { tier: 'advise', isSkill: true },
  'analyze-performance': { tier: 'advise', isSkill: true },
  'marketing-campaign-execution-orchestrator': { tier: 'represent', isSkill: true },
  'marketing-reports-scheduled': { tier: 'advise', isSkill: true },
  'marketing-seo': { tier: 'aid', isSkill: true },
  'marketing-market-research': { tier: 'aid', isSkill: true },
  'marketing-audience-insights': { tier: 'aid', isSkill: true },
  'marketing-content-generation': { tier: 'aid', isSkill: false },
  'marketing-social-media': { tier: 'represent', isSkill: false },
  'marketing-email': { tier: 'represent', isSkill: false },
  'marketing-document-management': { tier: 'represent', isSkill: false },

  // --- analytics ----------------------------------------------------------
  'analytics-adhoc-query-evaluator': { tier: 'advise', isSkill: true },
  'analytics-scheduled-trend-monitor': { tier: 'advise', isSkill: true },

  // --- support ------------------------------------------------------------
  'support-resolve-ticket': { tier: 'advise', isSkill: true },
  'response-drafting-user': { tier: 'aid', isSkill: true },
  'response-drafting-notifier': { tier: 'aid', isSkill: true },
  'ticket-ops': { tier: 'represent', isSkill: true },
  'analytics-planning': { tier: 'advise', isSkill: true },
  'support-sentiment-analysis': { tier: 'advise', isSkill: false },
  'support-issue-analysis': { tier: 'advise', isSkill: false },
  'support-search-kb': { tier: 'advise', isSkill: false },

  // --- cto ----------------------------------------------------------------
  'cto-architecture-tech-debt-evaluator': { tier: 'advise', isSkill: true },
  'cto-cloud-spend-infrastructure-optimizer': { tier: 'advise', isSkill: true },
  'cto-incident-war-room-synthesizer': { tier: 'advise', isSkill: true },
  'cto-team-delivery-health-evaluator': { tier: 'advise', isSkill: true },
  'cto-disaster-recovery-planner': { tier: 'advise', isSkill: true },
  'cto-engineering-action-iac-drift-remediation': { tier: 'represent', isSkill: true },
  'cto-architecture-advisory': { tier: 'advise', isSkill: false },
  'cto-infrastructure-query': { tier: 'advise', isSkill: false },
  'cto-engineering-actions': { tier: 'represent', isSkill: false },
  'cto-incident-disaster-readiness': { tier: 'advise', isSkill: false },
  'calculate-dora-metrics': { tier: 'advise', isSkill: false },

  // --- legal --------------------------------------------------------------
  'contract-document-advisory-user': { tier: 'advise', isSkill: true },
  'contract-document-advisory-scheduled': { tier: 'advise', isSkill: true },
  'legal-document-ops': { tier: 'aid', isSkill: true },
  'legal-research': { tier: 'advise', isSkill: true },
  'compliance-tracking-user': { tier: 'advise', isSkill: true },
  'compliance-tracking-scheduled': { tier: 'advise', isSkill: true },
  legal_draft: { tier: 'aid', isSkill: false },
  legal_redline: { tier: 'aid', isSkill: false },
  legal_analyze_clauses: { tier: 'advise', isSkill: false },
  legal_finalize: { tier: 'aid', isSkill: false },
};

/** Skills whose tier makes the runtime halt before the handler runs. */
export const GATED_SKILL_IDS = Object.entries(SKILL_CLASSIFICATION)
  .filter(([, classification]) => classification.tier === 'represent')
  .map(([id]) => id);

/** Skills that mount an Overview panel on the Assistant page. */
export const CANONICAL_SKILL_IDS = Object.entries(SKILL_CLASSIFICATION)
  .filter(([, classification]) => classification.isSkill)
  .map(([id]) => id);

/** Lower-order tools, reachable only from inside a higher-order Skill. */
export const LOWER_ORDER_TOOL_IDS = Object.entries(SKILL_CLASSIFICATION)
  .filter(([, classification]) => !classification.isSkill)
  .map(([id]) => id);

export function classificationOf(skillId: string): SkillClassification | undefined {
  return SKILL_CLASSIFICATION[skillId];
}
