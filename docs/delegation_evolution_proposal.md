# Task Delegation Refactoring: From Replication to Migration

## 1. High-Level Strategy Shift

The current task delegation strategy is based on **replication**. When a step is delegated, a new, separate task is created on the target agent, and the result is later copied back to the original step. This has led to issues with dependency tracking, memory usage, and complexity.

The new strategy will be **migration-based**. Instead of copying, a `Step` will be physically moved from one agent's `steps` list to another. This is a fundamental shift that simplifies the process and solves the underlying problems.

**Key Principles of the New Strategy:**

1.  **Step Migration, Not Replication:** A `Step` object will be removed from the source agent and added to the target agent, preserving its `id`, properties, and history.
2.  **Global Step Uniqueness:** Each `Step` `id` will be unique across the entire mission, regardless of which agent currently holds it.
3.  **Hierarchical Dependency Resolution:** Dependencies will be resolved first locally, then within the same AgentSet, and finally across AgentSets to minimize network overhead.
4.  **Upfront Assignment:** Instead of delegating at execution time, the assignment of a step to an agent will happen at creation time (`createFromPlan`). The `recommendedRole` will be used to determine the target agent for each step as the plan is being parsed.
5.  **Phased Implementation:** The migration will be implemented in phases to reduce risk and complexity.

## 2. Implementation Phases

### Phase 1: Single AgentSet Migration (Weeks 1-3)
- Implement step migration within a single AgentSet
- Add `ownerAgentId` property to Step class
- Modify `addStepsFromPlan` for upfront assignment
- Update dependency resolution for cross-agent lookups within same AgentSet
- Remove delegation logic for same-AgentSet scenarios

### Phase 2: Cross-AgentSet Foundation (Weeks 4-6)
- Implement StepRegistry service
- Add caching layer for remote step lookups
- Create cross-AgentSet API endpoints
- Implement authentication for cross-AgentSet communication

### Phase 3: Full Cross-AgentSet Migration (Weeks 7-9)
- Enable cross-AgentSet step migration
- Implement comprehensive error handling and fallback mechanisms
- Add monitoring and observability
- Performance optimization and testing

### Phase 4: Legacy System Removal (Weeks 10-12)
- Remove old TaskDelegation system
- Clean up deprecated code and interfaces
- Final testing and documentation

## 3. Impact on Classes

Here's a breakdown of the required changes for each major component.

### `Step.ts` (Phase 1)

The `Step` class requires several key changes to support migration.

1.  **`ownerAgentId` property:**
    *   Add a new property `ownerAgentId: string` to the `Step` class. (DONE)
    *   This property will be updated whenever a step is migrated to a new agent.
    *   This is crucial for logging, debugging, and for other systems to know which agent is currently responsible for the step.

2.  **`ownerAgentSetUrl` property (Phase 2):**
    *   Add a new property `ownerAgentSetUrl: string` to track which AgentSet currently owns the step.
    *   This enables cross-AgentSet step lookups and migration tracking.

3.  **Dependency Serialization:**
    *   The `StepDependency` interface (`{ sourceStepId: string, outputName: string, inputName: string }`) is sufficient as `sourceStepId` is globally unique. No changes are needed here.

4.  **Enhanced Dependency Resolution:**
    *   Modify `areDependenciesSatisfied()` to accept a step lookup function instead of a local steps array.
    *   Modify `populateInputsFromDependencies()` to use the same lookup function.
    *   This allows for hierarchical dependency resolution (local → same AgentSet → cross-AgentSet).

5.  **Clarification on `StepStatus.SUB_PLAN_RUNNING`:**
    *   The status `SUB_PLAN_RUNNING` should be retained for its original purpose: to indicate a parent step (like one using the `ACCOMPLISH` plugin) that has generated a sub-plan and is now awaiting its completion.
    *   The act of migrating a step to another agent does not require a special status. The step will simply have a `status` of `PENDING` in the new agent's queue, and its `ownerAgentId` property will reflect its new location.

### `Agent.ts` (Phase 1 & 2)

The `Agent` class will see significant changes to its execution and delegation logic.

1.  **Phase 1 - Modified `addStepsFromPlan`:**
    *   This method will now be responsible for the **upfront assignment**.
    *   When `createFromPlan` generates new steps, `addStepsFromPlan` will iterate through them.
    *   For each new step:
        *   If `step.recommendedRole` matches the current agent's role (or is undefined), the step is added to `this.steps` as usual.
        *   If `step.recommendedRole` does *not* match, the agent will call `this.agentSet.assignStepToAgent(step, step.recommendedRole)`.
    *   Set `step.ownerAgentId` when adding steps to the agent.

