import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { missionWorkflow } from '../workflows/missionWorkflow';
import { watchWorkflow } from '../workflows/watchWorkflow';
import { watchOrchestrator } from '../workflows/watchOrchestrator';
import { runWatchActivity } from '../activities/watchActivity';
import { fetchWatchActivity } from '../activities/watchActivity';
import { runWatchLoop } from '../workflows/watchLoop';
import { WorkflowInput, WorkflowResult } from '../types/workflow';
import { logger } from '@stage7-nextgen/shared';

const TEMPORAL_TIMEOUT_MS = parseInt(process.env.TEMPORAL_OP_TIMEOUT_MS || '5000', 10);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * True when Temporal refused the start because that workflow id is already running.
 *
 * The scheduler re-offers every enabled watch on every poll, so this is the normal steady-state
 * result once an orchestrator is up. It is a success, not a failure: treating it as a failure made
 * every poll spawn another in-process loop, so a single watch accumulated one non-durable runner per
 * minute, forever, each firing the watch independently.
 */
function isAlreadyStarted(err: unknown): boolean {
  if (err instanceof WorkflowExecutionAlreadyStartedError) return true;
  const name = (err as { name?: string } | null)?.name;
  const message = (err as { message?: string } | null)?.message || '';
  return name === 'WorkflowExecutionAlreadyStartedError' || /already started/i.test(message);
}

interface SingleWatchOutcome {
  status: 'completed' | 'failed';
  output?: unknown;
  error?: string;
  startedAt: number;
  completedAt: number;
}

/**
 * One in-process watch cycle, for the fallback path of the single-shot watch workflow.
 *
 * The durable workflow cannot be invoked directly outside a workflow context, so the fallback calls
 * the activity itself and reports the activity's real outcome rather than assuming success.
 */
async function runSingleWatch(watchId: string): Promise<SingleWatchOutcome> {
  const startedAt = Date.now();
  try {
    const outcome = await runWatchActivity({ watchId });
    const completedAt = Date.now();
    if (outcome && outcome.success === true) {
      return { status: 'completed', output: outcome, startedAt, completedAt };
    }
    return {
      status: 'failed',
      output: outcome,
      error: (outcome && outcome.error) || 'Watch run did not report success',
      startedAt,
      completedAt,
    };
  } catch (err) {
    return {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      startedAt,
      completedAt: Date.now(),
    };
  }
}

export class TemporalClient {
  private client: Client | null = null;
  private namespace: string;
  /**
   * Watch ids with an in-process orchestrator currently running. The scheduler polls on an interval
   * and re-offers every enabled watch each time, so without this the fallback path would start a
   * second, third, and nth loop for the same watch and the watch would run once per loop per poll.
   */
  private watchFallbacks = new Map<string, Promise<unknown>>();

