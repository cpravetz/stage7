# Agentic Capability Parity Handoff

## Objective

Finish the remediation in [AGENTIC_CAPABILITY_PARITY.md](./AGENTIC_CAPABILITY_PARITY.md) so Stage7's autonomous Agents can lead and complete missions. The acceptance criterion is observed end-to-end mission completion with persisted, validated outputs and supporting runtime evidence. Passing tests, successful builds, a healthy container, or a completed individual task are not sufficient on their own.

Keep the work centered on mission Agents and Brain/provider behavior. Assistants perform Skills; mission Agents execute mission tasks through Agent Runtime and registered tools. Do not spend further effort on a Skill demonstration unless a specific parity requirement depends on it.

## First actions: re-establish current state

This handoff was prepared from checkpoint 025, not a fresh service query. Refresh all state before continuing:

1. Inspect `git status --short` and preserve the already-dirty worktree. Many files were modified before this handoff; do not reset, revert, or overwrite unrelated changes.
2. Read the current parity assessment and its latest live-evidence section.
3. Query the deployed Temporal mission status and logs for `agentic-plugin-create-20261102-03` (retry count 4). The last recorded observation had its original task completed and phase review still running; that status may now be stale.
4. Check Brain and Agent Runtime health/logs, the active provider/model, and whether any request is currently in flight before restarting or redeploying services.
5. Confirm whether the Brain `ModelRouter.ts` latency-score change is deployed. It was tested and built but not yet deployed at the last checkpoint.

## Current evidence and unresolved work

- A previous bounded mission, `agentic-parity-live-20261015-02`, completed six phases and demonstrated Brain/tool execution, delegation, policy denial, error recovery, complaint submission for invalid Brain output, and completion review. A Temporal redeploy followed by retry reused persisted task receipts without repeating task actions. This proves a bounded mission path and persisted-task recovery, not the remaining parity claims.
- Generated-tool creator mission `agentic-plugin-create-20261102-03` is not accepted yet. Its first retry registered `stage7_mission_calculator_20261102_01`, but did not satisfy its creation and catalog-verification artifact requirements. The latest checkpoint says retry 4 resumed the completed task but was still trying to obtain a safe catalog-verification follow-up. Re-check live state and artifacts before deciding whether to retry or close it.
- During those creator retries, reviewers repeatedly returned malformed or semantically invalid follow-ups. Brain complaints were submitted for validation failures. OpenRouter responses were faster in observed calls but often failed JSON validation; OpenWebUI responses took about 226–237 seconds yet completed below the configured 300-second timeout. Thus those calls did not trigger timeout fallback.
- The Brain latency score was changed from a negligible contribution to a bounded factor centered on a 30-second baseline (`80 / (1 + avgLatencyMs / 30000) - 40`, range approaching -40..+40). Complaint penalties remain stronger (`complaintRate * 300`). Focused tests and the Brain build passed, but this change was undeployed at the last checkpoint. Verify actual code and deployment state before making another change.
- Complaint semantics are essential: a technically successful LLM/API response that fails caller-side content validation remains a successful call, while the caller reports the unacceptable response through the complaint endpoint. Verify that both the metric/accounting and provider-selection feedback preserve this distinction.
- Additional parity gaps noted in the assessment include recovery from a process crash during an active Agent action, independently authenticated learning provenance, measured learning-driven behavior change, and broad open-ended mission quality. Keep these explicitly open unless verified with real evidence.

## Recommended execution sequence

1. Refresh the active mission state and logs. If the mission is still running, observe it rather than launching a duplicate or restarting a service underneath an in-flight Brain request.
2. Do not recreate the already-registered plugin. Verify its exact registered ID and schemas using the live tool catalog, and preserve the requested ID.
3. Let the existing creator mission reach a terminal state. Accept it only if the mission itself completes and both required artifacts are persisted and validated; distinguish tool receipts from verified final outputs.
4. If it fails, inspect the exact reviewer output, validation error, complaint record, and persisted Agent receipts. Retry from the persisted checkpoint with a narrow fix; do not restart the whole mission or repeat successful side effects.
5. Once no Brain request is in flight, deploy the tested latency-ranking change if it is still pending. Observe provider/model selection, response time, complaint rates, and fallback behavior across actual requests. Ensure OpenRouter is configured and eligible; do not claim latency-aware routing works from formula/tests alone.
6. Update the parity assessment only with the actual run IDs, terminal outcomes, persisted artifact evidence, complaint/provider observations, and remaining gaps. Keep test/build evidence supplemental.
7. Run focused regression tests for any code changed and `git diff --check`; do not alter production behavior merely to accommodate flaky or inconsistent tests.

## Guardrails

- Never report success based only on tests, builds, redeployment, or a task-level receipt. Report actual mission ID, terminal status, artifact checks, and relevant provider/complaint evidence.
- Do not weaken structured review or validation contracts to make a mission appear successful. Repair invalid outputs or expose the blocker.
- Do not send executable tasks with `Human`/`User` roles to Brain as if they were agent roles; human decisions must be represented as explicit clarification/approval.
- Preserve complaint records for semantically invalid content even when the underlying LLM/API call succeeded.
- Preserve the existing worktree changes; no broad cleanup, reset, or unrelated refactoring.

## Key files

- `docs/ACTIVE_REFERENCE/AGENTIC_CAPABILITY_PARITY.md` — source of truth and live acceptance record.
- `services/temporal/src/agent/MissionAgentRuntime.ts` — Agent task/review execution, complaint reporting, semantic validation, safe follow-ups.
- `services/temporal/src/planner/MissionOrchestrator.ts` and `services/temporal/src/routes/missions.ts` — mission retry and persisted-checkpoint behavior.
- `services/brain/src/services/ModelRouter.ts` — response-time and complaint-based provider ranking.
- `services/brain/src/__tests__/model-router.test.ts` — regression coverage for ranking behavior (not live acceptance).

## Resolution status (2026-10-15)

- **AgentExecutor `grantResumeAllowance` fix applied:** The resume-budget flag no longer requires `retryGuidance`. An agent resuming from a persisted `AgentExecutionCheckpoint` now receives a bounded continuation budget (4 extra Brain calls) even when the retry was triggered without explicit user guidance. This was the root cause preventing `agentic-plugin-create-20261102-03` from producing `plugin_creation_result` and `plugin_verification_result` artifact sections during retry.
- **Correction messages improved:** `expectedArtifactCorrection` and the `alreadySatisfiedRequiredAction` message now reference action results already in the conversation, helping the agent populate required artifact sections from completed action receipts.
- **Tests:** 36/36 AgentExecutor tests pass, including a new test for resume-without-retry-guidance with exhausted brain-call budget.
- **Brain latency ranking:** `ModelRouter.ts` lines 261-264 contain the tested formula `80 / (1 + avgLatencyMs / 30000) - 40`. Code is in place; deployment status is unverified at this checkpoint.
- **Pending runtime verification:** Live re-run of the creator mission and Brain deployment are required for end-to-end acceptance. The worktree preserves all prior changes; no unrelated resets were performed.
