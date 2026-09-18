import { Tool } from '../../../types';
import { JOB_MARKET_POSITIONING_EVALUATOR } from './career-job-market-positioning-evaluator';
import { INTERVIEW_COMPENSATION_BATTLECARD } from './career-interview-compensation-battlecard-creator';
import { GOVERNED_APPLICATION_OUTREACH_MANAGER } from './career-governed-application-outreach-manager';
import { JOB_DISCOVERY_FIT_RANKING } from './career-job-discovery-fit-ranking';
import { APPLICATION_EXECUTION_ORCHESTRATOR } from './career-application-execution-orchestrator';
import { UPSKILL_ROLE_TARGETED_LEARNING_PLANNER } from './career-upskill-role-targeted-learning-planner';
import { INTERVIEW_PRACTICE_MOCK_INTERVIEWER } from './career-interview-practice-mock-interviewer';
import { PIPELINE_OUTCOME_TRACKER } from './career-pipeline-outcome-tracker';
// Workspace/email sync removed per design; do not export as a skill
import { RESUME_TEMPLATE_MANAGER } from './career-resume-template-manager';
import { PORTAL_RECRUITER_WORKFLOW } from './career-portal-recruiter-workflow';

export {
  JOB_MARKET_POSITIONING_EVALUATOR,
  INTERVIEW_COMPENSATION_BATTLECARD,
  GOVERNED_APPLICATION_OUTREACH_MANAGER,
  JOB_DISCOVERY_FIT_RANKING,
  APPLICATION_EXECUTION_ORCHESTRATOR,
  UPSKILL_ROLE_TARGETED_LEARNING_PLANNER,
  INTERVIEW_PRACTICE_MOCK_INTERVIEWER,
  PIPELINE_OUTCOME_TRACKER,
  RESUME_TEMPLATE_MANAGER,
  PORTAL_RECRUITER_WORKFLOW,
};

export const careerCanonicalSkills: Tool[] = [
  JOB_MARKET_POSITIONING_EVALUATOR,
  INTERVIEW_COMPENSATION_BATTLECARD,
  GOVERNED_APPLICATION_OUTREACH_MANAGER,
  JOB_DISCOVERY_FIT_RANKING,
  APPLICATION_EXECUTION_ORCHESTRATOR,
  UPSKILL_ROLE_TARGETED_LEARNING_PLANNER,
  INTERVIEW_PRACTICE_MOCK_INTERVIEWER,
  PIPELINE_OUTCOME_TRACKER,
  RESUME_TEMPLATE_MANAGER,
  PORTAL_RECRUITER_WORKFLOW,
];

export const careerSkills = careerCanonicalSkills;