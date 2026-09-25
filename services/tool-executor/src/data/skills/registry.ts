import { Tool, SchemaRecord } from '../../types';
import { careerCanonicalSkills, careerSkills } from './career';
import { ctoCanonicalSkills, ctoSkills } from './cto';
import { healthcareCanonicalSkills, healthcareSkills } from './healthcare';
import { hrCanonicalSkills, hrSkills } from './hr';
import { educationCanonicalSkills, educationSkills } from './education';
import { marketingSkills } from './marketing';
import { productSkills } from './product';
import { restaurantCanonicalSkills, restaurantSkills } from './restaurant';
import { salesSkills } from './sales';
import { supportSkills } from './support';
import { contentSkills } from './content';
import { creativeSkills } from './creative';
import { sportsSkills } from './sports';
import { eventSkills } from './event';
import { executiveSkills } from './executive';
import { financeSkills } from './finance';
import { hotelSkills } from './hotel';
import { investmentSkills } from './investment';
import { legalSkills } from './legal';
import { songwritingSkills } from './songwriting';
import { scriptwritingCanonicalSkills, scriptwritingSkills } from './scriptwriting';
import { analyticsSkills } from './analytics';

export interface SkillEntry {
  id: string;
  name: string;
  type: 'base' | 'higher-order' | 'wrapper';
  triggers: string[];
  lowerOrderTools: string[];
  confirmBeforeSend: boolean;
  workflowStage?: string;
}

export interface AssistantRegistry {
  assistant: string;
  productObject: string;
  workflowFlow: string;
  workflowStages: string[];
  skills: SkillEntry[];
}

function classifySkill(skill: Tool): SkillEntry {
  const triggers = (skill.triggers || []).map((t: { kind: string }) => t.kind);
  const lowerOrderTools = (skill.manifest?.lowerOrderTools || []) as string[];
  let type: 'base' | 'higher-order' | 'wrapper' = 'higher-order';
  if (skill.isSkill === false) {
    type = 'base';
  } else if (lowerOrderTools.length > 0) {
    type = 'wrapper';
  }
  return {
    id: skill.id,
    name: skill.name,
    type,
    triggers,
    lowerOrderTools,
    confirmBeforeSend: skill.confirmBeforeSend === true || (skill.manifest?.confirmBeforeSend === true),
    workflowStage: (skill.manifest?.workflowStage as string) || undefined,
  };
}

const ASSISTANT_OBJECT_MAP: Record<string, string> = {
  career: 'candidate / job',
  cto: 'system / incident',
  healthcare: 'patient',
  hr: 'applicant',
  education: 'learner',
  marketing: 'campaign',
  product: 'product / order',
  restaurant: 'reservation / table',
  sales: 'lead / opportunity',
  support: 'ticket / customer',
  content: 'content piece',
  creative: 'creative work',
  sports: 'game / matchup',
  event: 'event / vendor',
  executive: 'organization / strategy',
  finance: 'account / transaction',
  hotel: 'stay / booking',
  investment: 'portfolio / security',
  legal: 'case / matter',
  songwriting: 'song',
  scriptwriting: 'script',
  analytics: 'metric / insight',
};

const ASSISTANT_FLOW_MAP: Record<string, string> = {
  career: 'profile → fit ranking → application → prep → tracking → outcomes',
  cto: 'monitor → diagnose → plan → approve → execute',
  healthcare: 'review → scheduling → coordination',
  hr: 'screening → interview → decision',
  education: 'plan → assess → support',
  marketing: 'plan → create → publish → analyze',
  product: 'plan → specify → analyze → deliver',
  restaurant: 'reservation → service → kitchen → billing',
sales: 'discovery → proposal → close',
  support: 'intake → triage → resolution → follow-up',
  content: 'plan → draft → optimize → publish',
  creative: 'brief → create',
  sports: 'research → odds → analysis',
  event: 'plan → vendors → day-of',
  executive: 'review → analysis → recommendation → decision',
  finance: 'research → analyze → trade → report',
  hotel: 'booking → stay → review → loyalty',
  investment: 'research → analyze → trade → track',
  legal: 'intake → research → draft → review',
  songwriting: 'trend → brief → draft → refine',
  scriptwriting: 'brief → draft → revise → finalize',
  analytics: 'report → analyze → query',
};

function buildRegistry(skills: Tool[], canonical: Tool[], objectKey: string, flowKey: string, workflowStages: string[]): AssistantRegistry {
  const uniqueSkills = Array.from(new Map([...skills, ...canonical].map((skill) => [skill.id, skill])).values());
  return {
    assistant: '',
    productObject: ASSISTANT_OBJECT_MAP[objectKey] || '',
    workflowFlow: ASSISTANT_FLOW_MAP[flowKey] || '',
    workflowStages,
    skills: uniqueSkills.map(classifySkill),
  };
}

