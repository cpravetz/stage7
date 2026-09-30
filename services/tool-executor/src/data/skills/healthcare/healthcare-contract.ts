import { PRESENT_SCHEMA, resultSchema, EXTERNAL_ACTION_OUTPUT_SCHEMA } from '../shared/skill-result-contract';

export const HEALTHCARE_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const healthcareResultSchema = (dataDescription: string) =>
  resultSchema(dataDescription, { extraStatuses: ['safety-escalation', 'error'] });

export const HEALTHCARE_EXTERNAL_OUTPUT_SCHEMA = EXTERNAL_ACTION_OUTPUT_SCHEMA;
