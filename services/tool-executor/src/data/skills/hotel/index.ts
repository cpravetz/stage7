import { Tool } from '../../../types';
import { RESERVATIONS_SKILL } from './hotel-reservations-guest-profile';
import { HOUSEKEEPING_MANAGER_SKILL } from './hotel-housekeeping-manager';
import { MAINTENANCE_DISPATCHER_SKILL } from './hotel-maintenance-dispatcher';
import { ROOM_STATUS_MANAGER_SKILL } from './hotel-room-status-manager';
import { INVENTORY_MANAGER_SKILL } from './hotel-inventory-manager';
import { GUEST_EXPERIENCE_SKILL } from './hotel-guest-experience';
import { REVENUE_SKILL } from './hotel-revenue-performance-advisory';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const hotelSkills: Tool[] = [
  RESERVATIONS_SKILL,
  HOUSEKEEPING_MANAGER_SKILL,
  MAINTENANCE_DISPATCHER_SKILL,
  ROOM_STATUS_MANAGER_SKILL,
  INVENTORY_MANAGER_SKILL,
  GUEST_EXPERIENCE_SKILL,
  REVENUE_SKILL,
];

annotateStages(hotelSkills, {
  'hotel-reservations-guest-profile': 'booking',
  'hotel-housekeeping-manager': 'stay',
  'hotel-maintenance-dispatcher': 'stay',
  'hotel-room-status-manager': 'stay',
  'hotel-inventory-manager': 'stay',
  'hotel-guest-experience': 'loyalty',
  'hotel-revenue-performance-advisory': 'review',
});

export const hotelWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Hotel',
  productObject: 'stay / booking',
  flow: 'booking → stay → review → loyalty',
  stages: [
    { name: 'booking', description: 'Reservation and booking', stageIds: ['hotel-reservations-guest-profile'] },
    { name: 'stay', description: 'Property operations: housekeeping, maintenance, room status, and inventory', stageIds: ['hotel-housekeeping-manager', 'hotel-maintenance-dispatcher', 'hotel-room-status-manager', 'hotel-inventory-manager'] },
    { name: 'review', description: 'Revenue and performance review', stageIds: ['hotel-revenue-performance-advisory'] },
    { name: 'loyalty', description: 'Loyalty and guest retention', stageIds: ['hotel-guest-experience'] },
  ],
}, hotelSkills);
