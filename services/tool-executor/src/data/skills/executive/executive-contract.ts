import { PRESENT_SCHEMA, resultSchema, EXTERNAL_ACTION_OUTPUT_SCHEMA } from '../shared/skill-result-contract';

export const EXECUTIVE_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const executiveResultSchema = (dataDescription: string) =>
  resultSchema(dataDescription, { extraStatuses: ['safety-escalation', 'error'] });

export const EXECUTIVE_EXTERNAL_OUTPUT_SCHEMA = EXTERNAL_ACTION_OUTPUT_SCHEMA;
