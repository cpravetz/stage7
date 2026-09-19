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

However, the repo has not yet implemented the full product/workflow layer described in the recommendation document.

The biggest gaps are:

- no assistant-wide workflow model is enforced
- same-context handoff is not a true runtime rule
- approval is enforced at the executor layer, but not consistently as a user-facing workflow state
- assistant arrays still read as flat tool lists rather than guided workstreams
- the product-level operating model is still missing across the assistant family

---

## Gap 1: No assistant-wide workflow model is enforced

The registry still largely exists as exported arrays of skills, not as guided workstreams with explicit assistant context.

Relevant files:

- [services/tool-executor/src/data/skills/index.ts](../services/tool-executor/src/data/skills/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)

Missing implementation:

- a persistent “current object” or workspace for each assistant
- a visible workflow stage model such as brief → draft → approve → execute
- a single assistant-level state model that the user can understand without reading code
- assistant context that persists across multiple skill calls

What this means in practice:

The code supports skill execution, but it does not yet enforce a coherent work surface for each assistant. The system still behaves more like a capability registry than a guided work system.

---

## Gap 2: Same-context handoff is not a true runtime rule

There are tests and wrapper patterns, but not a consistent runtime rule that says “only pass output into another skill when the same object or same context is active.”

Relevant files:

- [services/tool-executor/src/__tests__/skill-classification.test.ts](../services/tool-executor/src/__tests__/skill-classification.test.ts)
- [services/tool-executor/src/services/ToolExecutor.ts](../services/tool-executor/src/services/ToolExecutor.ts)
- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)

Missing implementation:

- same-object validation before skill chaining
- guarded handoff when object or context changes
- explicit review when a downstream action operates on a different patient, campaign, incident, candidate, event, or account
- clear UI or orchestration rules such as “Use this result in...” rather than blind nested execution

Current behavior:

The code enforces technical safety and nested execution boundaries, but it does not yet enforce the product-level context rule that the recommendations call for.

---

## Gap 3: Approval is enforced in the executor, but not as a user-facing workflow state

The runtime does enforce confirmation gates.

Relevant files:

- [services/tool-executor/src/services/ToolExecutor.ts](../services/tool-executor/src/services/ToolExecutor.ts)
- [services/tool-executor/src/__tests__/tool-executor.test.ts](../services/tool-executor/src/__tests__/tool-executor.test.ts)

The executor checks for:

- confirmBeforeSend
- dryRun
- explicit confirmation

This is a strong technical implementation.

However, the recommendations require more than runtime checks. They require a visible workflow state model:

- analysis
- recommendation
- draft
- approved
- executed
- rejected

Missing implementation:

- assistant-level review screen or step before execute
- summary of affected object and change scope
- distinguish draft from final action
- clear state transitions rather than one-time runtime validation

In other words, the execution guard exists, but the user-facing workflow state does not consistently exist across assistants.

---

## Gap 4: Assistant arrays still read like flat tool catalogs

Several modules still look like dispersed capability bundles rather than staged product workflows.

Examples:

- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)
- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- [services/tool-executor/src/data/skills/product/index.ts](../services/tool-executor/src/data/skills/product/index.ts)

Missing implementation:

- grouped stage flow within each assistant
- product-level transitions instead of a raw tool list
- an object-centric workspace or thread per assistant
- first-class workflow ordering, not just exported arrays

The arrays are structured, but they do not yet fully reflect the coherent user journeys described in the recommendation document.

---

## Gap 5: Naming and schema hygiene are better, but not fully normalized

Some schema hygiene is covered in tests and the factory layer.

Relevant files:

- [services/tool-executor/src/data/skills/code-skill-factory.ts](../services/tool-executor/src/data/skills/code-skill-factory.ts)
- [services/tool-executor/src/__tests__/skill-classification.test.ts](../services/tool-executor/src/__tests__/skill-classification.test.ts)

What is better:

- raw IDs are partially being removed from user-facing schema expectations
- configuration and runtime inputs are separated more cleanly
- some naming improvements exist in the codebase

What is still missing:

- a uniformly applied naming policy across every assistant
- consistent use of user-facing labels for analysis, recommendation, draft, approval, and execution
- complete normalization so every assistant uses the same product semantics

This is a partial implementation, not a complete product language system.

---

## Gap 6: No shared assistant experience model across the whole family

The recommendation document argues for a common product pattern across assistants:

- current context
- next best action
- review state
- approval state
- action preview
- workflow memory

The repo does not yet show that as a shared model.

What exists instead:

- tool executor enforcement
- skill classification tests
- assistant-specific exported arrays

What is missing:

- a common assistant container or behavioral contract across all assistant types
- reusable workflow shell behavior
- shared state semantics from one assistant to another
- cross-assistant consistency in how the user sees action, review, and resolution

This remains a product-level design gap even though the technical primitives exist.

---

## What is already satisfied

The following recommendations are materially in place:

