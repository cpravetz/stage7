
import { createWorkflow, AssistantWorkflow } from '../workflow-common';

import { HR_INTERVIEW_SCHEDULING_AUTOMATED } from './interview-scheduling-automated';
import { HR_ASSESS_CANDIDATE } from './hr-assess-candidate';
import { HR_COMPLIANCE_CHECK } from './hr-compliance-check';
import { HR_DRAFT_JD_INTERVIEW_KIT } from './hr-draft-jd-interview-kit';
import { HR_HIRING_ANALYTICS } from './hr-hiring-analytics';
import { HR_INTERVIEW_SCHEDULING_USER } from './hr-interview-scheduling-user';
import { HR_SCREEN_RESUME } from './hr-screen-resume';

const hrSkills = [
  HR_SCREEN_RESUME,
  HR_ASSESS_CANDIDATE,
  HR_DRAFT_JD_INTERVIEW_KIT,
  HR_INTERVIEW_SCHEDULING_USER,
  HR_INTERVIEW_SCHEDULING_AUTOMATED,
  HR_HIRING_ANALYTICS,
  HR_COMPLIANCE_CHECK,
];

export { hrSkills };

export const hrCanonicalSkills = hrSkills;

export const hrWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'HR',
  productObject: 'applicant',
  flow: 'screening → interview → decision',
  skills: hrSkills,
});
