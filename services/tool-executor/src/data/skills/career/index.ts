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
import { createWorkflow, AssistantWorkflow } from '../workflow-common';
import { CAREER_INTERVIEW_PREP, CAREER_ADVISORY } from './career-lower-order-tools';

// Lower-order base tools that the wrappers delegate to via __execute_tool.
import { CAREER_PROFILE_INTAKE } from './career-base-tools';
import { CAREER_JOB_DISCOVERY } from './career-job-discovery';
import { CAREER_RANK } from './career-rank';
import { CAREER_APPLY_EXECUTE } from './career-application-execution';
import { CAREER_ADD_TEMPLATE } from './career-add-template';
import { CAREER_NETWORKING_OUTREACH } from './career-networking-outreach';
import { CAREER_PIPELINE_REPORT } from './career-pipeline-report';
import { CAREER_OUTCOME } from './career-outcome';

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
  CAREER_PROFILE_INTAKE,
  CAREER_JOB_DISCOVERY,
  CAREER_RANK,
  CAREER_APPLY_EXECUTE,
  CAREER_ADD_TEMPLATE,
  CAREER_NETWORKING_OUTREACH,
  CAREER_PIPELINE_REPORT,
  CAREER_OUTCOME,
};

export const careerCanonicalSkills: Tool[] = [
  // Panel order for the Career Assistant, in the sequence a candidate actually
  // works in: shape the profile, then manage resume and templates, then search,
  // apply, follow up, track, prepare, and upskill. This array is the order the
  // Career panel renders, and assistants/career/assistant.json mirrors it. The
  // mirror is checked by worker-pool's assistant-manifest-skills test, so the
  // two cannot drift apart silently.
  JOB_MARKET_POSITIONING_EVALUATOR,
  RESUME_TEMPLATE_MANAGER,
  JOB_DISCOVERY_FIT_RANKING,
  APPLICATION_EXECUTION_ORCHESTRATOR,
  GOVERNED_APPLICATION_OUTREACH_MANAGER,
  PORTAL_RECRUITER_WORKFLOW,
  PIPELINE_OUTCOME_TRACKER,
  INTERVIEW_PRACTICE_MOCK_INTERVIEWER,
  INTERVIEW_COMPENSATION_BATTLECARD,
  UPSKILL_ROLE_TARGETED_LEARNING_PLANNER,
];

export const careerLowerOrderTools: Tool[] = [
  CAREER_PROFILE_INTAKE,
  CAREER_JOB_DISCOVERY,
  CAREER_RANK,
  CAREER_APPLY_EXECUTE,
  CAREER_ADD_TEMPLATE,
  CAREER_NETWORKING_OUTREACH,
  CAREER_PIPELINE_REPORT,
  CAREER_OUTCOME,
  CAREER_INTERVIEW_PREP,
  CAREER_ADVISORY,
];

export const careerSkills = [...careerCanonicalSkills, ...careerLowerOrderTools];

  export const careerWorkflow: AssistantWorkflow = createWorkflow(
    {
      assistant: 'Career',
      productObject: 'candidate / job',
      flow: 'profile → fit ranking → application → prep → tracking → outcomes',
      skills: careerSkills,
    });
