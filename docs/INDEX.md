# CKT MCS Documentation

**Last Audited**: February 3, 2026  
**Total Active Docs**: 20 files (11 core, 9 reference)  
**Status**: Fully reorganized and rationalized

---

## 📚 Quick Navigation

### For Developers
- **Core Systems** → [CORE_SYSTEMS/](./CORE_SYSTEMS/) - Mission-critical infrastructure (11 files)
- **Active Reference** → [ACTIVE_REFERENCE/](./ACTIVE_REFERENCE/) - Design patterns & specs (9 files)
- **ADK** → [ADK/](./ADK/) - Agent Development Kit (SDK-first architecture)

### For Architects
- Start: [CORE_SYSTEMS/README.md](./CORE_SYSTEMS/README.md)
- Then: [ADK/SDK-ARCHITECTURE.md](./ADK/SDK-ARCHITECTURE.md)
- Proposal: [STAGE7_NEXTGEN_REBUILD_PROPOSAL.md](./STAGE7_NEXTGEN_REBUILD_PROPOSAL.md) ⭐ Architectural Overhaul Blueprint

### For Historians
- **Archive** → [archive/](./archive/) - Historical analysis, deprecated proposals, completed migrations

---

## 🎯 Documentation Structure

```
docs/
├── CORE_SYSTEMS/               [11 files - actively maintained, mission-critical]
│   ├── authentication.md                 ⭐ JWT, RBAC, SecurityManager, ServiceTokenManager
│   ├── BRAIN_SERVICE.md                  ⭐ Model selection, health checks, retry, performance tracking
│   ├── collaboration-services.md         ⭐ Multi-agent coordination, task delegation
│   ├── ENTERPRISE_PERSISTENCE_STRATEGY.md ⭐ Single-tenant session & persistence model
│   ├── file-upload-documentation.md      ⭐ File upload system, PostOffice integration
│   ├── message-queue.md                  ⭐ RabbitMQ, async messaging patterns
│   ├── MODEL_PERFORMANCE_SCORING.md      ⭐ Model failure tracking, blacklisting
│   ├── plugin_config_and_secrets.md      ⭐ Plugin configuration, credentials handling
│   ├── security_improvements.md          ⭐ Multi-layered security architecture
│   ├── API.md                             System API reference (AgentSet endpoints)
│   └── action_verb_tests.md               Testing guidance for built-in action verbs
│
├── ACTIVE_REFERENCE/           [9 files - architectural patterns & design specs]
│   ├── API_CLIENT_PLUGIN_DESIGN.md        Generic REST API plugin spec
│   ├── CODE_EXECUTOR_PLUGIN_DESIGN.md     Sandboxed code execution plugin
│   ├── EXCEPTION_HANDLING_FRAMEWORK.md    Centralized exception handling patterns
│   ├── HYBRID_VALIDATION_SYSTEM.md        Three-phase plan validation
│   ├── planning_schema.md                 JSON schema for plan steps
│   ├── plugin_lifecycles.md               Plugin state management
│   ├── SELF_HOSTED_LLM_GUIDE.md          Self-hosted LLM setup guide
│   ├── Step Architecture.md               Step lifecycle & execution orchestration
│   └── TASK_MANAGER_PLUGIN_DESIGN.md      Task self-planning plugin spec
│
├── ADK/                        [Agent Development Kit - SDK-first architecture]
│   ├── README.md                          Quick start guide
│   ├── SDK-ARCHITECTURE.md               ⭐ CONSOLIDATED: Event-driven, complete inventory
│   ├── INDEX.md                           Role-based navigation
│   └── [7 other essential guides]
│
└── archive/                    [Historical context & deprecated proposals]
    ├── deprecated-proposals/              Superseded design proposals
    │   ├── SOLUTION_1_BIDIRECTIONAL_SYNC.md
    │   └── SOLUTION_2_SDK_ENHANCEMENT.md
    └── reference/                         Historical analysis & completed migrations
        ├── ARCHITECTURE_ANALYSIS.md
        ├── DATA_FLOW_DIAGRAMS.md
        ├── DATA_FLOW_FIX_SUMMARY.md
        ├── QUICK_REFERENCE.md             [consolidated → ADK/SDK-ARCHITECTURE.md]
        ├── SDK_FIRST_ASSISTANT_MIGRATION.md [consolidated → ADK/SDK-ARCHITECTURE.md]
        ├── email_verification_implementation.md
        ├── github_integration_implementation.md
        ├── isolated-vm-migration.md       [migration complete]
        ├── llm-enhancements.md            [proposals archived]
        ├── service-discovery-config.md    [Consul: not in active deployment]
        ├── technical_implementation_details.md
        └── implementation-prompts.md
```

---

## 🔴 Core Systems (Mission-Critical)

These documents govern **production operations**. Changes require careful review.

