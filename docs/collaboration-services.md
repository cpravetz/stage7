# Collaboration Services Documentation

This document provides an overview and detailed description of the collaboration system implemented in the agentset service. The collaboration system enables agents to communicate, delegate tasks, share knowledge, and resolve conflicts effectively.

## Overview

The collaboration system consists of four main components:

- **CollaborationManager**: The central manager that coordinates collaboration activities among agents, including message routing, shared memory management, task delegation, and conflict resolution.
- **CollaborationProtocol**: Defines the message types, interfaces, and protocols used for collaboration between agents.
- **TaskDelegation**: Manages the delegation of tasks between agents, including task creation, forwarding, status updates, and notifications.
- **ConflictResolution**: Handles conflicts that arise during collaboration, supporting multiple resolution strategies such as voting, consensus, authority, negotiation, and escalation.

---

## CollaborationManager

The `CollaborationManager` class implements the `CollaborationProtocol` interface and acts as the core coordinator for collaboration among agents.

### Key Responsibilities

- Maintains a map of agents and shared memories for missions.
- Sends and forwards collaboration messages to agents or other agent sets.
- Handles incoming collaboration messages by routing them to appropriate handlers based on message type.
- Manages task delegation and conflict resolution by delegating to the respective systems.
- Periodically checks for expired tasks and conflicts.

### Message Handling

The manager processes various collaboration message types, including:

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
- Uses service-to-service authentication for secure communication.

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

### Conflict Lifecycle

1. Conflict created and stored with status `PENDING`.
2. Participants notified and votes collected.
3. Conflict resolved based on chosen strategy.
4. Resolution or escalation notifications sent.
5. Conflicts marked as `RESOLVED`, `FAILED`, or `ESCALATED`.

---

## Interaction Between Components

- `CollaborationManager` acts as the central hub, receiving and routing messages.
- Task delegation and conflict resolution are handled by their respective systems but coordinated through the manager.
- Agents communicate via collaboration messages adhering to the `CollaborationProtocol`.
- Shared memory is used to store and share knowledge among agents.
- The system supports distributed agent sets, forwarding messages and delegations across network boundaries securely.

---

This documentation provides a comprehensive understanding of the collaboration system's architecture and workflows, facilitating maintenance, extension, and integration efforts.