2.  **Phase 1 - Modified Dependency Resolution:**
    *   Update calls to `step.areDependenciesSatisfied()` and `step.populateInputsFromDependencies()` to use a step lookup function.
    *   Initially, this will search across all agents in the local `AgentSet`.
    *   The `Agent` will need a reference to the `AgentSet` for step lookups.

3.  **Phase 1 - Modified `executeStep`:**
    *   Remove the check `if (step.recommendedRole && step.recommendedRole !== this.role)`. If a step is in an agent's `steps` list, it belongs there and should be executed.
    *   Update dependency population to use the new lookup mechanism.

4.  **Phase 2 - Cross-AgentSet Support:**
    *   Update step lookup to support cross-AgentSet queries through the StepRegistry.
    *   Add caching for frequently accessed remote steps.
    *   Implement fallback mechanisms for network failures.

5.  **Phase 4 - Legacy Removal:**
    *   Remove `delegateStepToSpecializedAgent` method entirely.
    *   Remove `delegatedSteps` map.
    *   Remove `TASK_DELEGATION` and `TASK_RESULT` cases from `handleCollaborationMessage`.

### New Component: StepRegistry Service (Phase 2)

To support multiple `AgentSet`s across different containers or missions, a new singleton service, `StepRegistry`, is required. This service will act as the central, authoritative source of truth for the location of every step across the entire system.

**Architecture:**
*   **Database:** MongoDB for persistence with Redis for caching
*   **High Availability:** Multiple instances behind a load balancer
*   **Authentication:** Integration with existing SecurityManager
*   **Monitoring:** Health checks, metrics, and alerting

**Responsibilities:**

1.  **Store Step Locations:** Maps a globally unique `step.id` to the `agent.id` that currently owns it and the URL of the `AgentSet` that manages that agent.
2.  **Provide Lookup API:** Expose an API for other services to find where a step is located.
3.  **Caching:** Maintain a Redis cache for frequently accessed step locations.
4.  **Cleanup:** Remove entries for completed or cancelled steps to prevent memory leaks.

**API Endpoints:**

*   `POST /register`: Registers a new step.
    *   Body: `{ "stepId": "...", "agentId": "...", "agentSetUrl": "...", "missionId": "..." }`
    *   Authentication: Required
*   `PUT /update`: Updates the location of a migrated step.
    *   Body: `{ "stepId": "...", "newAgentId": "...", "newAgentSetUrl": "..." }`
    *   Authentication: Required
*   `GET /lookup/:stepId`: Looks up the location of a step.
    *   Returns: `{ "agentId": "...", "agentSetUrl": "...", "cached": boolean }`
    *   Authentication: Required
*   `DELETE /cleanup/:stepId`: Removes a completed step from the registry.
    *   Authentication: Required
*   `GET /health`: Health check endpoint
*   `GET /metrics`: Prometheus metrics endpoint

**Error Handling:**
*   **Graceful Degradation:** If StepRegistry is unavailable, fall back to local-only dependency resolution
*   **Retry Logic:** Exponential backoff for failed registry calls
*   **Circuit Breaker:** Temporarily disable cross-AgentSet lookups if registry is consistently failing

### `AgentSet.ts` (Phase 1 & 2)

The role of the `AgentSet` evolves to support both local step management and cross-AgentSet coordination.

**Phase 1 - Local Step Management:**

1.  **New `assignStepToAgent` Method:**
    *   Handle finding or creating a local agent for a given role.
    *   Migrate the step to the target agent's steps list.
    *   Update the step's `ownerAgentId` property.
    *   Log the step migration for debugging and monitoring.

2.  **Enhanced `findStepById` Method:**
    *   First check local agents for the step.
    *   Return step data if found locally.
    *   In Phase 1, return null if not found locally.

3.  **Step Lookup Function:**
    *   Provide a centralized step lookup function that agents can use.
    *   Initially searches across all local agents.
    *   Will be enhanced in Phase 2 for cross-AgentSet lookups.

**Phase 2 - Cross-AgentSet Support:**

4.  **StepRegistry Integration:**
    *   Register all local steps with the StepRegistry on creation.
    *   Update StepRegistry when steps are migrated.
    *   Query StepRegistry for non-local steps.

5.  **Enhanced `findStepById` Method:**
    *   **Hierarchical Lookup Logic:**
        1.  Check local step cache first (fastest).
        2.  Check if the `stepId` exists in local agents.
        3.  Query local StepRegistry cache.
        4.  Query the `StepRegistry`'s `/lookup/:stepId` endpoint.
        5.  Make authenticated API call to remote `AgentSet`'s `/api/steps/:stepId` endpoint.
        6.  Cache the result locally with TTL.

6.  **New External API Endpoints:**
    *   `GET /api/steps/:stepId`: Return step status and details for cross-AgentSet queries.
    *   `POST /api/steps/migrate`: Accept migrated steps from other AgentSets.

