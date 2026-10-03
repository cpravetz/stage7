import { ToolRegistry } from '../services/ToolRegistry';
import { ToolStore } from '../services/ToolStore';
import { ToolExecutor } from '../services/ToolExecutor';
import { AssistantWorkspaceManager } from '../services/AssistantWorkspaceManager';
import { PluginGenerator } from '../services/PluginGenerator';
import { TriggerScheduler } from '../services/TriggerScheduler';
import { createTriggerRecordStore } from '../services/TriggerRecordStore';
import { createEventLog } from '../services/EventLog';
import { allWorkflows } from '../data/skills';

export const toolStore = new ToolStore();
export const toolRegistry = new ToolRegistry(toolStore);
export const workspaceManager = new AssistantWorkspaceManager();
export const eventLog = createEventLog();
export const executor = new ToolExecutor(toolRegistry.getMap(), workspaceManager, eventLog);
export const pluginGenerator = new PluginGenerator();

pluginGenerator.setRegistry(toolRegistry);

/**
 * The trigger scheduler.
 *
 * It lives here, beside the registry and the executor, rather than in the
 * temporal service, because those are the two things a scheduled run needs and
 * the only place a `schedule` trigger can be found. The registry is passed by
 * reference and re-read on every tick, so a Skill registered after boot
 * schedules itself without the scheduler being told.
 *
 * The executor is called without `confirmation`, so a gated Skill stops for a
 * human exactly as it would if a user had pressed the button.
 */
export const triggerScheduler = new TriggerScheduler({
  getTools: () => toolRegistry.list(),
  getWorkflows: () => allWorkflows,
  execute: (tool, input, opts) => executor.executeOrRequestCredentials(tool, input, undefined, opts),
  store: createTriggerRecordStore(),
});