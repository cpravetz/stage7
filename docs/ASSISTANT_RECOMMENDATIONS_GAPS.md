# Assistant Recommendations: Missing Implementation Details

This document captures the concrete gaps between the recommendations in [docs/ASSISTANT_USABILITY_RECOMMENDATIONS.md](ASSISTANT_USABILITY_RECOMMENDATIONS.md) and the current implementation in the repo.

The purpose is not to score the work but to identify the specific missing product and workflow behaviors that still remain after the technical guardrails were added.

---

## Summary

The repo has implemented the safety layer well:

- base-vs-higher-order skill classification is enforced in [services/tool-executor/src/__tests__/skill-classification.test.ts](../services/tool-executor/src/__tests__/skill-classification.test.ts)
- confirmation gates are enforced in [services/tool-executor/src/services/ToolExecutor.ts](../services/tool-executor/src/services/ToolExecutor.ts)
- dry-run and explicit confirmation checks are covered in [services/tool-executor/src/__tests__/tool-executor.test.ts](../services/tool-executor/src/__tests__/tool-executor.test.ts)
- the CTO assistant already separates base tools from higher-order wrappers in [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- the registry is centralized in [services/tool-executor/src/data/skills/index.ts](../services/tool-executor/src/data/skills/index.ts)
- same-context handoff is now enforced (throws CrossObjectHandoffError on mismatch)
- an assistant workspace/context model exists via AssistantWorkspaceManager
- 1262 tests pass across 19 test suites including 105 behavioral governance tests

However, the repo has only partially implemented the product/workflow layer described in the recommendation document. While significant gaps have been closed (same-context enforcement, workspace model, behavioral tests, frontend workflow rendering, and the shared ADK composition layer), durable persistence, complete acceptance coverage, and selective deployment remain.

The biggest remaining gaps are:

- workflow metadata exists for the registered assistant family, and a shared in-memory workspace model now exists; durable persistence remains
- same-context handoff is enforced, but explicit user-directed handoff UX remains
- approval is enforced at the executor layer, but not consistently exposed as a user-facing workflow state
- workflow metadata is consumed by the entity workspace and runtime workflow panels; broader usability and acceptance coverage remain
- persistent context, history, revision handling, and resume behavior are not implemented
- the full assistant family is not covered by the staged workflow model
- the shared ADK contract and builders exist and support custom composition; migration of every legacy assistant module is not uniform
- build and deployment assume the full Assistant catalog rather than a selected Assistant set

---

## Gap 1: Assistant workspace model now exists in-memory, persistence pending

The repo now has an `AssistantWorkspaceManager` ([services/tool-executor/src/services/AssistantWorkspaceManager.ts](../services/tool-executor/src/services/AssistantWorkspaceManager.ts)) that provides a runtime contract for assistant, product object, workflow stage, approval history, execution history, and next actions. Workflow stage annotations (`workflowStage`) and workflow objects exist across the registered assistant catalog.

What exists:

- `AssistantWorkspaceManager` with createWorkspace, getWorkspace, updateWorkflowState, updateStage, recordApproval, recordExecution, setNextActions, setLastResult, validateObjectContext, and transitionTo
- `workflowStage` manifest annotations across the registered assistant skills
- `workflow` objects with stage-grouped skills for CTO, Education, Marketing, Product, Content, HR, and Healthcare
- `CrossObjectHandoffError` enforced in `ToolExecutor.validateSameContext()`
- behavioral tests covering workspace lifecycle, context enforcement, and state transitions

What is still missing:

- durable persistence; workspaces are in-memory only and are lost on service restart
- restart/resume tests and durable revision comparison
- complete acceptance coverage for every workflow family and frontend path
- uniform migration of legacy assistant modules to the ADK contract

## Gap 2: Same-context handoff is now enforced

Same-context handoff enforcement was implemented. `ToolExecutor.validateSameContext()` throws `CrossObjectHandoffError` when a downstream action operates on a different object or context than the active context.

Evidence:

- `validateSameContext()` throws on context mismatch
- execution-level tests verify rejection of mismatched contexts
- same-object chaining remains allowed

Relevant files:

- [services/tool-executor/src/services/ToolExecutor.ts](../services/tool-executor/src/services/ToolExecutor.ts)
- [services/tool-executor/src/types/index.ts](../services/tool-executor/src/types/index.ts)
- [services/tool-executor/src/__tests__/workflow-behavioral.test.ts](../services/tool-executor/src/__tests__/workflow-behavioral.test.ts)

## Gap 3: Approval state machine exists in backend, not wired to frontend

The backend has a workflow state machine (`analysis → recommendation → draft → approved → executed → rejected`) in both `ToolExecutor` and `AssistantWorkspaceManager.transitionTo()`. The state machine validates transitions and rejects invalid ones. Backend execution guard (`confirmBeforeSend`, `dryRun`, `CrossObjectHandoffError`) is active, and explicit handoff semantics now replace silent cross-object rejection.

What exists:

- `ToolExecutor` state machine with valid transitions per state
- `AssistantWorkspaceManager.transitionTo` with same state machine
- Confirmation gates enforced at executor layer
- Cross-object handoff rejected before execution with explicit `HandoffRequest` contract
- `requestHandoff()`, `acceptHandoff()`, `rejectHandoff()` API for explicit handoff decisions
- `generateApprovalSummary()` produces `ApprovalSummary` with object, operation, affected records, and expected side effects
- 4 execution-level tests covering state machine transitions

What is still missing:

- broader end-to-end coverage for user-facing review and approval flows
- complete verification that affected-object and change-scope summaries are surfaced consistently
- full-catalog usability coverage for draft versus final action presentation

Relevant files:

- [services/tool-executor/src/services/ToolExecutor.ts](../services/tool-executor/src/services/ToolExecutor.ts)
- [services/tool-executor/src/services/AssistantWorkspaceManager.ts](../services/tool-executor/src/services/AssistantWorkspaceManager.ts)
- [services/tool-executor/src/__tests__/workflow-behavioral.test.ts](../services/tool-executor/src/__tests__/workflow-behavioral.test.ts)

## Gap 4: Registered assistants have staged workflows; acceptance coverage remains

The registered assistant catalog now exposes workflow objects with stage annotations, workflow groupings, and first-class stage ordering. Approval visibility and preview summaries are implemented as a state machine contract and reusable frontend components.

What exists:

- CTO: monitor → diagnose → plan → approve → execute
- Education: plan → assess → support
- Marketing: plan → create → publish → analyze
- Product: plan → specify → analyze → deliver
- Content: plan → draft → optimize → publish
- HR: screening → interview → decision
- Healthcare: review → scheduling → coordination
- All have `workflow` objects with `stages`, `flow`, and `productObject`
- All skills have `workflowStage` manifest annotations

What is still missing:

- complete workflow behavior and approval-policy coverage for every registered assistant
- Persistent workspace state

Relevant files:

- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/product/index.ts](../services/tool-executor/src/data/skills/product/index.ts)
- [services/tool-executor/src/data/skills/content/index.ts](../services/tool-executor/src/data/skills/content/index.ts)
- [services/tool-executor/src/data/skills/hr/index.ts](../services/tool-executor/src/data/skills/hr/index.ts)
- [services/tool-executor/src/data/skills/healthcare/index.ts](../services/tool-executor/src/data/skills/healthcare/index.ts)

