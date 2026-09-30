import { PRESENT_SCHEMA, resultSchema } from '../shared/skill-result-contract';

export const EXECUTIVE_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const executiveResultSchema = (dataDescription: string) =>
  resultSchema(dataDescription, { extraStatuses: ['safety-escalation', 'error'] });
