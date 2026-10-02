import { Tool } from '../../../types';
import { LEADERSHIP_ADVISORY } from './executive-leadership-advisory';
import { DEV_CAREER } from './executive-dev-career';
import { FEEDBACK } from './executive-feedback';
import { RISK_SCENARIO } from './executive-risk-scenario';
import { SPEECH_COMMUNICATION_COPILOT } from './executive-speech-communication-copilot';
import { TIME_STRATEGIC_FOCUS_PROXY } from './executive-time-strategic-focus-proxy';
import { createWorkflow, AssistantWorkflow } from '../workflow-common';

export const executiveSkills: Tool[] = [
  LEADERSHIP_ADVISORY,
  DEV_CAREER,
  FEEDBACK,
  RISK_SCENARIO,
  SPEECH_COMMUNICATION_COPILOT,
  TIME_STRATEGIC_FOCUS_PROXY,
];

export const executiveWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Executive',
  productObject: 'organization / strategy',
  flow: 'review → analysis → recommendation → decision',
  skills: executiveSkills,
});
