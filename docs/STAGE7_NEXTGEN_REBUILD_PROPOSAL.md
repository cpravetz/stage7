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

### 6.2 Architectural Risk Mitigation Framework (Greenfield Clean Slate)

Since there are no active production instances of Stage7, the rebuild adopts a **Greenfield Clean-Slate Strategy**. We are not constrained by backward compatibility or legacy migrations and can replace outdated message-passing architectures whole cloth.

The rebuild enforces five strict architectural safeguards to avoid past refactoring failure modes:

| Risk Factor | Past Refactoring Failure Mode | NextGen Clean-Slate Mitigation Strategy |
|---|---|---|
| **Service Contracts** | Silent failures via unimplemented mock fallbacks | **Contract-Driven API Schemas**: Strict OpenAPI / gRPC contract generation between L1, L2, L3, and L4. Mocks are completely eliminated. |
| **Clean Architecture** | Maintaining dual-read legacy bridges | **Zero-Legacy Clean Break**: Complete replacement of PostOffice/RabbitMQ with a unified event broker and Temporal workflow engine. |
| **Testing Durability** | Broken local Jest setups and untested async paths | **Mandatory E2E Integration Gates**: Automated integration test suite verifying multi-service state transitions before deployment. |
| **State Consistency** | Ephemeral MongoDB/Redis state drops | **Transactional Saga Rollbacks**: Temporal workflow activities execute atomic state updates with explicit compensation steps for failed tool calls. |
| **Developer DX** | Fragmented SDK patterns & port clutter | **Single Unified SDK**: Streamlined ADK client interfacing directly with the Unified Control Plane API gateway. |

---

## 7. Why Stage7 NextGen? Strategic Differentiators vs. Existing Frameworks

With numerous agent frameworks on the market (e.g., LangGraph, CrewAI, AutoGen, LlamaIndex Workflows), Stage7 NextGen distinguishes itself by serving a unique market positioning: **A Self-Evolving, Entity-Centric Agent OS for Personal Autonomy and Scalable Control**.

### 7.1 Key Differentiators

1. **Self-Evolving & Self-Healing Runtime Engine**:
   - Unlike static agent frameworks where tool integration requires manual coding, Stage7 NextGen retains its core genetic advantage: **Active AI Code Generation & Dynamic Self-Healing**.
   - When an agent encounters missing capabilities or runtime errors, the built-in Engineer/ErrorHandler module generates, tests, and deploys new MCP tools dynamically at runtime without restarting system containers.

2. **Single-User Autonomy to Enterprise Control Continuum**:
   - Existing frameworks force a trade-off: lightweight single-user script libraries (LangGraph/CrewAI) vs. heavy enterprise SaaS platforms.
   - Stage7 NextGen runs effortlessly as a **lightweight, self-hosted personal AI assistant OS** on a single laptop/server, while possessing the architecture to instantly scale to multi-tenant deployment without rewriting agent logic.

3. **Entity-Centric Co-Creation Canvas**:
   - Most frameworks treat UX as a secondary chat box or raw execution log viewer.
   - Stage7 NextGen introduces a **Live Entity Desk & Co-Creation Canvas**: persistent, stateful digital colleagues that collaborate side-by-side with human users on live interactive artifacts (code, documentation, media, architecture diagrams) with real-time inner-monologue streaming.

4. **Native Tool Standard (MCP-First Engine)**:
   - Rather than inventing another proprietary tool schema, Stage7 NextGen builds natively on Anthropic's Model Context Protocol (MCP) as its core tool primitive. Any tool written for Stage7 is instantly usable across the global MCP ecosystem, and vice versa.

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
│   🔄 In Progress: Core replacement underway                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 7.1 Progress Tracker

