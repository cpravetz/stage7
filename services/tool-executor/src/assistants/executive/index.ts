import { Tool } from '../../types';
import { LEADERSHIP_ADVISORY } from './skills/executive-leadership-advisory';
import { DEV_CAREER } from './skills/executive-dev-career';
import { FEEDBACK } from './skills/executive-feedback';
import { RISK_SCENARIO } from './skills/executive-risk-scenario';
import { SPEECH_COMMUNICATION_COPILOT } from './skills/executive-speech-communication-copilot';
import { TIME_STRATEGIC_FOCUS_PROXY } from './skills/executive-time-strategic-focus-proxy';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';
import { EXECUTIVE_COMMUNICATION_DRAFTER } from './tools/executive-lower-order-tools';

export const executiveLowerOrderTools: Tool[] = [EXECUTIVE_COMMUNICATION_DRAFTER];

export const executiveSkills: Tool[] = [
  LEADERSHIP_ADVISORY,
  DEV_CAREER,
  FEEDBACK,
  RISK_SCENARIO,
  SPEECH_COMMUNICATION_COPILOT,
  TIME_STRATEGIC_FOCUS_PROXY,
  ...executiveLowerOrderTools,
];

export { EXECUTIVE_COMMUNICATION_DRAFTER };

export const executiveWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Executive',
  productObject: 'organization / strategy',
  flow: 'review → analysis → recommendation → decision',
  skills: executiveSkills,
});
