# Proposal: An Advanced, Search-Driven Framework for Tool Discovery and Fulfillment

## 1. Current State Assessment

The existing tool integration architecture (`mcp-tool-integration.md`) provides a robust, unified model for registering different types of tools (Python, OpenAPI, MCP) into a central `PluginRegistry`. Each tool's capability is exposed as a unique `actionVerb`.

However, this architecture has a critical scalability limitation: **tool discovery**. The current model requires the `ACCOMPLISH` planner to know the exact `actionVerb` for a tool at planning time. As the number of tools grows, it is infeasible to include a full list in the planner's context, creating a scalability bottleneck.

## 2. Vision: From "Planner-as-Tool-User" to "System-as-Capability-Fulfiller"

We will evolve our architecture to a more powerful abstraction. The planner should not need to know *how* a capability is fulfilled; it should simply state its *intent* using a clear, semantic `actionVerb` (e.g., `RESERVE_TABLE`, `CONVERT_CURRENCY`).

The system, in turn, becomes responsible for fulfilling that intent by finding an existing tool or even orchestrating the creation of a new one. This decouples the high-level planning process from the low-level details of tool implementation and discovery.

## 3. Proposed Architectural Evolution (Phased Approach)

### Phase 1: Reactive Tool Discovery via Novel Verb Handling

This phase reframes tool discovery as a reactive process, triggered when the system encounters a capability it doesn't immediately recognize.

1.  **Planner Focuses on Intent:** The `ACCOMPLISH` planner will be instructed to generate plans using the most logical and descriptive `actionVerb` for a step, regardless of whether it currently exists. It will focus on the "what," not the "how."

2.  **Enhance the Novel Verb Handler:** The `ACCOMPLISH` plugin, when invoked in its "novel verb handler" mode, becomes the core of our discovery engine. Its options will be re-ordered and enhanced:

    *   **Option 1: Find a Matching Tool (New First Step):**
        *   The handler will first use a new, internal `SEARCH_TOOLS` function.
        *   This function will perform a semantic vector search on the `PluginRegistry`, using the novel verb's name and description as the query.
        *   If a high-confidence match is found (e.g., the novel verb `CONVERT_CURRENCY` matches the existing MCP Tool `execute_currency_exchange`), the handler will instruct the `CapabilitiesManager` to **substitute and execute** the found tool with the original inputs.

    *   **Option 2: Decompose into a Plan:** If no single tool can accomplish the task, the handler will proceed with the existing behavior of breaking the novel verb down into a multi-step plan using fundamental, known verbs.

    *   **Option 3: Initiate "Find or Build":** If the task cannot be decomposed and represents a distinct, reusable capability, the handler will recommend the creation of a new tool. This recommendation will now explicitly trigger a "Find or Build" workflow for the `Engineer` agent.

### Phase 2: Proactive, AI-Driven Tool Engineering

This phase makes the system self-expanding by teaching the `Engineer` agent how to create new tools by wrapping existing services.

1.  **Enhance the `Engineer` Agent:** When the `Engineer` receives a "Find or Build" request for a new `actionVerb` (e.g., `RESERVE_LUTECE_TABLE`), its internal process will be:
    1.  **Search External Definitions:** First, search for any existing, un-integrated MCP or OpenAPI tool definitions that match the requested capability.
    2.  **Wrap Existing Tool:** If a matching external tool is found, the `Engineer` will **autonomously generate the boilerplate code for a new Python or TypeScript plugin** that acts as a simple, validated client for that tool's API.
    3.  **Build from Scratch:** Only if no existing tool can be found to wrap will the `Engineer` proceed with writing a new implementation from scratch.
    4.  **Register:** In either case, the `Engineer` will register the new plugin with the `PluginMarketplace`, making it immediately available for discovery by the Novel Verb Handler.

### Phase 3: Knowledge Graph for Advanced Disambiguation

This phase introduces a knowledge graph to solve complex discovery challenges where context is key.

1.  **The Problem:** A simple semantic search may not distinguish between a request to `MAKE_RESERVATION` for a restaurant table versus an airline seat. The verbs are similar, but the required tools are entirely different.

2.  **Knowledge Graph Implementation:**
    *   A graph database (e.g., Neo4j) will be managed by the `Librarian`.
    *   When tools are registered, they are added to the graph not just as a single node, but as a constellation of connected entities. For example, the `SouthwestAirlinesAPI` tool would be linked to nodes for `Airline`, `Flight`, `Seat Reservation`, and `Travel`.

3.  **Context-Aware Search:**
    *   The `SEARCH_TOOLS` function will be upgraded to query this graph.
    *   It will parse the user's full request and the plan's context to extract key entities (e.g., "Southwest", "flight 175", "dinner at 8pm").
    *   The search then becomes a graph traversal: "Find a tool connected to `MAKE_RESERVATION` that is *also* connected to the `Airline` entity, not the `Restaurant` entity."
    *   This allows the system to disambiguate between conceptually similar verbs and select the precise tool for the user's specific context.

## 4. Conclusion

This phased evolution creates a highly intelligent and scalable tool-handling architecture:

-   **Phase 1** immediately solves the scalability problem by abstracting tool discovery away from the planner.
-   **Phase 2** makes the system self-expanding, allowing it to autonomously integrate external tools into its own ecosystem.
-   **Phase 3** provides the final layer of sophistication, enabling true context-aware understanding and disambiguation for complex, real-world tasks.