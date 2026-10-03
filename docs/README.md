# Documentation Index & Organization



## 📚 Documentation Organization

This folder contains system documentation organized by purpose. For **current ADK development**, see [ADK/](./ADK/).

---

## 🔴 Active Documentation (Current)

These documents are actively maintained and reference current system behavior:

### Core References
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment topology and configuration
- **[USER_GUIDE.md](./USER_GUIDE.md)** - End-user walkthrough of the running system
- **[../DOCKER_BUILD_GUIDE.md](../DOCKER_BUILD_GUIDE.md)** - Build, launch, and assistant selection
- **[../env.summary](../env.summary)** - Environment variables each service reads

### Feature Documentation
- **[BRAIN_SERVICE notes](../.env.example)** - Provider and cache configuration for the brain service
- **[SELF_HOSTED_LLM_GUIDE.md](./ACTIVE_REFERENCE/SELF_HOSTED_LLM_GUIDE.md)** - Running LLMs locally
- **[HYBRID_VALIDATION_SYSTEM.md](./ACTIVE_REFERENCE/HYBRID_VALIDATION_SYSTEM.md)** - Input validation design

---

## 🗂️ Deprecated / Superseded

The V2 and legacy service documents that once lived in this folder have been removed. Their content
described containers and services that are not part of the current system (PostOffice,
CapabilitiesManager, Librarian, Engineer, Mission Control, and the security service).

> **Note**: The NextGen architecture is not a proposal. It is the running system described by the
> root [README](../README.md) and [DOCKER_BUILD_GUIDE.md](../DOCKER_BUILD_GUIDE.md). Design history
> that predates it is kept in [./archive/](./archive/) for reference only.

---

## 📈 Strategic & Community Roadmaps

These documents outline strategies for market positioning, community growth, and enterprise
certifications.

- **[ADK_DEVELOPER_GUIDE.md](./ADK/ADK_DEVELOPER_GUIDE.md)** - Contributor guide for building assistants and skills

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

> **Caveat**: the `*_PLUGIN_DESIGN.md` and `plugin_lifecycles.md` documents in this section predate
> the current architecture. Their paths and service names (CapabilitiesManager, Librarian, Engineer)
> refer to containers that no longer exist, and the tools they describe are now skills compiled by
> the tool-executor. Treat them as design history, not as a map of the current tree. The current
> model is documented in [ADK/](./ADK/) and in [plugin_lifecycles.md](./ACTIVE_REFERENCE/plugin_lifecycles.md).

- **[EXCEPTION_HANDLING_FRAMEWORK.md](./ACTIVE_REFERENCE/EXCEPTION_HANDLING_FRAMEWORK.md)** - Exception handling patterns
- **[HYBRID_VALIDATION_SYSTEM.md](./ACTIVE_REFERENCE/HYBRID_VALIDATION_SYSTEM.md)** - Input validation design
- **[API_CLIENT_PLUGIN_DESIGN.md](./ACTIVE_REFERENCE/API_CLIENT_PLUGIN_DESIGN.md)** - API client tool design (historical)
- **[CODE_EXECUTOR_PLUGIN_DESIGN.md](./ACTIVE_REFERENCE/CODE_EXECUTOR_PLUGIN_DESIGN.md)** - Code execution tool design (historical)
- **[TASK_MANAGER_PLUGIN_DESIGN.md](./ACTIVE_REFERENCE/TASK_MANAGER_PLUGIN_DESIGN.md)** - Task manager tool design (historical)
- **[plugin_lifecycles.md](./ACTIVE_REFERENCE/plugin_lifecycles.md)** - Tool lifecycle management (historical)

---

## 🚀 Advanced & Specialized

- **[SELF_HOSTED_LLM_GUIDE.md](./ACTIVE_REFERENCE/SELF_HOSTED_LLM_GUIDE.md)** - Running LLMs locally
- **[isolated-vm-migration.md](./archive/reference/isolated-vm-migration.md)** - Isolated VM migration (Stage6 → Stage7)
- **[llm-enhancements.md](./archive/reference/llm-enhancements.md)** - LLM model improvements
- **[Step Architecture.md](./ACTIVE_REFERENCE/Step Architecture.md)** - Step execution architecture
- **[FRONTEND_MODELS_SERVICES_INTERFACES_GUIDE.md](./archive/reference/FRONTEND_MODELS_SERVICES_INTERFACES_GUIDE.md)** - Frontend architecture

---

## 📋 Reference Lists

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

- **For current ADK development**: See [ADK/ADK_OVERVIEW.md](./ADK/ADK_OVERVIEW.md)
- **For historical context**: See [./archive/](./archive/)
- **For active system docs**: Browse this folder
- **For build and deployment**: See [../DOCKER_BUILD_GUIDE.md](../DOCKER_BUILD_GUIDE.md)

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