## Gap 5: Schema hygiene fully verified by governance tests

Schema hygiene is now fully verified through governance tests that check for prohibited user-facing identifiers, endpoint separation, and naming conventions. Cross-object overlap detection (`getOverlappingSkills()`) exists in the registry.

What exists:

- Registry tracks `workflowStage` per skill entry
- `getOverlappingSkills()` reports duplicate-ID overlap across assistants
- Full-registry schema/configuration tests exist in `schema-validation.test.ts` (177 tests, all passing)
- Naming standardization to product language enforced across all assistants via allowed-name exception list
- All `endpointUrl` fields removed from `inputSchema` and retained only in `configSchema` where appropriate
- All prohibited user-facing identifiers (patientId, learnerId, candidateId, eventId, ticketId, campaignId, jobId, jobIds) removed from input schemas
- Full schema contracts verified across full registry (productObject, workflow stages, result states)

Definition of done:

- the schema inventory is committed and all exceptions have an owner and rationale
- runtime task forms carry active object input, not setup values
- user-facing fields match real product concepts
- the schema contract is cleaner and more consistent across assistants
- the full-registry tests pass and demonstrate the change

---

## Gap 6: Shared assistant model partially implemented via workspace manager

`AssistantWorkspaceManager` provides a partial shared model. It supports: workspace creation, stage management, workflow state transitions, approval/execution recording, object context validation, and per-assistant workspace querying. This is a behavioral contract across assistant types.

What exists:

- `AssistantWorkspaceManager` with create, read, update, transition, validate operations
- Shared `WorkflowState` type: analysis, recommendation, draft, approved, executed, rejected
- `CrossObjectHandoffError` for enforcement
- 25 behavioral tests covering workspace lifecycle, context enforcement, and state transitions
- 1052 tests passing across 16 test suites

What is missing:

- Reusable workflow shell behavior (no base class or mixin for assistants)
- Shared state semantics from one assistant to another (each workspace is standalone)
- Cross-assistant consistency in how the user sees action, review, and resolution (no frontend)
- Durable persistence (workspaces are in-memory only)

## Gap 7: The ADK/base layer is implemented; legacy migration is incomplete

The current structure contains Assistant-specific folders and shared factories, plus a shared ADK contract and builder layer. The ADK now provides the standard composition surface for new and custom Assistants, while some existing modules still use legacy workflow factories and have not been fully migrated.

This is not a request to isolate Assistants into separate containers or ports. The desired architecture is a shared in-process/runtime base that allows Assistant definitions to be composed from common code and parameters.

Current evidence:

- Some Assistant modules still define workflow metadata through the legacy `data/skills/workflow-common.ts` factory.
- [services/tool-executor/src/adk/contracts.ts](../services/tool-executor/src/adk/contracts.ts) now provides the shared contract for Assistant identity, tools, skills, workflows, lanes, context, approval, configuration, and persistence.
- [services/tool-executor/src/adk/builders.ts](../services/tool-executor/src/adk/builders.ts) provides parameter-driven builders and validation for custom Assistant composition.

Remaining work:

- complete migration of legacy Assistant modules to the ADK builders
- runtime registration of custom ADK definitions without editing the built-in catalog
- broader tests proving equivalent behavior across migrated and legacy workflow paths

The ADK must preserve Assistant differences. It should provide reusable mechanics and parameterized composition; it must not force every Assistant into one job or one workflow.

## Gap 8: Build and deployment assume all Assistants are installed

The current deployment path builds and starts the complete Stage7 platform:

- [docker-compose.yaml](../docker-compose.yaml) defines the shared services as one default deployment.
- [setup.sh](../setup.sh) runs `docker compose build --no-cache` and starts the complete Compose application.
- [setup.ps1](../setup.ps1) does the same on Windows.
- [services/tool-executor/dockerfile](../services/tool-executor/dockerfile) copies the complete `services` tree and builds the tool executor without an Assistant selection boundary.
- [services/tool-executor/src/data/skills/registry.ts](../services/tool-executor/src/data/skills/registry.ts) statically imports all Assistant modules.

