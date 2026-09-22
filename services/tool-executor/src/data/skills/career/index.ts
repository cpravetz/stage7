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
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';
import { CAREER_INTERVIEW_PREP, CAREER_ADVISORY } from './career-lower-order-tools';

// Lower-order base tools that the wrappers delegate to via __execute_tool.
import { CAREER_PROFILE_INTAKE } from './career-base-tools';
import { CAREER_JOB_DISCOVERY } from './career-job-discovery';
import { CAREER_RANK } from './career-rank';
import { CAREER_APPLY_EXECUTE } from './career-apply-execute';
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

annotateStages(careerSkills, {
    'career-job-market-positioning-evaluator': 'profile',
    'career-interview-compensation-battlecard-creator': 'prep',
    'career-governed-application-outreach-manager': 'application',
    'career-job-discovery-fit-ranking': 'fit ranking',
    'career-application-execution-orchestrator': 'application',
    'career-upskill-role-targeted-learning-planner': 'prep',
    'career-interview-practice-mock-interviewer': 'prep',
    'career-pipeline-outcome-tracker': 'tracking',
    'career-resume-template-manager': 'profile',
    'career-portal-recruiter-workflow': 'outcomes',
    'career_profile_intake': 'profile',
    'career_job_discovery': 'fit ranking',
    'career_rank': 'fit ranking',
    'career_apply_execute': 'application',
    'career_add_template': 'profile',
    'career_networking_outreach': 'application',
    'career_pipeline_report': 'tracking',
    'career_outcome': 'outcomes',
  });

  export const careerWorkflow: AssistantWorkflow = createWorkflow(
    {
      assistant: 'Career',
      productObject: 'candidate / job',
      flow: 'profile → fit ranking → application → prep → tracking → outcomes',
      stages: [
        { name: 'profile', description: 'Candidate profile, market positioning, and resume management', stageIds: ['career-job-market-positioning-evaluator', 'career-resume-template-manager', 'career_profile_intake', 'career_add_template'] },
        { name: 'fit ranking', description: 'Job discovery and fit ranking', stageIds: ['career-job-discovery-fit-ranking', 'career_job_discovery', 'career_rank'] },
        { name: 'application', description: 'Application outreach and execution', stageIds: ['career-governed-application-outreach-manager', 'career-application-execution-orchestrator', 'career_apply_execute', 'career_networking_outreach'] },
        { name: 'prep', description: 'Interview prep and learning planning', stageIds: ['career-interview-compensation-battlecard-creator', 'career-upskill-role-targeted-learning-planner', 'career-interview-practice-mock-interviewer', 'career_interview_prep', 'career_advisory'] },
        { name: 'tracking', description: 'Pipeline tracking and monitoring', stageIds: ['career-pipeline-outcome-tracker', 'career_pipeline_report'] },
        { name: 'outcomes', description: 'Recruiter workflow and outcome management', stageIds: ['career-portal-recruiter-workflow', 'career_outcome'] },
      ],
    },
    careerSkills
  );
