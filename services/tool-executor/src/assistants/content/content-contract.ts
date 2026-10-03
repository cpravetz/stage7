import { PRESENT_SCHEMA, resultSchema, EXTERNAL_ACTION_OUTPUT_SCHEMA } from '../../adk/shared/skill-result-contract';

export const CONTENT_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const contentResultSchema = (dataDescription: string) =>
  resultSchema(dataDescription);

export const CONTENT_EXTERNAL_OUTPUT_SCHEMA = EXTERNAL_ACTION_OUTPUT_SCHEMA;
