import { PRESENT_SCHEMA, resultSchema, EXTERNAL_ACTION_OUTPUT_SCHEMA } from '../shared/skill-result-contract';
import { SchemaRecord } from '../../../types';

export const HR_PRESENT_SCHEMA: SchemaRecord = PRESENT_SCHEMA as SchemaRecord;

export const hrResultSchema = (dataDescription: string): SchemaRecord =>
  resultSchema(dataDescription, { extraStatuses: ['error'] }) as SchemaRecord;

export const HR_EXTERNAL_OUTPUT_SCHEMA: SchemaRecord = EXTERNAL_ACTION_OUTPUT_SCHEMA as SchemaRecord;
