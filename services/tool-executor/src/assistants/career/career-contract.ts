import { PRESENT_SCHEMA, resultSchema } from '../../adk/shared/skill-result-contract';

export const CAREER_PRESENT_SCHEMA = {
  ...PRESENT_SCHEMA,
  items: {
    ...PRESENT_SCHEMA.items,
    properties: {
      ...PRESENT_SCHEMA.items.properties,
      links: {
        type: 'array',
        description:
          'Outbound links rendered under the body, each opening in a new tab. A search that found postings lists them here; reporting only a count leaves the user with nothing to click.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            url: { type: 'string' },
            detail: { type: 'string' },
          },
          required: ['label', 'url'],
        },
      },
    },
  },
};

export const careerResultSchema = (dataDescription: string) =>
  resultSchema(dataDescription, { extraStatuses: ['dry-run', 'error'] });
