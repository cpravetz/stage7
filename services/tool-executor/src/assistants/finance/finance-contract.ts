import { PRESENT_SCHEMA, resultSchema, EXTERNAL_ACTION_OUTPUT_SCHEMA } from '../../adk/shared/skill-result-contract';

export const FINANCE_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const financeResultSchema = (dataDescription: string) =>
  resultSchema(dataDescription);
