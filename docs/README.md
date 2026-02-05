# Documentation Index & Organization

**Last Updated**: February 3, 2026

## 📚 Documentation Organization

This folder contains system documentation organized by purpose. For **current ADK development**, see [../ADK/](../ADK/).

---

## 🔴 Active Documentation (Current)

These documents are actively maintained and reference current system behavior:

### Core References
- **[API.md](./API.md)** - PostOffice and system API specifications
- **[authentication.md](./authentication.md)** - Authentication, JWT tokens, credentials
- **[message-queue.md](./message-queue.md)** - RabbitMQ and message passing architecture

### Feature Documentation
- **[file-upload-documentation.md](./file-upload-documentation.md)** - File upload system
- **[email_verification_implementation.md](./email_verification_implementation.md)** - Email verification
- **[github_integration_implementation.md](./github_integration_implementation.md)** - GitHub integration
- **[BRAIN_SERVICE.md](./BRAIN_SERVICE.md)** - Brain service and LLM coordination

### Integration & Security
- **[service-discovery-config.md](./service-discovery-config.md)** - Service discovery (Consul)
- **[security_improvements.md](./security_improvements.md)** - Security hardening
- **[plugin_config_and_secrets.md](./plugin_config_and_secrets.md)** - Plugin configuration

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

---

## 🔧 Component & Feature Design Docs

Design documentation for specific components. Content here is reference material for architectural understanding:

- **[EXCEPTION_HANDLING_FRAMEWORK.md](./EXCEPTION_HANDLING_FRAMEWORK.md)** - Exception handling patterns
- **[HYBRID_VALIDATION_SYSTEM.md](./HYBRID_VALIDATION_SYSTEM.md)** - Validation system design
- **[API_CLIENT_PLUGIN_DESIGN.md](./API_CLIENT_PLUGIN_DESIGN.md)** - API client plugin architecture
- **[CODE_EXECUTOR_PLUGIN_DESIGN.md](./CODE_EXECUTOR_PLUGIN_DESIGN.md)** - Code execution plugin
- **[TASK_MANAGER_PLUGIN_DESIGN.md](./TASK_MANAGER_PLUGIN_DESIGN.md)** - Task manager plugin
- **[plugin_lifecycles.md](./plugin_lifecycles.md)** - Plugin lifecycle management
- **[collaboration-services.md](./collaboration-services.md)** - Collaboration service design

---

## 🚀 Advanced & Specialized

- **[SELF_HOSTED_LLM_GUIDE.md](./SELF_HOSTED_LLM_GUIDE.md)** - Running LLMs locally
- **[isolated-vm-migration.md](./isolated-vm-migration.md)** - Isolated VM migration (Stage6 → Stage7)
- **[llm-enhancements.md](./llm-enhancements.md)** - LLM model improvements
- **[MODEL_PERFORMANCE_SCORING.md](./MODEL_PERFORMANCE_SCORING.md)** - LLM performance metrics
- **[Step Architecture.md](./Step Architecture.md)** - Step execution architecture
- **[FRONTEND_MODELS_SERVICES_INTERFACES_GUIDE.md](./FRONTEND_MODELS_SERVICES_INTERFACES_GUIDE.md)** - Frontend architecture

---

## 📋 Reference Lists

- **[action_verb_tests.md](./action_verb_tests.md)** - Test vectors for action verbs
- **[planning_schema.md](./planning_schema.md)** - Planning and schema definitions

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

---

## File Movement Log

**February 3, 2026**: Initial reorganization
- Moved deprecated proposal documents to archive/deprecated-proposals/
- Moved historical analysis to archive/reference/
- Updated main docs/ to contain only active documentation