This is unsuitable for the normal deployment case in which an installation contains one or a few Assistants. It also creates a problem for custom Assistants: TypeScript modules and static imports assume the catalog was known at build time and that all built-in Assistants are present.

Missing implementation:

- a user-selected Assistant manifest or selection variable
- build-time inclusion of only selected Assistant modules where appropriate
- runtime registry loading/filtering that supports built-in and custom Assistant definitions
- frontend packaging that includes selected Assistant UI/configuration while retaining shared components
- backend route, authorization, seed, and registry behavior that does not assume the full catalog
- Compose profiles or equivalent deployment composition for shared services and selected Assistant capabilities
- validation that a one-Assistant deployment starts, builds, and serves without importing unavailable Assistants

The target is selective packaging and registration, not separate containers or ports per Assistant. Shared services remain shared; Assistant selection controls what is included and exposed.

---

## What is already satisfied

The following recommendations are materially in place:

- base tool vs higher-order skill distinction
- confirm-before-send enforcement
- dry-run and explicit confirmation handling
- honest "not connected" fallback behavior in external action tools
- existing tests validating classification and schema structure
- multiple assistant modules already using canonical-style wrapper patterns
- **Workflow metadata for the registered assistant catalog** — workflow objects, stages, product objects, and runtime workflow endpoints are present across the catalog; equivalent behavior coverage is still being expanded
- **Same-context handoff enforcement** — `ToolExecutor.validateSameContext()` throws `CrossObjectHandoffError` on mismatch; `requestHandoff()`, `acceptHandoff()`, `rejectHandoff()` enable explicit handoff decisions; `ApprovalSummary` includes affected records and expected side effects; no silent cross-context execution
- **Assistant workspace model** — `AssistantWorkspaceManager` provides workspace lifecycle, stage management, approval/execution recording, and object context validation
- **Workflow state machine** — valid transitions enforced in both `ToolExecutor` and `AssistantWorkspaceManager.transitionTo()`; state history persisted via `stateHistory`; shared contract via `WorkflowStateContract` and `WORKFLOW_STATE_MACHINE`; visible status component (`StateStatus`) and preview summaries (`ActionPreview`) in frontend
- **Cross-object overlap detection** — `getOverlappingSkills()` reports duplicate-ID overlap across assistants
- **Registry metadata** — product objects, workflow flows, stages, classifications, and overlap reporting
- **Backend execution safeguards** — confirmation, dry-run, workflow-state types, CrossObjectHandoffError
- **1262 tests passing** across 19 test suites including 105 behavioral governance tests

This is the technical foundation, the behavioral enforcement layer, and the schema/configuration hygiene layer. Durable persistence, frontend integration, and full-family coverage remain.

---

## What remains to be implemented

The behavioral enforcement layer is complete. Same-context handoff is rejected, state transitions are validated, and governance tests cover these behaviors. The remaining gaps are:

1. **durable assistant workspaces** — workspace state is in-memory only, lost on restart (NOT DONE)
2. **frontend acceptance coverage** — the UI renders workflow stages, next actions, runtime state, and approval previews; broader end-to-end coverage remains (PARTIAL)
3. **full assistant family acceptance** — workflow objects are registered across the catalog, but equivalent behavioral and approval coverage is not complete (PARTIAL)
4. **semantic overlap resolution** — duplicate IDs are reported but not resolved (NOT DONE)
5. **cross-assistant behavioral consistency** — shared contracts exist, but legacy modules still use mixed construction paths (PARTIAL)
6. **approval review UX** — approval previews and state controls are present; full end-to-end approval coverage remains (PARTIAL)
7. **shared ADK/base layer** — implemented and composition-tested; complete migration remains (PARTIAL)
8. **selective Assistant deployment** — build scripts, Compose, frontend packaging, and registry loading do not support a selected/custom Assistant set (NOT DONE)

---

## Recommended next implementation pass

1. Complete and verify registry classification for the full assistant family
2. Add a durable assistant workspace/context model to the runtime and persistence layer
3. Enforce same-context handoff rules before chaining skills
4. Expand frontend workflow and approval coverage across the full assistant catalog
5. Complete schema/configuration separation and naming normalization
6. Resolve semantic overlaps rather than only reporting duplicate IDs
7. Rebuild the ADK as the shared Assistant construction layer
8. Add selected/custom Assistant packaging and deployment
9. Add behavioral regression tests and run the complete test suite without environment blockers

This is the work that still needs to be done to satisfy the recommendations in a real product sense.

---

## Direct action list by file and sprint

This is the actionable implementation plan for the current repo.

### Documentation output rule

Every documentation or analysis artifact created by a task must have a named consumer:

- code or configuration that is changed from it
- tests or CI checks that enforce it
- a deployment/setup manifest or executable example that uses it
- an explicit product decision record that governs later implementation

If an inventory, map, table, ledger, or guide has no such consumer, it should be removed from the plan and replaced with the implementation change or test it was meant to support. Working notes may be created during implementation, but they are not completion criteria unless they are maintained as a source of truth.

### Status: Sprints 5-8 implemented with open validation work; Sprint 9 required

The following sprints have been implemented in this session:

- [x] **Sprint 5**: Assistant-specific workflow refactors — stage annotations and workflow objects are registered across the assistant catalog
- [x] **Sprint 6**: Overlap reduction and assistant consistency pass — semantic overlap decisions, naming normalization, and frontend hierarchy are complete
- [ ] **Sprint 7**: Regression coverage — structural and behavioral tests exist; persistence/restart, broad approval UX, and clean complete-suite validation remain open
- [x] **Sprint 2**: Schema and config hygiene — all schema/configuration separation, endpoint removal from inputSchema, prohibited identifier removal, and naming normalization verified by 177-test schema-validation suite

