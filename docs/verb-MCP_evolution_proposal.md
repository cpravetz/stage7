# DEPRECATED: MCP Evolution Proposal

## Deprecation Notice

**This document has been deprecated and replaced by two focused architecture documents:**

1. **Enhanced Verb Discovery & Tool Integration Architecture** (`verb-discovery-architecture-proposal.md`)
2. **Enhanced MCP and OpenAPI Tool Integration & Management Architecture** (`mcp-tool-integration.md`)

## Migration Guide

### What's Changed

The concepts from this document have been distributed and enhanced across the two new architecture documents:

| Original Concept | New Location | Enhancements |
|------------------|--------------|--------------|
| Reactive Tool Discovery | `verb-discovery-architecture-proposal.md` | Enhanced with Chroma-powered semantic search, phased implementation |
| NovelVerbHandler improvements | `verb-discovery-architecture-proposal.md` | Integrated with knowledge graph, better discovery workflow |
| Knowledge Graph for disambiguation | `verb-discovery-architecture-proposal.md` | Future phase with clearer implementation path |
| AI-Driven Tool Engineering | `verb-discovery-architecture-proposal.md` | Future phase with Engineer agent enhancements |
| Tool Definition Structures | `mcp-tool-integration.md` | Enhanced with discovery metadata, better type definitions |
| PluginMarketplace integration | `mcp-tool-integration.md` | Unified architecture with discovery integration |
| External Tool Governance | Both documents | Distributed appropriately between discovery and integration |

### Why the Change

1. **Clearer Separation of Concerns**:
   - Discovery Architecture: Focuses on how tools are found
   - Integration Architecture: Focuses on how tools are managed and executed

2. **Better Implementation Path**:
   - Phased approach with clear priorities
   - Current focus on core discovery infrastructure
   - Future phases for advanced features

3. **Enhanced Technical Depth**:
   - More detailed implementation guidance
   - Better integration with existing systems
   - Comprehensive success metrics and risk mitigation

4. **Improved Maintainability**:
   - Smaller, focused documents
   - Clearer relationships between components
   - Better separation of current vs future work

### For Readers of This Document

If you were looking for:

- **Tool discovery mechanisms**: See `verb-discovery-architecture-proposal.md`
- **Tool integration and management**: See `mcp-tool-integration.md`
- **Phased evolution approach**: Both documents contain phased implementation plans
- **Governance and security**: Primarily in `mcp-tool-integration.md`

### Historical Context

This document represented an early attempt to unify discovery and integration concepts into a single evolutionary architecture. Through analysis, we determined that:

1. The scope was too broad for effective implementation
2. Discovery and integration have different concerns and audiences
3. A phased approach with separate focused documents provides better guidance

The core vision of evolving from "planner-as-tool-user" to "system-as-capability-fulfiller" remains valid and is implemented across both new architecture documents.

## Archived Content

For historical reference, the original content of this proposal is preserved below:

---

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

## 5. Implementation Details (Phase 1)

This section documents the technical implementation of the Reactive Tool Discovery phase.

### 5.1. Librarian Service (`services/librarian`)

-   **Vector Search Backend:** The existing ChromaDB integration (`knowledgeStore/index.ts`) was upgraded to provide true semantic search capabilities.
    -   The placeholder `SimpleEmbeddingFunction` was replaced with a real sentence-transformer model (`Xenova/all-MiniLM-L6-v2`) via the `@xenova/transformers` library.
    -   The dependency `@xenova/transformers` was added to the `librarian`'s `package.json`.

-   **New Tooling API:** Two new endpoints were added to `Librarian.ts` to manage the tool search index.
    -   `POST /tools/index`: Accepts a plugin manifest in the request body. It constructs a descriptive string from the plugin's `verb` and `explanation`, which is then vectorized and stored in a dedicated `tools` collection in ChromaDB. The full manifest is stored as metadata.
    -   `POST /tools/search`: Accepts a `queryText`. It queries the `tools` collection and returns the best matching tool, including its metadata and search distance.

### 5.2. Capabilities Manager Service (`services/capabilitiesmanager`)

-   **Plugin Indexing (`utils/pluginRegistry.ts`):** The `PluginRegistry` is now responsible for keeping the Librarian's tool index up-to-date.
    -   An `axios` instance was added to communicate with the Librarian service.
    -   A new private method, `indexPlugin(manifest)`, was created to send a manifest to the Librarian's `/tools/index` endpoint.
    -   The `refreshCache` method was modified to fetch the full manifest for every plugin from all repositories (including `git`, `github`, `local`, etc.). After fetching, it calls `indexPlugin` for each manifest to ensure it is indexed.
    -   The `_registerInternalVerbs` method was also updated to call `indexPlugin` for all internal verbs (e.g., `THINK`, `CHAT`).

