# Stage7 Modernization & Commercialization Proposal

**Author**: Jules, Software Engineer
**Date**: February 14, 2026
**Status**: Proposal

---

## 1. Executive Summary

Since the inception of Stage7, the AI agent space has shifted from basic LLM prompt chaining to highly structured, reactive, and state-durable multi-agent architectures. This proposal outlines the key enhancements required to modernize Stage7's Agent Development Kit (ADK) and underlying engine, transforming it from a promising development framework into an enterprise-ready, commercially viable SaaS platform.

Our analysis shows that while Stage7 possesses a highly clean, layered architecture and an elegant SDK-first design pattern (especially the `createQuickAssistant` abstraction), it suffers from production scaling limitations, mock-heavy infrastructure integrations, and a lack of true enterprise-grade multi-tenancy, observability, and state durability.

We propose a phased roadmap to transition Stage7 to a state-of-the-art agentic ecosystem, incorporating:
- **Anthropic's Model Context Protocol (MCP)** for standardized tool discovery and execution.
- **Durable workflows (e.g., Temporal.io / BullMQ)** to handle long-running, asynchronous, and resumable agent missions.
- **Unified API Gateway Routing** to replace the port-per-assistant bottleneck.
- **Enterprise Multi-Tenancy & Secrets Isolation** using row-level security and secure vaults (e.g., HashiCorp Vault).
- **Comprehensive Observability** via OpenTelemetry and structured tracing.

---

## 2. Modernizing Stage7's Agentic Architecture

To stay competitive with modern agentic frameworks (such as LangGraph, CrewAI, AutoGen, and LlamaIndex Workflows), the Stage7 architecture must be upgraded in several key dimensions.

### 2.1 From Message-Passing to Reactive State Machines & Actor Models
*   **Current State**: Stage7 relies on a customized JSON message-passing protocol routed through a central `PostOffice` service. Communications between L1, L2, and L4 are highly asynchronous but lack formal state verification, leading to potential race conditions or lost state during socket drops.
*   **Modernization**: Transition the communication topology to a **Reactive Actor Model** (using concepts from XState or Microsoft AutoGen). Each assistant should act as a state-ful, isolated actor that emits structured events. State transitions should be mathematically modelable, preventing agents from entering infinite delegation loops.

### 2.2 Standardizing on Anthropic's Model Context Protocol (MCP)
*   **Current State**: Stage7 uses a proprietary tool registration and execution paradigm. Tools (like `JiraTool`, `ConfluenceTool`) are hardcoded TypeScript/JavaScript classes with custom JSON schemas registered directly via the SDK.
*   **Modernization**: Standardize Stage7's tools on the **Model Context Protocol (MCP)**.
    -   Create an **MCP Client Adapter** in the L2 SDK that allows any Stage7 assistant to seamlessly call external, community-developed MCP servers.
    -   Expose Stage7's proprietary tools (like `DataAnalysisTool`) as an **MCP Server**, making them usable by any external, MCP-compliant client.
    -   This instantly multiplies Stage7's integrations with hundreds of pre-built developer tools.

### 2.3 Durable Workflow Orchestration (Temporal / BullMQ)
*   **Current State**: Missions are managed ephemerally. If `MissionControl` or the execution worker container restarts mid-mission, the entire mission context and execution state are lost.
*   **Modernization**: Introduce a durable, code-driven orchestration engine.
    -   Integrate **Temporal.io** or **BullMQ** to back the L1 `MissionControl` execution loop.
    -   Steps in a mission plan are executed as durable activities. If a container crashes, the workflow automatically resumes from the exact failing step without losing local variables or LLM conversation history.
    -   This is vital for human-in-the-loop steps that might remain pending for days.

### 2.4 Structured Outputs & Autoregressive Self-Repair
*   **Current State**: The `Brain` service attempts to enforce JSON outputs using custom prompts and a basic `ensureJsonResponse` repair helper.
*   **Modernization**: Standardize on **Structured Output Engines** (utilizing libraries like `Instructor`, `Outlines`, or direct JSON schema grammars for local LLMs).
    -   Force LLMs to adhere directly to Pydantic/Zod schemas at the inference level (token grammar sampling) rather than relying on regex or prompt heuristics.
    -   Implement standard multi-stage **self-correction loops** (critic-actor pattern) where the LLM parses compilation/runtime errors (using the `errorhandler` package) and corrects its own tool invocations automatically.

### 2.5 Context-Window and Long-Term Memory Optimization
*   **Current State**: The `Brain` service uses proportional character truncation to manage context windows.
*   **Modernization**:
    -   **Token-Aware Sliding Windows**: Implement exact token counters using `tiktoken` or a JS-equivalent to prune context windows dynamically.
    -   **Semantic Memory Retrieval**: Replace full-history loading with **Hierarchical Memory retrieval**. Retrieve only relevant conversation history chunks and context documents from the vector database (Chroma/Pinecone) based on the current user intent, keeping token usage minimal and lowering LLM costs.

