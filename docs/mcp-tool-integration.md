# MCP and OpenAPI Tool Integration Strategy (Revised)

This document outlines the integration of MCP (Mission Control Platform/Proprietary) Tools and OpenAPI Tools into the agent system, enabling agents to leverage external services as part of their action verb repertoire. This revised strategy treats these tools as specialized, definition-based plugins managed via the `PluginMarketplace`.

## 1. Overview

MCP Tools and OpenAPI Tools allow the system to interact with external services. Instead of custom code deployed within the agent system, these tools are defined by their metadata (interface contract, service targets, authentication).

The core architectural principles are:
-   **Definition-Based**: Tools are defined by their `MCPTool` or `OpenAPITool` data structures.
-   **Unified Management via PluginMarketplace**:
    -   These definitions are wrapped in a `DefinitionManifest` (which extends `PluginManifest`) and managed by the `PluginMarketplace`.
    -   A new `LibrarianDefinitionRepository` allows the `PluginMarketplace` to store and retrieve these definitions from Librarian.
    -   Administration (Add, Configure, Delete) is handled by `PluginManager` (in PostOffice) interacting with `PluginMarketplace`.
-   **Unified Capability Handling by CapabilitiesManager**:
    -   `CapabilitiesManager` discovers all handlers (code plugins, OpenAPI tools, MCP tools) *exclusively* through its `PluginRegistry`.
    -   `PluginRegistry` is populated from `PluginMarketplace`.
    -   Execution is dispatched based on the `language` field of the manifest (e.g., `'openapi'`, `'mcp'`, `'python'`).

## 2. Tool Definition Structures

-   **`MCPTool.ts`**: Defines the structure for MCP tool metadata, including `id`, `name`, `actionMappings` (with `actionVerb`, `mcpServiceTarget`), `authentication`, etc.
-   **`OpenAPITool.ts`**: Defines the structure for OpenAPI tool metadata, including `id`, `name`, `specUrl`, `actionMappings` (with `actionVerb`, `operationId`), `authentication`, etc.
-   **`DefinitionManifest.ts`**:
    -   A new type `DefinitionManifest extends PluginManifest`.
    -   It includes a `definitionType: DefinitionType` (enum for `OPENAPI` or `MCP`).
    -   It holds the raw `MCPTool` or `OpenAPITool` object in a `toolDefinition` field.
    -   The `language` field (from `PluginManifest`) is set to `'openapi'` or `'mcp'`.
    -   The `verb` field (from `PluginManifest`) usually corresponds to a primary `actionVerb` from the tool definition's `actionMappings`.
    -   Helper functions like `createOpenApiDefinitionManifest(tool, primaryVerb)` and `createMcpDefinitionManifest(tool, primaryVerb)` are provided to wrap raw definitions.

## 3. Lifecycle Management & Administration

The lifecycle (CRUD) of MCP and OpenAPI tool definitions is managed through the `PluginMarketplace`, with Librarian as the backend via `LibrarianDefinitionRepository`. Administration is intended via `PluginManager` (PostOffice).

-   **`LibrarianDefinitionRepository.ts`**:
    -   A new repository type for `PluginMarketplace`.
    -   **`store(definitionManifest: DefinitionManifest)`**: Extracts the raw `toolDefinition` (MCPTool/OpenAPITool) and saves it to the configured collection in Librarian (e.g., `mcpTools`, `openApiTools`, or a unified `actionHandlers` collection).
    -   **`list()`**: Queries Librarian for stored MCPTool/OpenAPITool definitions. For each definition, it generates one or more `PluginLocator` objects (one for each `actionVerb` in the `actionMappings`). The `PluginLocator.id` is a composite (e.g., `toolId-actionVerb`), and `language` is set to `'mcp'` or `'openapi'`.
    -   **`fetch(id: string, version?: string)`**: Fetches a raw tool definition from Librarian using the `toolId` part of the composite ID. It then wraps this raw definition into a `DefinitionManifest` for the specific `actionVerb` part of the ID.
    -   **`fetchByVerb(verb: string, version?: string)`**: Queries Librarian for a raw tool definition containing the given `verb` in its `actionMappings`. Wraps it into a `DefinitionManifest`.
    -   **`delete(id: string, version?: string)`**: Parses the composite ID to get the `toolId` and deletes the raw tool definition from Librarian.

-   **`PluginMarketplace.ts`**:
    -   Configured to use `LibrarianDefinitionRepository`.
    -   Its `store`, `list`, `fetchOne`, `fetchOneByVerb`, `delete` methods now seamlessly handle these definition-based tools alongside code-based plugins.

-   **`PluginManager` (PostOffice - Conceptual Admin Interface)**:
    -   To add a new MCP tool, an admin (via a UI) would submit the MCPTool JSON definition.
    -   `PluginManager` receives this, (potentially for each `actionVerb` in the definition or a chosen primary one) calls `createMcpDefinitionManifest(mcpToolDefinition, verb)` to create a `DefinitionManifest`.
    -   `PluginManager` then calls `pluginMarketplace.store(theDefinitionManifest)`.
    -   Updates and Deletions follow a similar pattern, using the composite `manifest.id` (e.g., `toolId-actionVerb`) when interacting with `pluginMarketplace.delete()` or for fetching before an update.

-   **Engineer Service**: The `Engineer` service is **not** involved in the CRUD operations for OpenAPI or MCP tool definitions.

## 4. "Use" - Execution by `CapabilitiesManager`

`CapabilitiesManager` executes actions for all types of handlers sourced from its `PluginRegistry`.

