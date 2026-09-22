import { Tool } from "../../../types";
import { EVENT_PLANNING_BUDGETING } from "./event-planning-budgeting";
import { VENDOR_CONTRACT_MANAGEMENT } from "./vendor-contract-management";
import { DAY_OF_OPERATIONS } from "./day-of-operations";
import { annotateStages, createWorkflow, AssistantWorkflow } from "../workflow-common";

export const eventSkills: Tool[] = [
  EVENT_PLANNING_BUDGETING,
  VENDOR_CONTRACT_MANAGEMENT,
  DAY_OF_OPERATIONS,
];

annotateStages(eventSkills, {
  'event_planning_budgeting': 'plan',
  'event_vendor_contract_management': 'vendors',
  'event_day_of_operations': 'day-of',
});

export const eventWorkflow = createWorkflow({
  assistant: 'Event',
  productObject: 'event / vendor',
  flow: 'plan → vendors → day-of',
  stages: [
    { name: 'plan', description: 'Event planning and budgeting', stageIds: ['event_planning_budgeting'] },
    { name: 'vendors', description: 'Vendor and contract management', stageIds: ['event_vendor_contract_management'] },
    { name: 'day-of', description: 'Day-of operations', stageIds: ['event_day_of_operations'] },
  ],
}, eventSkills);