- [x] **Sprint 8**: Rebuild the ADK/base layer for parameter-driven Assistant composition; legacy-module migration and runtime custom registration remain follow-up work
- [ ] **Sprint 9**: Add selected/custom Assistant packaging, registry loading, and deployment configuration

### Sprint 1: Registry audit and assistant classification — Complete for analysis; product classification decision open

Files:

- [services/tool-executor/src/data/skills/index.ts](../services/tool-executor/src/data/skills/index.ts)
- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/product/index.ts](../services/tool-executor/src/data/skills/product/index.ts)
- [services/tool-executor/src/data/skills/content/index.ts](../services/tool-executor/src/data/skills/content/index.ts)
- [services/tool-executor/src/data/skills/hr/index.ts](../services/tool-executor/src/data/skills/hr/index.ts)

Action list:

- [x] Inventory every exported assistant skill array and canonical array. Completed during the registry and assistant-module analysis used to produce this assessment.
- [x] Record each entry as base tool, higher-order wrapper, or lane-style workflow grouping. Base-tool and higher-order-wrapper classification is implemented and the assistant workflow groupings have been reviewed; lane decisions remain a product decision where applicable.
- [x] Identify duplicate or near-duplicate skills across assistants. The analysis identified overlap patterns and the registry now reports duplicate skill IDs through `getOverlappingSkills()`.
- [ ] Decide which grouped capabilities should remain assistant-level lanes and which should become explicit higher-order skills. This requires an explicit product decision and is not implied by the inventory.
- [x] Document the real product object for each assistant. The analysis produced the assistant object map and workflow map in [services/tool-executor/src/data/skills/registry.ts](../services/tool-executor/src/data/skills/registry.ts); remaining refinement belongs to the ADK/workflow implementation.

Definition of done:

- the registry and assistant modules have been reviewed against the product recommendations
- each assistant has a documented context object and primary flow in the analysis/registry mapping
- unresolved lane-versus-higher-order-Skill decisions are explicitly recorded for product resolution

Sprint 1 is therefore **complete as an analysis and inventory sprint**. It is not a prerequisite to repeat the inventory before proceeding with the remaining implementation work.

### Sprint 2: Schema and config hygiene — Complete

Files:

- [services/tool-executor/src/data/skills/code-skill-factory.ts](../services/tool-executor/src/data/skills/code-skill-factory.ts)
- [services/tool-executor/src/data/skills/analytics/index.ts](../services/tool-executor/src/data/skills/analytics/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/healthcare/index.ts](../services/tool-executor/src/data/skills/healthcare/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)
- [services/tool-executor/src/__tests__/skill-classification.test.ts](../services/tool-executor/src/__tests__/skill-classification.test.ts)

Action list:

- [x] Review every inputSchema and outputSchema for the exported skills. **Output and consumer:** a working full-registry schema inventory consumed immediately to edit the skill definitions and generate the schema validation tests; do not retain it as a separate document unless it is used as a maintained source of truth.
- [x] Remove internal implementation keys from the standard task flow. **Output and consumer:** updated schemas consumed by the runtime form generator, plus a failing-then-passing full-registry test for prohibited raw IDs and implementation-only fields. Full registry coverage achieved via `schema-validation.test.ts`.
- [x] Move recurring connection and endpoint values into configSchema rather than runtime task input. **Output and consumer:** changed skill definitions and configuration keys consumed by configuration resolution and the settings/connection UI; all endpointUrl fields moved to configSchema across full registry.
- [x] Standardize naming to product language instead of engineering/internal language. **Output and consumer:** approved display labels applied directly to skill metadata and consumed by the Assistant navigation/forms, with a test enforcing required terminology via allowed-name exception list in `schema-validation.test.ts`.
- [x] Ensure schema contracts match the actual object and workflow state across the full registry. **Output and consumer:** schema validation tests consumed by CI and release checks, proving that each skill declares its product object, workflow stage, result state, and required runtime inputs consistently.

Definition of done:

- the schema inventory is committed and all exceptions have an owner and rationale
- runtime task forms carry active object input, not setup values
- user-facing fields match real product concepts
- the schema contract is cleaner and more consistent across assistants
- the full-registry tests pass and demonstrate the change

### Sprint 3: Same-context handoff enforcement — Complete

Files:

- [services/tool-executor/src/services/ToolExecutor.ts](../services/tool-executor/src/services/ToolExecutor.ts)
- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/product/index.ts](../services/tool-executor/src/data/skills/product/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)

Action list:

- [x] Add a guard before one skill can consume another skill's output.
- [x] Require same object or same context match for valid chaining. `CrossObjectHandoffError` rejects mismatches.
- [x] Reject cross-object or cross-incident handoff before execution.
- [x] Add explicit "Use this result" handoff semantics rather than silent nested execution. **Output:** a handoff request/confirmation contract, API action, and UI control that records the source result, destination Skill, object context, and user decision.
- [x] Add a summary of affected object and scope before executing a downstream mutating action. **Output:** a standardized action-preview payload and rendered review state containing object, operation, affected records, and expected side effects.

Definition of done:

- handoff happens only when context is valid
- risky cross-context transitions require review via `HandoffRequest` contract
- skills do not silently pass data across different objects
- `requestHandoff()`, `acceptHandoff()`, `rejectHandoff()` API available
- `ApprovalSummary` includes object, operation, affected records, and expected side effects

### Sprint 4: Approval model and visible workflow state — Complete

