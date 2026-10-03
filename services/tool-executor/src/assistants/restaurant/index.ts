import { Tool } from '../../types';

import { RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST } from './skills/restaurant-menu-engineering-cost-strategist';
import { RESTAURANT_SHIFT_PREP_LIST_COPILOT } from './skills/restaurant-shift-prep-list-copilot';
import { RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER } from './skills/manage-reservation';
import { RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER } from './skills/restaurant-supply-chain-inventory-reorder-manager';
import { RESTAURANT_FINANCIAL_FORECAST_EVALUATOR } from './skills/restaurant-financial-forecast-evaluator';
import { createWorkflow } from '../../adk/workflow-common';

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
