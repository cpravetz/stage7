import { Tool } from '../../types';
import { LEADERSHIP_ADVISORY } from './skills/executive-leadership-advisory';
import { DEV_CAREER } from './skills/executive-dev-career';
import { FEEDBACK } from './skills/executive-feedback';
import { RISK_SCENARIO } from './skills/executive-risk-scenario';
import { SPEECH_COMMUNICATION_COPILOT } from './skills/executive-speech-communication-copilot';
import { TIME_STRATEGIC_FOCUS_PROXY } from './skills/executive-time-strategic-focus-proxy';
import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';

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
