# Agent Awareness Strategy

This document outlines the strategy for implementing higher-level awareness in agents. Agent awareness is the ability of an agent to reason about itself, its environment, and its peers to make more intelligent and autonomous decisions. This is the key to unlocking the complex, collaborative behaviors described in our use cases.

The strategy is broken down into four key pillars of awareness.

---

## 1. Specialization Awareness

**Purpose:** To enable agents to understand their own role and capabilities, and to delegate tasks to agents better suited for the job. This is the foundation of the "divide and conquer" strategy.

**Implementation Strategy:**
*   **Agent Roles:** The `AgentRole` definition (`PredefinedRoles`) is the source of truth for specialization. Each agent is instantiated with a `role` (e.g., `Researcher`, `Coder`, `Critic`).
*   **Self-Awareness:** An agent's primary awareness is knowing its own `this.role`.
*   **Task-Role Matching:** When a `Coordinator` agent creates a plan, it should annotate steps with a `recommendedRole`.
*   **Delegation Judgement:** An `Executor` agent, upon receiving a step, compares the `step.recommendedRole` to `this.role`. If there is a mismatch, it triggers the `delegateStepToSpecializedAgent` method, which uses the `CollaborationManager` to find and delegate to an appropriate peer.

**Example Agent Behavior:**
> A `CoordinatorAgent` creates a step: `{ actionVerb: 'WRITE_CODE', recommendedRole: 'coder' }`. An `ExecutorAgent` with the role `'executor'` receives it. It sees the role mismatch and says, "This task requires a 'coder'. I am an 'executor'. I will delegate this." It then calls the `CollaborationManager` to find a `CoderAgent` and pass the task on.

---

## 2. Knowledge Awareness

**Purpose:** To prevent agents from working in silos. Agents should know what they know, what they don't know, and how to find information from their peers or shared data stores.

**Implementation Strategy:**
*   **Internal Knowledge:** An agent's `conversation` history and its own `WorkProduct`s constitute its internal, short-term memory.
*   **Shared Knowledge (Librarian):** The `SharedMemory` class, backed by the `Librarian` service, acts as the mission's long-term, collective memory. Agents should be programmed to query this memory store using tags before starting a research task.
*   **Active Knowledge Seeking:** When an agent cannot find information internally or in `SharedMemory`, it should formulate a question. This question can be broadcast as a `KNOWLEDGE_SHARE` request to all agents in the mission.
*   **Expert Finding:** For targeted questions, an agent can query the `SpecializationFramework` (via `CollaborationManager`) to find an agent with a specific `knowledgeDomain` (e.g., "Find me a `DomainExpert` in `quantum_physics`") and send a direct query.

**Example Agent Behavior:**
> An agent is tasked with "analyzing market sentiment for product X".
> 1. It first queries `SharedMemory`: `query({ tags: ['market_sentiment', 'product_x'] })`.
> 2. It finds no results. It then broadcasts a message: `{ type: 'KNOWLEDGE_SHARE', payload: { topic: 'market_sentiment_product_x', question: 'Does anyone have data on this?' } }`.
> 3. Another agent, which recently completed a related task, responds with its `WorkProduct`.

---

## 3. Judgement Awareness

**Purpose:** To empower agents to make nuanced decisions beyond simple if/else logic, especially when faced with ambiguity, uncertainty, or conflicting goals.

**Implementation Strategy:**
*   **LLM as a Judgement Engine:** The `Brain` service is the primary tool for judgement. An agent can construct a prompt that frames a decision, provides context (from its conversation, knowledge, and awareness), and asks for the optimal course of action.
*   **Confidence Scoring:** When an agent uses the `Brain` to generate a plan or an answer, the `Brain` should also return a confidence score (e.g., 0.0 to 1.0).
*   **Policy-Based Judgement:** If confidence is below a certain threshold (e.g., < 0.7), the agent's policy should be to seek validation. It can delegate a "fact-check" or "review" task to a `Critic` or `FactCheckerAgent`.
*   **Conflict Resolution:** The `ConflictResolution` system is a specialized form of judgement. The `NEGOTIATION` strategy explicitly uses the `Brain` to weigh evidence and make a final call.

**Example Agent Behavior:**
> A `ResearcherAgent` finds a fact and the `Brain` returns it with a confidence score of 0.6. The agent's internal policy dictates that any fact with confidence < 0.75 must be verified. It creates a new step: `{ actionVerb: 'VERIFY_FACT', recommendedRole: 'critic', inputs: { fact: '...' } }` and delegates it. It will not proceed until the `CriticAgent` returns a confirmation.

---

## 4. Community Awareness

**Purpose:** To make agents aware of the team structure, dependencies, and the status of their peers. This allows for more effective coordination and prioritization.

**Implementation Strategy:**
*   **Mission Roster:** Agents should be able to query the `TrafficManager` for a "roster" of all agents currently active in their `missionId`, including their roles and status.
*   **Dependency Graph Awareness:** An agent can use the `TrafficManager`'s `/dependentAgents/:agentId` endpoint to know which other agents are waiting for its output. This awareness can be used to dynamically adjust its own task priorities.
*   **Status Monitoring:** Agents receive status updates from their peers via the `CollaborationManager`. Knowing that a critical dependency agent is in an `ERROR` state allows an agent to proactively re-plan or escalate the issue.
*   **Reputation (Future):** A future enhancement could be a `ReputationManager` service that tracks agent performance (e.g., reliability, speed, quality). When delegating, an agent could query this service to choose the most reliable peer for a critical task.

**Example Agent Behavior:**
> An `ExecutorAgent` is working on a task. It queries the `TrafficManager` and discovers that three other agents are dependent on its output. It then encounters a blocker. Instead of waiting, it immediately escalates the issue to the `CoordinatorAgent`, stating: "I am blocked on task X. This is high priority as agents Y and Z are waiting for my output."