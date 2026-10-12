# Agentic Capability Parity Audit

**Status:** Evidence-based audit; implementation proposal, not a redesign decision  
**Scope:** Rebuild proposal, legacy implementation available on `origin/legacy-services-model`, and current checkout  
**Checkout note:** The current checkout contains pre-existing uncommitted changes, including mission orchestration and agent-runtime changes. This audit describes the checked-out code and does not attribute those changes to a particular author or commit.

## Executive finding

The newer rebuild proposal does not direct Stage7 to remove autonomous-agent capabilities. It explicitly calls for stateful actor loops, dynamic assistant runtimes, multi-agent collaboration and delegation, self-correction, and runtime tool generation and deployment.

The implementation is mixed, and has advanced since the initial audit:

- **The mission-agent boundary now has a bounded executing slice.** A mission Agent calls Brain, reads the live system tool catalog, executes tools, can request tool generation, and can delegate bounded subtasks to child Agents. The outer mission phase/task loop is still owned by `MissionOrchestrator`, so this is not yet an open-ended mission-planning actor.
- **Several capabilities were retained in lower-level services.** The current system has Brain model routing, worker-pool LLM/tool-call loops, retries and output refinement, code-execution repair, and a tool-executor fallback that can discover or generate and deploy a code plugin.
- **Recovery and durability have advanced but remain incomplete.** Temporal heartbeats checkpoint the plan, completed task IDs, and completed phases; Agent receipts retain completed-task results. Retries recover results by task ID rather than rerunning completed side effects. A checkpointed task without a completed Agent receipt is rejected rather than replayed, and the Agent does not yet resume its in-progress reasoning/tool loop.
- **Some legacy/proposal claims were never fully realized or are not demonstrated by the evidence inspected.** In particular, legacy `Step.triggerReflection` is a stub even though the active legacy `ReflectionManager` implements end-of-mission reflection and recovery-plan handling. Neither the proposal nor the inspected code establishes durable learning that improves future agent behavior.

Therefore, the accurate diagnosis is **not “NextGen removed everything” and not “the old system was fully autonomous.”** The first Agent-owned execution/delegation slice is now implemented, but autonomous replanning, complete recovery, policy-scoped tool access, and durable mission resumption remain parity gaps.

## Evidence and interpretation

### Sources

- The user-provided February 2026 rebuild proposal, particularly §§2, 3.1–3.5, 4.2, and 7.1.
- The legacy implementation on the Git ref `origin/legacy-services-model`, especially:
  - `services/agentset/src/agents/Agent.ts`
  - `services/agentset/src/agents/Step.ts`
  - `services/agentset/src/agents/ReflectionManager.ts`
  - `services/capabilitiesmanager/src/utils/engineer.ts`
  - `services/engineer/src/Engineer.ts`
  - `services/brain/src/services/ModelDiscoveryService.ts`
- Current checked-out implementation under `services/temporal`, `services/agent-runtime`, `services/worker-pool`, `services/tool-executor`, and `services/brain`.

The legacy branch is code evidence, not a claim that every legacy feature was reliable or complete. The proposal is a target-state document, not proof that a target feature was implemented.

### Status labels

- **Implemented:** Evidence of an operational path in the current code was found.
- **Partial:** A related mechanism exists, but not the proposal-level end-to-end capability.
- **Missing in the inspected path:** The current mission/agent execution path does not provide the behavior.
- **Unverified:** The relevant claim is too broad or lacks evidence in the inspected runtime and tests.

## Capability parity matrix

