import { Tool } from "../../types";
import { EVENT_PLANNING_BUDGETING } from "./skills/event-planning-budgeting";
import { VENDOR_CONTRACT_MANAGEMENT } from "./skills/event-vendor-contract-management";
import { DAY_OF_OPERATIONS } from "./skills/event-day-of-operations";
import { CHECKIN_GUEST } from "./skills/event-checkin-guest";
import { UPDATE_SEATING } from "./skills/event-update-seating";
import { LOG_INCIDENT } from "./skills/event-log-incident";
import { createWorkflow } from '../../adk/workflow-common';

export const eventSkills: Tool[] = [
  EVENT_PLANNING_BUDGETING,
  VENDOR_CONTRACT_MANAGEMENT,
  DAY_OF_OPERATIONS,
  CHECKIN_GUEST,
  UPDATE_SEATING,
  LOG_INCIDENT,
];

export const eventWorkflow = createWorkflow({
  assistant: 'Event',
  productObject: 'event / vendor',
  flow: 'plan → vendors → day-of',
  skills: eventSkills,
});