---

## 3. Modifying Stage7 for Commercial & SaaS Viability

To turn Stage7 into a commercially successful SaaS product or an enterprise-grade internal platform, we must solve critical deployment, security, billing, and routing bottlenecks.

### 3.1 Resolving the Port-per-Assistant Bottleneck (Control Plane & Worker Nodes)
*   **Current State**: The 20+ assistants (Sales, HR, CTO, PM, etc.) each run as independent, long-running Node.js processes bound to their own dedicated HTTP/WebSocket ports (e.g., 3001, 3002). This does not scale. If 1,000 users register custom assistants, the server will quickly exhaust available ports and memory.
*   **Commercialization**: Implement a **Serverless/Shared Worker Pattern** and a **Control Plane**:
    -   Run a single, highly optimized **Assistant Execution Pool** (worker pool).
    -   When a user initiates a conversation with a Product Mgt Assistant, a worker dynamically fetches the Product Mgt Assistant's configuration from the database and executes its logic in an isolated sandbox.
    -   Implement a **Unified API Gateway** (e.g., Kong, Traefik, or an Express-based Router) that exposes a single entrypoint (e.g., `api.stage7.ai/v1/assistants/:id`) and dynamically routes traffic internally.

### 3.2 Enterprise Multi-Tenancy & Data Isolation
*   **Current State**: Database interactions are segmented using simple optional `userId` and `agentClass` keys in MongoDB. There is no hard security barrier between tenants.
*   **Commercialization**:
    -   Introduce **Logical Multi-Tenancy**: All DB schemas (MongoDB/Redis) must strictly enforce a `tenantId` field.
    -   **Row-Level Security (RLS)**: Enable database/application middleware that automatically appends `tenantId` to every query, preventing cross-tenant data leaks.
    -   **Data Residency**: Allow enterprise tenants to supply their own databases (BYODB - Bring Your Own Database) or pin their data to specific geographic regions.

### 3.3 Dynamic Config & Secrets Management (Vault Integration)
*   **Current State**: Credentials, API keys, and secrets are stored in raw environment variables (e.g., `.env` file) or plaintext in database configurations.
*   **Commercialization**:
    -   Integrate a secure secret manager (like **HashiCorp Vault**, **AWS Secrets Manager**, or encrypted MongoDB fields).
    -   Allow users to securely input their personal or organization-level keys (e.g., OpenAI API Key, Jira API Key) via the frontend, storing them encrypted at rest using envelope encryption (AES-GCM-256).
    -   At runtime, inject these credentials dynamically into the tool execution context without ever persisting them in logs or code variables.

### 3.4 Token Tracking, Cost Attribution, and Monetization
*   **Current State**: No tracking of model execution costs per assistant or user.
*   **Commercialization**:
    -   **Inference Auditing**: Log every token consumed (input, output, and cache hit/miss) by the `Brain` service.
    -   **Cost Attribution**: Calculate operational expenses in real-time by multiplying token counts by model-specific pricing.
    -   **Monetization / Subscriptions**: Integrate **Stripe Billing**. Set up usage-based billing tiers (e.g., Free Tier gets 50,000 tokens/mo; Premium gets 5M tokens/mo) and implement hard spending limits to protect the system against runaway loops.

### 3.5 Production Observability & Distributed Tracing
*   **Current State**: Metrics are limited to basic custom API endpoints (`/getLLMCalls`) and custom React monitoring charts.
*   **Commercialization**:
    -   Integrate **OpenTelemetry (OTel)** across the entire microservice ecosystem.
    -   Every message or user prompt must propagate a `trace_id` and `span_id`.
    -   This allows developers to view detailed execution traces in Jaeger, Datadog, or Honeycomb to instantly diagnose which agent delegated a task, what tool was invoked, and where latency or errors occurred.

---

## 4. Evaluation of the ADK Samples & Underlying ADK

### 4.1 Are the ADK Samples and Underlying ADK Functional?
*   **The Verdict**: **Partially Functional with Integration Gaps.**
*   **Key Findings**:
    1.  **Mock-Heavy L1 Integrations**: The core L2 SDK class `HttpCoreEngineClient.ts` relies on many unimplemented placeholders. For example, `getMissionHistory()` returns an empty array with a warning: `// TODO: Implement when L1 provides a history endpoint`. Similarly, `getContext()` and `updateContext()` are marked as unimplemented.
    2.  **Broken Out-of-the-Box Local Testing**: The local Jest test suite in `sdk/package.json` fails to run immediately due to a configuration mismatch with `ts-jest` presets in the monorepo workspace.
    3.  **Synchronization Issues**: The React UI uses ephemeral WebSocket channels. If a socket disconnects, there is no standardized mechanism for the frontend to easily re-sync the entire state of the conversation other than starting over.

