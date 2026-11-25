import type { AgentDefinition, AgentTask } from '../types'
import { getBrainUrl, httpRequest } from '@stage7-nextgen/shared'
import { ActionExecutor } from './agent-executor/ActionExecutor'
import { BrainClient, brainRequestTimeoutFromEnvironment } from './agent-executor/BrainClient'
import { CapabilityResolver } from './agent-executor/CapabilityResolver'
import type { ExecutorDeps } from './agent-executor/RunContext'
import { SystemToolClient } from './agent-executor/SystemToolClient'
import {
  DEFAULT_MAX_DELEGATION_DEPTH,
  DEFAULT_MAX_ITERATIONS,
  MAX_BRAIN_REQUEST_TIMEOUT_MS,
} from './agent-executor/constants'
import { runAgentLoop } from './agent-executor/loop'
import { createRun, resumeFromCheckpoint } from './agent-executor/startup'
import { ToolCatalogClient } from './agent-executor/toolCatalog'
import type {
  AgentExecutionContext,
  AgentExecutionResult,
  AgentExecutorOptions,
} from './agent-executor/types'

// Public API. Everything else lives under ./agent-executor.
export type {
  AgentActionOutcome,
  AgentActionReceipt,
  AgentDelegateRequest,
  AgentExecutionCheckpoint,
  AgentExecutionContext,
  AgentExecutionResult,
  AgentExecutorOptions,
} from './agent-executor/types'
export { isResumableDelegationCheckpoint, parseAgentExecutionCheckpoint } from './agent-executor/checkpoint'

/**
 * Runs one task for one agent: a bounded loop in which the Brain proposes actions
 * (tool calls, delegation, questions for the user) and the executor carries them out
 * under the agent's policy, recording a receipt for each side effect.
 *
 * See ./agent-executor/loop.ts for the loop and ./agent-executor/guards.ts for the
 * checks every proposed action passes through.
 */
export class AgentExecutor {
  private readonly deps: ExecutorDeps
  readonly maxDelegationDepth: number

  constructor(options: AgentExecutorOptions = {}) {
    const brainUrl = options.brainUrl || getBrainUrl()
    const toolExecutorUrl = (options.toolExecutorUrl || process.env.TOOL_EXECUTOR_URL || 'http://tool-executor:3500').replace(/\/$/, '')
    const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS
    this.maxDelegationDepth = options.maxDelegationDepth ?? DEFAULT_MAX_DELEGATION_DEPTH
    const brainRequestTimeoutMs = options.brainRequestTimeoutMs ?? brainRequestTimeoutFromEnvironment()
    const fetcher = options.fetcher || ((input, init) => fetch(input, init))
    if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 100) {
      throw new Error('Agent maxIterations must be an integer between 1 and 100')
    }
    if (!Number.isInteger(this.maxDelegationDepth) || this.maxDelegationDepth < 0 || this.maxDelegationDepth > 8) {
      throw new Error('Agent maxDelegationDepth must be an integer between 0 and 8')
    }
    if (
      !Number.isInteger(brainRequestTimeoutMs)
      || brainRequestTimeoutMs < 1_000
      || brainRequestTimeoutMs > MAX_BRAIN_REQUEST_TIMEOUT_MS
    ) {
      throw new Error(`Agent brainRequestTimeoutMs must be an integer between 1000 and ${MAX_BRAIN_REQUEST_TIMEOUT_MS}`)
    }

    const brain = new BrainClient(brainUrl, fetcher, brainRequestTimeoutMs)
    const catalog = new ToolCatalogClient(toolExecutorUrl, fetcher)
    const resolveFetcher: typeof fetch = options.fetcher || ((input, init) => httpRequest(String(input), {
      method: init?.method,
      headers: { 'Content-Type': 'application/json' },
      body: typeof init?.body === 'string' ? init.body : undefined,
      timeoutMs: brainRequestTimeoutMs,
      signal: init?.signal || undefined,
    }))
    const resolver = new CapabilityResolver(toolExecutorUrl, resolveFetcher, catalog)
    const systemTools = new SystemToolClient(toolExecutorUrl, fetcher, brain)
    this.deps = {
      brain,
      catalog,
      actions: new ActionExecutor(brain, resolver, systemTools),
      maxIterations,
      maxDelegationDepth: this.maxDelegationDepth,
    }
  }

  async execute(
    definition: AgentDefinition,
    task: AgentTask,
    context: AgentExecutionContext,
  ): Promise<AgentExecutionResult> {
    const run = createRun(this.deps, definition, task, context)
    const alreadyFinished = await resumeFromCheckpoint(run)
    if (alreadyFinished) return alreadyFinished
    return runAgentLoop(run)
  }
}
