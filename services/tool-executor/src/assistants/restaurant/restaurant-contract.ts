import { PRESENT_SCHEMA, resultSchema, EXTERNAL_ACTION_OUTPUT_SCHEMA } from '../../adk/shared/skill-result-contract';

export const RESTAURANT_SAFETY_BOUNDARY = 'food safety / allergen protocol';

export const RESTAURANT_PRESENT_SCHEMA = PRESENT_SCHEMA;

export const restaurantResultSchema = (dataDescription: string) =>
  resultSchema(dataDescription, { extraStatuses: ['error'], safetyBoundary: RESTAURANT_SAFETY_BOUNDARY });

export const RESTAURANT_EXTERNAL_OUTPUT_SCHEMA = EXTERNAL_ACTION_OUTPUT_SCHEMA;