-   **Novel Verb Handling (`CapabilitiesManager.ts`):** The core logic for Phase 1 was implemented in the `handleUnknownVerb` method.
    -   **Search-First Approach:** When a novel verb is encountered, the method now first sends a request to the Librarian's `/tools/search` endpoint, using the novel verb and its description as the query.
    -   **Substitution Logic:** If the search returns a high-confidence match (distance below a defined threshold of `0.5`), the system substitutes the novel verb with the verb from the matched tool's manifest.
    -   **Re-Execution:** After substitution, the step is re-dispatched internally by calling `executeActionVerb` with the corrected verb, effectively routing the request to the correct plugin.
    -   **Fallback:** If the tool search fails, or if no high-confidence match is found, the logic falls back to its original behavior: invoking the `ACCOMPLISH` plugin to generate a new plan to handle the novel verb.

## 6. External Tool Discovery and Governance

While the internal discovery mechanism (Phase 1) and AI-driven tool creation (Phase 2) provide a powerful foundation, integrating with the vast ecosystem of external tools (e.g., public APIs, third-party services) is critical for expanding the system's capabilities. This section outlines the strategy for discovering, vetting, and safely integrating external MCP and OpenAPI tools.

### 6.1. Discovery Strategy: A Hybrid Approach

We will adopt a hybrid strategy that balances user control with autonomous capabilities. The core principle is that **no external tool is ever used without explicit user review and approval.**

#### 6.1.1. User-Directed Discovery (Primary Method)

The most secure and reliable method for introducing external tools is through direct user guidance. The user, or a system administrator, will be able to register a source of tool definitions. This can be done via a new API endpoint in the Librarian service (e.g., `POST /tools/sources`). Supported sources will include:

-   **Direct URL to an OpenAPI/Swagger specification.**
-   **URL to a public Git repository containing tool manifests.**
-   **Connection to a curated Tool Marketplace (as described in `PluginMarketplace.ts`).**

Once a source is registered, the `Librarian` will periodically scan it for new or updated tools, adding them to a "pending review" queue.

#### 6.1.2. Semi-Autonomous Discovery (Optional Feature)

To enhance discovery, the system can be configured to proactively search for tools. This feature will be **disabled by default** and requires explicit user opt-in.

-   **Where Discovery Happens:** The `Librarian` will be responsible for this discovery process, running it as a background task.
-   **How it Works:** The `Librarian` will query a curated list of well-known, public API directories (e.g., APIs.guru, public-apis.io). It will search for tools based on high-priority capabilities that the system has identified as gaps (e.g., frequent "novel verb" failures that could not be decomposed).
-   **Review Process:** Discovered tool definitions are not automatically trusted. They are added to the same "pending review" queue as user-directed discoveries, awaiting manual approval.

### 6.2. The "Airlock": A Process for Vetting and Onboarding

To mitigate the risks associated with external tools, every new tool must pass through a strict "Airlock" process before it can be used in planning or execution.

1.  **Discovery:** A potential tool is identified via user-directed or semi-autonomous discovery. It is added to a "pending review" list.
2.  **User Review & Approval:** The user is presented with the tool's manifest (its description, author, required permissions, API endpoints). The user must explicitly approve the tool. During this step, the user can also configure:
    *   **Usage Policies:** Set rate limits, quotas, or budgets for paid APIs.
    *   **Access Control:** Define which agents or users are permitted to use the tool.
3.  **Automated Wrapping & Sandboxing:** Upon approval, the `Engineer` agent is tasked to onboard the tool.
    *   It autonomously generates a new, lightweight "wrapper" plugin (TypeScript or Python) that acts as a client for the external API.
    *   This wrapper enforces strict input/output schema validation and acts as a sandbox. It prevents the external tool from executing arbitrary code or accessing unauthorized resources.
4.  **Verification:** The `Engineer` also generates a basic "unit test" for the new plugin based on the tool's documentation. This test is executed to verify that the tool behaves as advertised.
5.  **Registration:** If the verification test passes, the new wrapper plugin is formally registered with the `PluginRegistry` and indexed by the `Librarian`. It is now a first-class, trusted tool available for use.

### 6.3. Risk Analysis and Mitigation

Integrating external tools introduces significant risks that must be actively managed.

| Risk Category | Description | Mitigation Strategy |
| :--- | :--- | :--- |
| **Security** | An external tool could be malicious, attempting to exfiltrate data, exploit vulnerabilities, or perform destructive actions. | - **Explicit User Approval:** No tool is used without manual vetting. <br> - **Sandboxed Wrappers:** Tools are never called directly; they are invoked via a generated wrapper that validates all I/O and restricts permissions. <br> - **Network Policies:** Outgoing network calls from wrappers can be restricted to pre-approved domains. |
| **Reliability** | External APIs can be unstable, change without notice, or be decommissioned, causing plan failures. | - **Automated Health Checks:** The `CapabilitiesManager` will periodically ping the health endpoint of wrapped tools. <br> - **Performance Monitoring:** Latency and error rates are tracked. <br> - **Automatic Deactivation:** Tools that consistently fail health or performance checks are automatically disabled, and the user is notified. |
| **Goal Alignment** | The tool's behavior may not perfectly match its description, leading to incorrect or unexpected outcomes. | - **Automated Verification:** The `Engineer` generates and runs a basic test during the "Airlock" process to confirm the tool's core functionality. <br> - **Semantic Clarity:** The wrapper plugin's manifest can be refined by the `Engineer` or the user to more accurately describe its function for the planner. |
| **Cost** | Autonomous use of pay-per-use APIs could lead to unexpected financial costs. | - **Budget Controls:** Users must be able to set hard/soft limits and spending alerts on a per-tool basis during the approval step. <br> - **Usage Dashboards:** The system will provide visibility into API usage and associated costs. |

