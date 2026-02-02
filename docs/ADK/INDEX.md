# Agent Development Kit (ADK) Documentation Index

**Last Updated**: February 2, 2026  
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

2. **[SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md)** - Technical reference
   - SDK design and philosophy
   - Core classes: `Assistant`, `Tool`, `Conversation`, `MessageParser`
   - Message flow diagrams
   - QuickAssistant pattern (boilerplate elimination)
   - Middleware stack and WebSocket integration
   - Event system and error handling

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

9. **[security_improvements.md](./security_improvements.md)** - Security best practices
   - RBAC implementation
   - Data encryption
   - API security

10. **[ASSISTANTS_BUILDER_MIGRATION_COMPLETE.md](./ASSISTANTS_BUILDER_MIGRATION_COMPLETE.md)** - Migration guide
    - Migration from old pattern to QuickAssistant
    - Pattern differences and benefits

### 📊 Advanced Topics

Specialized documentation:

11. **[technical_implementation_details.md](./technical_implementation_details.md)** - Technical deep dives
12. **[message-queue.md](./message-queue.md)** - RabbitMQ integration
13. **[service-discovery-config.md](./service-discovery-config.md)** - Service discovery
14. **[plugin_config_and_secrets.md](./plugin_config_and_secrets.md)** - Configuration management
15. **[file-upload-documentation.md](./file-upload-documentation.md)** - File handling

---

## 📋 Quick Reference

### By Task

**I want to...**

