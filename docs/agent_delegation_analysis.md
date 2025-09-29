# Agent Delegation Analysis and Recommendations

## Current Delegation Logic in `services/agentset/src/agents/Agent.ts`

The current delegation mechanism is implemented within the `executeStep` method of the `Agent` class. A step is considered for delegation under the following conditions:

1.  **`step.recommendedRole` is defined:** The step has an explicit role recommendation.
2.  **`step.recommendedRole` is different from the current agent's `this.role`:** The current agent is not the primary specialist for this step.
3.  **The current agent is not a 'coordinator':** Coordinator agents are exempt from delegating individual steps, implying they are meant to orchestrate.

The delegation process, handled by the `delegateStepToSpecializedAgent` function, involves:

*   **Finding or Creating a Specialized Agent:** The system first attempts to locate an existing agent with the `step.recommendedRole` within the same mission. If none is found, a new specialized agent is dynamically created.
*   **Constructing a Delegation Request:** A `TaskDelegationRequest` object is built, encapsulating the details of the individual step (action verb, description, inputs, outputs, dependencies, etc.).
*   **Sending the Request:** This request is sent to the `AgentSet` service, which then forwards it to the designated specialized agent.
*   **Status Update:** If the delegation is accepted, the original step's status is updated to `StepStatus.SUB_PLAN_RUNNING`, and a mapping between the delegated task ID and the original step ID is maintained.

**Brain's Role in Role Recommendation:**

The `useBrainForReasoning` function demonstrates that the Brain can indeed provide `recommendedRole` suggestions. Specifically, in scenarios where the Brain generates a `recovery_plan` due to low confidence, it can include `ActionVerbTask` objects (representing individual steps) with an assigned `recommendedRole` (e.g., 'critic'). This indicates the Brain's capability to suggest roles at the granular step level.

## Analysis of Current Approach (Step-Level Delegation)

### Pros:

*   **Fine-Grained Specialization:** Allows for precise offloading of tasks to agents best suited for a particular action verb or skill.
*   **Dynamic Adaptability:** The system can create new specialized agents on demand if no existing agent matches the required role, enhancing flexibility.
*   **Clear Ownership:** Each delegated step has a designated agent responsible for its execution, which can aid in tracking and accountability.

### Cons:

*   **High Overhead:** Delegating individual steps incurs significant overhead due to:
    *   Inter-service communication (HTTP calls to `AgentSet` for finding/creating agents and delegating tasks).
    *   Serialization/deserialization of step data for each delegation.
    *   Management of delegation mappings (`this.delegatedSteps`).
    *   This overhead can be substantial for missions involving many small steps, potentially negating the benefits of specialization.
*   **Potential for "Ping-Pong" Effect:** If a sequence of closely related steps each requires a slightly different specialized role, the primary agent might spend excessive time delegating and waiting, rather than executing.
*   **Limited Context for Sub-Agents:** When only a single step is delegated, the specialized agent receives minimal context beyond that specific step. This can hinder its ability to make informed decisions or adapt if the step's execution requires broader understanding of the mission's overall plan.
*   **Complexity in Orchestration:** Managing the lifecycle and results of numerous individually delegated steps adds complexity to the orchestrating agent's logic.

## Recommendations for Improvement

The current step-level delegation, while offering fine-grained control, introduces considerable overhead and can lead to inefficient execution. Moving towards delegation at the plan or sub-plan level would significantly improve efficiency and agent autonomy.

### 1. Shift Delegation to Plan/Sub-Plan Level

**Recommendation:** Instead of delegating individual steps, the system should delegate logical groups of steps (sub-plans) to specialized agents.

**Rationale:**
*   **Reduced Overhead:** A single delegation event for a sub-plan (containing multiple steps) drastically cuts down on inter-service communication and serialization overhead compared to delegating each step individually.
*   **Enhanced Context for Specialized Agents:** By receiving an entire sub-plan, a specialized agent gains a more comprehensive understanding of its immediate objectives and the sequence of actions required. This allows for more intelligent and autonomous execution within its area of expertise.
*   **Streamlined Orchestration:** The primary (coordinator) agent can focus on high-level planning and managing the execution of sub-plans, simplifying its role.
*   **Improved Performance:** Less communication overhead and more autonomous sub-agents can lead to faster overall mission execution.

### 2. Enhance Brain's Plan Generation for Sub-Plan Identification and Role Assignment

**Recommendation:** The Brain (LLM) should be guided to generate plans that explicitly define sub-plans and assign `recommendedRole`s to these sub-plans, rather than just individual steps.