7.  **Caching Layer:**
    *   Local cache for frequently accessed remote steps.
    *   TTL-based cache invalidation (default: 30 seconds).
    *   Cache warming for steps with known dependencies.

8.  **Error Handling:**
    *   Graceful degradation when StepRegistry or remote AgentSets are unavailable.
    *   Retry logic with exponential backoff.
    *   Circuit breaker pattern for consistently failing remote calls.

**Phase 4 - Legacy Removal:**

9.  **Remove `/delegateTask` endpoint:** The new `assignStepToAgent` logic replaces it.

### `TaskDelegation.ts` and `CollaborationProtocol.ts` (Phase 4)

These components will be gradually deprecated and removed.

**Phase 1-3 - Coexistence:**
*   Keep existing TaskDelegation system running alongside new migration system.
*   Add feature flags to control which system is used for new delegations.
*   Monitor both systems to ensure migration system works correctly.

**Phase 4 - Legacy Removal:**

1.  **`TaskDelegation.ts`:**
    *   This class, in its current form, is entirely based on the replication model (`DelegatedTask`, `pendingDelegations`, etc.).
    *   It should be **deprecated and removed**. Its responsibilities are being absorbed by `AgentSet` and `Agent`.
    *   Ensure all pending delegations are completed before removal.

2.  **`CollaborationProtocol.ts`:**
    *   `CollaborationMessageType.TASK_DELEGATION`: Remove this message type.
    *   `CollaborationMessageType.TASK_RESULT`: Remove this message type.
    *   `TaskDelegationRequest` interface: Remove.
    *   `TaskDelegationResponse` interface: Remove.
    *   `TaskResult` interface: Remove.

**Migration Strategy:**
*   Add deprecation warnings to old delegation methods.
*   Provide migration tools to convert pending delegations to new format.
*   Maintain backward compatibility during transition period.

## 4. New Workflow Summary

### Plan Creation and Step Assignment

1.  An agent executes a planning step (e.g., `ACCOMPLISH`).
2.  The result is a `plan` (an array of `ActionVerbTask` objects).
3.  The agent calls `addStepsFromPlan(plan, parentStep)`.
4.  Inside `addStepsFromPlan`, `createFromPlan` is called, which creates an array of new `Step` objects. Each `Step` has a `recommendedRole`.
5.  `addStepsFromPlan` iterates through the new `Step` objects.
6.  For each `step`:
    *   Set `step.ownerAgentId` to the current agent's ID initially.
    *   If `step.recommendedRole` matches the current agent's role (or is undefined), it's added to `this.steps`.
    *   If `step.recommendedRole` is different, the agent calls `this.agentSet.assignStepToAgent(step, step.recommendedRole)`.
7.  The `AgentSet` receives the step, finds/creates the correct specialist agent, and places the step in that agent's queue.
8.  The step's `ownerAgentId` is updated to reflect its new location.
9.  In Phase 2+, the `StepRegistry` is updated with the step's location (`stepId`, `agentId`, `agentSetUrl`).

### Dependency Resolution and Execution

10. Execution proceeds. When an agent needs to check dependencies, it uses the AgentSet's step lookup function.
11. The lookup function implements hierarchical search:
    *   **Local cache** (fastest, Phase 2+)
    *   **Local agents** (same AgentSet)
    *   **StepRegistry cache** (Phase 2+)
    *   **Remote AgentSet API** (Phase 2+)
12. Steps execute when their dependencies are satisfied, regardless of where those dependencies are located.

### Error Handling and Resilience

13. If remote lookups fail, the system gracefully degrades to local-only dependency resolution.
14. Circuit breakers prevent cascading failures from unreachable remote systems.
15. Caching reduces network overhead and improves performance.

## 5. Performance and Scalability Considerations

### Caching Strategy
*   **Local Step Cache:** TTL-based cache (30s default) for frequently accessed remote steps
*   **StepRegistry Cache:** Redis-backed cache for step location lookups
*   **Cache Warming:** Proactively cache steps that are likely to be dependencies

### Network Optimization
*   **Batch Lookups:** Support looking up multiple steps in a single API call
*   **Compression:** Use gzip compression for cross-AgentSet API calls
*   **Connection Pooling:** Reuse HTTP connections for better performance

### Monitoring and Observability
*   **Metrics:** Track cache hit rates, network latency, and error rates
*   **Alerting:** Alert on high error rates or performance degradation
*   **Distributed Tracing:** Track step execution across AgentSets

## 6. Risk Mitigation

### Rollback Strategy
*   **Feature Flags:** Control which delegation system is used
*   **Gradual Migration:** Migrate one mission type at a time
*   **Monitoring:** Comprehensive monitoring during transition