| Capability | Proposal intent | Legacy implementation evidence | Current implementation evidence | Assessment and verification gate |
|---|---|---|---|---|
| **Agent as an executing entity** | Target diagram calls for “Temporal.io / Stateful Actor Loops”; §3.1 calls for dynamic assistant runtimes. | Legacy `Agent` owns status, steps, managers, and an asynchronous `runUntilDone` loop. It repeatedly calls `runAgent`, adds planned steps, and finalizes its mission. | `AgentExecutor` runs a Brain/tool decision loop for a mission-scoped Agent. A Planner Agent generates plans and a Reviewer Agent evaluates completion through Agent Runtime; neither task uses an Assistant identity or Worker Pool executor. `MissionOrchestrator` still owns the outer phase/task loop and supplies bounded tasks. | **Partial; planning and task execution are Agent-owned, but mission-level decision ownership remains centralized.** Next: move bounded re-planning and task selection to the mission Agent without losing Temporal checkpoints, approvals, or explicit failure states. |
| **Dynamic agent creation and delegation** | §4.2 calls for a collaboration canvas showing interaction and delegation; §7.1 identifies agent-led capability extension. The proposal does not specify a complete delegation API. | `Step` handles `DELEGATE`; `Agent.createSubAgent` builds a new agent config and calls the AgentSet `/addAgent` endpoint. `Step` also resolves cross-agent dependencies. | `AgentExecutor` exposes a bounded delegation action. `AgentRuntime` creates and executes a mission-scoped child Agent and returns its result to the parent, with depth and mission-Agent-count limits. | **A bounded delegation slice is implemented.** Test child failure, timeouts, tenant/policy enforcement, and durable parent/child recovery; collaboration records alone are not evidence for those behaviors. |
| **Replanning and recovery** | §3.5 requires a critic feedback loop to inspect tool errors, correct parameters, and retry; §3.2 requires durable resumability. | Legacy `ReflectionManager` creates an end-of-mission `REFLECT` step and processes a new plan. The agent loop can continue after adding steps. However, `Step.triggerReflection` itself only logs; do not count that stub as working reflection. | `AgentExecutor` returns tool errors to Brain for a subsequent decision. Temporal schedules each Agent task as an independent heartbeating activity; workflow history records the plan and completed activity results. On retry, Agent Runtime returns a persisted completed receipt. If an activity was interrupted without a completed receipt, the retry fails closed instead of replaying possible external side effects. An Agent does not yet resume its in-progress reasoning/tool loop. | **Partial; completed task boundaries are replay-aware, but interrupted Agent recovery and general replanning remain missing.** Acceptance: inject a tool failure and worker restart; verify bounded repair/replan or explicit escalation, without duplicate external side effects or false success. |
| **Runtime tool creation and self-extension** | §7.1 explicitly requires agents to generate, test, and deploy new MCP tools at runtime without restarting containers. | Capability Manager can request a plugin from Engineer; Engineer exposes plugin generation and recovery methods. | `AgentExecutor` has a tool-creation action using the existing plugin-generation route, verifies registration in the next live catalog read, and can use the new tool on a later turn. `PluginGenerator` deploys code plugins; component tests cover generation and persistence. This is not proof of generated MCP servers or isolated validation and security review. | **Runtime code-plugin generation is connected; validation and policy controls remain partial.** Acceptance: validate generated artifact/schema/security before registration, apply explicit permission policy, and verify availability after restart. |
| **Tool use by agents** | §3.3 says Stage7 agents should use MCP clients and expose Stage7 tools via MCP. | Legacy agents execute plugin actions through the capabilities manager and can delegate steps. | `AgentExecutor` queries the live system-wide tool catalog on each decision and executes registered tools through ToolExecutor; it does not take Assistant-specific tool bindings as its allowlist. ToolExecutor's credential and confirmation gates still apply. There is not yet a per-Agent permission policy, and the catalog may be large. | **Mission Agents now use system-wide tools as requested; policy-scoped access remains open.** Acceptance: preserve live catalog access while enforcing tenant, risk, approval, and budget policy; test allowed and denied tool execution. |
| **Model selection and adaptation** | §3.4 requires cost/task-aware dynamic model routing; the target diagram includes model discovery and dynamic routing. | Legacy `ModelDiscoveryService` discovers models from active provider services and computes initial capability/performance scores. This is model discovery/scoring, not by itself proof of continual learning from outcomes. | Brain `ModelRouter` filters and ranks candidates using task capabilities, token limits, budget, optimization preferences, provider health, and observed performance. Brain owns both model and provider selection; completion callers cannot pin either. Agent requests contain the task and policy context, not a model choice. | **Brain-owned model/provider selection and provider failover are implemented; task-aware/adaptive selection remains partial.** Acceptance: pass task constraints to Brain; observe selected model/provider and rationale; test that measured success/latency/cost changes later choices. |
| **Memory, learning, and specialization** | Proposal promises hierarchical vector memory and persistent collaborators with memory/history. It does not precisely define online learning or what “learning” changes. | Legacy persistence stores agent state/events; shared-memory and reflection components exist. The examined sources do not establish a complete durable learning policy that updates future agent behavior. | Worker-pool knowledge is loaded for assistants. Agent specializations in `AgentRuntime` are stored in an in-process map; no inspected use changes model, tools, planning, or behavior based on that data. | **Memory partial; adaptive learning unverified.** Acceptance: specify the learning unit (e.g. user feedback, validated outcome, or run trace), persist provenance and scope, retrieve it for a later decision, and test a measurable behavior change without cross-tenant leakage. |
| **Durable execution and collaboration state** | §3.2 calls for resumable missions and durable DAGs; §5.3 calls for traces across workflow, agent, tool, and LLM. | Legacy has an AgentPersistenceManager and cross-agent output resolver, though durable recovery semantics need separate validation. | `missionWorkflow` now schedules planning, each Agent task, phase transitions, approval, and mission completion as separate activities. Temporal history retains completed activity results; Agent receipts let a retried task return its completed result, while uncertain tasks without receipts fail closed. | **Task-level activity replay protection implemented; in-progress Agent reasoning resumption is not.** Acceptance: restart workers during a mission, verify completed tasks are not rerun, interrupted tasks fail explicitly when their outcome is uncertain, and preserve trace linkage. |