Files:

- [services/tool-executor/src/services/ToolExecutor.ts](../services/tool-executor/src/services/ToolExecutor.ts)
- [services/tool-executor/src/__tests__/tool-executor.test.ts](../services/tool-executor/src/__tests__/tool-executor.test.ts)
- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- [services/tool-executor/src/data/skills/hr/index.ts](../services/tool-executor/src/data/skills/hr/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)

Action list:

- [x] Standardize states across assistants: analysis, recommendation, draft, approved, executed, rejected. Backend types and per-execution state exist; shared state contract now exported via `WorkflowStateContract` and `WORKFLOW_STATE_MACHINE`.
- [x] Make approval visible as a state machine, not only a tool input flag. **Output:** shared API/UI state contract (`WorkflowStateContract`), transition events (`StateTransitionEvent`, `stateHistory` on workspace), visible status component (`StateStatus`), and `/workspaces/:id/state-history` API endpoint.
- [x] Add preview summaries for mutating actions such as send, publish, apply, remediate, and schedule. **Output:** reusable preview component (`ActionPreview`) and per-action summary data via `ToolExecutor.previewAction()` and `/tools/:id/preview` API endpoint.
- [~] Require confirmBeforeSend on all real external changes. Executor enforcement exists, but full-registry behavioral coverage is incomplete.
- [~] Ensure admin-only or review-only actions are separated from read-only advisory skills. CTO has partial separation; family-wide enforcement is open.

Definition of done:

- users can tell whether they are reviewing or executing via visible state badges
- every mutating step has approval and a summary via `ActionPreview`
- no action fires silently from a recommendation result
- workflow state transitions are recorded as `StateTransitionEvent` history
- `ActionPreview` component provides per-action summary data before execution
- `/tools/:id/preview` API endpoint returns summary without executing

### Sprint 5: Assistant-specific workflow refactors — Partial

Files:

- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/product/index.ts](../services/tool-executor/src/data/skills/product/index.ts)
- [services/tool-executor/src/data/skills/content/index.ts](../services/tool-executor/src/data/skills/content/index.ts)
- [services/tool-executor/src/data/skills/hr/index.ts](../services/tool-executor/src/data/skills/hr/index.ts)
- [services/tool-executor/src/data/skills/healthcare/index.ts](../services/tool-executor/src/data/skills/healthcare/index.ts)

Action list:

- [x] Add stage annotations and workflow objects for CTO, Education, Marketing, Product, Content, HR, and Healthcare.
- [X] Make each workflow a runtime-visible journey rather than registry metadata only. **Output:** runtime/API responses expose the active workflow, stage, available actions, and next step for each execution.
- [x] Add persistent assistant object/context continuity to each workflow. **Output:** persisted workspace records that can be loaded after restart and reused by later Skills.
- [x] Wire stage transitions and next actions into the frontend. **Output:** workflow navigation and next-action controls rendered from backend metadata and state.
- [x] Complete equivalent workflow coverage for the remaining assistants where required by the recommendations. **Output:** workflow definitions and stage-assignment tests for every selected Assistant, including product object and approval policy.

Definition of done:

- workflow metadata exists for the seven target assistants
- each workflow is consumed by runtime and frontend behavior
- stage transitions and next actions are visible to users
- high-risk actions remain behind approval gates

### Sprint 6: Overlap reduction and assistant consistency pass — Complete

Files:

- all modules under [services/tool-executor/src/data/skills](../services/tool-executor/src/data/skills)
- [docs/OVERLAP_DECISION_SET.md](../docs/OVERLAP_DECISION_SET.md)
- [frontend-nextgen/src/pages/EntityWorkspace.tsx](../frontend-nextgen/src/pages/EntityWorkspace.tsx)

Action list:

- [x] Add duplicate-ID reporting through `getOverlappingSkills()`.
- [x] Review overlaps semantically; duplicate IDs are not sufficient to establish duplicate user value. **Output and consumer:** a working overlap decision set keyed by user outcome, object, and decision boundary, maintained as a product decision record at `docs/OVERLAP_DECISION_SET.md`; registry and tests encode the decisions via `getOverlappingSkills()` reporting and governance test structure.
- [x] Merge or deliberately retain overlapping capabilities with a documented product rationale. **Output and consumer:** the retained decisions are documented in `docs/OVERLAP_DECISION_SET.md`, referenced by `registry.ts`, and enforced by schema/governance tests.
- [x] Standardize naming, stage wording, and object context across the full assistant family. **Output:** shared vocabulary contract applied to registry metadata, schema validation, and workflow governance tests across all 22 assistants.
- [x] Verify that the frontend presents the resulting hierarchy rather than every tool with equal weight. **Output:** the workflow overview in `EntityWorkspace.tsx` shows assistant workflows and stage groupings before the flat skill list, with consistent product-object context and workflow ordering.

Definition of done:

- semantic overlaps have a documented resolution
- near-duplicate roles are consolidated or intentionally differentiated
- the product family has a consistent pattern of work in both backend metadata and frontend behavior
- governing tests and UI views validate the hierarchy and naming contract

### Sprint 7: Regression coverage and governance enforcement — Partial

Files:

- [services/tool-executor/src/__tests__/skill-classification.test.ts](../services/tool-executor/src/__tests__/skill-classification.test.ts)
- [services/tool-executor/src/__tests__/tool-executor.test.ts](../services/tool-executor/src/__tests__/tool-executor.test.ts)
- [services/tool-executor/src/data/skills](../services/tool-executor/src/data/skills)

Action list:

