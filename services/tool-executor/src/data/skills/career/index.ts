import { Tool } from '../../../types';
import { JOB_MARKET_POSITIONING_EVALUATOR } from './career-job-market-positioning-evaluator';
import { INTERVIEW_COMPENSATION_BATTLECARD } from './career-interview-compensation-battlecard-creator';
import { GOVERNED_APPLICATION_OUTREACH_MANAGER } from './career-governed-application-outreach-manager';
import { JOB_DISCOVERY_FIT_RANKING } from './career-job-discovery-fit-ranking';
import { APPLICATION_EXECUTION_ORCHESTRATOR } from './career-application-execution-orchestrator';
import { UPSKILL_ROLE_TARGETED_LEARNING_PLANNER } from './career-upskill-role-targeted-learning-planner';
import { INTERVIEW_PRACTICE_MOCK_INTERVIEWER } from './career-interview-practice-mock-interviewer';
import { PIPELINE_OUTCOME_TRACKER } from './career-pipeline-outcome-tracker';
import { RESUME_TEMPLATE_MANAGER } from './career-resume-template-manager';
import { PORTAL_RECRUITER_WORKFLOW } from './career-portal-recruiter-workflow';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

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
  { ...JOB_MARKET_POSITIONING_EVALUATOR, isSkill: true },
  { ...INTERVIEW_COMPENSATION_BATTLECARD, isSkill: true },
  { ...GOVERNED_APPLICATION_OUTREACH_MANAGER, isSkill: true },
  { ...JOB_DISCOVERY_FIT_RANKING, isSkill: true },
  { ...APPLICATION_EXECUTION_ORCHESTRATOR, isSkill: true },
  { ...UPSKILL_ROLE_TARGETED_LEARNING_PLANNER, isSkill: true },
  { ...INTERVIEW_PRACTICE_MOCK_INTERVIEWER, isSkill: true },
  { ...PIPELINE_OUTCOME_TRACKER, isSkill: true },
  { ...RESUME_TEMPLATE_MANAGER, isSkill: true },
  { ...PORTAL_RECRUITER_WORKFLOW, isSkill: true },
];

export const careerSkills = careerCanonicalSkills;

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
});

export const careerWorkflow: AssistantWorkflow = createWorkflow(
  {
    assistant: 'Career',
    productObject: 'candidate / job',
    flow: 'profile → fit ranking → application → prep → tracking → outcomes',
    stages: [
      { name: 'profile', description: 'Candidate profile, market positioning, and resume management', stageIds: ['career-job-market-positioning-evaluator', 'career-resume-template-manager'] },
      { name: 'fit ranking', description: 'Job discovery and fit ranking', stageIds: ['career-job-discovery-fit-ranking'] },
      { name: 'application', description: 'Application outreach and execution', stageIds: ['career-governed-application-outreach-manager', 'career-application-execution-orchestrator'] },
      { name: 'prep', description: 'Interview prep and learning planning', stageIds: ['career-interview-compensation-battlecard-creator', 'career-upskill-role-targeted-learning-planner', 'career-interview-practice-mock-interviewer'] },
      { name: 'tracking', description: 'Pipeline tracking and monitoring', stageIds: ['career-pipeline-outcome-tracker'] },
      { name: 'outcomes', description: 'Recruiter workflow and outcome management', stageIds: ['career-portal-recruiter-workflow'] },
    ],
  },
  careerSkills
);
