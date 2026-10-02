# Agent Development Kit (ADK) — Overview Architecture Specification

## 1. Vision & Architectural Boundary

The Agent Development Kit (ADK) is an application harness built on top of **stage7 core services**. It abstracts and orchestrates stage7's underlying capabilities—LLM routing, code generation and repair, mission-scoped agents, Model Context Protocol (MCP) and custom tools, data persistence, and secrets management—into a structured framework for building enterprise-grade AI Assistants.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                ADK APPLICATION HARNESS                          │
│                                                                                 │
│   ┌──────────────────┐      ┌─────────────────────┐      ┌──────────────────┐   │
│   │    ASSISTANTS    │      │       SKILLS        │      │      TOOLS       │   │
│   │ Domain Knowledge │ ───► │   LLM Workflows     │ ───► │  Deterministic   │   │
│   │ & Policy Engine  │      │ Advise/Aid/Represent│      │ Transformations  │   │
│   └──────────────────┘      └─────────────────────┘      └──────────────────┘   │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────────┐
│                              STAGE7 CORE SERVICES                               │
│  LLM Interface │ Code Repair │ Persistence (Mongo) │ Secrets │ Vector Knowledge │
└─────────────────────────────────────────────────────────────────────────────────┘

```

### The Three Core Primitives

1. **Assistants (Domain Boundaries):** Persisting, domain-specific entities that hold static domain knowledge, enforce operational policies, collect learnings over time, and adapt to user needs.
2. **Skills (LLM Workflows):** Goal-oriented capabilities where an LLM transforms inputs into structured outcomes (digital assets, recommendations, or system transactions). Skills operate across three risk tiers: **Advise**, **Aid**, or **Represent**.
3. **Tools (Deterministic Transformations):** Mechanical, non-LLM execution units. Tools execute side-effect-free data manipulation, interact with external systems/APIs, or write state changes to persistence layers.

---

## 2. Core Architectural Principles

### 2.1 Complete Blueprint Isolation (The Folder Rule)

An Assistant definition is **100% self-contained in a single directory**.

* No Assistant-specific environment variables are ever declared at the system or container level.
* No Assistant-specific code, prompts, or configuration scripts reside outside the Assistant folder.
* **Blueprint vs. Instance Separation:** The folder source code is an immutable blueprint that changes **only at deployment time**. All runtime state changes, newly generated triggers, user configurations, and learned insights are stored in stage7 core persistence services.

### 2.2 Overview Panel UX Paradigm

The Assistant interface is anchored on the **Overview Page**, which mounts dedicated UX panels for user-facing Skills.

* **Deterministic Output Presentation:** Skills do not rely on an LLM to synthesize conversation responses into chat text for workflow execution. Skills present their output using structured templates rendered in their specific UX panel.
* **User Input & Triggering:** A Skill’s Overview panel is where user inputs are collected and where the user clicks the explicit **Action Button** (e.g., *"Resolve Ticket"*, *"Generate Report"*) to trigger execution.
* **No Single-Stream "Current Step" UI:** Assistants handle multiple concurrent operations. The UI never forces a single "current step" linear stream onto the user.

### 2.3 Dual-Channel Interaction (Overview Panels + Chat)

While deterministic workflow execution and output rendering occur on Overview UX panels, Skills and Assistants can also interact via the **Assistant Chat Window**:

* The Assistant's chat interface allows the Skill to converse naturally as the Assistant entity.
* It can ask clarifying questions when inputs are missing or ambiguous.
* It sends proactive system notifications and status updates.

### 2.4 Skill Tiers & Risk Policy Gating

Every Skill belongs to exactly one tier, which determines the system enforcement and policy gating applied to its output:

| Tier | Role & Scope | Risk Profile | Policy & Approval Gate |
| --- | --- | --- | --- |
| **Advise** | Analyzes data, generates assessments, and provides recommendations. Reads state; does not act or output outbound assets. | Low | Autonomous execution. |
| **Aid** | Co-creates work products (drafts, plans, templates) for the user to review, edit, or manually send. | Medium | User manual action required for final delivery. |
| **Represent** | Executes actions directly against external systems on behalf of the user (sending emails, committing PRs, calling external APIs). | High | **Mandatory Policy Gate (`confirmBeforeSend`).** Runtime enforces explicit confirmation before completing execution. |

---

## 3. Skills, Tools & Orchestration Model

### 3.1 Higher-Order Skills vs. Sub-Tools

To prevent UI fragmentation, the ADK enforces a strict boundary using `isSkill`:

* **Higher-Order Skills (`isSkill: true`):** Canonical entry points that own a dedicated UX panel on the Overview page. They orchestrate overall workflow execution.
* **Sub-Skills & Lower-Order Tools (`isSkill: false`):** Internal, modular execution steps called inside higher-order Skills. They possess no independent UX panel and return raw data payloads directly to the orchestrator.

### 3.2 Skill Triggers & Dynamic Trigger Adaptation

Skills can be invoked through three explicit trigger mechanisms:

1. **User-Triggered:** Invoked manually via an Action Button on the Skill’s Overview UX panel or via a Chat phrase. Inputs may be supplied by the user or automatically pulled from persisted collections.
2. **Schedule-Triggered:** Executed automatically on a recurring clock interval configured in the Skill settings.
3. **Event-Triggered:** Fired automatically when a state or data change is detected (e.g., a tool emitting a document update in MongoDB or an external webhook event).

#### Adaptive Skill Self-Evolution

Assistants can adapt user-triggered Skills into scheduled or event-triggered Skills based on user instructions (e.g., *"Run this competitor search every Monday at 9 AM"*). When an Assistant adapts a Skill:

* The Assistant **does not modify the local folder blueprint code**.
* The stage7 runtime writes a **Dynamic Trigger Record** to the instance persistence layer.
* The stage7 scheduler/event-monitor evaluates these persisted trigger contracts dynamically at runtime.

### 3.3 Tool Scope & Portfolio Management

Tools are mechanical transformations and API adapters. They fall into two categories:

* **Assistant-Specific Tools:** Kept inside the Assistant’s local folder or subfolders (`/tools`). Used exclusively by that Assistant.
* **Generalized Stage7 Portfolio Tools:** Shared multi-assistant tools (e.g., File I/O, Slack messaging, Jira integration) managed globally by stage7 core services.

---

## 4. Knowledge, Data & Persistence Architecture

The stage7 core runtime provides a unified persistence layer for all Assistant instances.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STAGE7 PERSISTENCE LAYER                          │
│                                                                             │
│   ┌────────────────────────┐  ┌───────────────────┐  ┌──────────────────┐   │
│   │   STAGE7 SECRETS       │  │ MONGO DATA STORE  │  │ VECTOR KNOWLEDGE │   │
│   │ API Keys / Credentials │  │ Configs / Inputs  │  │ Static Domain +  │   │
│   │  (Flagged in Schema)   │  │  Outputs / State  │  │ Dynamic Learnings│   │
│   └────────────────────────┘  └───────────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

```