export function detectOverlappingSkills(registries: AssistantRegistry[]): { skillId: string; assistants: string[] }[] {
  const skillToAssistants: Record<string, string[]> = {};
  for (const reg of registries) {
    for (const skill of reg.skills) {
      if (!skillToAssistants[skill.id]) {
        skillToAssistants[skill.id] = [];
      }
      skillToAssistants[skill.id].push(reg.assistant);
    }
  }
  return Object.entries(skillToAssistants)
    .filter(([, assistants]) => assistants.length > 1)
    .map(([skillId, assistants]) => ({ skillId, assistants }));
}

export const assistantRegistries: AssistantRegistry[] = [
  buildRegistry(careerSkills, careerCanonicalSkills, 'career', 'career', ['profile', 'fit', 'application', 'prep', 'tracking', 'outcomes']),
  buildRegistry(ctoSkills, ctoCanonicalSkills, 'cto', 'cto', ['monitor', 'diagnose', 'plan', 'approve', 'execute']),
  buildRegistry(healthcareSkills, healthcareCanonicalSkills, 'healthcare', 'healthcare', ['review', 'scheduling', 'coordination']),
  buildRegistry(hrSkills, hrCanonicalSkills, 'hr', 'hr', ['screening', 'interview', 'decision']),
  buildRegistry(educationSkills, educationCanonicalSkills, 'education', 'education', ['plan', 'assess', 'support']),
  buildRegistry(marketingSkills, [], 'marketing', 'marketing', ['plan', 'create', 'publish', 'analyze']),
  buildRegistry(productSkills, [], 'product', 'product', ['plan', 'specify', 'analyze', 'deliver']),
  buildRegistry(restaurantSkills, restaurantCanonicalSkills, 'restaurant', 'restaurant', ['reservation', 'service', 'kitchen', 'billing']),
buildRegistry(salesSkills, [], 'sales', 'sales', ['discovery', 'proposal', 'close']),
  buildRegistry(supportSkills, [], 'support', 'support', ['intake', 'triage', 'resolution', 'follow-up']),
  buildRegistry(contentSkills, [], 'content', 'content', ['plan', 'draft', 'optimize', 'publish']),
  buildRegistry(creativeSkills, [], 'creative', 'creative', ['brief', 'create']),
  buildRegistry(sportsSkills, [], 'sports', 'sports', ['research', 'odds', 'analysis']),
  buildRegistry(eventSkills, [], 'event', 'event', ['plan', 'vendors', 'day-of']),
  buildRegistry(executiveSkills, [], 'executive', 'executive', ['review', 'analysis', 'recommendation', 'decision']),
  buildRegistry(financeSkills, [], 'finance', 'finance', ['research', 'analyze', 'trade', 'report']),
  buildRegistry(hotelSkills, [], 'hotel', 'hotel', ['booking', 'stay', 'review', 'loyalty']),
  buildRegistry(investmentSkills, [], 'investment', 'investment', ['research', 'analyze', 'trade', 'track']),
  buildRegistry(legalSkills, [], 'legal', 'legal', ['intake', 'research', 'draft', 'review']),
  buildRegistry(songwritingSkills, [], 'songwriting', 'songwriting', ['trend', 'brief', 'draft', 'refine']),
  buildRegistry(scriptwritingSkills, scriptwritingCanonicalSkills, 'scriptwriting', 'scriptwriting', ['brief', 'draft', 'revise', 'finalize']),
  buildRegistry(analyticsSkills, [], 'analytics', 'analytics', ['report', 'analyze', 'query']),
];

export interface RetainedOverlapDecision {
  decisionId: string;
  skillIds: string[];
  assistantNames: string[];
  userOutcome: string;
  object: string;
  decisionBoundary: string;
  decision: 'retain-separate' | 'merge' | 'retain-with-hierarchy';
  rationale: string;
  registryImplication: string;
}