**Implementation Considerations:**
*   **New Plan Structure:** Introduce a new data structure (e.g., `SubPlanGroup`) within the `ActionVerbTask` array that can contain a list of `ActionVerbTask` objects and a `recommendedRole` property for the entire group.
*   **Prompt Engineering/Fine-tuning:** Develop prompts or fine-tune the LLM to output plans in this new structured format, identifying coherent "streams of work" and their optimal agent roles. For example, a plan might look like:
    ```json
    [
      { "actionVerb": "THINK", "description": "Initial analysis" },
      {
        "type": "SubPlanGroup",
        "recommendedRole": "researcher",
        "steps": [
          { "actionVerb": "SEARCH_WEB", "description": "Gather data on X" },
          { "actionVerb": "ANALYZE_DATA", "description": "Process gathered data" }
        ]
      },
      { "actionVerb": "REPORT", "description": "Generate final report" }
    ]
    ```
*   **Brain's Current Capability:** The Brain already demonstrates the ability to suggest roles at the step level. Extending this to logical groupings should be feasible with appropriate guidance.

### 3. Refactor `Agent` Class for Sub-Plan Delegation and Execution

**Recommendation:** Modify the `Agent` class to recognize and delegate these new sub-plan structures.

**Implementation Considerations:**
*   **Update `addStepsFromPlan`:** This method should be updated to parse the new plan structure. When it encounters a `SubPlanGroup` with a `recommendedRole` different from the current agent's, it should trigger a sub-plan delegation.
*   **Modify `delegateStepToSpecializedAgent` (or create a new `delegateSubPlan` method):** This function would be adapted to accept an array of `Step` objects (the sub-plan) and delegate them as a single unit. The specialized agent would then receive and execute this entire sub-plan.
*   **Sub-Agent Execution Logic:** The specialized agent, upon receiving a delegated sub-plan, would execute all steps within that sub-plan sequentially or based on internal dependencies. It would then report the aggregated results of the entire sub-plan back to the delegating agent.
*   **Result Aggregation:** The delegating agent would need to handle the aggregated results from the completed sub-plan, integrating them into its overall mission context.

### 4. Formalize the "Coordinator" Role

**Recommendation:** Clearly define the responsibilities and behaviors of a "coordinator" agent.

**Implementation Considerations:**
*   **Primary Orchestrator:** A coordinator agent's main function should be to generate high-level plans, identify sub-plans, delegate them to specialized agents, and synthesize the results. It should rarely execute low-level action verbs directly.
*   **Simplified `executeStep` for Coordinators:** Coordinator agents could have a simplified `executeStep` logic that primarily focuses on delegation and result integration, rather than direct execution of all step types.

### 5. Introduce a "Delegation Threshold" or "Complexity Metric" (Optional but Recommended)

**Recommendation:** Implement a mechanism to determine if a step or sub-plan is sufficiently complex or specialized to warrant delegation.

**Implementation Considerations:**
*   **Heuristics:** This could be a simple heuristic (e.g., number of inputs/outputs, estimated execution time, or a flag set by the Brain).
*   **Configuration:** Allow for configuration of this threshold, enabling administrators to fine-tune delegation behavior.
*   **Avoid Over-Delegation:** This would prevent delegating trivial tasks, further reducing overhead.

### 6. Improve Error Handling and Fallback for Delegated Sub-Plans

**Recommendation:** Enhance error handling to gracefully manage failures within delegated sub-plans.

**Implementation Considerations:**
*   **Sub-Plan Level Failure Reporting:** If a specialized agent fails during a sub-plan, it should report the failure of the entire sub-plan (along with details of the failing step) back to the delegating agent.
*   **Delegating Agent's Recovery:** The delegating agent would then be responsible for initiating recovery (e.g., replanning the failed sub-plan, trying an alternative specialized agent, or escalating the issue). The current `replanFromFailure` logic would need to be adapted to handle sub-plan failures.

## Deliverable-Focused Role Assignment Strategy

After further analysis and expert consultation, the `SET_AGENT_ROLE_CONTEXT` approach (described previously as a middle-ground solution) was removed in favor of a more streamlined and intelligent LLM-guided strategy. The new approach avoids introducing special `actionVerbs` and instead relies on providing clearer guidance to the LLM during the planning phase.

The core principle is to assign roles at the level of a coherent deliverable, rather than on a per-step basis. This reduces overhead and provides better context to specialized agents.

The guidance provided to the LLM is as follows:

**Role Assignment Strategy:**
- Assign `recommendedRole` at the **deliverable level**, not per-step optimization.
- All steps contributing to a single coherent output (e.g., "research report", "code module", "analysis document") should share the same `recommendedRole`.
- Only change `recommendedRole` when transitioning to a fundamentally different type of deliverable.
- Example: Steps 1-5 all produce research for a report → all get `recommendedRole: "researcher"`.
- Counter-example: Don't switch roles between gathering data (step 1) and formatting it (step 2) if they're part of the same research deliverable.

This approach simplifies the agent's execution logic and places more trust in the LLM's ability to generate well-structured, role-aware plans from the outset.