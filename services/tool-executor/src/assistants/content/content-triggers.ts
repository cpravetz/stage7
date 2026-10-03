import { SkillTrigger } from '../../types';

/**
 * Higher-order triggers shared by the Content Creator's represent-tier skills. They describe when
 * the assistant should reach for this domain, not what any particular skill computes.
 */
export const CONTENT_HIGHER_ORDER_TRIGGERS: SkillTrigger[] = [
  {
    kind: 'user',
    phrase_examples: [
      'evaluate content strategy',
      'plan the editorial calendar',
      'stage a CMS publish',
    ],
  },
  {
    kind: 'schedule',
    cadence: 'weekly editorial queue and performance review',
  },
  {
    kind: 'event',
    on: 'draft completion, publishing request, or performance threshold',
  },
];