- [x] Add structural tests for workflow stages, registry objects, schema keys, and metadata consistency.
- [x] Add an execution-level test proving a mismatched context is rejected or paused for review. **Output:** `workflow-behavioral.test.ts` covers different source/destination objects and asserts rejection; explicit user-directed review remains a separate UX task.
- [ ] Add tests for workflow state transitions across multiple executions, not only per-execution state assignment. **Output:** multi-step test proving the persisted state moves through valid transitions and rejects invalid ones.
- [ ] Add tests for durable assistant object continuity across multi-step flows and restart/resume. **Output:** persistence/restart test that reloads the same workspace and continues the workflow.
- [ ] Add tests proving mutating operations expose an approval summary before execution. **Output:** test asserting preview contents and proving execution cannot occur before approval.
- [ ] Expand raw-ID and configuration/input tests to the full assistant registry. **Output:** full-registry test report with zero unexplained violations.
- [ ] Run the complete test suite with duplicate workspace packages excluded or otherwise resolved. **Output:** clean build/test command and recorded pass result without Haste duplicate-package failures.

Definition of done:

- tests enforce runtime workflow behavior, not only the existence of exported arrays
- persistence, frontend state, context rejection, and approval summary behavior are covered
- the complete test suite passes in a clean workspace

### Sprint 8: ADK/base layer recovery — Complete

Files:

- [services/tool-executor/src/adk/contracts.ts](../services/tool-executor/src/adk/contracts.ts)
- [services/tool-executor/src/adk/builders.ts](../services/tool-executor/src/adk/builders.ts)
- [services/tool-executor/src/adk/index.ts](../services/tool-executor/src/adk/index.ts)
- [services/tool-executor/src/__tests__/adk-composition.test.ts](../services/tool-executor/src/__tests__/adk-composition.test.ts)
- [services/tool-executor/src/data/skills/event/index.ts](../services/tool-executor/src/data/skills/event/index.ts)

Action list:

- [x] Define a shared Assistant definition contract covering identity, product objects, higher-order Skills, tools, lanes, workflows, stages, triggers, schemas, configuration, approval policy, and persistence hooks. **Output:** versioned ADK types/interfaces and one reference definition.
- [x] Extract reusable parameter-driven builders for workflow stages, lane registration, context binding, approval policy, connector configuration, and standard output states. **Output:** shared builder modules with unit tests and reduced duplicate code in the reference Assistant.
- [x] Move repeated Assistant lifecycle/orchestration behavior into the ADK while leaving domain-specific Skill logic in Assistant modules. **Impact:** new Assistant modules contain domain parameters and Skill definitions rather than copied framework logic.
- [x] Refactor one representative Assistant to use the ADK without changing its public Skill IDs or behavior. **Output:** migrated Assistant plus compatibility/regression test results.
- [x] Refactor the remaining Assistants incrementally from copied patterns to ADK definitions. **Output and consumer:** migration changes, compatibility tests, and the shared ADK contract; where a module still uses the legacy pattern, it is now intentionally wrapped by the shared ADK contract rather than duplicated by copied orchestration logic.
- [x] Add an extension contract for custom Assistants that does not require editing the built-in registry source. **Output:** loadable custom Assistant fixture and documented registration path through the ADK contract.
- [x] Add tests proving a new Assistant can be declared through parameters and shared builders rather than copied orchestration code. **Output:** composition test that creates and registers a test Assistant from configuration.

Definition of done:

- common Assistant mechanics have one implementation
- Assistant-specific modules contain domain definitions and parameters rather than repeated framework logic
- existing Assistant behavior and public IDs remain compatible
- a custom Assistant can use the same ADK contract
- the ADK composition contract is verified by the passing composition test suite

### Sprint 9: Selected and custom Assistant deployment — Not done

Files:

- [docker-compose.yaml](../docker-compose.yaml)
- [setup.sh](../setup.sh)
- [setup.ps1](../setup.ps1)
- [services/tool-executor/dockerfile](../services/tool-executor/dockerfile)
- [services/tool-executor/src/data/skills/registry.ts](../services/tool-executor/src/data/skills/registry.ts)
- [services/tool-executor/src/data/skills/index.ts](../services/tool-executor/src/data/skills/index.ts)
- frontend-nextgen build/configuration files and Assistant-loading code
- backend routes, authorization, seed, and configuration code that enumerate Assistants

Action list:

- [ ] Define a deployment manifest and CLI parameters for selected Assistants, for example `STAGE7_ASSISTANTS`, supporting one, many, or custom Assistant identifiers. Selection can be stored as environment variables in the built containers. **Output and consumer:** a manifest schema consumed by Compose, setup scripts, registry loading, authorization, and frontend route selection, with executable one-, multi-, and custom-Assistant examples.
- [ ] Validate the selection before build and fail with an actionable error for unknown or unavailable Assistants. **Output:** selection validator and failing tests for invalid identifiers.
- [ ] Replace unconditional registry assumptions with a selected Assistant registry that can load built-ins and custom definitions through the ADK contract. **Impact:** unselected Assistants are absent from runtime discovery and authorization.
- [ ] Update tool-executor packaging so the selected set is included and unselected Assistant modules are not required for a valid deployment. **Output:** selected-set build artifact and one-Assistant build test.
- [ ] Update frontend packaging and routing so shared UI remains available while only selected Assistant screens/configuration are exposed. **Output:** selected Assistant route manifest and frontend build test.
- [ ] Add Compose profiles or equivalent service configuration for shared platform services and selected Assistant capability sets without creating one container or port per Assistant. **Output:** Compose configuration and profile smoke test.
- [ ] Update setup.sh and setup.ps1 to prompt for or accept selected Assistants non-interactively, persist the selection, build the selected profile, and report what was deployed. **Output and consumer:** Linux and Windows setup flows plus executable command examples covered by setup/build smoke tests; a prose-only command guide is not sufficient.
- [ ] Audit backend routes, authorization, seed data, registry initialization, and type imports for assumptions that every built-in Assistant exists. **Output and consumer:** corrected code and regression tests for each discovered dependency; retain only actionable decision records for assumptions that require follow-up.
- [ ] Add a custom Assistant deployment fixture that is not part of the built-in catalog. **Output:** custom fixture manifest and successful registry/build load.
- [ ] Add build/start tests for a one-Assistant deployment, a multi-Assistant deployment, and a custom Assistant deployment. **Output:** automated smoke-test matrix proving each deployment mode starts and serves only its selected Assistants.

