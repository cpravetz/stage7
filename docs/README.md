# Documentation Index & Organization

**Last Updated**: September 3, 2026

## 📚 Documentation Organization

This folder contains system documentation organized by purpose. For **current ADK development**, see [../ADK/](../ADK/).

---

## 🔴 Active Documentation (Current)

These documents are actively maintained and reference current system behavior:

### Core References
- **[API.md](./CORE_SYSTEMS/API.md)** - PostOffice and system API specifications
- **[authentication.md](./CORE_SYSTEMS/authentication.md)** - Authentication, JWT tokens, credentials
- **[message-queue.md](./CORE_SYSTEMS/message-queue.md)** - RabbitMQ and message passing architecture. See also the [RabbitMQ Evaluation Summary](../GEMINI.md) for architectural decision details.

### Feature Documentation
- **[file-upload-documentation.md](./CORE_SYSTEMS/file-upload-documentation.md)** - File upload system
- **[email_verification_implementation.md](./archive/reference/email_verification_implementation.md)** - Email verification
- **[github_integration_implementation.md](./archive/reference/github_integration_implementation.md)** - GitHub integration
- **[BRAIN_SERVICE.md](./CORE_SYSTEMS/BRAIN_SERVICE.md)** - Brain service and LLM coordination

### Integration & Security
- **[service-discovery-config.md](./archive/reference/service-discovery-config.md)** - Service discovery (Consul)
- **[security_improvements.md](./CORE_SYSTEMS/security_improvements.md)** - Security hardening
- **[plugin_config_and_secrets.md](./CORE_SYSTEMS/plugin_config_and_secrets.md)** - Plugin configuration

---

## ⚙️ Operational & Enterprise Readiness Guides (New)

These documents provide guidance and roadmaps for critical operational aspects and enterprise readiness.

- **[STAGE7_NEXTGEN_REBUILD_PROPOSAL.md](./STAGE7_NEXTGEN_REBUILD_PROPOSAL.md)** - NextGen architectural rebuild proposal for enterprise scaling, state durability, entity-centric UX, and MCP integration.

---

## 🗂️ Deprecated / Superseded

These documents describe architectures or proposals that have been replaced by newer designs.

- **[v2-architecture-overview.md](./v2/v2-architecture-overview.md)** - V2 3-layer architecture (superseded by NextGen)
- **[QUICK_START.md](./v2/QUICK_START.md)** - V2 quick start guide (superseded by NextGen)
- **[DEPLOYMENT_GUIDE.md](./v2/DEPLOYMENT_GUIDE.md)** - V2 deployment guidance (superseded by NextGen)
- **[l2-sdk-api-design.md](./v2/l2-sdk-api-design.md)** - V2 SDK API design (superseded by NextGen)
- **[plugin-creation-guide.md](./v2/plugin-creation-guide.md)** - V2 plugin creation guide (superseded by NextGen)
- **[tool-implementation-plan.md](./v2/tool-implementation-plan.md)** - V2 tool implementation planning (superseded by NextGen)
- **[pm-assistant-tool-plugin-mapping.md](./v2/pm-assistant-tool-plugin-mapping.md)** - V2 PM assistant mappings (superseded by NextGen)
- **[reusable-assistant-integration-pattern.md](./v2/reusable-assistant-integration-pattern.md)** - V2 reusable integration patterns (superseded by NextGen)
- **[v2-telemetry-debugging.md](./v2/v2-telemetry-debugging.md)** - V2 telemetry and debugging (superseded by NextGen)
- **[CTO_ASSISTANT_SERVICE.md](./v2/CTO_ASSISTANT_SERVICE.md)** - V2 CTO assistant service spec (superseded by NextGen)

> **Note**: The V2 architecture has been superseded by the **NextGen** architecture described in [STAGE7_NEXTGEN_REBUILD_PROPOSAL.md](./STAGE7_NEXTGEN_REBUILD_PROPOSAL.md). These documents are retained for historical context only.

---

## 📈 Strategic & Community Roadmaps (New)

These documents outline strategies for market positioning, community growth, and enterprise certifications.

- **[COMMUNITY_GROWTH_STRATEGY.md](./COMMUNITY_GROWTH_STRATEGY.md)** - Strategy for fostering community and ecosystem growth.
- **[ENTERPRISE_CERTIFICATION_ROADMAP.md](./ENTERPRISE_CERTIFICATION_ROADMAP.md)** - Roadmap for pursuing enterprise security certifications (SOC 2, ISO 27001).
- **[MARKET_POSITIONING_STRATEGY.md](./MARKET_POSITIONING_STRATEGY.md)** - Strategic recommendations for market positioning.

---

## 📦 Archive: Deprecated Proposals & Analysis

See [./archive/](./archive/) for historical design documents and analysis.

**Deprecated Proposals** (replaced by SDK-first implementation):
- `SOLUTION_1_BIDIRECTIONAL_SYNC.md` - Old bidirectional sync proposal (superseded by SDK-first)
- `SOLUTION_2_SDK_ENHANCEMENT.md` - Old SDK enhancement proposal (implemented and consolidated)

