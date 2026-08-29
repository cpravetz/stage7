# Stage7 NextGen Rebuild Proposal: Modernizing Enterprise Multi-Agent Architecture

**Author:** Software Architecture Team
**Date:** February 2026
**Status:** Proposal

---

## 1. Executive Summary & Problem Diagnosis

Stage7 was originally designed in the early era of agentic LLM technology. While its 4-layered architecture (L1 Core Engine, L2 SDK, L3 Assistants, L4 Frontend) and SDK-first `QuickAssistant` pattern provided a strong conceptual foundation, the underlying implementation reflects early design choices that introduce significant operational friction, fragility, and maintenance overhead.

### 1.1 Key Vulnerabilities & Bottlenecks in Current Architecture

1. **Rigid Plan-Centric Fragility**:
   - The current mission engine (`MissionControl` + `Brain` + `CapabilitiesManager`) relies on generating monolithic static plan steps (via `ACCOMPLISH`) and executing them sequentially.
   - If a step fails, output schemas mismatch, or an external API changes, the entire mission frequently stalls or enters unrecoverable loops.
   - String-parsing heuristics (`ensureJsonResponse`) are used for LLM structured output parsing rather than strict inference-level schema constraints.

2. **Inefficient Model Optimization & Routing**:
   - Model selection is limited to basic fallback arrays and reactive blacklisting when endpoints fail.
   - Lacks semantic prompt caching, token-aware sliding window management, dynamic cost-performance routing, and local token-grammar sampling.
   - High token overhead due to sending full history contexts rather than hierarchical vector-retrieved memory chunks.

3. **Poor Error Recovery & Resiliency**:
   - Mission execution state is stored ephemerally across memory queues (RabbitMQ/PostOffice) and MongoDB without transactional step rollback or saga patterns.
   - If a container restarts mid-mission, context and progress are lost.
   - Lack of durable background activity retries and standardized self-healing circuits.

4. **UX Mismatch (Plan-Centric vs. Agent/Entity-Focused)**:
   - The user interface centers heavily around raw plan steps, execution logs, and modal step trackers.
   - Modern agentic UX requires an **Agent/Entity-centric experience**: persistent agent personas, collaborative multi-agent workspaces, direct artifact editing, live streaming of inner-monologue/tool calls, and interactive human-in-the-loop approval gates.

5. **Administrative & Scaling Friction**:
   - **Port-per-Assistant Bottleneck**: Each of the 20+ assistants (Sales, HR, CTO, PM, etc.) runs as an independent long-running Node.js process bound to a dedicated HTTP/WebSocket port (e.g., ports 3001, 3002, 3003...). This topology cannot scale to hundreds or thousands of custom enterprise assistants.
   - Secret management relies on plaintext `.env` files or basic DB fields without enterprise envelope encryption (e.g., Vault).
   - Lack of unified telemetry (OpenTelemetry) for end-to-end distributed tracing across microservices.

---

## 2. NextGen Target Architecture Overview

The rebuilt system (**Stage7 NextGen**) transitions Stage7 from a plan-centric, port-bound prototype into an **event-driven, state-durable, entity-focused enterprise agent platform**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Unified Frontend UX                                  │
│            Entity Workspace  •  Multi-Agent Canvas  •  Live Tool & Memory Feeds       │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Unified API Gateway (HTTP/WS)
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                             Unified Control Plane & Ingress                            │
│           Routing & Auth  •  Tenant Isolation  •  Vault Secrets  •  Cost Caps          │
└───────────────┬───────────────────────────────────────────────────────────┬────────────┘
                │                                                           │
┌───────────────▼───────────────────────────┐   ┌───────────────────────────▼────────────┐
│        Durable Execution Engine           │   │         Shared Worker Pool             │
│   Temporal.io / Stateful Actor Loops      │───│  Dynamic Assistant Runtimes & MCP      │
│   (Resumable Missions, Saga Workflows)    │   │  (Isolated Sandbox Containers)         │
└───────────────┬───────────────────────────┘   └───────────────────────────┬────────────┘
                │                                                           │
┌───────────────▼───────────────────────────────────────────────────────────▼────────────┐
│                              Optimized LLM & Memory Layer                              │
│  Grammar Sampling  •  Semantic Redis Cache  •  Model Discovery & Dynamic Routing     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Architectural Enhancements

