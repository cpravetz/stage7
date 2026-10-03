import { Tool } from "../../types";
import { EVENT_PLANNING_BUDGETING } from "./skills/event-planning-budgeting";
import { VENDOR_CONTRACT_MANAGEMENT } from "./skills/vendor-contract-management";
import { DAY_OF_OPERATIONS } from "./skills/day-of-operations";
import { CHECKIN_GUEST } from "./skills/guest-checkin";
import { UPDATE_SEATING } from "./skills/seating-update";
import { LOG_INCIDENT } from "./skills/incident-log";
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
