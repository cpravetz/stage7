# Agent Development Kit (ADK) - Get Started

**Last Updated**: February 2, 2026

## 🎯 Quick Navigation

- **New to ADK?** Start with [Getting Started in 5 Minutes](#getting-started-in-5-minutes)
- **Want to create an assistant?** See [Creating Assistants](#creating-assistants)
- **Need to understand the architecture?** See [Architecture Overview](#architecture-overview)
- **Building custom tools?** See [TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md)
- **Deploying to production?** See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Browse all docs?** See [INDEX.md](./INDEX.md)

---

## Getting Started in 5 Minutes

The fastest way to run an assistant:

### Prerequisites
- Node.js 18+ and npm
- Running L1 Core Engine services (or use docker-compose)

### Option A: Run an Existing Assistant

```bash
# 1. Start the Core Engine (in terminal 1)
docker-compose up -d

# 2. Start an assistant (in terminal 2)
cd agents/pm-assistant-api
npm install
npm run dev

# 3. Start the React UI (in terminal 3)
cd services/mcsreact
npm install
npm start

# 4. Open browser
http://localhost:3000/assistants/pm-assistant
```

### Option B: Create Your Own Assistant

See [Creating Assistants](#creating-assistants) section below.

---

## Creating Assistants

### Quick Assistant Pattern (Recommended)

All assistants in the ADK use the simplified `createQuickAssistant()` pattern that eliminates boilerplate:

**Before (250+ lines of setup):**
```typescript
// Manual token manager, core engine client, express server, websocket setup...
```

**After (35 lines, clean and focused):**
```typescript
import { createQuickAssistant } from '@cktmcs/sdk';

createQuickAssistant({
  id: 'my-assistant',
  name: 'My Assistant',
  role: 'Assists with domain-specific tasks',
  personality: 'Helpful, professional, and domain-expert',
  serviceId: 'my-assistant-api',
  secretEnvVar: 'MY_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const { MyTool, OtherTool } = await import('@cktmcs/sdk');
    return [
      new MyTool(coreEngineClient),
      new OtherTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3000'),
  urlBase: 'my-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize:', error);
  process.exit(1);
});
```

### Step-by-Step: Create a New Assistant

1. **Create directory structure:**
   ```bash
   mkdir agents/my-assistant-api
   cd agents/my-assistant-api
   npm init -y
   ```

2. **Add package.json dependencies:**
   ```json
   {
     "name": "my-assistant-api",
     "version": "1.0.0",
     "scripts": {
       "build": "tsc",
       "dev": "ts-node src/index.ts",
       "start": "node dist/index.js"
     },
     "dependencies": {
       "@cktmcs/sdk": "workspace:*",
       "@cktmcs/shared": "workspace:*"
     },
     "devDependencies": {
       "typescript": "^5.0.0",
       "ts-node": "^10.0.0"
     }
   }
   ```

3. **Create `src/index.ts`** using the Quick Assistant pattern above

4. **Build and run:**
   ```bash
   npm install
   npm run build
   npm start
   ```

---

## Architecture Overview

### Three-Layer Architecture

The ADK is organized in three layers:

```
┌─────────────────────────────────────────────────────────────┐
│                   L4: User Interface                        │
│              (React Frontend - mcsreact)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket + HTTP
┌──────────────────────┴──────────────────────────────────────┐
│              L3: Domain-Specific Assistants                 │
│    (20+ production assistants using QuickAssistant pattern) │
└──────────────────────┬──────────────────────────────────────┘
                       │ SDK API
┌──────────────────────┴──────────────────────────────────────┐
│                   L2: Agent SDK                             │
│  (Assistant, Tool, Conversation, Brain integration)         │
└──────────────────────┬──────────────────────────────────────┘
                       │ Core Engine Client
┌──────────────────────┴──────────────────────────────────────┐
│              L1: Core Engine Services                       │
│  (MissionControl, TrafficManager, CapabilitiesManager)      │
└─────────────────────────────────────────────────────────────┘
```

### What Each Layer Does

| Layer | Purpose | Examples |
|-------|---------|----------|
| **L1: Core Engine** | Foundational AI/planning infrastructure | Conversation management, multi-agent coordination, tool invocation planning |
| **L2: SDK** | Reusable assistant foundation | `Assistant`, `Tool`, `Conversation`, `MessageParser` classes |
| **L3: Assistants** | Domain-specific implementations | Sales, PM, Marketing, HR, Finance, Healthcare, CTO, etc. |
| **L4: UI** | User interaction | React web app, WebSocket client, chat interface |

### Message Flow

```
User Input (L4)
    ↓
React Component
    ↓
WebSocket → L3 Assistant API
    ↓
SDK Assistant.sendMessage()
    ↓
Core Engine Client (L2)
    ↓
RabbitMQ Message Queue
    ↓
Brain Service (MissionControl)
    ↓
LLM Integration + Tool Orchestration
    ↓
Response back through RabbitMQ
    ↓
WebSocket → Browser
    ↓
Chat Display (L4)
```

See [ADK_OVERVIEW.md](./ADK_OVERVIEW.md) for complete architecture details.

---

## SDK API Reference

### Assistant Class

Main interface for building assistants:

```typescript
interface AssistantConfig {
  id: string;              // Unique identifier
  name: string;            // Display name
  role: string;            // Purpose description
  personality: string;     // LLM personality prompt
  tools: Tool[];           // Available tools
  coreEngineClient: HttpCoreEngineClient;
  port?: number;
}

class Assistant {
  // Start conversation with user input
  async startConversation(initialPrompt: string): Promise<void>;
  
  // Send message to user via WebSocket
  async sendMessageToClient(content: string, clientId: string): Promise<void>;
  
  // Get active conversation
  getConversation(conversationId: string): Conversation | undefined;
  
  // Register additional tools at runtime
  registerTool(tool: Tool): void;
}
```

### Tool Class

Base class for all tools:

```typescript
abstract class Tool {
  name: string;           // Unique tool identifier
  description: string;    // What this tool does
  
  // Override this to implement tool logic
  abstract execute(args: Record<string, any>): Promise<any>;
}
```

See [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md) for complete API reference.

---

## Troubleshooting

### Common Issues

**Issue: Assistant won't start**
```
Error: Cannot find module '@cktmcs/sdk'
```
Solution: Run `npm install` in both SDK and assistant directories

**Issue: WebSocket connection refused**
```
WebSocket is closed with code 1006 (abnormal closure)
```
Solution: Verify PostOffice service is running (`http://localhost:5020/health`)

**Issue: Tool invocation fails**
```
Tool execution timeout after 30s
```
Solution: Check external service connectivity; increase timeout if legitimate

**Issue: Messages not displaying in UI**
```
ChatPanel shows count: 0
```
Solution: Verify WebSocket connection; check browser console for errors

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete troubleshooting guide.

---

## Security

### Authentication

The ADK uses JWT tokens issued by the Security Manager service:

- Each assistant service has a unique credential pair (service ID + secret)
- Secrets should be stored in environment variables, never committed to git
- Tokens are automatically refreshed by the SDK

**Best Practice:**
```bash
# Never do this:
export MY_ASSISTANT_API_SECRET=mySecretKey

# Instead, use secrets management:
# - Docker secrets for container deployments
# - HashiCorp Vault for distributed systems
# - AWS Secrets Manager / Azure Key Vault for cloud
```

See [authentication.md](./authentication.md) and [security_improvements.md](./security_improvements.md) for details.

---

## Performance

### Key Performance Metrics

| Metric | Target | Status |
|--------|--------|--------|
| Assistant Startup | < 5s | ✅ Achieved |
| Message Round-trip | < 2s | ✅ Achieved |
| Concurrent Users | 100+ | ✅ Supported |
| Tool Invocation | < 10s avg | ⚠️ Depends on tool |

### Optimization Tips

1. **Lazy Load Tools**: Only import tools that will be used
2. **Cache Tool Responses**: Implement caching for expensive operations
3. **Batch Operations**: Group multiple tool calls when possible
4. **Monitor Memory**: Watch for memory leaks in long-running assistants
5. **Connection Pooling**: Reuse database/API connections

---

## Documentation Index

### Essential Guides
- [INDEX.md](./INDEX.md) - Complete documentation navigation
- [ADK_OVERVIEW.md](./ADK_OVERVIEW.md) - System overview
- [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md) - Technical API reference
- [TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md) - Build custom tools
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment
- [ASSISTANT_STARTUP_GUIDE.md](./ASSISTANT_STARTUP_GUIDE.md) - Service reference

### Integration & Security
- [authentication.md](./authentication.md) - Auth system
- [security_improvements.md](./security_improvements.md) - Security practices
- [message-queue.md](./message-queue.md) - RabbitMQ config
- [plugin_config_and_secrets.md](./plugin_config_and_secrets.md) - Configuration
- [file-upload-documentation.md](./file-upload-documentation.md) - File handling

### Architecture
- [AGENT_DELEGATION.md](./AGENT_DELEGATION.md) - Multi-agent collaboration
- [technical_implementation_details.md](./technical_implementation_details.md) - Deep dives
- [service-discovery-config.md](./service-discovery-config.md) - Service discovery

---

## ADK Features

✨ **Quick Assistant Pattern**: Eliminate ~250 lines of boilerplate  
🛠️ **20+ Production Assistants**: Sales, PM, Marketing, HR, Finance, Healthcare, CTO, etc.  
🔐 **Enterprise Security**: JWT authentication, RBAC, encrypted communication  
📈 **Scalable Architecture**: Horizontal & vertical scaling support  
🧩 **Extensible Tools**: Easy to build and integrate custom tools  
🤝 **Multi-Agent Collaboration**: Agents work together seamlessly  
🎯 **LLM-Ready**: Built-in OpenAI/LLM integration  

---

**Version**: 2.0 (Production-Ready)  
**Status**: ✅ Complete and Maintained

👉 **Next**: [Browse all documentation (INDEX.md)](./INDEX.md)
