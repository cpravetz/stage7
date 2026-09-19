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
  sales: 'discovery → qualification → proposal → close',
  support: 'intake → triage → resolution → follow-up',
  content: 'plan → draft → optimize → publish',
  creative: 'brief → create → revise → finalize',
  sports: 'research → odds → analysis → recommendation',
  event: 'plan → vendors → logistics → day-of',
  executive: 'review → analysis → recommendation → decision',
  finance: 'research → analyze → trade → report',
  hotel: 'booking → stay → review → loyalty',
  investment: 'research → analyze → trade → track',
  legal: 'intake → research → draft → review',
  songwriting: 'trend → brief → draft → refine',
  scriptwriting: 'brief → draft → revise → finalize',
};

function buildRegistry(skills: Tool[], canonical: Tool[], objectKey: string, flowKey: string, workflowStages: string[]): AssistantRegistry {
  const allSkillIds = new Set([...skills.map(s => s.id), ...canonical.map(s => s.id)]);
  const uniqueSkills = [...skills, ...canonical.filter(s => !allSkillIds.has(s.id))];
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
  buildRegistry(salesSkills, [], 'sales', 'sales', ['discovery', 'qualification', 'proposal', 'close']),
  buildRegistry(supportSkills, [], 'support', 'support', ['intake', 'triage', 'resolution', 'follow-up']),
  buildRegistry(contentSkills, [], 'content', 'content', ['plan', 'draft', 'optimize', 'publish']),
  buildRegistry(creativeSkills, [], 'creative', 'creative', ['brief', 'create', 'revise', 'finalize']),
  buildRegistry(sportsSkills, [], 'sports', 'sports', ['research', 'odds', 'analysis', 'recommendation']),
  buildRegistry(eventSkills, [], 'event', 'event', ['plan', 'vendors', 'logistics', 'day-of']),
  buildRegistry(executiveSkills, [], 'executive', 'executive', ['review', 'analysis', 'recommendation', 'decision']),
  buildRegistry(financeSkills, [], 'finance', 'finance', ['research', 'analyze', 'trade', 'report']),
  buildRegistry(hotelSkills, [], 'hotel', 'hotel', ['booking', 'stay', 'review', 'loyalty']),
  buildRegistry(investmentSkills, [], 'investment', 'investment', ['research', 'analyze', 'trade', 'track']),
  buildRegistry(legalSkills, [], 'legal', 'legal', ['intake', 'research', 'draft', 'review']),
  buildRegistry(songwritingSkills, [], 'songwriting', 'songwriting', ['trend', 'brief', 'draft', 'refine']),
  buildRegistry(scriptwritingSkills, scriptwritingCanonicalSkills, 'scriptwriting', 'scriptwriting', ['brief', 'draft', 'revise', 'finalize']),
];

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
