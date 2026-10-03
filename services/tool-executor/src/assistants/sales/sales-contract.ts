import { PRESENT_SCHEMA, resultSchema, EXTERNAL_ACTION_OUTPUT_SCHEMA } from '../../adk/shared/skill-result-contract';

export const SALES_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const salesResultSchema = (dataDescription: string) =>
  resultSchema(dataDescription, { extraStatuses: ['dry-run', 'error'] });

export const SALES_EXTERNAL_OUTPUT_SCHEMA = EXTERNAL_ACTION_OUTPUT_SCHEMA;