**Historical Analysis** (reference for understanding evolution):
- `ARCHITECTURE_ANALYSIS.md` - Analysis of different data flow solutions
- `DATA_FLOW_DIAGRAMS.md` - Historical data flow diagrams
- `DATA_FLOW_FIX_SUMMARY.md` - Summary of data flow issues and solutions
- `QUICK_REFERENCE.md` - Early SDK-first reference (content consolidated to ADK/SDK-ARCHITECTURE.md)
- `SDK_FIRST_ASSISTANT_MIGRATION.md` - Migration guide (content consolidated to ADK/SDK-ARCHITECTURE.md)

**Reference Materials** (kept for context):
- `technical_implementation_details.md`
- `implementation-prompts.md`
- `email_verification_implementation.md`
- `github_integration_implementation.md`
- `isolated-vm-migration.md`
- `llm-enhancements.md`
- `service-discovery-config.md`
- `FRONTEND_MODELS_SERVICES_INTERFACES_GUIDE.md`

---

## 🔧 Component & Feature Design Docs

Design documentation for specific components. Content here is reference material for architectural understanding:

- **[EXCEPTION_HANDLING_FRAMEWORK.md](./ACTIVE_REFERENCE/EXCEPTION_HANDLING_FRAMEWORK.md)** - Exception handling patterns
- **[HYBRID_VALIDATION_SYSTEM.md](./ACTIVE_REFERENCE/HYBRID_VALIDATION_SYSTEM.md)** - Validation system design
- **[API_CLIENT_PLUGIN_DESIGN.md](./ACTIVE_REFERENCE/API_CLIENT_PLUGIN_DESIGN.md)** - API client plugin architecture
- **[CODE_EXECUTOR_PLUGIN_DESIGN.md](./ACTIVE_REFERENCE/CODE_EXECUTOR_PLUGIN_DESIGN.md)** - Code execution plugin
- **[TASK_MANAGER_PLUGIN_DESIGN.md](./ACTIVE_REFERENCE/TASK_MANAGER_PLUGIN_DESIGN.md)** - Task manager plugin
- **[plugin_lifecycles.md](./ACTIVE_REFERENCE/plugin_lifecycles.md)** - Plugin lifecycle management
- **[collaboration-services.md](./CORE_SYSTEMS/collaboration-services.md)** - Collaboration service design

---

## 🚀 Advanced & Specialized

- **[SELF_HOSTED_LLM_GUIDE.md](./ACTIVE_REFERENCE/SELF_HOSTED_LLM_GUIDE.md)** - Running LLMs locally
- **[isolated-vm-migration.md](./archive/reference/isolated-vm-migration.md)** - Isolated VM migration (Stage6 → Stage7)
- **[llm-enhancements.md](./archive/reference/llm-enhancements.md)** - LLM model improvements
- **[MODEL_PERFORMANCE_SCORING.md](./CORE_SYSTEMS/MODEL_PERFORMANCE_SCORING.md)** - LLM performance metrics
- **[Step Architecture.md](./ACTIVE_REFERENCE/Step Architecture.md)** - Step execution architecture
- **[FRONTEND_MODELS_SERVICES_INTERFACES_GUIDE.md](./archive/reference/FRONTEND_MODELS_SERVICES_INTERFACES_GUIDE.md)** - Frontend architecture

---

## 📋 Reference Lists

- **[action_verb_tests.md](./CORE_SYSTEMS/action_verb_tests.md)** - Test vectors for action verbs
- **[planning_schema.md](./ACTIVE_REFERENCE/planning_schema.md)** - Planning and schema definitions

---

## 🗂️ Organization Strategy

### Keep in ./docs/ (Active)
- Current API and system references
- Active feature documentation
- Integration guides
- Security and operational docs

### Move to ./docs/archive/
- Deprecated proposals and solutions
- Historical analysis and diagrams
- Old migration guides (content consolidated elsewhere)
- Reference materials not needed for active development

### Why This Organization?
1. **Clarity**: Easy to distinguish current docs from historical/reference
2. **Maintenance**: Active docs stay clean, historical context preserved
3. **Consolidation**: Reduces duplication with ADK documentation
4. **Discoverability**: Archive index guides users to historical materials

---

## Navigation

- **For current ADK development**: See [../ADK/INDEX.md](../ADK/INDEX.md)
- **For historical context**: See [./archive/](./archive/)
- **For active system docs**: Browse this folder
- **For deprecated V2 architecture**: See [./v2/](./v2/)

---

## File Movement Log

**February 3, 2026**: Initial reorganization
- Moved deprecated proposal documents to archive/deprecated-proposals/
- Moved historical analysis to archive/reference/
- Updated main docs/ to contain only active documentation

**September 3, 2026**: Documentation accuracy update
- Corrected all broken relative paths after reorganization
- Removed references to non-existent operational roadmap documents
- Moved V2 architecture section from active to deprecated/superseded
- Added deprecation notice linking to NextGen rebuild proposal
- Updated archive reference list to include all archived implementation guides