export function getRetainedOverlapDecisions(): RetainedOverlapDecision[] {
  return [
    {
      decisionId: 'DEC-001',
      skillIds: ['analytics_business_insight_report', 'analytics-grounded-reporting', 'analytics-warehouse-query', 'healthcare_operational_analytics', 'product-data-analysis', 'marketing-market-research', 'cto-infrastructure-query'],
      assistantNames: ['Analytics', 'Healthcare', 'Product', 'Marketing', 'CTO'],
      userOutcome: 'Understand business performance and surface actionable insight from data',
      object: 'Varies: business metrics, patient/operational data, product metrics, market/competitive data, infrastructure metrics',
      decisionBoundary: 'The data domain/object being analyzed',
      decision: 'retain-separate',
      rationale: 'Same meta-outcome (data-driven insight) but objects differ. Consolidating would conflate business strategy questions with clinical operations, product decisions, market intelligence, and infrastructure monitoring.',
      registryImplication: 'ADK should provide a shared report-builder primitive parameterized by data domain, not a single merged skill.',
    },
    {
      decisionId: 'DEC-002',
      skillIds: ['cto-architecture-tech-debt-evaluator', 'cto-cloud-spend-infrastructure-optimizer', 'plan-campaign', 'create-roadmap', 'education_learner_insight'],
      assistantNames: ['CTO', 'Marketing', 'Product', 'Education'],
      userOutcome: 'Create a structured plan for the assistant\'s primary domain',
      object: 'Varies: infrastructure systems, campaigns, products, learners',
      decisionBoundary: 'The domain object being planned',
      decision: 'retain-separate',
      rationale: 'The "plan" label is a shared stage name (benign per workflow-governance.test.ts), but the objects and outputs differ entirely. Merging would create a generic "plan" skill that does none of these well.',
      registryImplication: 'No action needed. Stage names may overlap; objects and product contexts do not.',
    },
    {
      decisionId: 'DEC-003',
      skillIds: ['product-jira', 'product-confluence', 'product-slack', 'product-calendar', 'cto-github-ops', 'cto-incident-war-room', 'marketing-content-generation', 'marketing-social-media', 'marketing-email', 'marketing-seo', 'marketing-document-management', 'healthcare_records_scheduling_ops', 'healthcare_communication_automation', 'hr-draft-jd-interview-kit'],
      assistantNames: ['Product', 'CTO', 'Marketing', 'Healthcare', 'HR'],
      userOutcome: 'Execute an external action through a connected system',
      object: 'Varies: product backlog items, product docs, team communication, scheduling, engineering issues, marketing content, healthcare records',
      decisionBoundary: 'The external system being operated and the product context of that operation',
      decision: 'retain-separate',
      rationale: 'Each external action skill targets a distinct system within a distinct assistant\'s product context. Even when the same underlying API is used, the user expects different outcomes, confirmation flows, and audit trails.',
      registryImplication: 'The createExternalActionSkill factory already parameterizes system, action, endpoint, auth, and configSchema. No merge needed; the factory is the correct abstraction level.',
    },
    {
      decisionId: 'DEC-004',
      skillIds: ['healthcare_patient_communication', 'marketing-email', 'marketing-social-media', 'hr-draft-jd-interview-kit'],
      assistantNames: ['Healthcare', 'Marketing', 'HR'],
      userOutcome: 'Deliver a message or notification to a recipient',
      object: 'Varies: patients, campaign audiences, social audiences, candidates',
      decisionBoundary: 'Recipient type and communication purpose',
      decision: 'retain-separate',
      rationale: 'Same user action (send message) but different regulatory context, recipient type, and content purpose. Merging would risk compliance violations or user confusion about message origin.',
      registryImplication: 'Each skill carries its own confirmBeforeSend and configSchema per domain. No merge.',
    },
    {
      decisionId: 'DEC-005',
      skillIds: ['cto-infrastructure-query', 'analytics-warehouse-query', 'product-data-analysis', 'marketing-market-research', 'healthcare_clinical_decision_support'],
      assistantNames: ['CTO', 'Analytics', 'Product', 'Marketing', 'Healthcare'],
      userOutcome: 'Retrieve and inspect data without modifying it',
      object: 'Varies: infrastructure status, business metrics, product data, market data, clinical data',
      decisionBoundary: 'The data source and the type of insight expected',
      decision: 'retain-separate',
      rationale: 'Different data sources, different query languages, different output formats, different user expertise expectations.',
      registryImplication: 'The ADK can share a query-execution primitive but should parameterize data source, query format, and result presentation.',
    },
    {
      decisionId: 'DEC-006',
      skillIds: ['cto-architecture-advisory', 'cto-architecture-tech-debt-evaluator', 'healthcare-clinical-decision-support-evaluator', 'healthcare-clinical-practice-workflow-evaluator', 'career-job-market-positioning-evaluator', 'customer-churn-health-evaluator', 'revenue-performance-advisory'],
      assistantNames: ['CTO', 'Healthcare', 'Career', 'Support', 'Hotel'],
      userOutcome: 'Get an expert assessment or evaluation of a domain situation',
      object: 'Varies: architecture/tech debt, clinical decisions, candidate fit, market positioning, customer health, hotel performance',
      decisionBoundary: 'The domain expertise and evaluation criteria',
      decision: 'retain-separate',
      rationale: '"Evaluate" is a universal meta-action, but evaluation criteria, domain knowledge, and output format are domain-specific. No two evaluation skills can be meaningfully merged without losing accuracy.',
      registryImplication: 'ADK should provide a shared evaluation wrapper parameterized by scoring function, criteria schema, and output format — not a single merged skill.',
    },
    {
      decisionId: 'DEC-007',
      skillIds: ['healthcare_records_scheduling_ops', 'schedule-interview', 'product-calendar'],
      assistantNames: ['Healthcare', 'HR', 'Product'],
      userOutcome: 'Reserve time, resources, or capacity for a specific entity',
      object: 'Varies: medical appointments, interviews, meetings',
      decisionBoundary: 'The entity being scheduled and the scheduling domain rules',
      decision: 'retain-separate',
      rationale: 'Each scheduling skill operates on a different object with different constraint sets and different downstream effects.',
      registryImplication: 'No merge. Each skill\'s configSchema and inputSchema are domain-specific.',
    },
    {
      decisionId: 'DEC-008',
      skillIds: ['marketing-content-generation', 'marketing-social-media', 'marketing-email', 'marketing-seo', 'marketing-document-management'],
      assistantNames: ['Marketing'],
      userOutcome: 'Create, distribute, and manage marketing content across channels',
      object: 'Varies: CMS content, social posts, email campaigns, SEO, documents',
      decisionBoundary: 'The channel and content type',
      decision: 'retain-with-hierarchy',
      rationale: 'These are all marketing execution skills but serve different channels with different UX flows. The marketing assistant should present channel selection as a sub-step rather than equal-weight tools.',
      registryImplication: 'No merge at the skill level. Frontend hierarchy change: channel selection should be a selector, not a flat list.',
    },
    {
      decisionId: 'DEC-009',
      skillIds: ['songwriter_genre_trend_evaluator', 'scriptwriting-genre-market-evaluator'],
      assistantNames: ['Songwriting', 'Scriptwriting'],
      userOutcome: 'Create creative content in a specific medium',
      object: 'Varies: songs/lyrics (Songwriting), scripts/scenes (Scriptwriting)',
      decisionBoundary: 'The creative medium and its structural rules',
      decision: 'retain-separate',
      rationale: 'Both share a creative brief pattern (goal, audience, tone, format, references) while diverging in medium-specific execution. Songwriter\'s genre evaluator assesses musical trend fit; Scriptwriter\'s assesses script market positioning for screen/media.',
      registryImplication: 'Skill names must be differentiated: songwriter\'s includes "Trend Fit" (music domain), scriptwriter\'s uses "Market Evaluator" (screen/media domain).',
    },
    {
      decisionId: 'DEC-010',
      skillIds: ['performance_analytics', 'player_tactical_advisory', 'scouting_report_generator', 'team_roster_analyzer'],
      assistantNames: ['Sports'],
      userOutcome: 'Understand performance and strategy',
      object: 'Player/team stats, game film',
      decisionBoundary: 'User intent and risk profile: performance analysis is for coaching/staff decision-making',
      decision: 'retain-separate',
      rationale: 'Sports performance analysis is for coaching/staff decision-making with no financial risk. Must be isolated from wagering capabilities which are for individual entertainment with financial risk.',
      registryImplication: 'ASSISTANT_OBJECT_MAP and ASSISTANT_FLOW_MAP must maintain dual-group structure. No cross-group state sharing, no shared data stores, no cross-group handoffs.',
    },
  ];
}