| Phase | Component | Status | Notes |
|---|---|---|---|
| Phase 1 | MCP Server Runtime | ✅ Complete | Core server, tool registry, stdio/HTTP transport, 8 tests passing |
| Phase 1 | Unified API Gateway | ✅ Complete | Service registry, health routes, 2 tests passing |
| Phase 1 | Shared Worker Pool | ✅ Complete | Task queue, worker pool, REST routes, 12 tests passing |
| Phase 1 | Brain/LLM Layer - Utilities | ✅ Complete | Logger, errors, asyncHandler |
| Phase 1 | Brain/LLM Layer - Structured Output | ✅ Complete | StructuredOutputSampler with Zod |
| Phase 1 | Brain/LLM Layer - Semantic Cache | ✅ Complete | SemanticCache with ioredis |
| Phase 1 | Brain/LLM Layer - Context Manager | ✅ Complete | ContextManager with token-aware windows |
| Phase 1 | Brain/LLM Layer - Model Router | ✅ Complete | ModelRouter with cost-based routing |
| Phase 1 | Brain/LLM Layer - Service | ✅ Complete | BrainService orchestration |
| Phase 1 | Brain/LLM Layer - Routes | ✅ Complete | REST endpoints |
| Phase 1 | Brain/LLM Layer - Tests | ✅ Complete | 16 unit tests passing |
| Phase 2 | Temporal.io | ✅ Complete | Workflow types, MissionWorkflow, activities, 4 tests passing |
| Phase 2 | Vault Integration | ✅ Complete | Envelope encryption, encrypt/decrypt routes, 4 tests passing |
| Phase 2 | NextGen Persistence Service | ✅ Complete | Document storage, mission state, agent state, vector search, 9 tests passing |
| Phase 2 | NextGen Auth Service | ✅ Complete | JWT tokens, API keys, RBAC, 15 tests passing |
| Phase 2 | NextGen Agent Runtime | ✅ Complete | Agent lifecycle, task execution, collaboration, specialization, 10 tests passing |
| Phase 2 | NextGen Tool Executor | ✅ Complete | Tool registry, execution, plugin generation, 11 tests passing |
| Phase 3 | NextGen Frontend | ✅ Complete | React + Vite SPA with entity workspace, multi-agent canvas, live feeds, login, and full service coverage |
| Legacy Cleanup | Legacy Cleanup | ✅ Complete | All legacy services removed from codebase; 'legacy' docker-compose profile cleared; zero legacy imports across NextGen services |
| Legacy Service Replacement | Legacy Service Replacement | ✅ Complete | All 21 legacy assistants removed; Worker-pool replaces dynamic assistant execution; NextGen services are default in docker-compose |
| Dependency Isolation | Dependency Isolation | ✅ Complete | All NextGen services depend only on @stage7-nextgen/shared; zero legacy imports |
| Docker Profile Restructure | Docker Profile Restructure | ✅ Complete | NextGen is default/always-on; legacy services removed from docker-compose |
| Integration Tests | Integration Tests | ✅ Complete | 7 integration suites, 22 tests passing; covers gateway→workers, auth flows, agent runtime collaboration, multi-tenancy, vault→tool executor, and end-to-end mission flows |


## 7.2 True Replacement Strategy

The rebuild has moved from additive parallel services to active replacement of legacy components. The guiding principle: **new services must cut legacy dependencies and supplant old components, not merely coexist with them**.

### Replacement Order

| Priority | Legacy Component | Replacement | Status |
|---|---|---|
| 1 | 21 Assistant Services (port-per-assistant) | Worker-Pool dynamic assistant execution | ✅ Complete |
| 2 | Legacy Brain HTTP API | NextGen Brain direct service calls | ✅ Complete |
| 3 | PostOffice / RabbitMQ | Gateway + MCP Runtime | ✅ Complete |
| 4 | MissionControl | Temporal.io workflows | ✅ Complete |
| 5 | AgentSet | NextGen Agent Runtime | ✅ Complete |
| 6 | Engineer / CapabilitiesManager | Tool Executor | ✅ Complete |
| 7 | Librarian | NextGen Persistence | ✅ Complete |
| 8 | SecurityManager | NextGen Auth | ✅ Complete |