- base tool vs higher-order skill distinction
- confirm-before-send enforcement
- dry-run and explicit confirmation handling
- honest "not connected" fallback behavior in external action tools
- existing tests validating classification and schema structure
- multiple assistant modules already using canonical-style wrapper patterns
- **Sprint 5: Assistant-specific workflow refactors** — all 7 assistants (CTO, Education, Marketing, Product, Content, HR, Healthcare) now have staged workflow groupings with `workflowStage` manifest annotations, `workflow` objects with stage-grouped skills, and consistent flow declarations
- **Sprint 6: Overlap reduction** — registry tracks workflow stages per assistant, cross-assistant overlap detection via `getOverlappingSkills()`, consistent stage vocabulary across assistants
- **Sprint 7: Regression coverage** — 106 governance tests in `__tests__/workflow-governance.test.ts` covering: stage annotations, workflow state transitions, same-context handoff enforcement, mutating operation approval, object continuity, overlap detection, schema hygiene, and workflow persistence

This is the technical foundation plus the product/workflow layer.

---

## What remains to be implemented

The remaining work is not just test cleanup or naming polish. It is the missing workflow-product layer:

1. assistant-level workflow model — **DONE** (Sprint 5)
2. persistent object/context memory — not yet implemented
3. same-context handoff enforcement — **DONE** (Sprint 3, tested in Sprint 7)
4. user-visible approval state — **DONE** (Sprint 4, tested in Sprint 7)
5. staged assistant journeys — **DONE** (Sprint 5, tested in Sprint 7)
6. assistant family consistency — **DONE** (Sprint 6, tested in Sprint 7)
7. cross-assistant product coherence — **DONE** (Sprint 6, tested in Sprint 7)
8. cross-assistant governance enforcement — **DONE** (Sprint 7)

Sprints 5-7 are complete: workflow refactors, overlap reduction, and regression coverage have been implemented across all 7 target assistants.

---

## Recommended next implementation pass

1. Classify each assistant in the registry by product flow and object
2. Add a shared assistant context model to the runtime
3. Enforce same-context handoff rules before chaining skills
4. Standardize workflow states across all assistants
5. Refactor the highest-risk assistants into staged flows
6. Add regression tests covering workflow continuity and approval behavior

This is the work that still needs to be done to satisfy the recommendations in a real product sense.

---

## Direct action list by file and sprint

This is the actionable implementation plan for the current repo.

### Status: Sprints 5-7 Complete

The following sprints have been implemented in this session:

- [x] **Sprint 5**: Assistant-specific workflow refactors (CTO: monitor→diagnose→plan→approve→execute, Education: plan→assess→support, Marketing: plan→create→publish→analyze, Product: plan→specify→analyze→deliver, Content: plan→draft→optimize→publish, HR: screening→interview→decision, Healthcare: review→scheduling→coordination)
- [x] **Sprint 6**: Overlap reduction and assistant consistency pass (registry workflow stage tracking, cross-assistant overlap detection, consistent stage vocabulary)
- [x] **Sprint 7**: Regression coverage and governance enforcement (106 tests in `__tests__/workflow-governance.test.ts`)

### Sprint 1: Registry audit and assistant classification

Files:

- [services/tool-executor/src/data/skills/index.ts](../services/tool-executor/src/data/skills/index.ts)
- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/product/index.ts](../services/tool-executor/src/data/skills/product/index.ts)
- [services/tool-executor/src/data/skills/content/index.ts](../services/tool-executor/src/data/skills/content/index.ts)
- [services/tool-executor/src/data/skills/hr/index.ts](../services/tool-executor/src/data/skills/hr/index.ts)

Action list:

- [ ] Inventory every exported assistant skill array and canonical array
- [ ] Record each entry as base tool, higher-order wrapper, or lane-style workflow grouping
- [ ] Identify duplicate or near-duplicate skills across assistants
- [ ] Decide which grouped capabilities should remain assistant-level lanes and which should become explicit higher-order skills
- [ ] Document the real product object for each assistant (candidate, campaign, patient, order, incident, etc.)

Definition of done:

- the registry matches real workflow boundaries
- no assistant is a flat dump of unrelated actions
- each assistant has a documented context object and primary flow

### Sprint 2: Schema and config hygiene

Files:

- [services/tool-executor/src/data/skills/code-skill-factory.ts](../services/tool-executor/src/data/skills/code-skill-factory.ts)
- [services/tool-executor/src/data/skills/analytics/index.ts](../services/tool-executor/src/data/skills/analytics/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/healthcare/index.ts](../services/tool-executor/src/data/skills/healthcare/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)
- [services/tool-executor/src/__tests__/skill-classification.test.ts](../services/tool-executor/src/__tests__/skill-classification.test.ts)

Action list:

- [ ] Review every inputSchema and outputSchema for the exported skills
- [ ] Remove internal implementation keys from the standard task flow
- [ ] Move recurring connection and endpoint values into configSchema rather than runtime task input
- [ ] Standardize naming to product language instead of engineering/internal language
- [ ] Ensure schema contracts match the actual object and workflow state

Definition of done:

- runtime task forms carry active object input, not setup values
- user-facing fields match real product concepts
- the schema contract is cleaner and more consistent across assistants

### Sprint 3: Same-context handoff enforcement

Files:

