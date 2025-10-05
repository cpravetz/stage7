# Proposal: Activating Agent Specialization and Learning

## 1. Introduction

This proposal outlines a strategy to evolve agents from role-based labels into true specialists that learn from experience. The goal is to build upon the existing `SpecializationFramework` by introducing agent-driven workflows for autonomous knowledge growth and self-correction.

## 2. Current Implementation Analysis

The `SpecializationFramework.ts` provides a robust foundation for agent evolution. Key existing components include:

-   **`AgentSpecialization` Model:** A data structure persisted in MongoDB that links an agent to a role and tracks performance metrics (`successRate`, `taskCount`, `qualityScore`) and `customizations` (including a custom `systemPrompt`).
-   **`KnowledgeDomain` Model:** A structured way to store domain-specific information, including keywords and resources.
-   **`findBestAgentForTask` Function:** An advanced routing mechanism that selects agents based not just on role, but on proficiency scores derived from their performance history.

Currently, these data structures are in place but are not yet being autonomously updated or utilized by the agents themselves. My proposal focuses on adding the behavioral logic to activate this framework.

## 3. Proposed Enhancements

I propose two primary mechanisms that directly integrate with and enhance the existing `SpecializationFramework`.

### 3.1. Activating the Knowledge Framework

**Concept:** Empower agents to autonomously populate and query the existing `KnowledgeDomain` structures. This will transform the domains into a shared, collective memory for all agents of a specific role, enabling them to learn from each other's work.

**Mechanism:**

1.  **New Plugins for Knowledge Management:** Two new plugins will be created to interact with the `knowledge_domains` collection in MongoDB via the `Librarian`.
    *   `SAVE_TO_KNOWLEDGE_BASE(domain, keywords, content)`: This plugin will identify the appropriate `KnowledgeDomain` (or create a new one), generate embeddings for the `content`, and add it as a new `resource` in the domain's resource list.
    *   `QUERY_KNOWLEDGE_BASE(query_text, domains)`: This plugin will query the vector stores associated with the specified `domains` and return the most relevant resources.
2.  **Workflow Integration:**
    *   After a `researcher` or `domain_expert` agent completes a research task, a subsequent step in its plan will be to call `SAVE_TO_KNOWLEDGE_BASE` to store key findings, enriching the collective knowledge.
    *   Before starting a new research task, an agent will first call `QUERY_KNOWLEDGE_BASE` to leverage existing knowledge and avoid redundant work.

**Example:**

1.  A `researcher` is asked to find information on "agentic AI platforms".
2.  It first calls `QUERY_KNOWLEDGE_BASE('agentic AI platforms', ['ai_development'])`. No results are found.
3.  It proceeds to `SEARCH` the web and synthesizes a summary.
4.  Its final step is `SAVE_TO_KNOWLEDGE_BASE('ai_development', ['agentic', 'ai', 'platforms'], 'Summary of agentic AI platforms: ...')`.
5.  Later, another agent calls `QUERY_KNOWLEDGE_BASE` for a similar topic and immediately retrieves the summary, giving it a massive head start.

### 3.2. Autonomous Self-Correction via Prompt Refinement

**Concept:** Agents will learn from their performance by dynamically refining their own system prompts. This creates a feedback loop that allows an agent's core instructions and heuristics to evolve with experience, leveraging the existing `AgentSpecialization.customizations` data structure.

**Mechanism:**

1.  **Enhanced Reflection Step:** For complex tasks, the final step will be a mandatory `REFLECT` action. This plugin will be enhanced to analyze the rich data already being collected by the `SpecializationFramework`.
2.  **Self-Correction Logic:** The `REFLECT` plugin will:
    *   Analyze the `successRate`, `averageTaskDuration`, and `qualityScore` from the agent's `TaskPerformanceMetrics`.
    *   Review the outcomes of the preceding steps (e.g., success, failure, errors from a `CODE_EXECUTOR` plugin).
    *   Based on this analysis, generate a concise, imperative "lesson learned" designed to improve future performance.
3.  **Prompt Persistence:** This "lesson learned" will be used to update the `systemPrompt` property within the agent's `AgentSpecialization.customizations` object. The `SpecializationFramework` already persists this object, ensuring the lesson is loaded the next time the agent is activated.

**Example:**

1.  A `coder` agent writes a Python function. The `RUN_CODE` step fails due to a linting error. The `updateAgentPerformance` function records this failure.
2.  The `coder` agent's final `REFLECT` step is executed. It sees the linting failure and the dip in its `successRate` and `qualityScore` for the `RUN_CODE` task.
3.  The `REFLECT` plugin's output is a new, refined system prompt: `"You are a Python coding agent. Correction: All Python code must be formatted with the 'black' code formatter before execution to avoid linting errors."`
4.  This new prompt is saved to the `coder` agent's `customizations.systemPrompt`.
5.  The next time this agent is asked to write code, its system prompt includes this new rule, making it much more likely to add a formatting step and succeed on the first try.

## 4. Conclusion

The `SpecializationFramework` provides the perfect foundation for creating truly adaptive agents. By implementing the agent-driven workflows described in this proposal, we can activate the existing data models and create a system where agents genuinely learn, improve, and become more effective specialists over time.