### Replacement Rules

1. **No legacy imports**: NextGen services must not import from `@cktmcs/shared`, `@cktmcs/sdk`, `@cktmcs/errorhandler`, or `@cktmcs/marketplace`
2. **No legacy infrastructure**: New services must not depend on RabbitMQ, Consul, or legacy service discovery
3. **Contract boundaries**: Legacy services that remain must call NextGen services via HTTP APIs, not shared libraries
4. **Deprecation profile**: Legacy services move to `legacy` docker-compose profile; NextGen services move to `default` (always-on)

---

## 7.3 What Has Been Replaced

| Legacy Component | Replacement | Status |
|---|---|---|
| PostOffice | Gateway | ✅ Complete and removed |
| MissionControl | Temporal | ✅ Complete and removed |
| 21 Assistant Services (port-per-assistant) | Worker-Pool | ✅ Complete and removed |
| Brain (legacy) | NextGen Brain (services/brain) | ✅ Complete and removed |
| AgentSet | Agent Runtime | ✅ Complete and removed |
| Engineer / CapabilitiesManager | Tool Executor | ✅ Complete and removed |
| Librarian | Persistence | ✅ Complete and removed |
| SecurityManager | Auth | ✅ Complete and removed |
| Legacy mcsreact frontend | NextGen React frontend (frontend-nextgen) | ✅ Complete and removed |
| Legacy shared/sdk/errorhandler/marketplace packages | shared-nextgen | ✅ Complete and removed |

> **Note:** All legacy components listed above have been completely removed from the codebase. The NextGen replacements are now the sole implementations.

## 7.4 What Remains Legacy

| Legacy Component | Replacement | Details |
|---|---|---|
| mongo | Infrastructure | Used by NextGen Persistence Service (MongoDB) |
| redis | Infrastructure | Used by NextGen Auth Service, Agent Runtime, and Worker Pool (Redis) |

All legacy services have been completely removed from the codebase. Only **mongo** and **redis** infrastructure components remain — these are shared by NextGen services and are not legacy application code.



## 7.5 Final Architecture

> **All legacy code has been removed.** The entire system now runs exclusively on NextGen services. No legacy service processes, packages, or shared libraries remain in the codebase. Only MongoDB and Redis infrastructure persist — both consumed directly by NextGen services.

### NextGen Services

| Service | Port | Directory | Description |
|---|---|---|---|
| Gateway | 3000 | services/gateway | Unified API Gateway (HTTP/WebSocket routing, service registry) |
| Brain | 3100 | services/brain | LLM orchestration, structured output, semantic cache, model routing |
| Worker-Pool | 3200 | services/worker-pool | Dynamic assistant execution (replaces 21 port-per-assistant services) |
| MCP Runtime | 3300 | services/mcp-runtime | Model Context Protocol server runtime and tool registry |
| Agent Runtime | 3400 | services/agent-runtime | Agent lifecycle, task execution, collaboration, specialization |
| Tool Executor | 3500 | services/tool-executor | Tool registry, execution, MCP plugin generation |
| Vault | 4000 | services/vault | Envelope encryption for secrets management |
| Temporal | 4100 | services/temporal | Durable workflow orchestration (replaces MissionControl) |
| Artifacts | 4200 | services/artifacts | Document storage, mission/agent state, vector search, mission event log |
| Auth | 4300 | services/auth | JWT tokens, API keys, RBAC |
| Frontend | 8080 | frontend-nextgen | NextGen React frontend (Entity Workspace, Multi-Agent Canvas) |

### Infrastructure

| Component | Port | Purpose |
|---|---|---|
| MongoDB | 27017 | Persistence backing store (used by NextGen Persistence Service) |
| Redis | 6379 | Caching and queuing (used by Auth, Agent Runtime, Worker-Pool, Persistence) |

