import { Tool } from '../../../types';
import { TICKET_UNDERSTANDING } from './ticket-understanding';
import { RESPONSE_DRAFTING } from './response-drafting';
import { TICKET_OPS } from './ticket-ops';
import { ANALYTICS_PLANNING } from './analytics-planning';

export const supportSkills = [
  { ...TICKET_UNDERSTANDING, isSkill: false },
  { ...RESPONSE_DRAFTING, isSkill: false },
  { ...TICKET_OPS, isSkill: false },
  { ...ANALYTICS_PLANNING, isSkill: false },
];