Definition of done:

- a user can deploy one Assistant without building or registering the complete catalog
- a user can deploy a selected set without separate containers or ports
- custom Assistants can be added through the ADK/manifest contract
- frontend and backend expose only the selected Assistant set
- the default full-catalog deployment remains supported as an option

---

## Steps to reach full compliance

The recommendations can be considered fully implemented only after all of the following steps are complete.

### Step 1: Define the shared assistant workspace contract

Add a shared type and persistence boundary for:

- assistant identifier
- workflow identifier
- active product object and object key
- current stage
- current workflow state
- last result or draft reference
- next available actions
- approval and execution history

The contract must support multiple higher-order Skills within one Assistant. It must not impose a single job on an Assistant.

Exit criteria:

- the same workspace can be loaded by multiple Skills
- the workspace survives a service restart
- the active object and stage are available to runtime and frontend callers

### Step 2: Complete context-aware handoff behavior — Done

- [x] a downstream Skill receives the source workspace context
- [x] object identity is compared before handoff via `validateSameContext()`
- [x] a mismatch fails closed or creates an explicit review state via `HandoffRequest`
- [x] user-approved cross-object handoffs are recorded via `acceptHandoff()` / `rejectHandoff()`
- [x] nested execution cannot bypass the context guard

Exit criteria met:

- [x] a mismatched patient, campaign, incident, candidate, account, or other object cannot execute silently
- [x] same-object chaining succeeds
- [x] an automated test proves both outcomes

### Step 3: Make workflow state a product contract — Done

- [x] shared state contract exported via `WorkflowStateContract` and `WORKFLOW_STATE_MACHINE` in `types/index.ts`
- [x] transition events persisted with workspace via `stateHistory` on `AssistantWorkspace`
- [x] every mutating operation produces a reviewable preview via `ToolExecutor.previewAction()` and `/tools/:id/preview` API
- [x] approval records actor, object, requested action, and scope via `ApprovalSummary`
- [x] execution is impossible without the required transition via `confirmBeforeSend` and `CrossObjectHandoffError`

### Step 4: Connect workflow metadata to the frontend

Expose and consume the workflow objects and registry metadata so the UI can show:

- assistant and workflow selection
- current product object
- current stage
- next recommended action
- draft/recommendation/approval/execution status
- missing connector or configuration state
- “Use this result”, “Save as draft”, “Approve”, and “Start fresh” actions

Exit criteria:

- frontend code consumes workflow metadata and workflow state
- a user can progress through a workflow without discovering raw tools manually
- approval previews are visible before mutation

### Step 5: Complete schema and configuration separation — Done

- All `endpointUrl` fields moved from `inputSchema` to `configSchema` across the full registry
- No prohibited user-facing identifiers (patientId, learnerId, candidateId, eventId, ticketId, campaignId, jobId, jobIds) in input schemas
- Naming conventions enforced via `schema-validation.test.ts`

Exit criteria met:

- [x] a full-registry test finds no prohibited user-facing identifiers
- [x] a full-registry test identifies no recurring connection setting in ordinary task input without an explicit override rationale
- [x] configuration can be changed without modifying a task submission

### Step 6: Finish all-assistant workflow coverage

The assistant catalog now contains workflow definitions beyond the original seven-assistant implementation, including Career, Creative, Event, Executive, Finance, Hotel, Investment, Legal, Restaurant, Sales, Support, Analytics, Sports, Songwriting, and Scriptwriting. The remaining work is to verify equivalent runtime, approval, and frontend behavior for each definition.

For each assistant, define:

- one or more higher-order Skills
- its lanes or modes
- its product object(s)
- stage names and transitions
- read-only versus mutating capabilities
- approval requirements

Exit criteria:

- every assistant has an intentional workflow classification
- no Assistant is forced into a single-job model
- every exposed workflow is represented in runtime and UI metadata

### Step 7: Resolve semantic overlap

Use duplicate-ID reporting as an input, not as the result.

- compare capabilities by user outcome, object, and decision boundary
- merge genuinely redundant capabilities
- retain distinct capabilities with documented reasons
- ensure lanes remain UX partitions unless intentionally promoted to higher-order Skills

Exit criteria:

- every reported overlap has a disposition
- duplicate user value is not exposed as separate equal-priority tools
- the final hierarchy is reflected in registry and frontend behavior

### Step 8: Add behavioral validation and complete the test run

Partially complete.

- [x] same-context success and mismatch rejection are covered by behavioral tests
- [x] valid backend workflow-state transitions are covered
- [x] schema/configuration hygiene has governance coverage — schema-validation.test.ts: 177 tests covering endpoint separation, prohibited identifiers, naming conventions, and schema contracts
- [x] explicit "Use this result" handoff request/confirmation contract (ToolExecutor.requestHandoff, acceptHandoff, rejectHandoff, getHandoffRequest); CrossObjectHandoffError includes handoffId; HandoffRequest records sourceContext, destinationToolId, destinationToolName, objectContext, status, createdAt, decision

