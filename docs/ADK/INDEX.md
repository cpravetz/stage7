# Agent Development Kit (ADK) Documentation Index


**Status**: Complete, Production-Ready

## 📚 Documentation Structure

The ADK documentation is organized by use case. Find what you need:

### 🚀 Getting Started (5 minutes)

Start here if you're new to the ADK:

1. **[README.md](./README.md)** - Main entry point
   - Quick start in 5 minutes
   - Architecture overview (3-layer model)
   - Running existing assistants
   - Creating your first assistant

### 👨‍💻 For Developers

Build assistants and tools:

2. **[SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md)** - SDK-First Architecture & API Design
   - Layered event-driven architecture overview (Frontend → Event → API → Librarian)
   - LibrarianClient interface for persistent data storage (MongoDB/Redis/Chroma)
   - Event system: structured state changes (domain.collection.operation format)
   - Assistant state management and useMemo patterns
   - sendEvent: frontend-backend communication via WebSocket
   - Message flow: inbound/outbound patterns
   - Core classes: `Assistant`, `Tool`, `Conversation`, `MessageParser`
   - **Complete inventory**: All 20 backend assistant APIs + 24 frontend components
   - Standard 6-step SDK-first migration pattern
   - QuickAssistant pattern for boilerplate elimination
   - Middleware stack, WebSocket integration, error handling

3. **[TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md)** - How to build tools
   - Creating custom tools step-by-step
   - Tool best practices (single responsibility, error handling, stateless)
   - Configuration and secrets management
   - Integration examples (CRM, data analysis, document generation)
   - Unit testing tools

4. **[ASSISTANT_STARTUP_GUIDE.md](./ASSISTANT_STARTUP_GUIDE.md)** - Reference guide
   - Starting each assistant service
   - Port allocation and conflicts resolution
   - Service URLs and health checks
   - Available tools per assistant

### 🚢 For DevOps & Operations

Deploy and manage systems:

5. **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment
   - Docker Compose setup (complete template)
   - Manual deployment instructions
   - Production checklist (security, monitoring, reliability)
   - Scaling guide (horizontal & vertical)
   - Health checks and monitoring
   - Troubleshooting common issues
   - Backup & recovery procedures

### 🏗️ Architecture & Design

Understand the system:

6. **[ADK_OVERVIEW.md](./ADK_OVERVIEW.md)** - System overview
   - ADK purpose and principles
   - Layered architecture (L1-L4)
   - Key components and responsibilities
   - Design patterns

7. **[AGENT_DELEGATION.md](./AGENT_DELEGATION.md)** - Agent collaboration
   - Agent-to-agent communication
   - Task delegation patterns
   - Multi-agent coordination

### 🔐 Security & Integration

Important reference materials:

8. **[authentication.md](./authentication.md)** - Auth system
   - JWT tokens and refresh
   - Service credentials
   - Security manager integration

### 📖 Additional Resources

9. **[ASSISTANTS_BUILDER_MIGRATION_COMPLETE.md](./ASSISTANTS_BUILDER_MIGRATION_COMPLETE.md)** - Migration status
   - Historical reference: builder pattern → SDK-first migration
   - Rationale for architectural changes
   
---

## Quick Links by Role

### 👤 Product Manager / Non-Technical
- Start: [README.md](./README.md)
- Then: [ADK_OVERVIEW.md](./ADK_OVERVIEW.md)

### 👨‍💻 Backend Developer (Creating New Assistants)
1. [README.md](./README.md) - Quick start
2. [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md) - Understand the pattern
3. [TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md) - Build custom tools
4. [ASSISTANT_STARTUP_GUIDE.md](./ASSISTANT_STARTUP_GUIDE.md) - Deploy your assistant

### 🎨 Frontend Developer
1. [README.md](./README.md) - Quick start
2. [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md) - Understand sendEvent & assistantState
3. See specific assistant component in `services/mcsreact/src/assistants/*/`

### 🚀 DevOps / Operations
1. [DEPLOYMENT.md](./DEPLOYMENT.md) - Production setup
2. [ASSISTANT_STARTUP_GUIDE.md](./ASSISTANT_STARTUP_GUIDE.md) - Service management
3. [authentication.md](./authentication.md) - Security setup

---

## FAQ & Troubleshooting

**Q: How do I create a new assistant?**  
A: See [README.md - Creating Assistants](./README.md#creating-assistants)

**Q: How does the SDK-first architecture work?**  
A: See [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md#architecture-at-a-glance)

**Q: How do I deploy to production?**  
A: See [DEPLOYMENT.md](./DEPLOYMENT.md)

**Q: Where can I find examples of running assistants?**  
A: See [ASSISTANT_STARTUP_GUIDE.md](./ASSISTANT_STARTUP_GUIDE.md)

**Q: How do I build custom tools?**  
A: See [TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md)

---

## Version History

| Date | Changes |
|------|---------|
| Feb 2, 2026 | Consolidated SDK-first documentation into SDK-ARCHITECTURE.md; all 20 APIs + 24 components verified |
| Jan 22, 2026 | Initial ADK framework documentation |

