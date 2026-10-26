import { randomUUID } from 'node:crypto';
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { missionWorkflow } from '../workflows/missionWorkflow';
import { watchWorkflow } from '../workflows/watchWorkflow';
import { watchOrchestrator } from '../workflows/watchOrchestrator';
import { runWatchActivity } from '../activities/watchActivity';
import { fetchWatchActivity } from '../activities/watchActivity';
import { runMissionDirect } from '../activities/missionActivity';
import { runWatchLoop } from '../workflows/watchLoop';
import { logger, Plan, PlanSchema } from '@stage7-nextgen/shared';
import { MissionActivityCheckpoint, WorkflowInput, WorkflowResult } from '../types/workflow';
import { getMissionResumeProgress } from '../recovery/missionProgress';
import { MissionTerminationRequestedError } from '../types/missionControl';

const TEMPORAL_TIMEOUT_MS = parseInt(process.env.TEMPORAL_OP_TIMEOUT_MS || '5000', 10);
const DIRECT_RECOVERY_LEASE_DURATION_MS = 90_000;
const DIRECT_RECOVERY_LEASE_RENEWAL_MS = 30_000;
const DIRECT_MISSION_CONTROL_POLL_MS = 250;

interface PersistedMissionControlRecord {
  missionId?: string;
  status?: string;
  controlState?: 'running' | 'pause_requested' | 'paused' | 'terminate_requested' | 'terminated';
  pendingDeletion?: boolean;
  input?: WorkflowInput;
}

function missionIdFromWorkflowId(workflowId: string): string {
  return workflowId.startsWith('mission-') ? workflowId.slice(8) : workflowId;
}

function visibleMissionStatus(record: PersistedMissionControlRecord): string {
  if (record.controlState === 'pause_requested') return 'pausing';
  if (record.controlState === 'terminate_requested') return 'canceling';
  return record.status || 'unknown';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timeout));
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