| Document | Purpose | Last Updated | Priority |
|----------|---------|--------------|----------|
| **[authentication.md](./CORE_SYSTEMS/authentication.md)** | JWT RS256, RBAC, credentials management | Dec 2025 | CRITICAL |
| **[BRAIN_SERVICE.md](./CORE_SYSTEMS/BRAIN_SERVICE.md)** | LLM model selection, health checks, retry logic | Current | CRITICAL |
| **[collaboration-services.md](./CORE_SYSTEMS/collaboration-services.md)** | Multi-agent orchestration, task delegation | Current | HIGH |
| **[ENTERPRISE_PERSISTENCE_STRATEGY.md](./CORE_SYSTEMS/ENTERPRISE_PERSISTENCE_STRATEGY.md)** | Single-tenant session & persistence model | Feb 2026 | CRITICAL |
| **[file-upload-documentation.md](./CORE_SYSTEMS/file-upload-documentation.md)** | File upload system, Librarian storage | Current | HIGH |
| **[message-queue.md](./CORE_SYSTEMS/message-queue.md)** | RabbitMQ integration, async messaging | Current | CRITICAL |
| **[MODEL_PERFORMANCE_SCORING.md](./CORE_SYSTEMS/MODEL_PERFORMANCE_SCORING.md)** | Model failure tracking, critical failures | Current | HIGH |
| **[plugin_config_and_secrets.md](./CORE_SYSTEMS/plugin_config_and_secrets.md)** | Plugin development critical path | Current | CRITICAL |
| **[security_improvements.md](./CORE_SYSTEMS/security_improvements.md)** | Security architecture, multi-layered | Current | CRITICAL |
| [API.md](./CORE_SYSTEMS/API.md) | AgentSet REST API reference | Current | MEDIUM |
| [action_verb_tests.md](./CORE_SYSTEMS/action_verb_tests.md) | Built-in action verb testing | Current | MEDIUM |

---

## 📖 Active Reference (Design & Patterns)

Architectural specifications and design patterns. Useful for development planning.

| Document | Purpose | Audience |
|----------|---------|----------|
| [API_CLIENT_PLUGIN_DESIGN.md](./ACTIVE_REFERENCE/API_CLIENT_PLUGIN_DESIGN.md) | Generic REST API plugin architecture | Plugin Developers |
| [CODE_EXECUTOR_PLUGIN_DESIGN.md](./ACTIVE_REFERENCE/CODE_EXECUTOR_PLUGIN_DESIGN.md) | Docker-based code execution plugin | Plugin Developers |
| [EXCEPTION_HANDLING_FRAMEWORK.md](./ACTIVE_REFERENCE/EXCEPTION_HANDLING_FRAMEWORK.md) | Retry, circuit breaker, fallback patterns | Backend Developers |
| [HYBRID_VALIDATION_SYSTEM.md](./ACTIVE_REFERENCE/HYBRID_VALIDATION_SYSTEM.md) | Three-phase plan validation design | Architects |
| [planning_schema.md](./ACTIVE_REFERENCE/planning_schema.md) | JSON schema for plan steps | All Developers |
| [plugin_lifecycles.md](./ACTIVE_REFERENCE/plugin_lifecycles.md) | Plugin state management patterns | Plugin Developers |
| [SELF_HOSTED_LLM_GUIDE.md](./ACTIVE_REFERENCE/SELF_HOSTED_LLM_GUIDE.md) | Self-hosted LLM operational guide | DevOps |
| [Step Architecture.md](./ACTIVE_REFERENCE/Step%20Architecture.md) | Step execution lifecycle | Architects |
| [TASK_MANAGER_PLUGIN_DESIGN.md](./ACTIVE_REFERENCE/TASK_MANAGER_PLUGIN_DESIGN.md) | Task self-planning plugin spec | Plugin Developers |

---

## 🏗️ Agent Development Kit (ADK)

Complete SDK-first architecture and assistant development guidance.

**Start Here**: [ADK/README.md](./ADK/README.md)

Key Documents:
- **[SDK-ARCHITECTURE.md](./ADK/SDK-ARCHITECTURE.md)** - Complete SDK-first event-driven architecture
  - LibrarianClient interface, event system, state management
  - Complete inventory: 20 backend APIs + 24 frontend components
  - Standard 6-step migration pattern
- **[INDEX.md](./ADK/INDEX.md)** - Role-based navigation guide
- **[TOOL-DEVELOPMENT.md](./ADK/TOOL-DEVELOPMENT.md)** - Custom tool creation
- **[DEPLOYMENT.md](./ADK/DEPLOYMENT.md)** - Production deployment guide

---

## 🗂️ Archive (Historical Context)