  constructor(namespace = 'default') {
    this.namespace = namespace;
    const temporalAddress = process.env.TEMPORAL_ADDRESS;
    if (!temporalAddress) {
      logger.info('No TEMPORAL_ADDRESS set, using direct execution mode');
      return;
    }
    try {
      this.client = new Client({ connection: Connection.lazy({ address: temporalAddress }), namespace });
      logger.info({ address: temporalAddress }, 'Connected to Temporal server');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Failed to connect to Temporal server, using direct execution mode');
      this.client = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Persists the initial "running" state of a mission to the persistence service
   * before workflow execution begins. This ensures the mission appears in lists
   * immediately, even while the workflow is still running.
   */
  private async persistRunningState(input: WorkflowInput): Promise<void> {
    await this.persistMissionState({
      missionId: input.missionId,
      tenantId: input.tenantId || '',
      assistantId: input.assistantId || '',
      status: 'running',
      currentStep: 0,
      totalSteps: 1,
      history: [{ step: 0, status: 'running' as const, startedAt: Date.now() }],
      input,
      startedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  /**
   * Persists the final state of a mission after workflow completion.
   * Preserves the original createdAt from startTime.
   */
  private async persistFinalState(
    input: WorkflowInput,
    result: WorkflowResult,
    startTime: number,
  ): Promise<void> {
    const historyStatus: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_review' | 'incomplete' =
      result.status === 'completed'
        ? 'completed'
        : result.status === 'failed'
          ? 'failed'
          : result.status === 'awaiting_review'
            ? 'awaiting_review'
            : 'incomplete';

    const history: Array<{
      step: number;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_review' | 'incomplete';
      startedAt?: number;
      completedAt?: number;
      result?: unknown;
      error?: string;
    }> = [
      {
        step: 0,
        status: historyStatus,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        ...(result.status === 'completed' ? { result: result.output } : {}),
        ...(result.status === 'failed' ? { error: result.error } : {}),
      },
    ];

    await this.persistMissionState({
      missionId: input.missionId,
      tenantId: input.tenantId || '',
      assistantId: input.assistantId || '',
      status: result.status,
      currentStep: 1,
      totalSteps: 1,
      history,
      input,
      output: result.output,
      error: result.error,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      createdAt: startTime,
      updatedAt: Date.now(),
    });
  }

  async startMission(input: WorkflowInput): Promise<string> {
    const workflowId = `mission-${input.missionId}`;
    logger.info({ missionId: input.missionId, assistantId: input.assistantId }, 'Starting mission');

    // Persist "running" state immediately so the mission is visible before execution
    await this.persistRunningState(input);

    // Broadcast the mission-started event to connected WebSocket clients
    await this.broadcastMissionUpdate({
      type: 'mission_started',
      missionId: input.missionId,
      workflowId,
      status: 'running',
      assistantId: input.assistantId,
      timestamp: Date.now(),
    });

    if (this.client) {
      // Temporal path: start workflow asynchronously on the Temporal server
      try {
        await withTimeout(
          this.client.workflow.start(missionWorkflow, {
            taskQueue: 'stage7-workers',
            workflowId,
            args: [input],
          }),
          TEMPORAL_TIMEOUT_MS,
        );
        // Return immediately — Temporal handles async execution.
        return workflowId;
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Temporal workflow start failed, falling back to direct execution');
      }
    }

    // Fallback: execute workflow asynchronously without Temporal.
    const startTime = Date.now();
    missionWorkflow(input)
      .then(async (result) => {
        await this.persistFinalState(input, result, startTime);
        await this.broadcastMissionUpdate({
          type: 'mission_completed',
          missionId: input.missionId,
          workflowId,
          status: result.status,
          output: result.output,
          timestamp: result.completedAt || Date.now(),
        });
      })
      .catch(async (err: any) => {
        logger.error({ err: err.message }, 'Mission workflow failed');
        await this.persistMissionState({
          missionId: input.missionId,
          tenantId: input.tenantId || '',
          assistantId: input.assistantId || '',
          status: 'failed',
          currentStep: 0,
          totalSteps: 1,
          history: [{ step: 0, status: 'failed' as const, startedAt: startTime, completedAt: Date.now(), error: err.message }],
          input,
          error: err.message,
          startedAt: startTime,
          completedAt: Date.now(),
          createdAt: startTime,
          updatedAt: Date.now(),
        });
        await this.broadcastMissionUpdate({
          type: 'mission_failed',
          missionId: input.missionId,
          workflowId,
          status: 'failed',
          error: err.message,
          timestamp: Date.now(),
        });
      });

    return workflowId;
  }

  async startWatch(watchId: string): Promise<string> {
    const workflowId = `watch-${watchId}`
    logger.info({ watchId }, 'Starting watch workflow')

    if (this.client) {
      try {
        await withTimeout(
          this.client.workflow.start(watchWorkflow, {
            taskQueue: 'stage7-workers',
            workflowId,
            args: [{ watchId }],
          }),
          TEMPORAL_TIMEOUT_MS,
        )
        return workflowId
      } catch (err) {
        if (isAlreadyStarted(err)) {
          logger.debug({ watchId }, 'Watch workflow already running');
          return workflowId;
        }
        logger.warn({ err: (err as Error).message }, 'Temporal watch workflow start failed, falling back to direct execution')
      }
    }

    // Fallback: execute directly
    (async () => {
      const startTime = Date.now()
      try {
        const result = await runSingleWatch(watchId)
        await this.persistFinalState({ missionId: `watch-${watchId}`, tenantId: '', assistantId: '', prompt: '', contextChunks: [], metadata: {} } as any, { status: result.status as any, output: result.output, error: result.error, startedAt: startTime, completedAt: Date.now() } as any, startTime)
        await this.broadcastMissionUpdate({ type: 'watch_completed', missionId: `watch-${watchId}`, workflowId, status: result.status, output: result.output, timestamp: Date.now() })
      } catch (err: any) {
        logger.error({ err: err.message }, 'Watch workflow failed in fallback')
      }
    })()

    return workflowId
  }

  async startWatchOrchestrator(watchId: string): Promise<string> {
    const workflowId = `watch-orch-${watchId}`;
    // Debug, not info: this runs on every scheduler poll, and a line that reads like "started" on
    // each poll is exactly what made the duplicate-loop defect hard to spot in the logs.
    logger.debug({ watchId }, 'Watch orchestrator poll');

    if (this.client) {
      try {
        await withTimeout(
          this.client.workflow.start(watchOrchestrator, {
            taskQueue: 'stage7-workers',
            workflowId,
            args: [{ watchId }],
          }),
          TEMPORAL_TIMEOUT_MS,
        );
        return workflowId;
      } catch (err) {
        if (isAlreadyStarted(err)) {
          // The durable orchestrator is already running, which is the state we want. Returning here
          // is what stops every subsequent poll from adding a duplicate non-durable runner.
          logger.debug({ watchId }, 'Watch orchestrator already running');
          return workflowId;
        }
        logger.warn({ err: (err as Error).message }, 'Temporal watch orchestrator start failed, falling back to direct execution');
      }
    }

    this.startWatchFallback(watchId, async () =>
      runWatchLoop(watchId, {
        fetchWatch: (id) => fetchWatchActivity({ watchId: id }),
        runWatch: (id) => runWatchActivity({ watchId: id }),
        sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      }),
    );

    return workflowId;
  }

  /**
   * Run a watch loop in this process, at most once per watch at a time.
   *
   * Deliberately fire-and-forget: the caller is the scheduler poll, which must not block on a loop
   * that sleeps for a whole cadence. The promise is retained so a later poll for the same watch is
   * a no-op rather than a duplicate.
   */
  private startWatchFallback(watchId: string, loop: () => Promise<unknown>): void {
    if (this.watchFallbacks.has(watchId)) {
      logger.info({ watchId }, 'Watch orchestrator fallback already running; not starting another');
      return;
    }
    const running = loop()
      .then((result) => {
        logger.info({ watchId, result }, 'Watch orchestrator fallback finished');
        return result;
      })
      .catch((err) => {
        logger.error({ watchId, err: (err as Error).message }, 'Watch orchestrator failed in fallback');
        throw err;
      })
      .finally(() => {
        // Only clear if this is still the current loop; a replacement may already own the slot.
        if (this.watchFallbacks.get(watchId) === running) this.watchFallbacks.delete(watchId);
      });
    this.watchFallbacks.set(watchId, running);
  }

  async getMissionResult(workflowId: string): Promise<WorkflowResult | null> {
    const getResultTimeout = parseInt(process.env.TEMPORAL_GET_RESULT_TIMEOUT_MS || '1000', 10);

    if (this.client) {
      try {
        const handle = this.client.workflow.getHandle<typeof missionWorkflow>(workflowId);
        const result = await withTimeout(handle.result(), getResultTimeout);
        return result as WorkflowResult;
      } catch (error: any) {
        if (!error.message?.includes('workflow not found') && !error.message?.includes('timed out')) {
          logger.warn({ err: error.message }, 'Temporal getMissionResult error');
        }
      }
    }

    const missionKey = workflowId.startsWith('mission-') ? workflowId.slice(8) : workflowId;
    try {
      const persistenceUrl = process.env.ARTIFACTS_URL;
      if (persistenceUrl) {
        const response = await fetch(`${persistenceUrl}/api/artifacts/missions/${missionKey}`);
        if (response.ok) {
          const data: any = await response.json();
          return {
            missionId: data.missionId || missionKey,
            status: data.status || 'completed',
            output: data.output,
            error: data.error,
            startedAt: data.startedAt ? new Date(data.startedAt).getTime() : Date.now(),
            completedAt: data.completedAt ? new Date(data.completedAt).getTime() : undefined,
            input: data.input,
          } as WorkflowResult;
        }
      }
    } catch (error: any) {
      logger.warn({ err: error.message }, 'Failed to get mission result from persistence');
    }

    return null;
  }

  async listMissions(): Promise<Array<{ workflowId: string; status: string; missionId: string; prompt?: string; assistantId?: string; startedAt?: string; completedAt?: string }>> {
    const results: Array<{ workflowId: string; status: string; missionId: string; prompt?: string; assistantId?: string; startedAt?: string; completedAt?: string }> = [];

    if (this.client) {
      try {
        const listPromise = (async () => {
          const workflows = this.client!.workflow.list({
            query: 'WorkflowType = "missionWorkflow"',
            pageSize: 100,
          });
          for await (const w of workflows) {
            results.push({
              workflowId: w.workflowId,
              status: String(w.status || 'unknown'),
              missionId: w.workflowId.replace('mission-', ''),
            });
          }
        })();
        await withTimeout(listPromise, TEMPORAL_TIMEOUT_MS);
        return results;
      } catch (error: any) {
        logger.warn({ err: error.message }, 'Failed to list missions from Temporal');
      }
    }

    try {
      const persistenceUrl = process.env.ARTIFACTS_URL;
      if (persistenceUrl) {
        const response = await fetch(`${persistenceUrl}/api/artifacts/missions`);
        if (response.ok) {
          const data: any = await response.json();
          const docs = data.missions || [];
          for (const doc of docs) {
            const missionId = doc.missionId || doc.id || '';
            const workflowId = `mission-${missionId}`;
            const status = doc.status || 'unknown';
            results.push({
              workflowId,
              status,
              missionId,
              prompt: doc.input?.prompt,
              assistantId: doc.assistantId,
              startedAt: doc.startedAt,
              completedAt: doc.completedAt,
            });
          }
        }
      }
    } catch (error: any) {
      logger.warn({ err: error.message }, 'Failed to list missions from persistence');
    }

    return results;
  }

  async terminateMission(workflowId: string): Promise<void> {
    if (this.client) {
      try {
        const handle = this.client.workflow.getHandle(workflowId);
        await withTimeout(handle.terminate('Mission terminated by user'), TEMPORAL_TIMEOUT_MS);
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Failed to terminate workflow');
      }
    }

    // Also mark as terminated in persistence
    const missionKey = workflowId.startsWith('mission-') ? workflowId.slice(8) : workflowId;
    try {
      const persistenceUrl = process.env.ARTIFACTS_URL;
      if (persistenceUrl) {
        await fetch(`${persistenceUrl}/api/artifacts/missions/${missionKey}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'canceled', completedAt: Date.now() }),
        });
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Failed to update mission state on terminate');
    }
  }

  async deleteMission(workflowId: string): Promise<void> {
    const missionKey = workflowId.startsWith('mission-') ? workflowId.slice(8) : workflowId;
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) return;
    try {
      await fetch(`${persistenceUrl}/api/artifacts/missions/${missionKey}`, {
        method: 'DELETE',
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Failed to delete mission from persistence');
    }
  }

  async appendMissionEvent(missionId: string, event: { type: string; timestamp?: number; data?: Record<string, unknown> }): Promise<void> {
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) {
      logger.warn('ARTIFACTS_URL not set, skipping event append');
      return;
    }
    try {
      await fetch(`${persistenceUrl}/api/artifacts/missions/${missionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: event.type,
          timestamp: event.timestamp || Date.now(),
          data: event.data || {},
        }),
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Failed to append mission event');
    }
  }

  /**
   * Broadcasts a mission event to WebSocket clients subscribed to the mission via the gateway.
   */
  async broadcastMissionUpdate(event: Record<string, unknown>): Promise<void> {
    // Persist event to artifacts service
    const missionId = event.missionId as string | undefined;
    if (missionId) {
      await this.appendMissionEvent(missionId, {
        type: event.type as string,
        timestamp: (event.timestamp as number) || Date.now(),
        data: event.data as Record<string, unknown> || {},
      });
    }

    // Broadcast to WebSocket clients via gateway
    const gatewayUrl = process.env.GATEWAY_URL;
    if (!gatewayUrl) {
      logger.debug('GATEWAY_URL not set, skipping broadcast');
      return;
    }

    let endpoint = `${gatewayUrl}/api/gateway/broadcast`;

    if (missionId) {
      endpoint = `${gatewayUrl}/api/gateway/broadcast/mission/${missionId}`;
    } else {
      logger.warn({ event: event.type }, 'Missing missionId in event, falling back to general broadcast');
    }

    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      logger.debug({ event: event.type, missionId }, 'Broadcast mission event');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Failed to broadcast mission event');
    }
  }

  /**
   * Persists a mission state to the persistence service.
   * Uses POST (upsert) — the persistence store replaces existing state by missionId.
   */
  private async persistMissionState(state: {
    missionId: string;
    tenantId: string;
    assistantId: string;
    status: string;
    currentStep: number;
    totalSteps: number;
    history: Array<{
      step: number;
       status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_review' | 'incomplete';
      startedAt?: number;
      completedAt?: number;
      result?: unknown;
      error?: string;
    }>;
    input: WorkflowInput;
    output?: unknown;
    error?: string;
    startedAt: number;
    completedAt?: number;
    createdAt?: number;
    updatedAt?: number;
  }): Promise<void> {
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) {
      logger.warn('ARTIFACTS_URL not set, skipping state persistence');
      return;
    }

    try {
      await fetch(`${persistenceUrl}/api/artifacts/missions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: state.missionId,
          tenantId: state.tenantId || '',
          assistantId: state.assistantId || '',
          status: state.status,
          currentStep: state.currentStep,
          totalSteps: state.totalSteps,
          history: state.history,
          input: state.input,
          output: state.output,
          error: state.error,
          startedAt: state.startedAt,
          completedAt: state.completedAt,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
        }),
      });
      logger.debug({ missionId: state.missionId, status: state.status }, 'Mission state persisted');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Failed to persist mission state');
    }
  }
}