| Task | Document | Time |
|------|----------|------|
| Get started immediately | [README.md](./README.md) | 5 min |
| Create a new assistant | [README.md](./README.md#creating-assistants) | 10 min |
| Build a custom tool | [TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md) | 30 min |
| Deploy to production | [DEPLOYMENT.md](./DEPLOYMENT.md) | 1 hour |
| Understand the architecture | [ADK_OVERVIEW.md](./ADK_OVERVIEW.md) + [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md) | 1 hour |
| Set up security/auth | [authentication.md](./authentication.md) + [security_improvements.md](./security_improvements.md) | 30 min |
| Debug message flow | [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md#message-flow) | 15 min |
| Configure tools/secrets | [TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md#tool-configuration--secrets) | 20 min |

### By Role

**I am a...**

| Role | Start With | Then Read |
|------|-----------|-----------|
| **New Developer** | [README.md](./README.md) | → [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md) → [TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md) |
| **Senior Engineer** | [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md) | → [technical_implementation_details.md](./technical_implementation_details.md) → [security_improvements.md](./security_improvements.md) |
| **DevOps/Ops** | [DEPLOYMENT.md](./DEPLOYMENT.md) | → [Troubleshooting](./DEPLOYMENT.md#troubleshooting) → Specific tool docs |
| **Product Manager** | [ADK_OVERVIEW.md](./ADK_OVERVIEW.md) | → [README.md](./README.md) → Examples in `/agents/` |

---

## 🎯 Production Checklist

Before deploying to production, verify:

- [ ] Read [DEPLOYMENT.md](./DEPLOYMENT.md) - Production Checklist section
- [ ] Review [security_improvements.md](./security_improvements.md)
- [ ] Configure secrets per [plugin_config_and_secrets.md](./plugin_config_and_secrets.md)
- [ ] Set up monitoring and logging
- [ ] Test all custom tools
- [ ] Load test with realistic traffic
- [ ] Plan backup and recovery procedures

---

## 🔍 Finding Answers

### By Problem/Error

**I'm seeing...**

| Error/Issue | See | Solution |
|------------|-----|----------|
| "Cannot find module '@cktmcs/sdk'" | [README.md](./README.md) | Run `npm install` |
| "WebSocket connection refused" | [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting) | Verify PostOffice is running |
| "Tool execution timeout" | [TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md#4-timeout-management) | Increase timeout or check external service |
| "Messages not displaying" | [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md#message-flow) | Check WebSocket and verify message format |
| "Authentication failed" | [authentication.md](./authentication.md) | Verify secrets and tokens |
| "High memory usage" | [DEPLOYMENT.md](./DEPLOYMENT.md#high-latency) | Check resource limits and cache |

### By Topic

| Topic | Documents |
|-------|-----------|
| **Message Flow** | [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md#message-flow) + [technical_implementation_details.md](./technical_implementation_details.md) |
| **Tools & Plugins** | [TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md) + [plugin_config_and_secrets.md](./plugin_config_and_secrets.md) |
| **Security** | [authentication.md](./authentication.md) + [security_improvements.md](./security_improvements.md) |
| **Deployment** | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| **Configuration** | [plugin_config_and_secrets.md](./plugin_config_and_secrets.md) + tool-specific docs |
| **Performance** | [DEPLOYMENT.md](./DEPLOYMENT.md#performance) + [technical_implementation_details.md](./technical_implementation_details.md) |

---

## 📦 Complete Document List

### ADK Core Documentation (Primary)
- `README.md` - Main entry point with getting started guide
- `ADK_OVERVIEW.md` - System overview and principles
- `SDK-ARCHITECTURE.md` - Technical architecture and API design
- `TOOL-DEVELOPMENT.md` - Tool development guide
- `DEPLOYMENT.md` - Production deployment guide
- `ASSISTANT_STARTUP_GUIDE.md` - Service reference

### Integration & Infrastructure
- `authentication.md` - Auth system documentation
- `security_improvements.md` - Security best practices
- `message-queue.md` - Message queue configuration
- `service-discovery-config.md` - Service discovery
- `plugin_config_and_secrets.md` - Configuration management
- `file-upload-documentation.md` - File handling

### Architecture & Design
- `ADK_OVERVIEW.md` - High-level architecture
- `AGENT_DELEGATION.md` - Agent collaboration
- `technical_implementation_details.md` - Implementation details

### Migration & Special Topics
- `ASSISTANTS_BUILDER_MIGRATION_COMPLETE.md` - Migration documentation
- `AGENT_DELEGATION.md` - Delegation patterns

---

## 💡 Key Concepts

### ADK Principles
1. **Simplicity**: Hide complexity behind clean APIs
2. **Extensibility**: Easy to add new tools and assistants
3. **Collaboration**: Agents work together seamlessly
4. **Transparency**: Clear visibility into operations

### Three-Layer Architecture
- **L1**: Core Engine (conversation management, LLM integration)
- **L2**: SDK (reusable assistant foundation)
- **L3**: Applications (domain-specific assistants, 20+ production)
- **L4**: UI (React frontend, user interaction)

### QuickAssistant Pattern
- Eliminates ~250 lines of boilerplate per assistant
- 87% average code reduction
- Consistent across all 20 production assistants

---

## 🚀 Next Steps

1. **Choose your starting point** from the Quick Reference above
2. **Follow the guide** for your specific use case
3. **Refer back** to specific documents as needed
4. **Check examples** in the `/agents/` directory for working code

---

## ❓ FAQ

**Q: Where do I start?**  
A: Read [README.md](./README.md). You'll be running an assistant in 5 minutes.

**Q: How do I create a new assistant?**  
A: See [README.md - Creating Assistants](./README.md#creating-assistants) section.

**Q: Where's the API documentation?**  
A: [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md) contains the complete API reference.

**Q: How do I deploy to production?**  
A: Read [DEPLOYMENT.md](./DEPLOYMENT.md) for complete instructions.

**Q: Is there sample code?**  
A: Yes! Check the `/agents/` directory for 20+ production assistants.

**Q: What if I have questions?**  
A: Search this documentation using your editor's search feature.

---

**Status**: ✅ Complete, Production-Ready  
**Last Updated**: February 2, 2026  
**Maintainer**: ADK Documentation Team
