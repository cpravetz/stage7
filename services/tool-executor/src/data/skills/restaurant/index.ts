import { Tool } from '../../../types';

import { RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST } from './restaurant-menu-engineering-cost-strategist';
import { RESTAURANT_SHIFT_PREP_LIST_COPILOT } from './restaurant-shift-prep-list-copilot';
import { RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER } from './restaurant-reservations-guest-profile-manager';
import { RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER } from './restaurant-supply-chain-inventory-reorder-manager';
import { RESTAURANT_FINANCIAL_FORECAST_EVALUATOR } from './restaurant-financial-forecast-evaluator';
import { createWorkflow } from '../workflow-common';

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

export const restaurantWorkflow = createWorkflow({
  assistant: 'Restaurant',
  productObject: 'reservation / table',
  flow: 'reservation → service → kitchen → billing',
  skills: restaurantSkills,
});