This governance framework ensures that while the system can be expanded with external capabilities, it is done in a manner that prioritizes safety, security, and reliability, with the user always in control.

## 7. Implementation Checklist for External Tool Governance

This section breaks down the recommendations from Section 6 into a checklist of concrete tasks for each affected service.

### 7.1. Librarian Service (`services/librarian`)

-   [ ] **API for Tool Sources:**
    -   [ ] Create a new data model for `ToolSource` (e.g., `id`, `type: 'openapi' | 'git' | 'marketplace'`, `url`, `last_scanned_at`).
    -   [ ] Implement `POST /tools/sources`: Add a new external tool source to the database.
    -   [ ] Implement `GET /tools/sources`: Retrieve the list of all configured tool sources.
    -   [ ] Implement `DELETE /tools/sources/{id}`: Remove a tool source.
-   [ ] **API for Tool Review:**
    -   [ ] Create a new data model for `PendingTool` (e.g., `id`, `source_id`, `manifest_url`, `manifest_json`, `status: 'pending' | 'approved' | 'rejected'`).
    -   [ ] Implement `GET /tools/pending`: Retrieve the list of all tools awaiting review.
    -   [ ] Implement `POST /tools/pending/{id}/approve`: Mark a tool as approved and trigger the `Engineer` onboarding process. This endpoint should accept policy configurations (rate limits, budgets) in the request body.
    -   [ ] Implement `POST /tools/pending/{id}/reject`: Mark a tool as rejected.
-   [ ] **Background Discovery Worker:**
    -   [ ] Create a scheduled job that iterates through all `ToolSource` entries.
    -   [ ] For each source, fetch the contents and parse for tool manifests (e.g., OpenAPI specs).
    -   [ ] For each discovered tool, check if it's already in the `PendingTool` list or registered with the `CapabilitiesManager`. If not, add it to the `PendingTool` list with a 'pending' status.
-   [ ] **Semi-Autonomous Discovery Worker (Optional):**
    -   [ ] Create a separate, disabled-by-default scheduled job.
    -   [ ] When enabled, this job will query public API registries (e.g., APIs.guru).
    -   [ ] Add newly discovered and relevant tools to the `PendingTool` list.

### 7.2. MCSReact Service (`services/mcsreact`)

-   [ ] **UI for Tool Source Management:**
    -   [ ] Create a new component/view within the existing Plugin Manager section for "External Tool Sources".
    -   [ ] Add a form to submit a new tool source URL and type (calls `POST /tools/sources`).
    -   [ ] Display a table or list of existing tool sources with an option to delete each one (calls `GET /tools/sources` and `DELETE /tools/sources/{id}`).
-   [ ] **UI for "Airlock" Review Process:**
    -   [ ] Create a new component/view for "Pending Tool Reviews".
    -   [ ] Display a list of tools with a 'pending' status (calls `GET /tools/pending`).
    -   [ ] For each pending tool, display its manifest details in a readable format.
    -   [ ] Add "Approve" and "Reject" buttons for each tool.
    -   [ ] On "Approve", open a modal to allow the user to configure rate limits, budgets, and access controls.
    -   [ ] The final "Approve" action in the modal should call `POST /tools/pending/{id}/approve` with the configured policies. The "Reject" button should call `POST /tools/pending/{id}/reject`.

### 7.3. Engineer Service (`services/engineer`)

-   [ ] **Onboarding Workflow:**
    -   [ ] Create a new entry point (e.g., a message queue listener or API endpoint) to receive "onboard tool" requests from the `Librarian` after user approval.
    -   [ ] Implement the logic to fetch the tool manifest (e.g., OpenAPI spec) from the provided URL.
    -   [ ] Implement the code generation logic to create a sandboxed wrapper plugin (TypeScript/Python).
    -   [ ] Implement the logic to generate a basic unit test for the new wrapper.
    -   [ ] Execute the generated test.
    -   [ ] If the test passes, register the newly created plugin with the `PluginMarketplace`/`CapabilitiesManager`.
    -   [ ] Update the status of the tool in the `Librarian`'s database (e.g., from 'approved' to 'active').

### 7.4. Capabilities Manager Service (`services/capabilitiesmanager`)

-   [ ] **Health Check Worker:**
    -   [ ] Add a property to the plugin manifest/metadata to identify tools that are externally wrapped and require health checks.
    -   [ ] Create a scheduled job that periodically iterates through all registered plugins.
    -   [ ] For each external plugin, execute a simple, non-destructive call (e.g., a dedicated `health` endpoint on the wrapper, or a simple `GET` request).
    -   [ ] Implement logic to track latency and error rates.
    -   [ ] If a tool fails multiple consecutive health checks or its performance degrades significantly, automatically disable it in the `PluginRegistry` and notify the user/admin.
