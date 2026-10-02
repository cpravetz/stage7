import { Tool } from '../../../types';

import { ctoTeamDeliveryHealthEvaluator } from './cto-team-delivery-health-evaluator';
import { createWorkflow, AssistantWorkflow } from '../workflow-common';
import { ctoDisasterRecoveryPlanner } from './cto-disaster-recovery-planner';
import { CTO_ARCHITECTURE_ADVISORY } from './cto-architecture-advisory';
import { CTO_ARCHITECTURE_TECH_DEBT_EVALUATOR } from './cto-architecture-tech-debt-evaluator';
import { CTO_CLOUD_SPEND_INFRASTRUCTURE_OPTIMIZER } from './cto-cloud-spend-infrastructure-optimizer';
import { CTO_ENGINEERING_ACTION_IAC_DRIFT_REMEDIATION } from './cto-engineering-action-iac-drift-remediation';
import { CTO_ENGINEERING_ACTIONS } from './cto-engineering-actions';
import { CTO_INCIDENT_DISASTER_READINESS } from './cto-incident-disaster-readiness';
import { CTO_INCIDENT_WAR_ROOM_SYNTHESIZER } from './cto-incident-war-room-synthesizer';
import { CTO_INFRASTRUCTURE_QUERY } from './cto-infrastructure-query';

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
];

export const ctoCanonicalSkills = ctoSkills.filter((s) => s.isSkill !== false);

export const ctoWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'CTO',
  productObject: 'system / incident',
  flow: 'monitor → diagnose → plan → approve → execute',
  skills: ctoSkills,
});