### Clean Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                 NextGen Frontend  (port 8080)                       │
│   Entity Workspace  •  Multi-Agent Canvas  •  Live Feeds           │
│                    (frontend-nextgen/)                              │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTP / WebSocket
┌──────────────────────────────▼─────────────────────────────────────┐
│                      Gateway  (port 3000)                          │
│           Unified API Gateway & Service Registry                   │
│                    (services/gateway/)                             │
├──────────┬──────────┬──────────┬──────────┬──────────┬────────────┤
│          │          │          │          │          │
│          ▼          ▼          ▼          ▼          ▼
│ ┌─────────────┐ ┌─────────┐ ┌───────────┐ ┌─────────┐ ┌──────────┐
│ │   Brain     │ │Worker   │ │  MCP      │ │ Agent   │ │  Tool    │
│ │(port 3100)  │ │  Pool   │ │  Runtime  │ │ Runtime │ │Executor  │
│ │             │ │(3200)   │ │  (3300)   │ │ (3400)  │ │(3500)   │
│ └─────────────┘ └────┬────┘ └─────┬─────┘ └─────────┘ └──────────┘
│          │           │           │
│          │           ▼           │
│          │     ┌──────────────────────────────────────┐ │
│          │     │    Temporal  (port 4100)              │ │
│          │     │  Durable Workflow Orchestration       │ │
│          │     │  (replaces MissionControl)           │ │
│          │     └──────────────────┬───────────────────┘ │
│          │                      │                       │
│          │           ┌─────────┴──────────┐            │
│          ▼           ▼                     ▼            ▼
│ ┌─────────────┐ ┌─────────────┐   ┌─────────────┐ ┌─────────────┐
│ │   Vault     │ │ Persistence │   │    Auth     │ │             │
│ │ (port 4000) │ │ (port 4200) │   │ (port 4300) │ │             │
│ │ Envelope    │ │ Document    │   │ JWT, API    │ │             │
│ │ Encryption  │ │ Store,      │   │ Keys, RBAC  │ │             │
│ │             │ │ Vector      │   │             │ │             │
│ └─────────────┘ └─────────────┘   └─────────────┘ └─────────────┘
│          │           │                   │
│          │           │                   │
└──────────┼───────────┼───────────────────┼─────────────────────────┘
           │           │                   │
┌──────────▼───────────▼───────────────────▼────────────────────────┐
│                          Infrastructure                           │
│  ┌─────────────┐           ┌──────────────────┐                   │
│  │  MongoDB    │           │      Redis       │                   │
│  │ (27017)     │           │     (6379)       │                   │
│  │ Persistence │           │  Cache & Queue   │                   │
│  └─────────────┘           └──────────────────┘                   │
│  Used by all NextGen services for durable state                    │
└─────────────────────────────────────────────────────────────────────┘

```

---


## 7.6 Multi-Provider Brain (Implemented)

The Brain service is the LLM orchestrator. It always selects the most appropriate model from the available providers based on the optimization criteria of the prompt, the capabilities required, the token budget, and which providers have valid API keys in the environment.

### Supported Providers

| Provider | Env Variable | API Base | Auth |
|---|---|---|---|
| **OpenAI** | `OPENAI_API_KEY` | `OPENAI_API_BASE` (default `https://api.openai.com/v1`) | Bearer token |
| **OpenRouter** | `OPENROUTER_API_KEY` | `OPENROUTER_URL` (default `https://openrouter.ai/api/v1`) | Bearer token |
| **Anthropic** | `ANTHROPIC_API_KEY` | `https://api.anthropic.com` | `x-api-key` header |
| **Google Gemini** | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | `https://generativelanguage.googleapis.com` | `?key=` query param |
| **Mistral** | `MISTRAL_API_KEY` | `MISTRAL_API_BASE` (default `https://api.mistral.ai/v1`) | Bearer token |
| **Grok (xAI)** | `GROK_API_KEY` or `XAI_API_KEY` | `GROK_API_BASE` (default `https://api.x.ai/v1`) | Bearer token |
| **Hugging Face** | `HUGGINGFACE_API_KEY` or `HF_TOKEN` | `HUGGINGFACE_API_BASE` (default `https://router.huggingface.co/v1`) | Bearer token |
| **OpenWebUI / Ollama** | `OPENWEB_URL` (and optionally `OPENWEBUI_API_KEY`) | `${OPENWEB_URL}/api/v1` | Bearer token (optional for local) |