### 3.1 Serverless Shared Worker Pool & Unified Control Plane
- **Eliminate Port-per-Assistant**: Replace individual assistant server processes with a single **Unified API Gateway** routing to a dynamic **Shared Worker Pool**.
- **Dynamic Assistant Loading**: When an agent task is triggered, worker nodes load the assistant's context, system prompts, and tool manifests dynamically from central persistence (Librarian/Redis) and execute inside an isolated sandbox.
- **Unified Control Plane**: Single interface for registering assistants, configuring tools, managing model provider keys, setting spending caps, and viewing system-wide analytics.

### 3.2 State-Durable Workflow Orchestration (Temporal / BullMQ)
- **Durable Mission DAGs**: Rebind `MissionControl` execution to a durable workflow engine (such as Temporal.io or BullMQ).
- **Crash Fault-Tolerance**: If a worker or service restarts mid-task, execution resumes instantly from the exact failing step without re-running expensive LLM calls.
- **Long-Running Human-in-the-Loop**: Workflow steps can pause safely for hours or days waiting for human authorization, asset upload, or review without consuming active CPU cycles.

### 3.3 Standardization on Anthropic's Model Context Protocol (MCP)
- **Native MCP Ecosystem**: Transition Stage7 tool definitions away from proprietary JSON structures to standard **Model Context Protocol (MCP)** manifests.
- **MCP Client Adapter**: Built-in adapter allows Stage7 agents to plug into hundreds of community MCP servers (GitHub, PostgreSQL, Slack, Brave Search, Puppeteer, filesystem, etc.).
- **Stage7 as an MCP Server**: Expose internal Stage7 core capabilities as standard MCP endpoints for external AI clients.

### 3.4 Modern LLM Optimization & Dynamic Routing
- **Token-Grammar Sampling & Structured Outputs**: Use structured inference frameworks (`Instructor`, Zod/Pydantic grammars) to enforce strict JSON schemas directly during LLM generation, eliminating markdown stripping and raw regex string parsing.
- **Semantic Prompt Caching**: Implement a Redis vector caching layer to bypass LLM calls for recurring prompt types and static tool definitions.
- **Hierarchical Vector Memory**: Prune large context windows with semantic RAG retrieval (`tiktoken`-aware sliding windows) rather than naive character truncation.
- **Real-Time Cost & Routing Optimization**: Dynamic model router selects the most cost-effective provider/model (e.g., Claude 3.5 Sonnet, GPT-4o, DeepSeek R1, or local Ollama) based on prompt complexity, task urgency, and token budget.

### 3.5 Autoregressive Error Recovery & Self-Healing
- **Multi-Stage Self-Correction**: When a tool execution fails or code contains bugs, error logs are piped through an automated critic feedback loop (using the `errorhandler` package). The agent automatically analyzes stack traces, corrects parameters, and retries.
- **Circuit Breaker Integration**: Automatic failure counting marks unhealthy tools or LLM endpoints, triggering graceful degradation to secondary providers without throwing unhandled exceptions.

---

## 4. Entity-Centric & Agent-Focused UX Overhaul

### 4.1 Transition from Plan-Centric to Entity-Centric Paradigm

| Legacy Stage7 UX | NextGen Entity-Centric UX |
|---|---|
| Rigid modal step tracker showing plan steps 1..N | Persistent Agent/Entity Workspaces with distinct personas |
| Execution paused while waiting on raw step logs | Real-time streaming inner monologue, tool call activity, and outputs |
| Static mission launch screen | Interactive canvas with side-by-side artifact co-creation |
| Manual plan editing | Active human intervention: direct agent guidance & approval gates |

### 4.2 Key Frontend Modernizations
- **Multi-Agent Collaboration Canvas**: Visual node graph showing real-time interaction, delegation flow, and state transitions between agents.
- **Unified Entity Desk**: Each entity (e.g., Product Manager Assistant, CTO Assistant, Sales Assistant) acts as a persistent collaborator with dedicated memory, past mission histories, assigned integrations, and background tasks.
- **Live Tool & Artifact Workspace**: Documents, code snippets, charts, and file outputs generated by tools render directly in an interactive live workspace adjacent to the agent chat stream.

---

## 5. Enterprise Administration & Operations

### 5.1 Multi-Tenancy & Data Isolation
- **Logical & Row-Level Security (RLS)**: Enforce strict `tenantId` and `orgId` isolation at the database layer (MongoDB/Redis) for multi-tenant SaaS deployments.
- **Data Encryption**: Support encrypted-at-rest data isolation with client-managed keys (Bring Your Own Database / BYODB options).

