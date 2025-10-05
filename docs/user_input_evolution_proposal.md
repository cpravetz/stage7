# Proposal: Evolving User Input from Agent Blocking to Step-Level Concurrency

## 1. Introduction

This document analyzes the current user input mechanism and proposes a significant architectural evolution from the existing **agent-blocking** model to a more efficient, **step-level concurrency** model. The goal is to enable agents to continue working on parallel tasks while one specific task awaits user input, dramatically increasing agent efficiency and responsiveness.

## 2. Current Implemented State: Agent-Level Blocking

A review of `services/agentset/src/agents/Agent.ts` confirms that the system currently operates on an agent-blocking model:

-   **Agent Status is the Blocker:** When a step requires user input, the agent's own status is set to `AgentStatus.WAITING_FOR_USER_INPUT`.
-   **Execution Loop Halts:** The agent's main work loop (`runUntilDone`) is conditioned on the agent's status being `RUNNING`. When the status changes, the loop terminates, and all work on the agent's plan ceases.
-   **External Resumption:** The agent remains completely idle until an external `USER_INPUT_RESPONSE` message is received. This message handler is responsible for resetting the agent's status to `RUNNING` and restarting the execution loop.

This model is robust but inefficient, as it prevents the agent from performing any other work—even on independent branches of its plan—while it waits.

## 3. Proposed Evolution: Step-Level Blocking for Concurrent Execution

The vision is to evolve the agent from a single-threaded process into a **task scheduler for its own plan**. When one task (a step) is blocked on external I/O (like user input), the agent should be capable of executing other ready tasks.

This moves the "waiting" state from the agent to the individual step, unlocking the potential for significant parallelism within a single agent's workflow.

### A. Redefine Agent and Step Status (Proposed Change)

The status enums that govern execution flow must be updated:

1.  **`AgentStatus`:** The `WAITING_FOR_USER_INPUT` state should be removed. An agent should remain `RUNNING` as long as it has work to do.
2.  **`Step.status`:** A new status, `WAITING_FOR_USER_INPUT`, will be added to the `Step` status model to track blocked tasks at a granular level (currently, a generic `WAITING` status is used).

### B. Evolve the `runAgent()` Execution Loop (Proposed Change)

This is the most significant change. The `runAgent()` method in `Agent.ts` must be refactored from a batch processor that halts into a continuous task scheduler.

On each execution "tick," the new loop will:

1.  **Identify Ready Steps:** Scan the agent's entire list of steps and identify all that are in the `PENDING` state.
2.  **Check Dependencies:** For each `PENDING` step, validate that all of its dependencies have a status of `COMPLETED`.
3.  **Execute Concurrently:** Execute all steps that are now considered "ready." These steps can be dispatched for execution concurrently.
4.  **Continue Loop:** The `runAgent()` loop will continue as long as there are `PENDING` or `RUNNING` steps. The agent only completes when all steps are resolved.

### C. Update the User Input Response Handler (Proposed Change)

The backend logic that handles the user's response will be simplified:

-   The handler will no longer change the agent's status.
-   It will simply locate the specific step marked as `WAITING_FOR_USER_INPUT`, update its result, and change its status to `COMPLETED`.
-   The `runAgent()` scheduler, on its next tick, will automatically see that this step is now complete and proceed to execute any newly unblocked dependent tasks.

## 4. Existing Recommendations (Still Valid)

The following recommendations from the original analysis remain high-value improvements:

-   **Timeout Mechanism:** A timeout should be initiated when a *step* enters the `WAITING_FOR_USER_INPUT` state. If the timer expires, only that step and its dependent branches should fail, not the entire agent.
-   **UI Enhancements:** The recommendations to clear the input field on new questions and to add Markdown support for question formatting are still valid and improve the user experience.

## 5. Conclusion

Transitioning from agent-level to step-level blocking is a critical architectural evolution. It moves our agents from simple sequential processors to sophisticated, concurrent task schedulers. This change will significantly boost agent efficiency and is a foundational requirement for handling more complex, multi-faceted plans in the future.