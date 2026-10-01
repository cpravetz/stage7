import { PRESENT_SCHEMA, resultSchema, EXTERNAL_ACTION_OUTPUT_SCHEMA } from '../shared/skill-result-contract';

export const INVESTMENT_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const investmentResultSchema = (dataDescription: string) =>
  resultSchema(dataDescription, { extraStatuses: ['dry-run', 'error'] });

export const INVESTMENT_EXTERNAL_OUTPUT_SCHEMA = EXTERNAL_ACTION_OUTPUT_SCHEMA;