export function getRetainedOverlapDecision(decisionId: string): RetainedOverlapDecision | undefined {
  return getRetainedOverlapDecisions().find(d => d.decisionId === decisionId);
}

export function getRetainedOverlapDecisionIds(): string[] {
  return getRetainedOverlapDecisions().map(d => d.decisionId);
}

export function getOverlappingSkills(): { skillId: string; skillName: string; assistants: string[] }[] {
  const overlaps = detectOverlappingSkills(assistantRegistries);
  const allSkills = assistantRegistries.flatMap(r => r.skills);
  return overlaps.map(({ skillId, assistants }) => {
    const skill = allSkills.find(s => s.id === skillId);
    return { skillId, skillName: skill?.name || skillId, assistants };
  });
}

assistantRegistries.forEach((reg, i) => {
  const mapKeys = Object.keys(ASSISTANT_OBJECT_MAP);
  const key = mapKeys[i];
  if (key) reg.assistant = key.charAt(0).toUpperCase() + key.slice(1);
});

export function getAssistantByName(name: string): AssistantRegistry | undefined {
  return assistantRegistries.find(r => r.assistant.toLowerCase() === name.toLowerCase());
}

export function getAssistantsByObject(object: string): AssistantRegistry[] {
  return assistantRegistries.filter(r => r.productObject.toLowerCase().includes(object.toLowerCase()));
}

export function getAssistantsWithSkillCount(minSkills = 1): AssistantRegistry[] {
  return assistantRegistries.filter(r => r.skills.length >= minSkills);
}