### 4.1 Unified Knowledge Hydration

Assistants hold domain knowledge that provides context for LLM execution:

* **Static Domain Knowledge:** Stored as documents/markdown in the Assistant folder.
* **Dynamic Learnings:** Gathered automatically by the Assistant during workflow execution and user interaction.
* **Deployment Seeding:** Upon folder deployment, stage7 seeds the static domain knowledge directly into the instance's **Vector Knowledge Store**. RAG retrieval queries a single unified context store containing both static domain facts and dynamic learnings.

### 4.2 Collection-Referencing Inputs

To minimize user typing, Skill `inputSchema` definitions can reference persisted Mongo collections (e.g., `ticketId: { type: 'string', sourceCollection: 'active_tickets' }`). The Overview UX panel automatically populates selection controls from the current instance state.

### 4.3 Configurations and Secrets

Skill settings and configurations are managed through configuration panels on the Assistant's Settings page:

* Configuration keys defined in `configSchema` are stored in MongoDB.
* Any configuration property marked as a secret (e.g., `isSecret: true`) is routed directly to the **stage7 Secrets Service** rather than standard storage.
* Common configuration keys (e.g., a shared `SLACK_API_KEY`) are stored centrally and accessible across all Skills and Assistants.

---

## 5. Schema Evolution & Zero-Downtime Upgrades

To support continuous deployment of Assistant folder blueprints without breaking existing database state, the ADK uses **Schema Versioning** combined with **On-Read Hydration Adapters**.

```
    WRITE PATH                              READ PATH
┌──────────────────┐                  ┌──────────────────┐
│  Skill Execution │                  │   ctx.store.     │
│   (Version 2)    │                  │   load(col)      │
└────────┬─────────┘                  └────────▲─────────┘
         │ Writes Document                     │ Returns Hydrated Object
         │ Stamped _schemaVersion: 2           │
┌────────▼─────────┐                  ┌────────┴─────────┐
│ MongoDB Storage  │ ───────────────► │ Hydration Adapter│
│ (Un-normalized)  │  Reads Doc (v1)  │ (Applies v1-►v2  │
└──────────────────┘                  │ Defaults/Transforms)
                                      └──────────────────┘

```

### 5.1 Rules for Data Evolution

1. **Explicit `schemaVersion`:** Skill manifests state an integer `schemaVersion` for inputs, configs, and output payloads.
2. **Stamp on Write:** When a Skill or Tool writes to persistence, the ADK automatically stamps `_schemaVersion` and `_updatedAt`.
3. **Transform on Read (Lazy Migrations):** When loading documents from MongoDB, the ADK passes records through hydration adapters. If `doc._schemaVersion < currentVersion`, fields are transformed or populated with schema defaults lazily in memory before reaching the handler.
4. **Merge-on-Read Configs:** Configuration evaluation merges `configSchema` defaults with persisted Mongo/Secrets values at runtime.

---

## 6. Self-Healing, Execution, & Resilience Protocol

Assistants feature an intelligent state-monitoring layer. Errors during tool execution or LLM state transformations are managed autonomously according to a strict fallback protocol before ever surfacing to the user:

```
[Tool / LLM Execution Event]
         │
         ├───► Success ───► Render UX Panel & Persist State
         │
         └───► Failure / Exception
                   │
                   ▼
       ┌────────────────────────┐
       │ 1. Deterministic Retry  │ (Exponential Backoff)
       └───────────┬────────────┘
                   │ Failed
                   ▼
       ┌────────────────────────┐
       │ 2. LLM Self-Correction │ (Feed validation error to stage7 code repair)
       └───────────┬────────────┘
                   │ Failed
                   ▼
       ┌────────────────────────┐
       │ 3. Assistant Escalation│ (Notify via Chat with actionable error state)
       └────────────────────────┘

```

1. **Deterministic Retry:** Transient API errors or rate limits are retried with exponential backoff.
2. **LLM Self-Correction:** Malformed data outputs or validation failures are routed through stage7 code repair and re-prompting mechanisms.
3. **Chat Escalation:** Unrecoverable errors pause execution and surface an actionable notification card in the Assistant Chat Window, explaining the state issue without exposing raw stack traces.