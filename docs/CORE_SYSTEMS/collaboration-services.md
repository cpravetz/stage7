# Collaboration Services Documentation

This document provides an overview and detailed description of the collaboration system implemented in the agentset service. The collaboration system enables agents to communicate, delegate tasks, share knowledge, and resolve conflicts effectively.

## Overview

The collaboration system consists of four main components:

- **CollaborationManager**: The central manager that coordinates collaboration activities among agents, including message routing, shared memory management, task delegation, and conflict resolution.
- **CollaborationProtocol**: Defines the message types, interfaces, and protocols used for collaboration between agents.
- **TaskDelegation**: Manages the delegation of tasks between agents, including task creation, forwarding, status updates, and notifications.
- **ConflictResolution**: Handles conflicts that arise during collaboration, supporting multiple resolution strategies such as voting, consensus, authority, negotiation, and escalation.
- **SharedMemory**: Provides a key-value store with access control for agents to share data, backed by the `Librarian` service for persistence.

---

## Purpose and Strategy

The fundamental purpose of the collaboration system is to enable a **"divide and conquer"** strategy for problem-solving. It allows the system to tackle missions that are too complex, large, or require a breadth of specialized skills that would be inefficient for a single agent to handle. It transforms the system from a collection of siloed workers into a coordinated, intelligent team.

The core strategy is **delegation to specialized agents**. Instead of creating a single, monolithic "super-agent", the system creates smaller, focused agents with specific roles (e.g., `Researcher`, `Writer`, `Coder`). When a coordinator agent encounters a step requiring a specific skill, it delegates that step to an agent with the appropriate role.

### Use Cases

*   **Complex Research Task:** A main agent running `ACCOMPLISH` creates a plan.
    -   Step 1: "Search for articles on quantum computing". The main agent delegates this to a `ResearcherAgent`.
    -   Step 2: "Scrape the content from the top 5 articles". This is delegated to a `ScraperAgent`.
    -   Step 3: "Summarize the scraped content". This is delegated to a `SummarizerAgent`.
    -   Step 4: "Write a final report". The main agent takes the summaries and writes the report.

*   **Conflict Resolution:**
    -   `AgentA`'s research says a fact is TRUE. `AgentB`'s research says the same fact is FALSE.
    -   One agent initiates a `resolveConflict` request.
    -   Other agents in the mission are asked to vote or provide evidence.
    -   The `ConflictResolution` system uses a strategy (e.g., `NEGOTIATION` using an LLM) to determine the most likely correct answer based on the provided evidence.

*   **Knowledge Sharing:**
    -   A `ScraperAgent` finds a very useful API documentation page.
    -   It uses `shareKnowledge` to `broadcast` the URL and a summary to all other agents in the mission.
    -   A `CoderAgent` later in the plan can then use this shared knowledge without having to re-discover it.

---

## CollaborationManager

The `CollaborationManager` class, instantiated within the `AgentSet`, implements the `CollaborationProtocol` interface and acts as the core coordinator for collaboration among agents.

### Key Responsibilities

- Delegates message routing to the `postOffice` service, ensuring messages reach the correct agent or agent set.
- Uses the `AgentSet` for agent lookup and management, rather than maintaining its own agent map.
- Leverages the `librarian` service for shared memory and knowledge storage, instead of managing shared memory internally.
- Delegates agent location and network routing to the `trafficManager` service.
- Manages task delegation and conflict resolution by delegating to the respective systems.
- Periodically checks for expired tasks and conflicts.

### Message Handling

The manager processes various collaboration message types by routing them to the appropriate agent or service provider, avoiding duplication of logic already present in the system.

- Knowledge sharing
- Task delegation, result, and status updates
- Conflict resolution messages
- Coordination messages
- Resource requests and responses

### Task Delegation and Conflict Resolution Access

Provides accessors to the `TaskDelegation` and `ConflictResolution` systems for direct interaction.

---

## CollaborationProtocol

Defines the communication protocol and message types used in the collaboration system.

### Message Types

