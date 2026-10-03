import { Tool } from '../../types';

import { ctoTeamDeliveryHealthEvaluator } from './skills/cto-team-delivery-health-evaluator';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';
import { ctoDisasterRecoveryPlanner } from './skills/cto-disaster-recovery-planner';
import { CTO_ARCHITECTURE_ADVISORY } from './tools/cto-architecture-advisory';
import { CTO_ARCHITECTURE_TECH_DEBT_EVALUATOR } from './skills/cto-architecture-tech-debt-evaluator';
import { CTO_CLOUD_SPEND_INFRASTRUCTURE_OPTIMIZER } from './skills/cto-cloud-spend-infrastructure-optimizer';
import { CTO_ENGINEERING_ACTION_IAC_DRIFT_REMEDIATION } from './skills/cto-engineering-action-iac-drift-remediation';
import { CTO_ENGINEERING_ACTIONS } from './tools/cto-engineering-actions';
import { CTO_INCIDENT_DISASTER_READINESS } from './tools/cto-incident-disaster-readiness';
import { CTO_INCIDENT_WAR_ROOM_SYNTHESIZER } from './skills/cto-incident-war-room-synthesizer';
import { CTO_INFRASTRUCTURE_QUERY } from './tools/cto-infrastructure-query';
import { CALCULATE_DORA } from './tools/dora-metrics';

export const ctoSkills: Tool[] = [
  CTO_INFRASTRUCTURE_QUERY,
  CTO_ENGINEERING_ACTIONS,
  CTO_INCIDENT_DISASTER_READINESS,
  CTO_ARCHITECTURE_ADVISORY,
  CTO_ARCHITECTURE_TECH_DEBT_EVALUATOR,
  CTO_CLOUD_SPEND_INFRASTRUCTURE_OPTIMIZER,
  CTO_INCIDENT_WAR_ROOM_SYNTHESIZER,
  CTO_ENGINEERING_ACTION_IAC_DRIFT_REMEDIATION,
  ctoTeamDeliveryHealthEvaluator,

  ctoDisasterRecoveryPlanner,
  CALCULATE_DORA,
];

export const ctoCanonicalSkills = ctoSkills.filter((s) => s.isSkill !== false);

export const ctoWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'CTO',
  productObject: 'system / incident',
  flow: 'monitor → diagnose → plan → approve → execute',
  skills: ctoSkills,
});
