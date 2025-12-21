# DEPRECATED: Verb Discovery and Caching Architecture

**Status:** This document has been consolidated into [`consolidated-verb-discovery-architecture.md`](docs/consolidated-verb-discovery-architecture.md)

**Migration Guide:** All concepts and implementation details from this document have been incorporated into the consolidated architecture with the following enhancements:

- Integrated with phased approach from verb-discovery-architecture-proposal.md
- Combined with tool discovery concepts from tool_discovery_and_planning_architecture.md
- Enhanced with implementation details from verb-architecture-consolidation-summary.md
- Added Brain Awareness section for LLM access to verb discovery

**Key Sections Migrated:**
- PlanValidator caching mechanism for efficiency
- Dynamic discovery workflow (cache hit/miss scenarios)
- Benefits analysis (scalability, single source of truth, etc.)
- Future consideration for Brain Awareness

Please refer to the consolidated document for the most current and comprehensive architecture.

## 2. Proposed Solution

The new architecture introduces a dynamic, on-demand verb discovery mechanism centered around the **Librarian** service and an intelligent **in-memory cache** within the `PlanValidator`.

### 2.1. Core Components

- **PlanValidator:** When it encounters a verb in a plan step, it is responsible for ensuring that verb is valid and that the step provides all required inputs.
- **Librarian Service:** Acts as the central, authoritative registry for all available plugins and their corresponding verbs (tools). It exposes an endpoint that can be queried for the definition and schema of a specific verb.
- **In-Memory Cache:** Implemented within the `PlanValidator` to store the schemas of verbs that have already been resolved during a mission.

### 2.2. Workflow

1.  The `PlanValidator` receives a plan to validate.
2.  For each step in the plan, it extracts the `actionVerb`.
3.  It first checks its local in-memory cache for the definition of the `actionVerb`.
4.  **Cache Hit:** If the verb is found in the cache, the validator uses the cached definition to validate the step's inputs.
5.  **Cache Miss:** If the verb is not in the cache, the `PlanValidator` makes an HTTP request to the `Librarian` service's query endpoint (e.g., `/api/plugins/search?verb=<actionVerb>`).
6.  The `Librarian` searches its registered plugins and returns the full schema for the requested verb if found.
7.  The `PlanValidator` receives the schema from the `Librarian`.
8.  It **stores the newly fetched schema** in its in-memory cache for future use.
9.  It then uses the schema to validate the current step's inputs.
10. If the `Librarian` does not find the verb, the `PlanValidator` marks the step as invalid, failing the plan validation.

### 2.3. Flow Diagram

```
+----------------+      1. Check Cache      +----------------+
| Plan Validator | ----------------------> | In-Memory Cache|
+----------------+      (actionVerb)       +----------------+
       |                                     |
       | 2. Cache Miss                       | 3. Cache Hit
       |                                     |
       |  +----------------------------------+
       |  |
       v  v
+----------------+      4. Query Librarian    +-----------------+
| Make HTTP Call | ----------------------> | Librarian Service|
+----------------+      (GET /search?verb=...) +-----------------+
       ^                                     |
       |                                     | 5. Return Schema
       |  +----------------------------------+
       |  |
       +--+
      6. Store in Cache & Validate

```

## 3. Benefits

- **Scalability:** The system can scale to thousands of plugins and verbs without degrading performance. The `PlanValidator` only loads information for verbs that are actually used in a plan.
- **Single Source of Truth:** The `Librarian` becomes the definitive source for all tool/verb definitions, ensuring consistency across the platform.
- **Decoupling & Resilience:** The `PlanValidator` is decoupled from the specifics of plugin storage. The caching mechanism makes the validation process resilient to minor network latency or temporary `Librarian` hiccups for frequently used verbs.
- **Efficiency:** The cache significantly reduces redundant network calls, making the validation process faster and more efficient, especially for plans with recurring verbs.

## 4. Future Consideration: Brain Awareness

This architecture effectively solves the problem of *plan validation*. A separate, but related, challenge is making the **Brain (LLM)** aware of the available tools so it can generate valid and effective plans in the first place.

This is a distinct problem that will be addressed in a subsequent phase. Potential strategies include:

-   Providing the Brain with a summarized, high-level list of available verbs.
-   Developing a mechanism for the Brain to query the `Librarian` for tools relevant to its current objective.
-   Fine-tuning models with knowledge of the available toolset.

The immediate priority is implementing the robust validation system described above.