### Data Consistency
*   **Eventual Consistency:** Accept that step location data may be slightly stale
*   **Conflict Resolution:** Handle cases where multiple AgentSets think they own a step
*   **Cleanup Procedures:** Regular cleanup of orphaned step registry entries

This new architecture eliminates the complex and buggy replication/synchronization logic, replacing it with a simpler and more robust migration model that aligns better with the distributed nature of the agent system while addressing performance, scalability, and reliability concerns.

## 7. Implementation Details

### Phase 1: Single AgentSet Migration (Weeks 1-3)

**Week 1: Step Class Enhancements**
*   Add `ownerAgentId` property to Step class
*   Modify `areDependenciesSatisfied()` to accept a lookup function parameter
*   Modify `populateInputsFromDependencies()` to use lookup function
*   Update Step constructor to set initial `ownerAgentId`
*   Add unit tests for new Step functionality

**Week 2: Agent Class Modifications**
*   Modify `addStepsFromPlan()` to implement upfront assignment logic
*   Update `executeStep()` to remove role-based delegation checks
*   Update dependency resolution calls to use AgentSet lookup function
*   Add integration tests for step assignment

**Week 3: AgentSet Enhancements**
*   Implement `assignStepToAgent()` method
*   Implement local `findStepById()` method
*   Create step lookup function for agents to use
*   Add comprehensive testing for local step migration
*   Performance testing and optimization

### Phase 2: Cross-AgentSet Foundation (Weeks 4-6)

**Week 4: StepRegistry Service**
*   Design and implement StepRegistry service architecture
*   Set up MongoDB and Redis infrastructure
*   Implement core API endpoints (/register, /update, /lookup, /cleanup)
*   Add authentication integration with SecurityManager
*   Implement health checks and monitoring

**Week 5: Caching and Performance**
*   Implement local step cache in AgentSet
*   Add Redis caching to StepRegistry
*   Implement cache warming strategies
*   Add performance monitoring and metrics
*   Load testing and optimization

**Week 6: Cross-AgentSet API**
*   Add `/api/steps/:stepId` endpoint to AgentSet
*   Implement authentication for cross-AgentSet calls
*   Add error handling and retry logic
*   Implement circuit breaker patterns
*   Integration testing between AgentSets

### Phase 3: Full Cross-AgentSet Migration (Weeks 7-9)

**Week 7: Enhanced Step Lookup**
*   Add `ownerAgentSetUrl` property to Step class
*   Implement hierarchical step lookup in AgentSet
*   Integrate StepRegistry calls into lookup logic
*   Add comprehensive error handling and fallbacks

**Week 8: Cross-AgentSet Step Migration**
*   Implement step migration between AgentSets
*   Add `/api/steps/migrate` endpoint
*   Update StepRegistry on cross-AgentSet migrations
*   Add monitoring and alerting for cross-AgentSet operations

**Week 9: Testing and Optimization**
*   End-to-end testing with multiple AgentSets
*   Performance optimization and tuning
*   Stress testing with high step volumes
*   Documentation and runbooks

### Phase 4: Legacy System Removal (Weeks 10-12)

**Week 10: Migration Tools**
*   Create tools to migrate pending delegations
*   Add deprecation warnings to old delegation methods
*   Implement feature flags for gradual rollout

**Week 11: Legacy Removal**
*   Remove TaskDelegation class and related code
*   Remove deprecated CollaborationProtocol interfaces
*   Clean up unused delegation endpoints
*   Update documentation

**Week 12: Final Testing and Deployment**
*   Final integration testing
*   Performance validation
*   Production deployment with monitoring
*   Post-deployment validation and cleanup

## 8. Success Criteria

### Performance Metrics
*   **Dependency Resolution Time:** < 100ms for local lookups, < 500ms for cross-AgentSet
*   **Cache Hit Rate:** > 80% for frequently accessed remote steps
*   **Network Overhead:** < 50% increase in cross-AgentSet API calls
*   **Error Rate:** < 1% for step lookups and migrations

### Reliability Metrics
*   **System Availability:** 99.9% uptime for StepRegistry service
*   **Graceful Degradation:** System continues to function when StepRegistry is unavailable
*   **Data Consistency:** < 0.1% orphaned or inconsistent step registry entries

### Functional Requirements
*   All existing delegation scenarios work with new migration system
*   Cross-AgentSet dependencies are resolved correctly
*   Step migration preserves all step properties and history
*   Legacy system can be completely removed without data loss

## 9. Next Steps

1. **Stakeholder Review:** Get approval from architecture team and product owners
2. **Resource Allocation:** Assign development team and infrastructure resources
3. **Detailed Design:** Create detailed technical specifications for each phase
4. **Infrastructure Planning:** Set up development and testing environments
5. **Risk Assessment:** Conduct detailed risk analysis and mitigation planning
6. **Implementation Kickoff:** Begin Phase 1 development with proper project management
