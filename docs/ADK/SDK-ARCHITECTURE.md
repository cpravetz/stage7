# SDK Architecture & API Design

## Quick Assistant Pattern

The ADK provides `createQuickAssistant()` to eliminate initialization boilerplate across all 20 production assistants.

### Configuration Interface

```typescript
interface QuickAssistantConfig {
  // Identity
  id: string;                                    // Unique assistant ID
  name: string;                                  // Display name
  role: string;                                  // Purpose description
  personality: string;                           // LLM persona prompt
  
  // Tools & Capabilities
  tools: Tool[] | ((coreEngineClient) => Tool[] | Promise<Tool[]>);
  
  // Deployment
  port?: number;                                 // Port to listen on (default: 3000)
  urlBase?: string;                              // URL base for registration
  
  // Security & Configuration
  serviceId?: string;                            // Service identifier (defaults to id)
  secretEnvVar?: string;                         // Environment variable for API secret
  securityManagerUrl?: string;                   // Security manager endpoint
  clientSecret?: string;                         // Fallback secret
  postOfficeUrl?: string;                        // PostOffice WebSocket endpoint
}
```

### Returns

```typescript
interface AssistantInstance {
  assistant: Assistant;
  app: express.Application;
  server: http.Server;
  messageParser: MessageParser;
}
```

## Core Classes

### Assistant

```typescript
class Assistant {
  id: string;
  name: string;
  role: string;
  personality: string;
  tools: Tool[];
  
  // Start conversation
  async startConversation(userId: string, initialPrompt: string): Promise<Conversation>;
  
  // Get/manage conversations
  getConversation(conversationId: string): Conversation | undefined;
  getActiveSessions(): Map<string, Session>;
  async endConversation(conversationId: string): Promise<void>;
  
  // Send message to client
  async sendMessageToClient(content: string, clientId: string, options?: MessageOptions): Promise<void>;
  
  // Tool management
  registerTool(tool: Tool): void;
  getTool(toolName: string): Tool | undefined;
}
```

### Tool

```typescript
abstract class Tool {
  name: string;                          // Unique identifier (used by LLM)
  description: string;                   // LLM-readable description
  
  // Override to implement tool logic
  abstract execute(args: Record<string, any>): Promise<any>;
}
```

### Conversation

```typescript
class Conversation {
  id: string;
  assistantId: string;
  userId: string;
  
  // Message management
  addMessage(role: 'user' | 'assistant', content: string): void;
  getHistory(): Message[];
  
  // Lifecycle
  async end(): Promise<void>;
  
  // Events
  on(event: 'message' | 'tool_call' | 'tool_output' | 'error' | 'end', callback: Function): void;
  off(event: string, callback: Function): void;
}
```

### MessageParser

Converts natural language to structured tool invocations:

```typescript
class MessageParser {
  constructor(config: {
    tools: Tool[];
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
  });
  
  parse(message: string): ParsedMessage;
}

interface ParsedMessage {
  action: string;                        // Identified action
  toolName: string;                      // Tool to invoke (or null if no tool)
  parameters: Record<string, any>;       // Extracted parameters
  confidence: number;                    // Confidence score 0-1
  reasoning: string;                     // Why this parsing was chosen
}
```

## Message Flow

### Inbound (User → Assistant → LLM)

```
User Input (Browser)
    ↓
WebSocket.send(message)
    ↓
L3 Assistant receives message
    ↓
SDK: Assistant.startConversation() or addMessage()
    ↓
MessageParser.parse() - identify intent
    ↓
L2: CoreEngineClient sends to Brain (via RabbitMQ)
    ↓
Brain Service processes with LLM
    ↓
Brain identifies tool needs and/or generates response
```

### Outbound (LLM Response → Browser)

```
Brain publishes response (RabbitMQ)
    ↓
PostOffice receives via routing key
    ↓
L3 Assistant triggers event: Conversation.on('message')
    ↓
Assistant.sendMessageToClient() encapsulates response
    ↓
WebSocket broadcasts to connected browser
    ↓
React state updates, UI displays message
```

## Middleware Stack

Automatically applied via `createQuickAssistant()`:

```typescript
// 1. Request Logging
app.use((req, res, next) => {
  console.log(`[${assistant.id}] ${req.method} ${req.path}`);
  next();
});

// 2. Message Parsing (identify tool usage)
app.use((req, res, next) => {
  if (req.body.message) {
    req.body.parsedMessage = messageParser.parse(req.body.message);
  }
  next();
});

// 3. Standard Headers
app.use((req, res, next) => {
  res.setHeader('X-Assistant-Name', assistant.name);
  res.setHeader('X-Assistant-ID', assistant.id);
  res.setHeader('X-Stage7-Version', '2.0');
  next();
});

// 4. Error Handling
app.use((err, req, res, next) => {
  console.error(`[${assistant.id}] Error:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    assistantId: assistant.id,
    timestamp: new Date().toISOString(),
  });
});
```

## WebSocket Integration

Automatically configured for each assistant:

```typescript
// WebSocket server created on /ws/conversations/:conversationId
wss.on('connection', (ws, req) => {
  const conversationId = req.url.split('/').pop();
  
  // Validate conversation exists
  const conversation = assistant.getConversation(conversationId);
  if (!conversation) {
    ws.close(1008, 'Conversation not found');
    return;
  }
  
  // Forward all conversation events to client
  conversation.on('message', (msg) => {
    ws.send(JSON.stringify({ event: 'message', data: msg }));
  });
  
  conversation.on('tool_call', (data) => {
    ws.send(JSON.stringify({ event: 'tool_call', data }));
  });
  
  // ... other events
});
```

## Error Handling

The SDK provides structured error handling:

```typescript
class ToolExecutionError extends Error {
  constructor(
    public toolName: string,
    public reason: string,
    public originalError?: Error
  ) {
    super(`Tool ${toolName} failed: ${reason}`);
  }
}

class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Conversation ${conversationId} not found`);
  }
}
```

## Token Management

Automatic JWT token handling:

```typescript
const tokenManager = ServiceTokenManager.getInstance(
  securityManagerUrl,
  serviceId,
  clientSecret
);

// Tokens automatically refreshed
const token = await tokenManager.getToken();  // Returns fresh token

// Used by CoreEngineClient for all L1 communication
const coreEngineClient = new HttpCoreEngineClient(
  postOfficeUrl,
  async () => tokenManager.getToken()
);
```

## Event System

Conversations emit events for real-time updates:

```typescript
conversation.on('message', (msg: Message) => {
  // New message added
});

conversation.on('tool_call', (data: ToolCallEvent) => {
  // Tool invocation initiated
});

conversation.on('tool_output', (data: ToolOutputEvent) => {
  // Tool returned result
});

conversation.on('human_input_required', (data: HumanInputEvent) => {
  // LLM needs user approval/input
});

conversation.on('error', (error: Error) => {
  // Error occurred
});

conversation.on('end', () => {
  // Conversation ended
});
```

## State Management

### Local State (in Assistant)
- Tool registry
- Active conversations
- Configuration

### Shared State (in L1 Brain)
- Conversation history
- User context
- Multi-agent coordination state

### Client State (in React UI)
- Chat messages
- UI state (open/closed, expanded tools)
- User preferences

---

See [README.md](./README.md) for usage examples and [ASSISTANT_STARTUP_GUIDE.md](./ASSISTANT_STARTUP_GUIDE.md) for deployment details.
