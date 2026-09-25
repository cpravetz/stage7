import { Tool } from '../../../types';
import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';
import { RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST } from './restaurant-menu-engineering-cost-strategist';
import { RESTAURANT_SHIFT_PREP_LIST_COPILOT } from './restaurant-shift-prep-list-copilot';
import { RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER } from './restaurant-reservations-guest-profile-manager';
import { RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER } from './restaurant-supply-chain-inventory-reorder-manager';
import { RESTAURANT_FINANCIAL_FORECAST_EVALUATOR } from './restaurant-financial-forecast-evaluator';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const restaurantSkills: Tool[] = [
  RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST,
  RESTAURANT_SHIFT_PREP_LIST_COPILOT,
  RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER,
  RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER,
  RESTAURANT_FINANCIAL_FORECAST_EVALUATOR,
];

export const restaurantCanonicalSkills: Tool[] = [
  RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST,
  RESTAURANT_SHIFT_PREP_LIST_COPILOT,
  RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER,
  RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER,
  RESTAURANT_FINANCIAL_FORECAST_EVALUATOR,
];

annotateStages(restaurantSkills, {
  'restaurant-menu-engineering-cost-strategist': 'billing',
  'restaurant-shift-prep-list-copilot': 'kitchen',
  'restaurant-reservations-guest-profile-manager': 'reservation',
  'restaurant-supply-chain-inventory-reorder-manager': 'service',
  'restaurant-financial-forecast-evaluator': 'billing',
});

export const restaurantWorkflow = createWorkflow({
  assistant: 'Restaurant',
  productObject: 'reservation / table',
  flow: 'reservation → service → kitchen → billing',
  stages: [
    { name: 'reservation', description: 'Reservation and guest experience management', stageIds: ['restaurant-reservations-guest-profile-manager'] },
    { name: 'service', description: 'Supply chain and reorder operations', stageIds: ['restaurant-supply-chain-inventory-reorder-manager'] },
    { name: 'kitchen', description: 'Kitchen and service operations', stageIds: ['restaurant-shift-prep-list-copilot'] },
    { name: 'billing', description: 'Financial engineering and forecasting', stageIds: ['restaurant-menu-engineering-cost-strategist', 'restaurant-financial-forecast-evaluator'] },
  ],
}, restaurantSkills);
