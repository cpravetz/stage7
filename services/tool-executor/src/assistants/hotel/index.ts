import { Tool } from '../../types';
import { RESERVATIONS_SKILL } from './skills/hotel-reservations-guest-profile';
import { HOUSEKEEPING_MANAGER_SKILL } from './skills/hotel-housekeeping-manager';
import { MAINTENANCE_DISPATCHER_SKILL } from './skills/hotel-maintenance-dispatcher';
import { ROOM_STATUS_MANAGER_SKILL } from './skills/hotel-room-status-manager';
import { INVENTORY_MANAGER_SKILL } from './skills/hotel-inventory-manager';
import { GUEST_EXPERIENCE_SKILL } from './skills/hotel-guest-experience';
import { REVENUE_SKILL } from './skills/hotel-revenue-performance-advisory';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';

export const hotelSkills: Tool[] = [
  RESERVATIONS_SKILL,
  HOUSEKEEPING_MANAGER_SKILL,
  MAINTENANCE_DISPATCHER_SKILL,
  ROOM_STATUS_MANAGER_SKILL,
  INVENTORY_MANAGER_SKILL,
  GUEST_EXPERIENCE_SKILL,
  REVENUE_SKILL,
];

export const hotelWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Hotel',
  productObject: 'stay / booking',
  flow: 'booking → stay → review → loyalty',
  skills: hotelSkills,
});
