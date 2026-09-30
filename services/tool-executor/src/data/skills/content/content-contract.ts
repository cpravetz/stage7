import { PRESENT_SCHEMA, resultSchema } from '../shared/skill-result-contract';

export const CONTENT_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const contentResultSchema = (dataDescription: string) =>
  resultSchema(dataDescription);