### Architecture

- **Provider abstraction** (`services/brain/src/providers/`): each provider implements the `LLMProvider` interface (`isAvailable()`, `listModels()`, `complete()`). Most providers extend `OpenAICompatibleProvider` (OpenAI, OpenRouter, Mistral, Grok, HuggingFace, OpenWebUI). Anthropic and Gemini have their own native adapters because they use different request/response formats.
- **Provider registry** (`registry.ts`): auto-detects which providers are available from environment variables. Only providers with valid credentials are registered.
- **Model registry**: each provider exposes its available models (queried via the provider's `/models` endpoint where available, or fall back to a curated default list). Each model is tagged with `capabilities: ['chat', 'code', 'reasoning', 'vision', 'creative', 'search']`, `maxTokens`, and `costPer1kTokens`.
- **ModelRouter** (`ModelRouter.ts`): selects the optimal model by:
  1. Inferring required capabilities from the prompt via keyword analysis.
  2. Filtering candidates by capabilities, `maxTokens`, `budget`, and (if specified) `provider`.
  3. Sorting by cost ascending; picking the cheapest that meets all criteria.
  4. Relaxing capability filter if no strict match; throwing if no model is available at all.
- **BrainService**: orchestrates the call. It checks the semantic cache first (key = SHA-256 of prompt + systemPrompt + model + provider), then routes, then dispatches to the matching provider. Caches the result on success.
- **SemanticCache** (`SemanticCache.ts`): Redis-backed with a 1-second connection timeout and automatic in-memory fallback when Redis is unreachable, so tests and local development don't hang.

### API

The Brain exposes:
- `GET /api/brain/health` — service health with provider list and model count
- `GET /api/brain/providers` — list of configured providers
- `GET /api/brain/models` — all available models across providers
- `POST /api/brain/complete` — unified completion endpoint accepting `{ prompt, systemPrompt?, model?, provider?, maxTokens?, budget?, temperature? }`
- `POST /api/brain/validate` — structured output validation against a Zod schema
- `POST /api/brain/route` — model routing preview (lists candidates)
- `GET /api/brain/cache/stats` — cache hit/miss/mode stats

### Model Selection Examples

- `POST /api/brain/complete` with `{ prompt: "Help me write a Python function" }` → routes to the cheapest model with `code` capability
- `POST /api/brain/complete` with `{ prompt: "...", model: "openai/gpt-4o-mini", provider: "openrouter" }` → uses that exact model on that provider
- `POST /api/brain/complete` with `{ prompt: "...", provider: "openai" }` → picks the cheapest model on OpenAI
- Reasoning models (e.g. Gemini with `max_tokens` < 64) automatically fall back to their `reasoning` field when `content` is empty, so the caller always gets a useful answer.

### Mission Integration

A mission flows through the Brain via the worker-pool's `AssistantExecutor.execute()`, which forwards the mission prompt and (optionally) the assistant's persona system prompt to the Brain. The Brain picks the model, the provider handles the API call, and the real LLM response is persisted as the mission output.

## 8. Conclusion

By implementing the NextGen Rebuild Proposal, Stage7 eliminates legacy architectural bottlenecks, resolves port scaling limits, standardizes tool ecosystem integration via MCP, and elevates user experience from rigid plan tracking to dynamic, entity-centric agent collaboration. This positions Stage7 as a state-of-the-art, enterprise-grade agent platform ready for commercial multi-tenant deployment.