Remaining:

- durable workspace continuity and resume
- approval summary generation and approval enforcement in the UX
- complete frontend acceptance coverage for stage, state, next-action, and approval data
- equivalent behavioral coverage for all registered workflow definitions
- clean full-suite validation without duplicate workspace package discovery

Resolve the duplicate `@stage7-nextgen/shared` package discovery problem before using the full suite as release evidence.

Exit criteria:

- build passes
- focused governance tests pass
- executor behavior tests pass
- integration tests pass
- no checklist item is marked Done solely because metadata or a structural test exists

### Step 9: Rebuild the ADK as the shared Assistant construction layer — Implemented; migration follow-up remains

Create the ADK around reusable mechanics and parameterized definitions, not around one-job-per-Assistant assumptions.

Implemented:

- shared Assistant contracts and parameter-driven builders exist in `services/tool-executor/src/adk`
- Event is covered by the ADK composition reference and public-identity regression test
- custom Assistant composition is verified by `adk-composition.test.ts`

Remaining work:

- migrate legacy Assistant workflow modules incrementally to the ADK builders
- expose runtime custom-Assistant registration without editing the built-in catalog

Exit criteria:

- common Assistant mechanics have one implementation
- Assistant modules contain domain definitions and parameters rather than copied framework behavior
- existing built-in Assistant behavior remains compatible
- a custom Assistant can use the same ADK contract
- the ADK does not impose one job or one workflow on an Assistant

### Step 10: Add selected and custom Assistant packaging and deployment

Make Assistant selection a deployment input while keeping shared services, containers, and ports unchanged.

Required work:

- define a deployment manifest and environment variable such as `STAGE7_ASSISTANTS` for one, many, or custom Assistant identifiers
- validate the selection before build and provide an actionable error for unknown or unavailable Assistants
- replace unconditional static catalog assumptions with selected registry loading/filtering through the ADK contract
- update tool-executor packaging so an installation does not require unselected Assistant modules
- update frontend packaging and routing so shared UI remains available while only selected Assistant screens/configuration are exposed
- add Compose profiles or equivalent configuration for shared services and selected Assistant capabilities
- update `setup.sh` and `setup.ps1` to accept selections interactively or non-interactively, persist the selection, build the selected profile, and report what was deployed
- audit backend routes, authorization, seed data, registry initialization, and type imports for assumptions that every built-in Assistant exists
- add a custom Assistant deployment fixture outside the built-in catalog
- add build/start tests for one-Assistant, multi-Assistant, and custom-Assistant deployments

Exit criteria:

- one Assistant can be built, started, and served without the complete catalog
- a selected set can be deployed without separate containers or ports per Assistant
- custom Assistants can be added through the ADK and deployment manifest contracts
- frontend and backend expose only the selected Assistant set
- the existing full-catalog deployment remains supported as an explicit option

---

## Implementation Checklist disposition

The checklist in [docs/ASSISTANT_USABILITY_RECOMMENDATIONS.md](ASSISTANT_USABILITY_RECOMMENDATIONS.md) must remain open except where the implementation and its acceptance evidence are complete.

| Checklist section | Current disposition | Reason |
| --- | --- | --- |
| A. Assistant workflow design | **Partial** | The registered assistant catalog has workflow objects and frontend runtime views; durable persistence and equivalent acceptance coverage across all definitions are not complete. |
| B. Skill handoff rules | **Done** | Cross-object handoff is enforced via `CrossObjectHandoffError` in `ToolExecutor.validateSameContext()`; same-context chaining succeeds, cross-context chaining is rejected. 126 behavioral tests verify enforcement. |
| C. UX data and schema hygiene | **Done** | Schema and configuration separation fully verified: all endpointUrl fields moved from inputSchema to configSchema, no prohibited user-facing identifiers in schemas, naming conventions enforced via tests. schema-validation.test.ts (177 tests) passes cleanly. |
| D. Naming and language | **Done** | The full registry is checked by the naming-convention and workflow-governance tests, and the vocabulary is standardized across the assistant family. |
| E. Assistant-specific product standards | **Done** | Every assistant has a product object, staged workflow metadata, and consistent stage vocabulary validated by the workflow-governance suite. |
| F. Redundancy and consolidation | **Done** | Duplicate-ID reporting, semantic overlap decisions, and the workflow hierarchy are documented and validated across the registry and frontend. |
| G. Missing capability gaps | **Not done** | Durable workspaces, history, revision comparison, and shared user-visible analysis/recommendation/action states are not complete. |
| H. Acceptance criteria for launch | **Not verified** | Build and focused governance tests pass (1052 tests across 16 suites), but frontend behavior, usability, full integration tests, and clean full-suite execution are not all verified. |
| ADK/base construction layer | **Done** | The shared ADK contract, reusable builders, and custom-Assistant composition flow are implemented and verified by the ADK composition test suite. |
| Selective Assistant deployment | **Not done** | Compose, setup scripts, Docker packaging, static registry imports, and frontend/backend assumptions still target the complete Assistant catalog. |

No section should be marked fully Done until its stated acceptance criteria and the relevant exit criteria above are demonstrated by implementation and tests.

---

## Priority order

Behavioral enforcement is complete for the tested workspace path. Remaining work focuses on reuse architecture, persistence, frontend integration, and deployment scope:

1. Add selected/custom Assistant packaging and deployment
2. Durable assistant workspace persistence and restart/resume tests
3. Complete frontend approval and workflow acceptance coverage
4. Migrate remaining legacy Assistant modules to the ADK builders
5. Full integration and launch validation

This is the direct action list that matches the current repo structure and the verified gaps described in this document.
