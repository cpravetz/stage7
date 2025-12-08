# Mission Failure Analysis & Remediation Plan (v3)

## 1. Executive Summary

The recurring mission failures stem from two independent, critical issues:

1.  **Invalid Plan Generation and Repair:** The core planner, driven by an LLM, consistently generates structurally invalid plans. The subsequent `REFLECT` and plan repair mechanisms also fail because they repeat the same mistakes. This is caused by overly strict validation logic and the LLM's failure to adhere to the specified plan schema.
2.  **Agent Delegation Deadlock:** When a valid plan *is* generated, the system hangs due to a bug in the inter-agent communication protocol. Status updates from delegated agents are sent with a missing `agentId`, preventing the primary agent from ever being notified of task completion, causing it to wait indefinitely.

This document details the root causes and provides specific, actionable recommendations to fix both problems.

## 2. Detailed Findings

### 2.1. Plan Validation & Repair Failures

The `plan_validator.py` script, used by both `ACCOMPLISH` and `REFLECT`, is the epicenter of the initial mission failures.

#### 2.1.1. Root Cause: Incorrect Type Coercion Logic

*   **Observation:** The validator throws `Type mismatch for input 'personas'. Expected 'string' but got 'object'`.
*   **Analysis:** The system is intended to allow object-to-string coercion for inputs, where the object is serialized into a JSON string. The current validation logic does not implement this, treating it as a hard failure. It correctly disallows `array` to `string` coercion, which should be handled by `FOREACH`.
*   **Impact:** Prevents otherwise valid plans from executing.

#### 2.1.2. Root Cause: Invalid `sourceStep: '0'` Usage by LLM

*   **Observation:** The validator throws `Input 'mission_context' references parent ('0'), but step has no parent`.
*   **Analysis:** `sourceStep: '0'` is a valid schema convention *within sub-plans* (e.g., inside a `FOREACH` loop) to refer to the parent step's context. The LLM is incorrectly generating this at the top level of a plan where no parent exists.
*   **Impact:** The validator correctly identifies this as a structural flaw, causing plan rejection. This is an LLM hallucination issue.

#### 2.1.3. Root Cause: Ineffective LLM Repair Strategy

*   **Observation:** The `cm.log.text` shows `LLM repair failed...`. The LLM, when asked to repair a plan, is either returning a malformed structure (e.g., a single step object instead of a full plan array) or fails to correct the underlying issue (like the `sourceStep: '0'` error).
*   **Analysis:** The prompts used in the repair cycle are not specific enough to guide the LLM to fix certain structural errors. The LLM needs explicit instructions on how to correct specific validation failures, such as the misuse of `sourceStep: '0'`.
*   **Impact:** The self-correction loop fails, even when the issue is theoretically fixable.

### 2.2. Agent Delegation Deadlock

This issue occurs in the second mission run after the initial `ACCOMPLISH` step successfully generates a multi-step plan involving multiple agent roles.

*   **Observation:** The primary agent delegates steps, then enters an infinite loop, printing `runAgent: Executable steps: None`. The `agentset.log.text` shows repeated `TaskDelegation received status update for agent undefined: undefined` messages.
*   **Analysis:** The architecture correctly uses RabbitMQ for inter-agent communication. However, the status update messages sent from the delegated agent are missing the `agentId`. The `TaskDelegation` service, which routes these messages, cannot deliver the notification to the correct primary agent because the sender is `undefined`. The primary agent, never receiving the completion event, remains stuck waiting for dependencies that, in its view, are still `running`.
*   **Impact:** Complete mission stall. The system cannot proceed past the first delegation.

## 3. Remediation Recommendations

### 3.1. Fix Plan Validator Type-Checking (High Priority)

*   **Action:** Modify `shared/python/lib/plan_validator.py`.
*   **Details:** In the `_check_type_compatibility` function (or equivalent), add logic to explicitly permit an `object` type to be passed as an input where a `string` is expected. The validator should assume the value will be JSON-serialized. **This change should NOT apply to arrays, which are handled by the `FOREACH` process.**

### 3.2. Enhance Plan Repair Prompt for `sourceStep: '0'` error (Medium Priority)

*   **Action:** Update the repair prompt generation logic in `shared/python/lib/plan_validator.py`.
*   **Details:** When a `references parent ('0'), but step has no parent` error is detected, the prompt sent to the LLM for plan repair must include a specific, explicit instruction: "The plan failed because a step incorrectly used `sourceStep: '0'`. This reference is only valid inside a sub-plan (like `FOREACH`). You must correct this by either removing the input or pointing it to a valid, previously defined step ID."

### 3.3. Correct Agent Status Update Payload (Critical)

*   **Action:** Investigate and fix the `agent.status.update` publishing logic, likely in `services/agentset/src/agents/Agent.ts`.
*   **Details:** The code responsible for publishing status updates via RabbitMQ must be corrected to include the `agentId` in the message payload. This will ensure the `TaskDelegation` service can route the completion notification back to the correct waiting agent, resolving the deadlock.

### 3.4. Long-Term: Fine-Tune LLM for Plan Generation (Low Priority)

*   **Action:** Collect failed plan generation and repair examples.
*   **Details:** While the above are immediate fixes, the ideal long-term solution is to fine-tune the planning model on examples of valid and invalid plan structures. This will reduce the frequency of the initial errors and lessen the reliance on the programmatic repair loop.