## Important corrections to the earlier assessment

1. **The legacy system had more than agent-shaped records.** `Agent` had a running lifecycle loop and explicit sub-agent creation. The older architecture was not merely aspirational on those points.
2. **The legacy system was not uniformly complete.** `Step.triggerReflection` is only a logging stub; active reflection behavior is implemented in `ReflectionManager`. Delegation, recovery, and persistence still require correctness/reliability tests before claiming production parity.
3. **NextGen has genuine agent-adjacent capabilities.** Worker-pool assistants can iterate over tool calls; Brain routes among models; ToolExecutor can repair failed code and generate/deploy code plugins. The key gap is that these services are not consistently capabilities owned and invoked by a mission agent.
4. **The proposal does not explicitly require open-ended, unconstrained agents.** It requires agent-centered dynamic behavior within an enterprise control plane. The intended autonomy should be bounded by tool permissions, tenant isolation, approvals, budgets, iteration limits, and auditability.

## Recommended implementation sequence

This audit is not authorization for a broad rewrite. Use the following gates to restore the architectural boundary incrementally:

### Gate 1 — Agent runtime contract (first slice implemented)

Define an executing `Agent` contract separate from its persisted `AgentDefinition`. The runtime should receive service interfaces for Brain, tool discovery/execution, memory, persistence, delegation, policy, and cancellation. Brain remains a shared service; agents call it when they need reasoning. Temporal may host/supervise durable agent loops, but must not encode every agent decision as a fixed role/task loop.

### Gate 2 — Complete the bounded vertical slice

The current implementation covers Brain/tool execution, live tool discovery, one child-Agent delegation, Temporal plan/task/phase checkpoints, task receipts, and per-Agent-task execution budgets. The default policy caps one task at 8 Brain calls, 6 tool/delegation actions, 16,384 total completion tokens, 2,048 tokens per completion, and 2 delegated subtasks; delegations inherit the policy. Planning uses a separate 4,096-token per-completion cap. These are bounded service limits, not a mission-wide aggregate budget or fine-grained tool permission policy.

Still complete and verify one bounded mission in which an agent:

1. receives a goal and policy/tool budget;
2. reasons through Brain and selects from its permitted tools;
3. delegates one subtask to a dynamically registered child agent;
4. consumes the child result and completes the goal;
5. recovers from an injected tool failure or escalates explicitly; and
6. resumes after a worker restart without duplicating completed side effects.

The test must inspect runtime calls, persisted state, tool permissions, and final output—not just agent records or UI events.

### Gate 3 — Harden extension and optimization

Add generated-tool validation and explicit policy controls before treating runtime code generation as production-ready. Connect task requirements and measured outcomes to Brain routing. Define “learning” as an explicit, auditable data flow before implementing it.

### Gate 4 — Update claims from demonstrated behavior

For every capability, require observed end-to-end execution and an observable trace; automated tests are regression aids, not proof that deployed behavior works. Then update the README and [user guide](../USER_GUIDE.md) to distinguish currently available behavior from roadmap or design intent.

## Current status and next action

Mission plan generation and completion review now execute as mission-scoped Agents through Agent Runtime and Brain. Mission Agents no longer receive Assistant identity, execute through Worker Pool, or call Brain directly from Temporal; completed-task receipts still protect retries. The outer phase/task loop remains centralized, and no successful live mission or real Temporal worker-restart recovery has been demonstrated. Gate 2 remains open until a running stack shows Agent delegation, repair or explicit escalation, and worker-restart recovery without duplicate completed side effects. The recovery contract deliberately fails closed when an interrupted Agent task has no completed receipt; it does not resume in-progress reasoning/tool execution. Next architectural work is bounded Agent-owned re-planning/task selection, followed by fine-grained tool policy and generated-plugin validation. Preserve Brain and ToolExecutor as shared services; keep Agents as mission-scoped actors and Assistants as persistent domain collaborators.