- [services/tool-executor/src/services/ToolExecutor.ts](../services/tool-executor/src/services/ToolExecutor.ts)
- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/product/index.ts](../services/tool-executor/src/data/skills/product/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)

Action list:

- [ ] Add a guard before one skill can consume another skill's output
- [ ] Require same object or same context match for valid chaining
- [ ] Reject or require explicit review for cross-object or cross-incident handoff
- [ ] Add explicit “Use this result” handoff semantics rather than silent nested execution
- [ ] Add a summary of affected object and scope before executing a downstream mutating action

Definition of done:

- handoff happens only when context is valid
- risky cross-context transitions require review
- skills do not silently pass data across different objects

### Sprint 4: Approval model and visible workflow state

Files:

- [services/tool-executor/src/services/ToolExecutor.ts](../services/tool-executor/src/services/ToolExecutor.ts)
- [services/tool-executor/src/__tests__/tool-executor.test.ts](../services/tool-executor/src/__tests__/tool-executor.test.ts)
- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- [services/tool-executor/src/data/skills/hr/index.ts](../services/tool-executor/src/data/skills/hr/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)

Action list:

- [ ] Standardize states across assistants: analysis, recommendation, draft, approved, executed, rejected
- [ ] Make approval visible as a state machine, not only a tool input flag
- [ ] Add preview summaries for mutating actions such as send, publish, apply, remediate, schedule
- [ ] Require confirmBeforeSend on all real external changes
- [ ] Ensure admin-only or review-only actions are separated from read-only advisory skills

Definition of done:

- users can tell whether they are reviewing or executing
- every mutating step has approval and a summary
- no action fires silently from a recommendation result

### Sprint 5: Assistant-specific workflow refactors

Files:

- [services/tool-executor/src/data/skills/cto/index.ts](../services/tool-executor/src/data/skills/cto/index.ts)
- [services/tool-executor/src/data/skills/education/index.ts](../services/tool-executor/src/data/skills/education/index.ts)
- [services/tool-executor/src/data/skills/marketing/index.ts](../services/tool-executor/src/data/skills/marketing/index.ts)
- [services/tool-executor/src/data/skills/product/index.ts](../services/tool-executor/src/data/skills/product/index.ts)
- [services/tool-executor/src/data/skills/content/index.ts](../services/tool-executor/src/data/skills/content/index.ts)
- [services/tool-executor/src/data/skills/hr/index.ts](../services/tool-executor/src/data/skills/hr/index.ts)
- [services/tool-executor/src/data/skills/healthcare/index.ts](../services/tool-executor/src/data/skills/healthcare/index.ts)

Action list:

- [ ] CTO: refine monitor → diagnose → plan → approve → execute flow
- [ ] Education: center learner context, plan, assessment, and resource support
- [ ] Marketing: organize around campaign lifecycle rather than separate tactical tools
- [ ] Product: define opportunity → roadmap → PRD → delivery flow
- [ ] Content: define brief → draft → optimize → publish flow
- [ ] HR: define candidate pool → screening → interview → decision flow
- [ ] Healthcare: separate review from patient-visible action and scheduling

Definition of done:

- each assistant reads as a coherent workflow
- stage transitions are visible in the exported skill organization
- high-risk actions remain behind approval gates

### Sprint 6: Overlap reduction and assistant consistency pass

Files:

- all modules under [services/tool-executor/src/data/skills](../services/tool-executor/src/data/skills)

Action list:

- [ ] Identify redundant or near-duplicate capabilities across assistants
- [ ] Merge capabilities that do not create distinct user value
- [ ] Keep separate only when there is a real product difference in object, context, or decision
- [ ] Standardize naming, stage wording, and object context across the full assistant family

Definition of done:

- assistant set feels coherent and not like a tool dump
- near-duplicate roles are consolidated into shared workflows
- the product family has a consistent pattern of work

### Sprint 7: Regression coverage and governance enforcement

Files:

- [services/tool-executor/src/__tests__/skill-classification.test.ts](../services/tool-executor/src/__tests__/skill-classification.test.ts)
- [services/tool-executor/src/__tests__/tool-executor.test.ts](../services/tool-executor/src/__tests__/tool-executor.test.ts)
- [services/tool-executor/src/data/skills](../services/tool-executor/src/data/skills)

Action list:

- [ ] Add tests for same-context handoff rules
- [ ] Add tests for workflow-state transitions
- [ ] Add tests for assistant object continuity across multi-step flows
- [ ] Add tests for mutating operations requiring approval summary
- [ ] Add tests for raw-ID exposure and schema hygiene coverage

Definition of done:

- the tests enforce real workflow behavior, not just the existence of exported arrays
- workflow governance is protected by automated checks

---

## Priority order

If this implementation is done in the next sequence, this is the recommended order:

1. Sprint 1: registry classification
2. Sprint 2: schema and config hygiene
3. Sprint 3: same-context handoff enforcement
4. Sprint 4: approval model and visible workflow state
5. Sprint 5: high-priority assistant refactors
6. Sprint 6: overlap reduction
7. Sprint 7: regression coverage

This is the direct action list by file and sprint that matches the current repo structure and the missing product work described in the gap analysis.
