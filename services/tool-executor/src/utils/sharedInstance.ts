import { ToolRegistry } from '../services/ToolRegistry';
import { ToolStore } from '../services/ToolStore';
import { ToolExecutor } from '../services/ToolExecutor';
import { AssistantWorkspaceManager } from '../services/AssistantWorkspaceManager';
import { PluginGenerator } from '../services/PluginGenerator';
import { TriggerScheduler } from '../services/TriggerScheduler';
import { createTriggerRecordStore } from '../services/TriggerRecordStore';
import { createEventLog } from '../services/EventLog';
import { HarnessEditService } from '../services/HarnessEditService';
import { allWorkflows } from '../data/skills';
import type { MissionScheduleDispatch } from '../services/TriggerScheduler';

export const toolStore = new ToolStore();
export const toolRegistry = new ToolRegistry(toolStore);
export const workspaceManager = new AssistantWorkspaceManager();
export const eventLog = createEventLog();
export const executor = new ToolExecutor(toolRegistry.getMap(), workspaceManager, eventLog);
export const pluginGenerator = new PluginGenerator();

/** The Harness² inner loop. Opt-in per assistant and per tenant. */
export const harnessEditService = new HarnessEditService({ registry: toolRegistry });

pluginGenerator.setRegistry(toolRegistry);

const TEMPORAL_HTTP_URL = process.env.TEMPORAL_HTTP_URL || 'http://temporal:4100';

/**
 * One schedule manager serves Skill triggers and mission jobs. Skill runs use
 * the local registry/executor; mission runs dispatch to the existing Stage7
 * Temporal HTTP service. The registry is re-read each tick so new Skills are
 * scheduled without a second scheduler or container.
 */
export const triggerScheduler = new TriggerScheduler({
  getTools: () => toolRegistry.list(),
  getWorkflows: () => allWorkflows,
  execute: (tool, input, opts) => executor.executeOrRequestCredentials(tool, input, undefined, opts),
  runMission: async (scheduled: MissionScheduleDispatch) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${TEMPORAL_HTTP_URL}/api/temporal/missions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          missionId: scheduled.missionId,
          tenantId: scheduled.tenantId,
          assistantId: scheduled.assistantId,
          prompt: scheduled.prompt,
          contextChunks: scheduled.contextChunks,
          metadata: {
            ...scheduled.metadata,
            scheduled: true,
            scheduleId: scheduled.scheduleId,
            scheduledFor: scheduled.scheduledFor,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`Temporal service rejected scheduled mission (${response.status})`);
      }
      const result = await response.json() as { workflowId?: unknown };
      if (typeof result.workflowId !== 'string') {
        throw new Error('Temporal service returned no workflowId for scheduled mission');
      }
      return { workflowId: result.workflowId };
    } finally {
      clearTimeout(timeout);
    }
  },
  store: createTriggerRecordStore(),
});