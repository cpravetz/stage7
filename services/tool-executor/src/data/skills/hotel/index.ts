import { Tool } from '../../../types';
import { RESERVATIONS_SKILL } from './hotel-reservations-guest-profile';
import { PROPERTY_OPERATIONS_SKILL } from './hotel-property-operations';
import { GUEST_EXPERIENCE_SKILL } from './hotel-guest-experience';
import { REVENUE_SKILL } from './hotel-revenue-performance-advisory';

export const hotelSkills: Tool[] = [
  { ...RESERVATIONS_SKILL, isSkill: false },
  { ...PROPERTY_OPERATIONS_SKILL, isSkill: false },
  { ...GUEST_EXPERIENCE_SKILL, isSkill: false },
  REVENUE_SKILL,
];
