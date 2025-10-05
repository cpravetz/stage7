# Proposal: Distinguishing Interim Work Products from Final Deliverables

## 1. Introduction

Currently, the mission outputs or "Shared Files" folder becomes populated with all intermediate work products generated during a plan's execution. This includes temporary files, formatted data for the next step, and partial results. This clutters the user-facing output directory, making it difficult to identify the actual, final deliverables of a mission. The file naming is also generic (e.g., `step_9_prioritizedEnhancements.txt`), lacking user-friendly context.

This proposal outlines a strategy to differentiate between **interim work products** (internal data passed between steps) and **final deliverables** (the polished outputs intended for the user), and to handle each accordingly.

## 2. Analysis of Current State

-   **Indiscriminate Saving:** The current agent logic saves the result of almost every step to a shared file space. While useful for debugging, this is not ideal for user presentation.
-   **Generic Naming:** Files are named programmatically based on their step number and output name, which lacks semantic meaning for the end-user.
-   **Implicit Distinction:** The system uses `outputType` (`Interim`/`Final`) and `scope` (`AgentStep`/`MissionOutput`) in its internal messaging. This is a good starting point but does not currently control what is saved as a user-facing file.

**The core gap is the lack of an explicit mechanism, either defined by the planner or inferred by the system, to identify an output as a final, user-centric deliverable.**

## 3. Proposed Solution: Explicit Deliverable Declaration

To solve this, I propose enhancing the plan schema to allow the planner (the `ACCOMPLISH` LLM) to explicitly declare which outputs are final deliverables.

### 3.1. Schema Enhancement

I propose adding two new optional properties to the `outputs` objects within a plan step:

1.  `isDeliverable` (boolean): When `true`, this flag marks the output as a final deliverable intended for the user.
2.  `filename` (string): A user-friendly filename for the deliverable (e.g., `market_analysis_report.pdf`). This should be provided if `isDeliverable` is true.

**Example Schema:**

```json
{
  "number": 5,
  "actionVerb": "THINK",
  "description": "Analyze market data and generate a final report.",
  "inputs": { ... },
  "outputs": {
    "final_report": {
      "description": "A comprehensive report on market trends.",
      "isDeliverable": true,
      "filename": "2025-market-trends-report.md"
    }
  }
}
```

### 3.2. Planner (LLM) Prompt Enhancement

The system prompt for the `ACCOMPLISH` plugin's planning phase will be updated to instruct the LLM on how and when to use these new properties. The guidance will be:

-   "Identify the key final outputs of the plan that the user will want to see. For these specific outputs, set `isDeliverable` to `true`."
-   "When you mark an output as a deliverable, also provide a descriptive, user-friendly `filename` for it."
-   "Do not mark intermediate outputs that are only used as inputs for subsequent steps as deliverables."

### 3.3. System Implementation Logic

The agent's step execution logic will be updated to handle outputs based on these new properties:

1.  **When a step completes:** The agent will inspect the `outputs` definition for that step in the original plan.
2.  **If `isDeliverable` is `true`:**
    *   The output will be saved to the user-facing **Shared Files** directory.
    *   The system will use the provided `filename`. If the filename is missing, it will fall back to a sanitized version of the output name (e.g., `final_report.txt`).
3.  **If `isDeliverable` is `false` or not present:**
    *   The output will be treated as an **interim work product**.
    *   It will still be saved to the internal, step-specific storage for debugging, chaining, and reflection purposes.
    *   It will **not** be displayed in the primary "Shared Files" UI, thus keeping the user's view clean.

### 3.4. Heuristic Fallback (Backward Compatibility)

For older plans or cases where the LLM fails to use the new properties, we can apply a heuristic as a fallback:

-   **The "Orphan Output" Rule:** An output is automatically promoted to a deliverable if it is not consumed as an `input` by any subsequent step in the plan, with the exception of `REFLECT` steps which are known to consume all outputs for analysis.
-   This provides a safety net to ensure that final results are not missed, even in the absence of explicit declaration.

## 4. Conclusion

This multi-faceted approach combines the intelligence of the LLM planner with a robust system heuristic. It will:
-   De-clutter the user's view of mission outputs.
-   Provide user-friendly filenames for deliverables.
-   Maintain a clear distinction between internal work products and final results.
-   Be backward-compatible by using the heuristic for older plans.