### 4.2 Is the ADK Well-Designed?
*   **The Verdict**: **Highly Innovative and Well-Structured conceptually, but suffers from physical deployment coupling.**
*   **Strengths**:
    -   **QuickAssistant Pattern**: The `createQuickAssistant` abstraction is exceptionally well-designed. It eliminates massive amounts of boilerplate code (~250 lines down to ~20 lines), allowing developers to register an assistant, supply its personality, and lazily load tools in minutes.
    -   **Separation of Concerns**: The 4-layered model (L1-L4) provides a brilliant conceptual roadmap. Keeping the core planning engine (L1) separate from the domain-specific logic (L3) prevents agents from becoming monolithic.
    -   **Structured Tool Interface**: Defining tools with standardized input and output JSON schemas allows for easy integration with both code execution and LLM function calling.
*   **Weaknesses**:
    -   **Node/Express Coupling**: The ADK is strictly written for Node.js. In real-world enterprise environments, many data science and AI teams prefer writing agents in Python (due to LangChain/LlamaIndex mature tooling). The SDK lacks a Python port.
    -   **Tight Deployment Coupling**: The expectation that each assistant requires a physical runtime server listening on a specific port limits elasticity and introduces server overhead.

---

## 5. Comprehensive Modifications Roadmap (Proposed Action Plan)

We recommend dividing the modernization of Stage7 into three prioritized phases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Phase 1: Stabilization & MCP                          │
│   • Fix SDK testing suite & workspace dependencies                         │
│   • Build L2-to-MCP client adapter & convert local tools to MCP servers     │
│   • Complete missing L1 endpoints (getMissionHistory, getContext)           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────┴──────────────────────────────────────┐
│                        Phase 2: Commercial Control Plane                     │
│   • Implement Unified API Gateway & Shared Worker Pool                      │
│   • Integrate Temporal.io/BullMQ for state-durable executions               │
│   • Secure secret/credential storage with HashiCorp Vault                   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────┴──────────────────────────────────────┐
│                        Phase 3: SaaS & Enterprise Scales                     │
│   • Implement Row-Level Multi-Tenancy (RLS) in Mongo/Redis                  │
│   • Build Stripe-integrated real-time token tracking & spending limits      │
│   • Integrate OpenTelemetry (OTel) for distributed execution tracing        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 1: Stabilization & MCP Integration (Immediate Wins)
1.  **Fix Local Jest/Workspace Testing**: Reconfigure ts-jest/jest settings at the monorepo root and within `sdk` so unit tests can be executed seamlessly in local environments.
2.  **Build L2 MCP Client Adapter**: Integrate Anthropic's Model Context Protocol (MCP) into `Tool.ts` and `HttpCoreEngineClient.ts`, enabling immediate use of community MCP servers.
3.  **Complete Missing SDK Methods**: Implement actual HTTP endpoints in the L1 `MissionControl`/`Librarian` services to support the `getMissionHistory()`, `getContext()`, and `updateContext()` SDK methods, completely eliminating the fallback mocks.

### Phase 2: Commercial Control Plane & Durability
1.  **Unified Routing (API Gateway)**: Replace port-based service registration with a single API gateway router. Run assistants inside a dynamic, shared worker pool.
2.  **Temporal Workflow Engine**: Move the L1 mission loop to Temporal, ensuring that complex PM, CTO, or Sales missions are state-durable, resumable, and fault-tolerant.
3.  **Secure Vault Integration**: Add a dynamic config/secret management UI on the frontend, saving credentials securely encrypted at rest.

### Phase 3: SaaS Scale, Security & Cost Control
1.  **Tenant-Level Database Security**: Restructure database collections to strictly enforce `tenantId` queries across MongoDB and Redis.
2.  **Inference Auditing & Spending Limits**: Hook up a token-auditing middleware in the `Brain` service and tie it to Stripe billing for usage limit enforcement.
3.  **Distributed Tracing (OTel)**: Deploy OpenTelemetry across all Node containers to enable clear system-wide observability.

---

## 6. Conclusion

Stage7 has a fantastic foundational design. The ADK's `QuickAssistant` pattern is a highly competitive model for developer onboarding. By transitioning from ephemeral message-routing to durable reactive workflows, standardizing tool integration via MCP, and introducing robust multi-tenant control planes, Stage7 can easily evolve from a local multi-agent prototype into a highly valuable, commercially viable enterprise SaaS platform.