function missionStatus(result: unknown): WorkflowResult['status'] {
  const outputs = result && typeof result === 'object'
    ? (result as { outputs?: { status?: string } }).outputs
    : undefined;
  if (outputs?.status === 'awaiting_clarification' || outputs?.status === 'rejected_at_phase') {
    return 'awaiting_review';
  }
  return outputs?.status === 'incomplete' ? 'incomplete' : 'completed';
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
  private readonly directMissionRuns = new Set<string>();
  private readonly directMissionRunner: typeof runMissionDirect;
  private readonly recoveryLeaseOwnerId = randomUUID();
  private readonly recoveryLeaseRenewals = new Map<string, NodeJS.Timeout>();
  /**
   * Watch ids with an in-process orchestrator currently running. The scheduler polls on an interval
   * and re-offers every enabled watch each time, so without this the fallback path would start a
   * second, third, and nth loop for the same watch and the watch would run once per loop per poll.
   */
  private watchFallbacks = new Map<string, Promise<unknown>>();

  /**
   * Missions for which mission_started has been broadcast in this process,
   * so recovery or resume does not re-announce the same milestone.
   */
  private readonly missionStartedEmitted = new Set<string>();

  constructor(namespace = 'default', directMissionRunner: typeof runMissionDirect = runMissionDirect) {
    this.namespace = namespace;
    this.directMissionRunner = directMissionRunner;
    const backend = process.env.TEMPORAL_BACKEND || 'direct';
    if (backend === 'direct') {
      logger.info('Using Stage7 in-process workflow runner backed by Artifacts');
      return;
    }
    if (backend !== 'temporal-server') {
      throw new Error(`Unsupported TEMPORAL_BACKEND: ${backend}`);
    }

    const temporalAddress = process.env.TEMPORAL_ADDRESS;
    if (!temporalAddress) {
      throw new Error('TEMPORAL_BACKEND=temporal-server requires TEMPORAL_ADDRESS');
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

  getRuntimeStatus(): {
    executionMode: 'artifacts-backed-direct' | 'external-temporal-compatibility';
    activeMissions: number;
    activeWatchLoops: number;
    artifactsConfigured: boolean;
  } {
    return {
      executionMode: this.client ? 'external-temporal-compatibility' : 'artifacts-backed-direct',
      activeMissions: this.directMissionRuns.size,
      activeWatchLoops: this.watchFallbacks.size,
      artifactsConfigured: Boolean(process.env.ARTIFACTS_URL),
    };
  }

  /**
   * Persists the initial "running" state of a mission to the persistence service
   * before workflow execution begins. This ensures the mission appears in lists
   * immediately, even while the workflow is still running.
   */
  private async persistRunningState(input: WorkflowInput): Promise<void> {
    const existing = await this.getPersistedMissionControlRecord(input.missionId).catch(() => null);
    const startedAt = existing ? (existing as { startedAt?: number }).startedAt ?? Date.now() : Date.now();
    // Ensure input has all optional fields to avoid validation issues
    const normalizedInput: WorkflowInput = {
      missionId: input.missionId,
      tenantId: input.tenantId || "",
      assistantId: input.assistantId || "",
      prompt: input.prompt || "",
      contextChunks: input.contextChunks || [],
      metadata: input.metadata || {},
      resumeFromPhaseId: input.resumeFromPhaseId || undefined,
      resumeFromTaskId: input.resumeFromTaskId || undefined,
      completedPhases: input.completedPhases || [],
      completedTasks: input.completedTasks || [],
      retryGuidance: input.retryGuidance || undefined,
    };
    await this.persistMissionState({
      missionId: normalizedInput.missionId,
      tenantId: normalizedInput.tenantId,
      assistantId: normalizedInput.assistantId,
      status: "running",
      controlState: "running",
      currentStep: 0,
      totalSteps: 1,
      startedAt,
      history: [{ step: 0, status: "running" as const, startedAt, completedAt: undefined, result: null, error: undefined }],
      input: normalizedInput,
      output: null,
      error: undefined,
      completedAt: undefined,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
}

  private async persistFinalState(
    input: WorkflowInput,
    result: WorkflowResult,
    startTime: number,
  ): Promise<void> {
    const historyStatus: 'pending' | 'running' | 'completed' | 'failed' | 'canceled' | 'awaiting_review' | 'incomplete' =
      result.status === 'completed'
        ? 'completed'
        : result.status === 'failed'
          ? 'failed'
          : result.status === 'canceled'
            ? 'canceled'
          : result.status === 'awaiting_review'
            ? 'awaiting_review'
            : 'incomplete';

    const history: Array<{
      step: number;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled' | 'awaiting_review' | 'incomplete';
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
          ...(result.status === 'failed' || result.status === 'canceled' ? { error: result.error } : {}),
      },
    ];

    await this.persistMissionState({
      missionId: input.missionId,
      tenantId: input.tenantId || '',
      assistantId: input.assistantId || '',
      status: result.status,
      controlState: result.status === 'canceled' ? 'terminated' : 'running',
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

  async startMission(
    input: WorkflowInput,
    resumeCheckpoint?: MissionActivityCheckpoint,
    recoveryLeaseAlreadyClaimed = false,
    resumePausedOccurrence = false,
  ): Promise<string> {
    const workflowId = `mission-${input.missionId}`;
    logger.info({ missionId: input.missionId, assistantId: input.assistantId }, 'Starting mission');

    if (!this.client && input.metadata?.scheduled === true && !resumePausedOccurrence) {
      if (await this.isPersistedScheduledOccurrence(input)) {
        logger.info({ missionId: input.missionId }, 'Scheduled mission occurrence already exists; not starting a duplicate');
        return workflowId;
      }
    }

    if (!this.client && this.directMissionRuns.has(input.missionId)) {
      logger.info({ missionId: input.missionId }, 'Mission already running in this process; not starting a duplicate');
      return workflowId;
    }
    if (!this.client) this.directMissionRuns.add(input.missionId);
    let recoveryLeaseClaimed = recoveryLeaseAlreadyClaimed;

    try {
      const isMissionResume = Boolean(
        input.retryGuidance
        || input.metadata?.retriedFrom
        || input.resumeFromPhaseId
        || input.resumeFromTaskId
        || input.completedPhases?.length
        || input.completedTasks?.length
      );
      if (!this.client && !resumeCheckpoint && isMissionResume) {
        resumeCheckpoint = await this.loadRetryCheckpoint(input);
      }

      if (!this.client && !recoveryLeaseAlreadyClaimed) {
        const claimed = await this.claimDirectRecoveryLease(input.missionId);
        if (claimed === false) {
          logger.info({ missionId: input.missionId }, 'Another Temporal process owns the direct mission lease');
          this.directMissionRuns.delete(input.missionId);
          return workflowId;
        }
        recoveryLeaseClaimed = claimed === true;
      }
      if (!this.client && recoveryLeaseClaimed) this.startRecoveryLeaseRenewal(input.missionId);

      // Claim direct execution before writing running state, so a duplicate launch
      // cannot overwrite the active owner's mission timestamps or history.
      const existingRecord = await this.getPersistedMissionControlRecord(input.missionId).catch(() => null);
      const alreadyStarted = existingRecord?.status === 'running';
      if (!recoveryLeaseAlreadyClaimed && !alreadyStarted) await this.persistRunningState(input);

      // Broadcast the mission-started event to connected WebSocket clients.
      if (!alreadyStarted && !this.missionStartedEmitted.has(input.missionId)) {
        await this.broadcastMissionUpdate({
                type: 'mission_started',
                missionId: input.missionId,
                workflowId,
                status: 'running',
                assistantId: input.assistantId,
                timestamp: Date.now(),
        });
        this.missionStartedEmitted.add(input.missionId);
      }

      if (this.client) {
        // Temporal path: start workflow asynchronously on the Temporal server.
        try {
          await withTimeout(
            this.client.workflow.start(missionWorkflow, {
              taskQueue: 'stage7-workers',
              workflowId,
              args: [input],
            }),
            TEMPORAL_TIMEOUT_MS,
          );
          return workflowId;
        } catch (err) {
          if (isAlreadyStarted(err)) {
            return workflowId;
          }
          logger.error(
            { err: err instanceof Error ? err.message : String(err), workflowId },
            'Temporal workflow start outcome is ambiguous; refusing direct fallback to avoid duplicate mission execution',
          );
          throw err;
        }
      }

      // Direct mode resumes from Artifacts state without requiring a Temporal Server.
      const startTime = Date.now();
      const controlCheckpoint = () => this.awaitDirectMissionControl(input.missionId);
      this.directMissionRunner(input, resumeCheckpoint, controlCheckpoint)
        .then((output) => ({
          missionId: input.missionId,
          status: missionStatus(output),
          output,
          startedAt: startTime,
          completedAt: Date.now(),
        } satisfies WorkflowResult))
        .then(async (result) => {
          await controlCheckpoint();
          await this.persistFinalState(input, result, startTime);
          const completionType = result.status === 'awaiting_review'
            ? 'mission_needs_review'
            : result.status === 'incomplete'
              ? 'mission_incomplete'
              : 'mission_completed';
          await this.broadcastMissionUpdate({
            type: completionType,
            missionId: input.missionId,
            workflowId,
            status: result.status,
            output: result.output,
            timestamp: result.completedAt || Date.now(),
          });
          try {
            const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
            const artifacts = (process.env.ARTIFACTS_URL || process.env.PERSISTENCE_URL || 'http://artifacts:4200');
            // Fetch assistant and trigger distillation via Brain service
            fetch(`${artifacts}/api/artifacts/assistants/${encodeURIComponent(input.assistantId || '')}`)
              .then(async (res) => {
                if (!res.ok) return;
                const assistant = await res.json();
                // Ask brain to distill and we can re-save via artifacts; brain service has distillation route
                await fetch(`${brainUrl}/api/brain/distillation/trigger`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    assistantId: input.assistantId,
                    tenantId: input.tenantId,
                    missionId: input.missionId,
                  }),
                });
                // Optionally re-fetch updated assistant from brain if it persists; brain persists via its own flow? 
                // Brain's distillation service can be extended to persist via artifacts - but easier: call artifacts to save after brain returns? 
                // For now trigger only; brain service can be enhanced to persist
              })
              .catch(() => {});
          } catch (e) {
            // best-effort, ignore
          }
        })
        .catch(async (err: unknown) => {
          if (err instanceof MissionTerminationRequestedError) {
            const error = err.message;
            logger.info({ missionId: input.missionId }, 'Mission stopped at a task checkpoint');
            const pendingDeletion = await this.isMissionPendingDeletion(input.missionId);
            await this.persistMissionState({
              missionId: input.missionId,
              tenantId: input.tenantId || '',
              assistantId: input.assistantId || '',
              status: 'canceled',
              controlState: 'terminated',
              currentStep: 1,
              totalSteps: 1,
              history: [{
                step: 0,
                status: 'canceled' as const,
                startedAt: startTime,
                completedAt: Date.now(),
                error,
              }],
              input,
              error,
              startedAt: startTime,
              completedAt: Date.now(),
              createdAt: startTime,
              updatedAt: Date.now(),
              pendingDeletion,
            });
            await this.broadcastMissionUpdate({
              type: 'mission_canceled',
              missionId: input.missionId,
              workflowId,
              status: 'canceled',
              error,
              timestamp: Date.now(),
            });
            if (pendingDeletion) {
              // The user deleted this mission while it was running. The final
              // state is written above, so the mission can now be removed
              // together with its live feed events.
              await this.deleteMissionArtifacts(input.missionId);
            }
            return;
          }
          const error = err instanceof Error ? err.message : String(err);
          logger.error({ missionId: input.missionId, error }, 'Mission workflow failed');
          await this.persistMissionState({
            missionId: input.missionId,
            tenantId: input.tenantId || '',
            assistantId: input.assistantId || '',
            status: 'failed',
            controlState: 'running',
            currentStep: 0,
            totalSteps: 1,
            history: [{ step: 0, status: 'failed' as const, startedAt: startTime, completedAt: Date.now(), error }],
            input,
            error,
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
            error,
            timestamp: Date.now(),
          });
        })
        .finally(async () => {
          this.stopRecoveryLeaseRenewal(input.missionId);
          if (recoveryLeaseClaimed) await this.releaseDirectRecoveryLease(input.missionId);
          this.directMissionRuns.delete(input.missionId);
        });

      return workflowId;
    } catch (error) {
      if (!this.client) {
        this.stopRecoveryLeaseRenewal(input.missionId);
        if (recoveryLeaseClaimed) await this.releaseDirectRecoveryLease(input.missionId);
        this.directMissionRuns.delete(input.missionId);
      }
      throw error;
    }
  }

  async pauseMission(workflowId: string): Promise<'pausing' | 'paused'> {
    if (this.client) {
      throw new Error('Cooperative pause is only available with TEMPORAL_BACKEND=direct');
    }
    const missionId = workflowId.startsWith('mission-') ? workflowId.slice(8) : workflowId;
    const record = await this.getPersistedMissionControlRecord(missionId);
    if (!record) throw new Error(`Mission ${missionId} was not found`);
    if (record.status === 'paused' || record.controlState === 'paused') return 'paused';
    if (record.status !== 'running') {
      throw new Error(`Cannot pause mission ${missionId} while it is ${record.status || 'unknown'}`);
    }
    if (record.controlState === 'terminate_requested' || record.controlState === 'terminated') {
      throw new Error(`Cannot pause mission ${missionId} while termination is pending`);
    }
    if (record.controlState !== 'pause_requested') {
      await this.updatePersistedMissionControl(missionId, 'running', 'pause_requested');
    }
    return 'pausing';
  }

  async resumeMission(workflowId: string, clarificationAnswers?: string[]): Promise<'running' | 'resuming'> {
    if (this.client) {
      throw new Error('Cooperative resume is only available with TEMPORAL_BACKEND=direct');
    }
    const missionId = workflowId.startsWith('mission-') ? workflowId.slice(8) : workflowId;
    const record = await this.getPersistedMissionControlRecord(missionId);
    if (!record) throw new Error(`Mission ${missionId} was not found`);
    if (record.controlState === 'terminate_requested' || record.controlState === 'terminated') {
      throw new Error(`Cannot resume mission ${missionId} while termination is pending`);
    }
    if (record.status === 'running' && record.controlState !== 'pause_requested' && record.controlState !== 'paused') {
      return 'running';
    }
    if (
      record.status !== 'pending'
      &&
      record.status !== 'paused'
      &&
      record.status !== 'awaiting_review'
      && record.controlState !== 'pause_requested'
      && record.controlState !== 'paused'
    ) {
      throw new Error(`Cannot resume mission ${missionId} while it is ${record.status || 'unknown'}`);
    }

    if (this.directMissionRuns.has(missionId)) {
      await this.updatePersistedMissionControl(missionId, 'running', 'running');
      return 'running';
    }

    const input = record.input;
    if (
      !input
      || typeof input !== 'object'
      || input.missionId !== missionId
      || typeof input.prompt !== 'string'
    ) {
      throw new Error(`Cannot resume mission ${missionId}: persisted workflow input is invalid`);
    }
    const resumeInput = clarificationAnswers
      ? { ...input, clarificationAnswers: [...clarificationAnswers] }
      : input;
    const checkpoint = record.status === 'pending'
      ? undefined
      : await this.loadPersistedCheckpoint(missionId);
    const leaseClaimed = await this.claimDirectRecoveryLease(missionId);
    if (leaseClaimed === false) {
      throw new Error(`Cannot resume mission ${missionId}: another process still owns its execution lease`);
    }
    try {
      await this.updatePersistedMissionControl(missionId, 'running', 'running');
    } catch (error) {
      if (leaseClaimed) await this.releaseDirectRecoveryLease(missionId);
      throw error;
    }
    await this.startMission(resumeInput, checkpoint, leaseClaimed === true, true);
    await this.broadcastMissionUpdate({
      type: 'mission_resumed',
      missionId,
      workflowId: `mission-${missionId}`,
      status: 'running',
      timestamp: Date.now(),
    });
    return 'resuming';
  }

  async terminateMission(workflowId: string): Promise<'stopping' | 'canceled' | 'already_finished'> {
    if (this.client) {
      const handle = this.client.workflow.getHandle(workflowId);
      await withTimeout(handle.terminate('Mission terminated by user'), TEMPORAL_TIMEOUT_MS);
      return 'canceled';
    }

    const missionId = workflowId.startsWith('mission-') ? workflowId.slice(8) : workflowId;
    const record = await this.getPersistedMissionControlRecord(missionId);
    if (!record) throw new Error(`Mission ${missionId} was not found`);
    if (record.status === 'canceled' || record.controlState === 'terminated') return 'canceled';
    if (record.status !== 'running' && record.status !== 'paused') return 'already_finished';
    if (record.status === 'paused' || record.controlState === 'paused') {
      await this.updatePersistedMissionControl(missionId, 'canceled', 'terminated');
      await this.broadcastMissionUpdate({
        type: 'mission_canceled',
        missionId,
        workflowId: `mission-${missionId}`,
        status: 'canceled',
        timestamp: Date.now(),
      });
      return 'canceled';
    }
    if (record.controlState !== 'terminate_requested') {
      await this.updatePersistedMissionControl(missionId, 'running', 'terminate_requested');
    }
    return 'stopping';
  }

  private async isPersistedScheduledOccurrence(input: WorkflowInput): Promise<boolean> {
    const scheduleId = input.metadata?.scheduleId;
    const scheduledFor = input.metadata?.scheduledFor;
    if (typeof scheduleId !== 'string' || typeof scheduledFor !== 'string') {
      throw new Error('Scheduled missions require scheduleId and scheduledFor metadata');
    }
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) {
      throw new Error('Scheduled missions require ARTIFACTS_URL for durable idempotency');
    }
    const response = await this.fetchArtifactsWithRetry(
      `${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(input.missionId)}`,
    );
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new Error(`Could not check scheduled mission idempotency (${response.status})`);
    }
    const existing = await response.json() as {
      missionId?: unknown;
      input?: { metadata?: Record<string, unknown> };
    };
    return existing.missionId === input.missionId
      && existing.input?.metadata?.scheduled === true
      && existing.input.metadata.scheduleId === scheduleId
      && existing.input.metadata.scheduledFor === scheduledFor;
  }

  private async claimDirectRecoveryLease(missionId: string): Promise<boolean | null> {
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) {
      logger.warn({ missionId }, 'ARTIFACTS_URL is not set; direct mission recovery is process-local only');
      return null;
    }

    const result = await this.updateDirectRecoveryLease(persistenceUrl, missionId, 'claim');
    if (typeof result.claimed !== 'boolean') {
      throw new Error('Artifacts returned an invalid direct mission lease claim response');
    }
    return result.claimed;
  }

  private startRecoveryLeaseRenewal(missionId: string): void {
    this.stopRecoveryLeaseRenewal(missionId);
    const timer = setInterval(() => {
      const persistenceUrl = process.env.ARTIFACTS_URL;
      if (!persistenceUrl) return;
      void this.updateDirectRecoveryLease(persistenceUrl, missionId, 'renew').then((result) => {
        if (result.renewed !== true) {
          logger.error({ missionId }, 'Direct mission recovery lease was lost');
          this.stopRecoveryLeaseRenewal(missionId);
        }
      }).catch((error: unknown) => {
        logger.error({
          missionId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Failed to renew direct mission recovery lease');
      });
    }, DIRECT_RECOVERY_LEASE_RENEWAL_MS);
    timer.unref();
    this.recoveryLeaseRenewals.set(missionId, timer);
  }

  private stopRecoveryLeaseRenewal(missionId: string): void {
    const timer = this.recoveryLeaseRenewals.get(missionId);
    if (timer) clearInterval(timer);
    this.recoveryLeaseRenewals.delete(missionId);
  }

  private async releaseDirectRecoveryLease(missionId: string): Promise<void> {
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) return;
    try {
      const result = await this.updateDirectRecoveryLease(persistenceUrl, missionId, 'release');
      if (result.released !== true) {
        logger.warn({ missionId }, 'Direct mission recovery lease was not released by its owner');
      }
    } catch (error) {
      logger.error({
        missionId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to release direct mission recovery lease; it will expire');
    }
  }

  private async updateDirectRecoveryLease(
    persistenceUrl: string,
    missionId: string,
    action: 'claim' | 'renew' | 'release',
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchArtifactsWithRetry(
      `${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(missionId)}/recovery-lease`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ownerId: this.recoveryLeaseOwnerId,
          ...(action === 'release' ? {} : { leaseDurationMs: DIRECT_RECOVERY_LEASE_DURATION_MS }),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Artifacts rejected direct mission lease ${action} (${response.status})`);
    }
    const result = await response.json();
    if (!result || typeof result !== 'object') {
      throw new Error('Artifacts returned an invalid direct mission lease response');
    }
    return result as Record<string, unknown>;
  }

  async recoverInFlightMissions(): Promise<number> {
    if (this.client) {
      logger.info('Temporal Server is configured; in-flight recovery is owned by Temporal');
      return 0;
    }

    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) {
      throw new Error('Cannot recover in-flight missions: ARTIFACTS_URL is not configured');
    }

    const response = await this.fetchArtifactsWithRetry(`${persistenceUrl}/api/artifacts/missions`);
    if (!response.ok) {
      throw new Error(`Cannot list persisted missions for recovery (${response.status})`);
    }
    const result = await response.json() as { missions?: unknown };
    if (!Array.isArray(result.missions)) {
      throw new Error('Artifacts returned an invalid mission list during recovery');
    }

    let recovered = 0;
    for (const value of result.missions) {
      if (!value || typeof value !== 'object') continue;
      const mission = value as { missionId?: unknown; status?: unknown; input?: unknown };
      if (mission.status !== 'running') continue;
      if (typeof mission.missionId === 'string' && this.directMissionRuns.has(mission.missionId)) continue;
      const controlState = (mission as { controlState?: unknown }).controlState;
      if (
        (controlState === 'pause_requested' || controlState === 'terminate_requested')
        && typeof mission.missionId === 'string'
      ) {
        let leaseClaimed = false;
        try {
          leaseClaimed = await this.claimDirectRecoveryLease(mission.missionId) === true;
          if (!leaseClaimed) {
            logger.info(
              { missionId: mission.missionId },
              'Skipping mission control recovery; another process owns the mission lease',
            );
            continue;
          }
          const terminating = controlState === 'terminate_requested';
          const status = terminating ? 'canceled' : 'paused';
          await this.updatePersistedMissionControl(
            mission.missionId,
            status,
            terminating ? 'terminated' : 'paused',
          );
          await this.broadcastMissionUpdate({
            type: terminating ? 'mission_canceled' : 'mission_paused',
            missionId: mission.missionId,
            workflowId: `mission-${mission.missionId}`,
            status,
            timestamp: Date.now(),
          });
          if (terminating && await this.isMissionPendingDeletion(mission.missionId)) {
            // The mission was deleted by the user before the process restarted.
            // It is finalized now, so its artifacts and live feed events go too.
            await this.deleteMissionArtifacts(mission.missionId);
          }
          recovered++;
        } catch (error) {
          logger.error({
            missionId: mission.missionId,
            error: error instanceof Error ? error.message : String(error),
          }, 'Could not recover mission control state');
        } finally {
          if (leaseClaimed) await this.releaseDirectRecoveryLease(mission.missionId);
        }
        continue;
      }
      if (controlState === 'paused') {
        continue;
      }

      try {
        const input = mission.input as WorkflowInput | undefined;
        if (
          !input
          || typeof input !== 'object'
          || typeof input.missionId !== 'string'
          || input.missionId !== mission.missionId
          || typeof input.prompt !== 'string'
        ) {
          throw new Error('Persisted mission does not contain a valid workflow input');
        }

        const checkpoint = await this.loadPersistedCheckpoint(input.missionId);
        const claimed = await this.claimDirectRecoveryLease(input.missionId);
        if (!claimed) {
          logger.info({ missionId: input.missionId }, 'Skipping mission recovery; another process owns its lease');
          continue;
        }
        await this.startMission(input, checkpoint, claimed);
        recovered++;
      } catch (error) {
        logger.error({
          missionId: mission.missionId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Could not recover persisted in-flight mission');
      }
    }

    logger.info({ recovered }, 'In-flight mission recovery scan completed');
    return recovered;
  }

  private async loadRetryCheckpoint(input: WorkflowInput): Promise<MissionActivityCheckpoint> {
    const plan = await this.loadPersistedPlan(input.missionId);
    if (!plan) {
      // The mission failed before a plan was ever persisted, so there is no
      // completed work to resume and no side effect to replay. The mission
      // restarts from its original prompt and plans again. Failing here would
      // leave every planning-stage failure permanently unretryable.
      logger.warn({ missionId: input.missionId }, 'No persisted plan for mission retry; restarting from the original prompt');
      return {
        version: 1,
        completedTasks: [],
        completedPhases: [],
      };
    }
    return {
      version: 1,
      plan,
      completedTasks: input.completedTasks || [],
      completedPhases: input.completedPhases || [],
    };
  }

  private async loadPersistedCheckpoint(missionId: string): Promise<MissionActivityCheckpoint | undefined> {
    const plan = await this.loadPersistedPlan(missionId);
    if (!plan) return undefined;
    return getMissionResumeProgress(plan).checkpoint;
  }

  private async loadPersistedPlan(missionId: string): Promise<Plan | undefined> {
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) {
      throw new Error('ARTIFACTS_URL is not configured');
    }
    const response = await this.fetchArtifactsWithRetry(
      `${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(missionId)}/plan`,
    );
    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new Error(`Could not load persisted plan for mission ${missionId} (${response.status})`);
    }
    return PlanSchema.parse(await response.json());
  }

  private async fetchArtifactsWithRetry(url: string, init?: RequestInit): Promise<Response> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const response = await fetch(url, init);
        if (response.status < 500 || attempt === 4) return response;
        lastError = new Error(`Artifacts returned HTTP ${response.status}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === 4) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
    }
    throw new Error(`Artifacts request failed after retries: ${lastError?.message || url}`);
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
            status: visibleMissionStatus(data),
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
            const status = visibleMissionStatus(doc);
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

  private async getPersistedMissionControlRecord(missionId: string): Promise<PersistedMissionControlRecord | null> {
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) {
      throw new Error('Mission controls require ARTIFACTS_URL');
    }
    const response = await fetch(`${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(missionId)}`);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Could not load mission control state (${response.status})`);
    }
    const record = await response.json() as unknown;
    if (!record || typeof record !== 'object') {
      throw new Error('Artifacts returned an invalid mission control record');
    }
    return record as PersistedMissionControlRecord;
  }

  private async updatePersistedMissionControl(
    missionId: string,
    status: string,
    controlState: NonNullable<PersistedMissionControlRecord['controlState']>,
  ): Promise<void> {
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) {
      throw new Error('Mission controls require ARTIFACTS_URL');
    }
    const response = await fetch(`${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(missionId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, controlState, updatedAt: Date.now() }),
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 500);
      throw new Error(`Could not update mission control state (${response.status}): ${details}`);
    }
  }

  private async awaitDirectMissionControl(missionId: string): Promise<void> {
    if (!process.env.ARTIFACTS_URL) return;
    let record = await this.getPersistedMissionControlRecord(missionId);
    if (!record) throw new Error(`Mission ${missionId} disappeared during execution`);

    if (
      record.status === 'canceled'
      || record.controlState === 'terminate_requested'
      || record.controlState === 'terminated'
    ) {
      throw new MissionTerminationRequestedError();
    }
    if (record.controlState !== 'pause_requested' && record.controlState !== 'paused' && record.status !== 'paused') {
      return;
    }

    if (record.status !== 'paused' || record.controlState !== 'paused') {
      await this.updatePersistedMissionControl(missionId, 'paused', 'paused');
      await this.broadcastMissionUpdate({
        type: 'mission_paused',
        missionId,
        workflowId: `mission-${missionId}`,
        status: 'paused',
        timestamp: Date.now(),
      });
    }

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, DIRECT_MISSION_CONTROL_POLL_MS));
      record = await this.getPersistedMissionControlRecord(missionId);
      if (!record) throw new Error(`Mission ${missionId} disappeared while paused`);
      if (
        record.status === 'canceled'
        || record.controlState === 'terminate_requested'
        || record.controlState === 'terminated'
      ) {
        throw new MissionTerminationRequestedError();
      }
      if (record.status === 'running' && record.controlState === 'running') break;
    }

    await this.broadcastMissionUpdate({
      type: 'mission_resumed',
      missionId,
      workflowId: `mission-${missionId}`,
      status: 'running',
      timestamp: Date.now(),
    });
  }

  /**
   * Deletes a mission and everything persisted for it, including the live feed
   * events recorded in the artifacts service.
   *
   * A mission that is still running owns its own persisted state until it
   * winds down, and the runner writes that state again when it finalizes. The
   * deletion is therefore recorded on the mission and applied by the runner
   * once it is done, so the mission is not resurrected by that final write.
   */
  async deleteMission(workflowId: string): Promise<'deleted' | 'stopping'> {
    const missionId = missionIdFromWorkflowId(workflowId);

    const record = await this.getPersistedMissionControlRecord(missionId).catch(() => null);
    // Only a mission that is running or paused still has a runner attached to
    // it. Every other status is a mission the runner has already finalized.
    const runnerOwnsMission = !!record && (
      record.status === 'running' || record.status === 'paused'
    );

    const status = await this.terminateMission(workflowId);

    if (runnerOwnsMission) {
      await this.markPersistedMissionForDeletion(missionId);
      return 'stopping';
    }

    await this.deleteMissionArtifacts(missionId);
    return status === 'stopping' ? 'stopping' : 'deleted';
  }

  /**
   * Records that the user deleted a mission that is still winding down.
   */
  private async markPersistedMissionForDeletion(missionId: string): Promise<void> {
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) return;
    try {
      const response = await fetch(`${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(missionId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingDeletion: true, updatedAt: Date.now() }),
      });
      if (!response.ok) {
        const details = (await response.text()).slice(0, 500);
        logger.warn({ missionId, status: response.status, details }, 'Failed to mark mission for deletion');
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, missionId }, 'Failed to mark mission for deletion');
    }
  }

  /**
   * Removes the persisted artifacts of a mission, including the live feed
   * events stored for it.
   */
  private async deleteMissionArtifacts(missionId: string): Promise<void> {
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) return;
    try {
      const response = await fetch(`${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(missionId)}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 404) {
        const details = (await response.text()).slice(0, 500);
        logger.warn({ missionId, status: response.status, details }, 'Failed to delete mission artifacts');
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, missionId }, 'Failed to delete mission artifacts');
    }
  }

  /**
   * True when the user deleted this mission while it was still running. The
   * runner applies the deletion once it has written its final state.
   */
  private async isMissionPendingDeletion(missionId: string): Promise<boolean> {
    try {
      const record = await this.getPersistedMissionControlRecord(missionId);
      return record?.pendingDeletion === true;
    } catch (err) {
      logger.warn({ err: (err as Error).message, missionId }, 'Failed to read mission deletion flag');
      return false;
    }
  }

  async appendMissionEvent(missionId: string, event: { type: string; timestamp?: number; data?: Record<string, unknown>; [key: string]: unknown }): Promise<void> {
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
          ...event,
          missionId,
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
      // The mission output is persisted as the mission state, so it is not
      // repeated in the event. Everything else, including the failure reason,
      // is persisted so a reloaded mission still explains what happened.
      const { output: _output, ...rest } = event;
      await this.appendMissionEvent(missionId, {
        ...rest,
        type: event.type as string,
        timestamp: (event.timestamp as number) || Date.now(),
        data: (event.data as Record<string, unknown>) || {},
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
    controlState?: PersistedMissionControlRecord['controlState'];
    pendingDeletion?: boolean;
    currentStep: number;
    totalSteps: number;
    history: Array<{
      step: number;
       status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled' | 'awaiting_review' | 'incomplete';
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
          controlState: state.controlState,
          pendingDeletion: state.pendingDeletion,
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


// Phase 4: post-task distillation hook (best-effort)
