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

---

## 5. Implementation Plan & Design Decisions

This section outlines the strategic programme of work for implementing the role evolution proposal. It details the necessary design decisions, code modifications, and a phased implementation plan.

### 5.1. Key Design Decisions

#### 5.1.1. Knowledge Manager Architecture
*   **Decision:** The "Knowledge Manager" functionality will not be a new, standalone service. Instead, it will be implemented as an extension of the existing **`Librarian`** service. The `Librarian` is the natural home for this capability as it already manages data persistence and retrieval.
*   **Rationale:** This approach avoids architectural fragmentation, reduces operational overhead, and leverages the `Librarian`'s existing infrastructure for database connections and service communication. The core function is knowledge storage and retrieval, which is a library function.
*   **Implementation:** The `Librarian`'s responsibility will be expanded to include vector embedding generation and similarity search. The agent-facing interface will be the two new plugins (`SAVE_TO_KNOWLEDGE_BASE` and `QUERY_KNOWLEDGE_BASE`) which will communicate with the `Librarian` via the existing service bus.

#### 5.1.2. Search and Retrieval Technology
*   **Decision:** The system will use **Semantic Search** powered by a vector database. We will use a dedicated vector store like `ChromaDB` or `FAISS` integrated with the `Librarian` service, rather than a keyword-based solution like `Elasticsearch`.
*   **Rationale:** The proposal requires understanding the *meaning* of the content, not just matching keywords. Semantic search excels at this by comparing vector embeddings, allowing agents to find conceptually related information even if the wording is different. This is crucial for building a robust and intelligent knowledge base. `Elasticsearch` is powerful but is fundamentally a text-search engine and would be less effective for this use case.
*   **Implementation:**
    1.  [x] A vector database will be added to the `docker-compose.yaml` stack.
    2.  [x] The `Librarian` service will be updated with a new module for interacting with the vector database.
    3.  [x] An embedding model (e.g., from the `sentence-transformers` library or a commercial API) will be integrated into the `Librarian` to generate vectors from text content.

### 5.2. Programme of Work: Phased Implementation

#### Phase 1: Foundational Knowledge Management
*   **Objective:** Build the core infrastructure for the semantic knowledge base.
*   **New Code:**
    1.  [x] **`services/librarian/src/knowledgeStore`**: Create a new module responsible for all vector database interactions (connecting, creating collections, adding/updating documents, and performing similarity searches).
    2.  [x] **`tools/knowledge_plugins`**: Create a new directory for the two new plugins.
        *   `saveToKnowledgeBase.ts`: Defines the `SAVE_TO_KNOWLEDGE_BASE` plugin. This plugin will validate inputs and make an API call to a new endpoint on the `Librarian` service.
        *   `queryKnowledgeBase.ts`: Defines the `QUERY_KNOWLEDGE_BASE` plugin, which will call a separate `Librarian` endpoint for searching.
*   **Code Modifications:**
    1.  [x] **`services/librarian/src/Librarian.ts`**: Add two new API endpoints (`/knowledge/save` and `/knowledge/query`) that route requests to the new `knowledgeStore` module.
    2.  [x] **`services/librarian/package.json`**: Add dependencies for the chosen vector database client library and embedding model.
    3.  [x] **`docker-compose.yaml`**: Add a new service definition for the vector database (e.g., `chromadb`).
    4.  **`shared/src/models/KnowledgeDomain.ts`**: Potentially add a `vectorCollectionName` field to the `KnowledgeDomain` model to map a domain to its corresponding collection in the vector DB.
*   **Order of Implementation:**
    1.  [x] Set up the vector database and update `docker-compose.yaml`.
    2.  [x] Implement the `knowledgeStore` module in the `Librarian`.
    3.  [x] Add the new endpoints to the `Librarian` server.
    4.  [x] Create the two new plugins.
    5.  [x] Write integration tests to ensure the plugins can successfully save and query information via the `Librarian`.

#### Phase 2: Autonomous Self-Correction
*   **Objective:** Implement the agent self-reflection and prompt refinement loop.
*   **New Code:**
    1.  [x] **`services/brain/src/selfCorrection.ts`**: Create a new module within the `Brain` service responsible for generating the "lesson learned" based on performance data. This logic should be centralized in the `Brain` as it orchestrates agent execution.
*   **Code Modifications:**
    1.  [x] **`tools/reflect.ts` (or equivalent)**: The existing `REFLECT` plugin needs to be significantly enhanced. It will now fetch performance data for the current task from the `AgentSpecialization` model.
    2.  **`services/brain/src/agentExecution.ts`**: The logic that handles the `REFLECT` action needs to be updated. It will pass the performance data to the new `selfCorrection` module and receive the generated "lesson" in return.
    3.  [x] **`services/capabilitiesmanager/src/specialization.ts`**: The `SpecializationFramework` must be updated with a function like `updateSystemPrompt(agentId, newLesson)`. This function will append the lesson to the existing `systemPrompt` in the agent's `customizations` and save it to the database.
*   **Order of Implementation:**
    1.  Develop the core logic in the `selfCorrection` module within the `Brain`.
    2.  Implement the `updateSystemPrompt` function in the `CapabilitiesManager`.
    3.  Enhance the `REFLECT` plugin to gather and send performance data.
    4.  Integrate the components, ensuring the `Brain` correctly orchestrates the flow from reflection to prompt update.

#### Phase 3: Full Workflow Integration & Testing
*   **Objective:** Integrate the new capabilities into the agent's core planning and execution loop and conduct end-to-end testing.
*   **Code Modifications:**
    1.  **`services/brain/src/planning.ts`**: The agent's planning module must be updated to incorporate the new behaviors:
        *   **Pre-Task:** For research-oriented tasks, the planner should automatically insert a `QUERY_KNOWLEDGE_BASE` step at the beginning of the plan.
        *   **Post-Task:** For research and other designated tasks, the planner should insert a `SAVE_TO_KNOWLEDGE_BASE` step after a successful outcome.
        *   **Post-Task:** For all complex tasks, ensure a `REFLECT` step is the final action.
*   **Testing:**
    1.  **Unit Tests:** Each new module and modified function should have comprehensive unit tests.
    2.  **Integration Tests:** Create test scenarios that cover the full loop (e.g., an agent failing a task, reflecting, updating its prompt, and then succeeding on a similar task).
    3.  **End-to-End (E2E) Tests:** Design a complex mission that requires an agent to use the knowledge base and demonstrate self-correction to succeed. For example, a `coder` agent that initially fails to use a specific library, queries the knowledge base for examples, and then corrects its code.
