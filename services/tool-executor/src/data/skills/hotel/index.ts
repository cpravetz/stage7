import { Tool } from '../../../types';
import { RESERVATIONS_SKILL } from './hotel-reservations-guest-profile';
import { PROPERTY_OPERATIONS_SKILL } from './hotel-property-operations';
import { GUEST_EXPERIENCE_SKILL } from './hotel-guest-experience';
import { REVENUE_SKILL } from './hotel-revenue-performance-advisory';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const hotelSkills: Tool[] = [
  RESERVATIONS_SKILL,
  PROPERTY_OPERATIONS_SKILL,
  GUEST_EXPERIENCE_SKILL,
  REVENUE_SKILL,
];

annotateStages(hotelSkills, {
  'hotel-reservations-guest-profile': 'booking',
  'hotel-property-operations': 'stay',
  'hotel-guest-experience': 'loyalty',
  'hotel-revenue-performance-advisory': 'review',
});

export const hotelWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Hotel',
  productObject: 'stay / booking',
  flow: 'booking → stay → review → loyalty',
  stages: [
    { name: 'booking', description: 'Reservation and booking', stageIds: ['hotel-reservations-guest-profile'] },
    { name: 'stay', description: 'Property operations', stageIds: ['hotel-property-operations'] },
    { name: 'review', description: 'Revenue and performance review', stageIds: ['hotel-revenue-performance-advisory'] },
    { name: 'loyalty', description: 'Loyalty and guest retention', stageIds: ['hotel-guest-experience'] },
  ],
}, hotelSkills);