### Deprecated Proposals
Superseded design proposals preserved for architectural decision context:
- [SOLUTION_1_BIDIRECTIONAL_SYNC.md](./archive/deprecated-proposals/SOLUTION_1_BIDIRECTIONAL_SYNC.md) - Superseded by SDK-first
- [SOLUTION_2_SDK_ENHANCEMENT.md](./archive/deprecated-proposals/SOLUTION_2_SDK_ENHANCEMENT.md) - Implemented and consolidated

### Reference Materials
Historical analysis and completed migrations:
- [ARCHITECTURE_ANALYSIS.md](./archive/reference/ARCHITECTURE_ANALYSIS.md) - Design decision analysis
- [DATA_FLOW_DIAGRAMS.md](./archive/reference/DATA_FLOW_DIAGRAMS.md) - Historical data flow
- [isolated-vm-migration.md](./archive/reference/isolated-vm-migration.md) - VM2 → Isolated-VM migration (complete)

See [archive/README.md](./archive/README.md) for complete archive index.

---

## 📋 Document Maintenance Guide

### Active Documents
- **Review Frequency**: Quarterly
- **Update Triggers**: API changes, architectural shifts, security updates
- **Ownership**: Engineering team

### Reference Documents
- **Review Frequency**: Annually or when referenced
- **Update Triggers**: Major design changes
- **Ownership**: Architecture team

### Archive Documents
- **Review Frequency**: None (preserved as-is)
- **Purpose**: Historical context, decision rationale
- **⚠️ Do NOT implement**: Use current docs for guidance

---

## 🔍 Finding What You Need

### "How do I authenticate services?"
→ [CORE_SYSTEMS/authentication.md](./CORE_SYSTEMS/authentication.md)

### "How does model selection work?"
→ [CORE_SYSTEMS/BRAIN_SERVICE.md](./CORE_SYSTEMS/BRAIN_SERVICE.md)

### "How do I create a new assistant?"
→ [ADK/README.md](./ADK/README.md) then [ADK/SDK-ARCHITECTURE.md](./ADK/SDK-ARCHITECTURE.md)

### "How do I build a custom tool?"
→ [ADK/TOOL-DEVELOPMENT.md](./ADK/TOOL-DEVELOPMENT.md)

### "What's the messaging architecture?"
→ [CORE_SYSTEMS/message-queue.md](./CORE_SYSTEMS/message-queue.md)

### "How are plugins configured?"
→ [CORE_SYSTEMS/plugin_config_and_secrets.md](./CORE_SYSTEMS/plugin_config_and_secrets.md)

### "Why was SDK-first chosen over bidirectional sync?"
→ [archive/deprecated-proposals/SOLUTION_1_BIDIRECTIONAL_SYNC.md](./archive/deprecated-proposals/SOLUTION_1_BIDIRECTIONAL_SYNC.md)

---

## 📊 Documentation Health

**Last Comprehensive Audit**: February 3, 2026

| Metric | Status |
|--------|--------|
| **Active docs** | 19 files (rationed from 34) |
| **Redundancy** | Eliminated (FRONTEND_MODELS consolidated into BRAIN_SERVICE) |
| **Currency** | 22/25 files dated 2025-12+ or Jan 2026+ |
| **Conflicts with ADK** | None (ADK is canonical for SDK-first) |
| **Missing critical docs** | None identified |
| **Outdated info** | Archived appropriately |

---

## ✅ Quality Standards

### All Active Documents Must Have:
1. **Last Updated date** (YYYY-MM-DD format)
2. **Clear purpose statement** in opening paragraph
3. **Target audience** identification
4. **Current information only** (no TODO markers without timeline)
5. **Cross-references** to related docs
6. **Examples** where applicable

### Archive Documents Must Have:
1. **Archive date** and reason
2. **Pointer to current equivalent** (if exists)
3. **Historical context** explanation
4. **"⚠️ HISTORICAL - DO NOT IMPLEMENT"** marker

---

## 🚀 Contributing

### Adding New Documentation
1. Determine category: CORE_SYSTEMS / ACTIVE_REFERENCE / ADK / archive
2. Follow quality standards above
3. Update this README with new entry
4. Cross-reference in related documents

### Updating Existing Documentation
1. Update "Last Updated" date
2. Preserve historical decisions (note changes in document body)
3. Update cross-references if structure changes

### Archiving Documentation
1. Move to appropriate archive subdirectory
2. Add archive marker and date
3. Update README to reflect archival
4. Add pointer in replacement document (if any)

---

## 📞 Support

- **For ADK questions**: See [ADK/INDEX.md](./ADK/INDEX.md)
- **For architecture questions**: Review CORE_SYSTEMS docs
- **For historical context**: See [archive/README.md](./archive/README.md)

---

**Navigation**: [Core Systems](./CORE_SYSTEMS/) • [Active Reference](./ACTIVE_REFERENCE/) • [ADK](./ADK/) • [Archive](./archive/)