### 5.2 Enterprise Secrets Management
- **Vault Integration**: Eliminate raw `.env` storage of third-party API keys (OpenAI, Anthropic, Jira, Slack).
- **Envelope Encryption**: Third-party credentials and user tokens are stored encrypted via AES-256-GCM using HashiCorp Vault, AWS KMS, or the internal Security service. Keys are decrypted only at execution runtime inside worker memory.

### 5.3 Distributed Tracing & Observability
- **OpenTelemetry (OTel)**: Native instrumentation across all workers, API gateways, execution loops, and LLM calls.
- **Full Trace Visibility**: Developers can track a user request from UI socket emission -> Gateway -> Temporal Workflow -> Agent Execution -> MCP Tool -> LLM API call with complete trace IDs in Jaeger/Datadog.
- **Token Spending Attribution**: Real-time token usage dashboard by user, department, assistant, and mission with hard budget enforcement limits.

---

## 6. Retrospective on Past Modernization Pitfalls & Risk Mitigation

A critical evaluation of previous refactoring attempts (e.g., `modernization_proposal.md`) highlights why previous modernization efforts inadvertently caused system instability, fragile runtime behaviors, and mock-heavy technical debt:

### 6.1 Root Causes of Past Instability
1. **Big-Bang Architecture Swaps**: Previous proposals attempted to replace core message-passing protocols wholesale without maintaining backward-compatible adapters, leading to broken service-to-service contracts.
2. **Mock-Heavy Abstraction Leaks**: SDK enhancements (such as `HttpCoreEngineClient`) added unimplemented placeholder methods (`// TODO: Implement when L1 provides...`) and silent fallback mocks rather than true integration tests.
3. **Layer Coupling Violations**: Higher-level SDK abstractions became tightly bound to lower-level infrastructure setups (such as hardcoded per-assistant port numbers), causing local dev setup failures and workspace test brittleness.

### 6.2 Architectural Risk Mitigation Framework

To guarantee that Stage7 NextGen avoids repeating these failure modes, the rebuild enforces five strict architectural safeguards:

| Risk Factor | Past Refactoring Failure Mode | NextGen Safeguard & Mitigation Strategy |
|---|---|---|
| **Service Contracts** | Silent failures via unimplemented mock fallbacks | **Contract-Driven API Schemas**: Strict OpenAPI / gRPC contract generation between L1, L2, L3, and L4. Mocks are forbidden in production builds. |
| **Migration Path** | Big-bang replacement of PostOffice / RabbitMQ | **Dual-Read / Adapter Pattern**: Dual-adapter bridge where legacy plugins & `QuickAssistant` instances execute side-by-side with new MCP worker instances during migration. |
| **Testing Durability** | Broken local Jest setups and untested async paths | **Mandatory E2E Integration Gates**: Integration test suite verifying multi-service state transitions prior to merging any core engine refactor. |
| **State Consistency** | Ephemeral MongoDB/Redis state drops | **Transactional Saga Rollbacks**: Temporal workflow activities execute atomic state updates with explicit compensation steps for failed tool calls. |
| **SDK Stability** | Breaking changes to `QuickAssistant` interfaces | **Zero-Downtime ADK Compatibility Layer**: The L2 ADK `createQuickAssistant` interface remains 100% backward compatible; internal transport details are hidden behind standard adapters. |

---

## 7. Implementation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Phase 1: Foundation & MCP Protocol                    │
│   • Standardize tool layer on Anthropic Model Context Protocol (MCP)        │
│   • Implement Pydantic/Zod structured output sampling in Brain              │
│   • Upgrade LLM layer with semantic Redis caching & token-aware windows     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────┴──────────────────────────────────────┐
│                  Phase 2: Durable Control Plane & Workers                   │
│   • Build Unified API Gateway and shared serverless worker pool             │
│   • Integrate Temporal.io workflow engine for state-durable execution       │
│   • Integrate Vault envelope encryption for secure secret management        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────┴──────────────────────────────────────┐
│                   Phase 3: Entity UX & Enterprise Scale                     │
│   • Redesign React UI into Entity-Centric Agent Canvas & Workspace          │
│   • Implement Row-Level Multi-Tenancy (RLS) & OpenTelemetry tracing         │
│   • Deploy cost attribution dashboards and automated spending limits        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Conclusion

By implementing the NextGen Rebuild Proposal, Stage7 eliminates legacy architectural bottlenecks, resolves port scaling limits, standardizes tool ecosystem integration via MCP, and elevates user experience from rigid plan tracking to dynamic, entity-centric agent collaboration. This positions Stage7 as a state-of-the-art, enterprise-grade agent platform ready for commercial multi-tenant deployment.