1.  **Discovery (`getHandlerForActionVerb`)**:
    -   This method **only** calls `this.pluginRegistry.fetchOneByVerb(actionVerb)`.
    -   The `PluginRegistry` (which gets its data from `PluginMarketplace`, including from `LibrarianDefinitionRepository`) returns the relevant manifest (which could be a `PluginManifest` for code plugins or a `DefinitionManifest` for OpenAPI/MCP tools).

2.  **Execution Dispatch (`executeActionVerb`, `executeActionVerbInternal`)**:
    -   These methods receive the manifest from `getHandlerForActionVerb` (or directly in `executeActionVerbInternal`).
    -   They inspect the `manifest.language` field:
        -   If `'openapi'` (i.e., `DefinitionType.OPENAPI`):
            -   The manifest is cast to `DefinitionManifest`.
            -   The raw `OpenAPITool` is extracted from `definitionManifest.toolDefinition`.
            -   `this.executeOpenAPIToolInternal(openApiToolDefinition, step, trace_id)` is called.
        -   If `'mcp'` (i.e., `DefinitionType.MCP`):
            -   The manifest is cast to `DefinitionManifest`.
            -   The raw `MCPTool` is extracted from `definitionManifest.toolDefinition`.
            -   `this.executeMCPTool(mcpToolDefinition, step, trace_id)` is called.
        -   If `'javascript'`, `'python'`, `'container'`:
            -   The existing logic for code-based plugins is used (`this.executePlugin(...)`).
        -   If the language is unknown or the handler is not found/invalid, it falls back to `handleUnknownVerb()`.
    -   The `executeOpenAPIToolInternal` and `executeMCPTool` methods handle the specific logic for calling those external services, including authentication (via `applyMCPAuthentication` or `addOpenAPIAuthentication`) and transforming responses.

3.  **Listing Capabilities (`listCapabilities`)**:
    -   The `GET /capabilities` endpoint on `CapabilitiesManager` calls `this.pluginRegistry.list()` to get all `PluginLocator` instances.
    -   It then iterates these locators, potentially fetching the full manifest via `pluginRegistry.fetchOne()` for more details, to provide a consolidated list of all system capabilities (code plugins, OpenAPI tools, MCP tools).

## 5. Configuration

-   **Librarian Collections**: `LibrarianDefinitionRepository` is configured with names for Librarian collections (e.g., `openApiTools`, `mcpTools`, or a single `actionHandlers` collection).
-   **Service URLs & Credentials**: As before, target service URLs and authentication credentials for MCP/OpenAPI services are typically managed via environment variables, accessed by `CapabilitiesManager` during execution.

## 6. Revised Example Workflow

1.  **Admin Action**: An administrator, using a UI, defines a new MCP Tool for "CREATE_MCP_ORDER". The UI sends the raw MCPTool JSON definition to `PluginManager` in PostOffice.
2.  **`PluginManager`**:
    -   For the "CREATE_MCP_ORDER" actionVerb (and any other verbs in the MCPTool definition), it calls `createMcpDefinitionManifest(mcpToolJson, "CREATE_MCP_ORDER")` to create a `DefinitionManifest`.
    -   It then calls `pluginMarketplace.store(theDefinitionManifest)`.
3.  **`PluginMarketplace`**:
    -   Identifies that this manifest should be handled by `LibrarianDefinitionRepository` (e.g., based on `manifest.language === 'mcp'` or a pre-configured routing rule).
    -   Calls `librarianDefinitionRepository.store(theDefinitionManifest)`.
4.  **`LibrarianDefinitionRepository`**:
    -   Extracts the raw MCPTool JSON from `theDefinitionManifest.toolDefinition`.
    -   Saves this raw MCPTool JSON to the `mcpTools` collection in Librarian, using `mcpToolJson.id` as the document ID.
5.  **Agent Plan Execution**:
    -   An agent's plan includes a step: `actionVerb: "CREATE_MCP_ORDER"`.
    -   `MissionControl` sends this step to `CapabilitiesManager.executeActionVerb`.
6.  **`CapabilitiesManager` - Discovery**:
    -   `getHandlerForActionVerb("CREATE_MCP_ORDER")` calls `pluginRegistry.fetchOneByVerb("CREATE_MCP_ORDER")`.
    -   `PluginRegistry` (if not cached) calls `pluginMarketplace.fetchOneByVerb("CREATE_MCP_ORDER")`.
    -   `PluginMarketplace` delegates to `LibrarianDefinitionRepository.fetchByVerb("CREATE_MCP_ORDER")`.
    -   `LibrarianDefinitionRepository` queries Librarian, finds the raw MCPTool definition, and wraps it (for the "CREATE_MCP_ORDER" verb) into a `DefinitionManifest`. This is returned up the chain.
7.  **`CapabilitiesManager` - Execution**:
    -   `executeActionVerb` receives the `DefinitionManifest`. It sees `manifest.language === 'mcp'`.
    -   It extracts the raw `MCPTool` object from `manifest.toolDefinition`.
    -   It calls `executeMCPTool(rawMCPToolObject, step, trace_id)`.
8.  **`executeMCPTool`**:
    -   Validates inputs, constructs the HTTP request to the MCP order service, applies authentication, etc.
    -   The MCP service returns a response.
    -   `executeMCPTool` transforms this into `PluginOutput[]` and returns it.

This revised architecture provides a more unified approach to managing all types of action verb handlers through the `PluginMarketplace` and `PluginRegistry`.
