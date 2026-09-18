import { Tool } from '../../../types';
import { modelingAnalysisSkill } from './finance-modeling-analysis';
import { reportingDataOpsSkill } from './reporting-data-ops';
import { riskRegulatorySkill } from './risk-regulatory-advisory';
import { budgetTrackingSkill } from './budget-tracking';

export const financeSkills: Tool[] = [
  modelingAnalysisSkill,
  reportingDataOpsSkill,
  riskRegulatorySkill,
  budgetTrackingSkill,
];