- `KNOWLEDGE_SHARE`
- `TASK_DELEGATION`
- `TASK_RESULT`
- `TASK_STATUS`
- `CONFLICT_RESOLUTION`
- `COORDINATION`
- `RESOURCE_REQUEST`
- `RESOURCE_RESPONSE`

### Interfaces

- `CollaborationMessage`: Standard message format with metadata and payload.
- `TaskDelegationRequest` / `TaskDelegationResponse`: For task delegation operations.
- `TaskResult`: Represents the outcome of a task.
- `KnowledgeSharing`: Structure for sharing knowledge among agents.
- `ConflictResolutionRequest` / `ConflictResolutionResponse`: For conflict resolution operations.
- `CoordinationData`: Data structure for coordination messages.
- `ResourceResponse`: For resource sharing responses.

### Protocol Interface

Defines methods for sending messages, handling received messages, delegating tasks, sharing knowledge, and resolving conflicts.

---

## TaskDelegation

Manages the delegation of tasks between agents.

### Features

- Creates and stores delegated tasks with metadata such as status, priority, deadlines, and results.
- Delegates tasks to agents within the same or different agent sets, forwarding requests as needed.
- Updates task status and notifies delegators of progress or completion.
- Supports task cancellation and expiration checks.
- Includes error handling and timeout mechanisms for robust operation.

### Security and Authentication

The `TaskDelegation` system uses a `ServiceTokenManager` to obtain JWTs from the `SecurityManager`. These tokens are used to make authenticated requests when forwarding task delegations to other agent sets, ensuring that all communication is secure.

### Task Lifecycle

1. Task delegation request received.
2. Task created and stored with status `PENDING`.
3. Task sent to recipient agent.
4. Status updated to `ACCEPTED` upon acceptance.
5. Status updates and results are communicated back to the delegator.
6. Tasks can be cancelled or marked expired if deadlines pass.

---

## ConflictResolution

Handles conflicts that arise during collaboration.

### Features

- Creates conflicts with details including description, conflicting data, participants, and resolution strategy.
- Notifies participants of conflicts and collects votes or inputs.
- Supports multiple resolution strategies:
  - Voting: Majority vote determines resolution.
  - Consensus: Requires unanimous agreement, falls back to voting if no consensus.
  - Authority: Initiator's decision is final.
  - Negotiation: Uses AI-assisted negotiation via an LLM.
  - External: Escalates to human intervention.
- Notifies participants of resolutions or escalations.
- Checks for expired conflicts and escalates if unresolved.

### Security and Authentication

Similar to `TaskDelegation`, the `ConflictResolution` system utilizes a `ServiceTokenManager` to make secure, authenticated requests when communicating with other services, such as the `Brain` for negotiation or the `TrafficManager` for escalations.

### Conflict Lifecycle

1. Conflict created and stored with status `PENDING`.
2. Participants notified and votes collected.
3. Conflict resolved based on chosen strategy.
4. Resolution or escalation notifications sent.
5. Conflicts marked as `RESOLVED`, `FAILED`, or `ESCALATED`.

---

## SharedMemory

The `SharedMemory` class provides a persistent, mission-specific, key-value store for agents to share data.

### Features

- **Persistent Storage**: Uses the `Librarian` service to persist shared memory entries in MongoDB.
- **Access Control**: Each memory entry has read and write access control lists, allowing agents to control who can access their data.
- **Versioning**: Keeps a history of previous versions of a memory entry.
- **Tagging and Querying**: Supports tagging entries with keywords and provides a query interface to search for entries based on tags, creator, and timestamps.

---

## Interaction Between Components

- `CollaborationManager` acts as the central hub, receiving and routing messages.
- Task delegation and conflict resolution are handled by their respective systems but coordinated through the manager.
- Agents communicate via collaboration messages adhering to the `CollaborationProtocol`.
- `SharedMemory` is used to store and share knowledge among agents.
- The system supports distributed agent sets, forwarding messages and delegations across network boundaries securely.

---

This documentation provides a comprehensive understanding of the collaboration system's architecture and workflows, facilitating maintenance, extension, and integration efforts.
