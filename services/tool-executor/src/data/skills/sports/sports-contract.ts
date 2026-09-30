import { PRESENT_SCHEMA, resultSchema, EXTERNAL_ACTION_OUTPUT_SCHEMA } from '../shared/skill-result-contract';

export const SPORTS_SAFETY_BOUNDARY = 'wagering advice separation / performance analytics isolation';
export const SPORTS_PERFORMANCE_SAFETY_BOUNDARY = 'performance analytics isolation';
export const SPORTS_WAGERING_SAFETY_BOUNDARY = 'wagering advice separation';

export const SPORTS_PERFORMANCE_GROUP = 'sports-performance';
export const SPORTS_WAGERING_GROUP = 'sports-wagering';

export function sportsGroupFor(skillId: string): string {
  if (skillId.includes('odds') || skillId.includes('bankroll') || skillId.includes('line-alert')) {
    return SPORTS_WAGERING_GROUP;
  }
  return SPORTS_PERFORMANCE_GROUP;
}

export function sportsBoundaryFor(group: string): string {
  if (group === SPORTS_WAGERING_GROUP) {
    return SPORTS_WAGERING_SAFETY_BOUNDARY;
  }
  return SPORTS_PERFORMANCE_SAFETY_BOUNDARY;
}

export const SPORTS_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const sportsResultSchema = (dataDescription: string, group?: string) => {
  const boundary = group ? sportsBoundaryFor(group) : SPORTS_SAFETY_BOUNDARY;
  return resultSchema(dataDescription, { extraStatuses: ['error'], safetyBoundary: boundary });
};

export const SPORTS_EXTERNAL_OUTPUT_SCHEMA = EXTERNAL_ACTION_OUTPUT_SCHEMA;
