# Reusable Assistant Integration Pattern

## Overview
This document defines the standard pattern for integrating SDK assistants with L1 plugins across all 15 V2 assistants. This pattern ensures consistency, maintainability, and scalability.

## Architecture Layers

### Layer 1 (L1) - Core Engine & Plugins
**Purpose**: Execute actual business logic and integrate with external services

**Components**:
- **MissionControl**: Orchestrates agent missions and tool execution
- **TrafficManager**: Creates and manages agents
- **CapabilitiesManager**: Executes plugins
- **Plugins**: Individual capability implementations (JIRA, Slack, etc.)

### Layer 2 (L2) - SDK
**Purpose**: Provide high-level abstractions for assistant development

**Components**:
- **Assistant**: Manages tools and conversations
- **Tool**: Abstracts plugin execution
- **Conversation**: Handles message flow and events
- **HttpCoreEngineClient**: Communicates with L1 APIs

### Layer 3 (L3) - Assistant API
**Purpose**: Expose assistant functionality via REST/WebSocket APIs

**Components**:
- **Express Server**: REST API endpoints
- **WebSocket Server**: Real-time event streaming
- **Conversation Management**: Track active conversations
- **Suggested Actions**: Generate contextual actions

### Layer 4 (L4) - React UI
**Purpose**: Provide user interface for assistant interaction

**Components**:
- **AssistantPage**: Main UI component
- **AssistantClient**: API client
- **Message Rendering**: Display conversation
- **Event Handling**: Process WebSocket events

## Standard Integration Pattern

### Step 1: Define Assistant Tools (L2)

Create SDK tools that map to L1 plugins:

```typescript
// sdk/src/tools/ExampleTool.ts
import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ExampleTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ExampleTool',
      description: 'Description of what this tool does',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['action1', 'action2']
          },
          payload: {
            type: 'object'
          }
        },
        required: ['action', 'payload']
      },
      coreEngineClient
    });
  }

  public async action1(params: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'action1', payload: params }, conversationId);
  }

  public async action2(params: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'action2', payload: params }, conversationId);
  }
}
```

### Step 2: Create L1 Plugin

Generate plugin using the standard generator:

```bash
python scripts/generate-plugin.py EXAMPLE_PLUGIN \
  "Example plugin description" \
  "Detailed explanation" \
  "tag1,tag2,tag3" \
  "category"
```

Implement action handlers in `main.py`:

```python
def action1(payload: dict) -> dict:
    """Implement action1 logic."""
    # Implementation here
    return {"result": "success"}

def action2(payload: dict) -> dict:
    """Implement action2 logic."""
    # Implementation here
    return {"result": "success"}

def execute_plugin(inputs):
    """Main plugin execution function."""
    action = _get_input(inputs, 'action')
    payload = _get_input(inputs, 'payload', default={})
    
    if action == 'action1':
        result_data = action1(payload)
    elif action == 'action2':
        result_data = action2(payload)
    else:
        return [{"success": False, "error": f"Unknown action: {action}"}]
    
    return [{"success": True, "result": result_data}]
```

### Step 3: Create Assistant API (L3)

```typescript
// services/example-assistant-api/src/index.ts
import express from 'express';
import * as http from 'http';
import WebSocket from 'ws';
import {
  Assistant,
  Conversation,
  ExampleTool,
  HttpCoreEngineClient
} from '@cktmcs/sdk';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// Initialize SDK
const coreEngineClient = new HttpCoreEngineClient('http://localhost:5030');
const exampleTool = new ExampleTool(coreEngineClient);

const assistant = new Assistant({
  id: 'example-assistant',
  name: 'Example Assistant',
  role: 'Assists with example tasks',
  personality: 'Helpful and efficient',
  coreEngineClient,
  tools: [exampleTool]
});

// Store active conversations
const activeConversations = new Map<string, Conversation>();
const clients = new Map<string, WebSocket>();

// REST Endpoints
app.post('/api/example-assistant/conversations', async (req, res) => {
  const { initialPrompt } = req.body;
  const conversation = await assistant.startConversation(initialPrompt);
  activeConversations.set(conversation.id, conversation);
  
  // Set up event handlers
  conversation.on('message', (msg) => sendWebSocketEvent(conversation.id, 'message', msg));
  conversation.on('tool_execution', (data) => sendWebSocketEvent(conversation.id, 'tool_execution', data));
  conversation.on('human_input_required', (data) => sendWebSocketEvent(conversation.id, 'human_input_required', data));
  conversation.on('completed', () => {
    sendWebSocketEvent(conversation.id, 'completed', {});
    activeConversations.delete(conversation.id);
  });
  
  res.status(201).json({ conversationId: conversation.id });
});

app.post('/api/example-assistant/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  const conversation = activeConversations.get(id);
  
  if (!conversation) {
    return res.status(404).send('Conversation not found');
  }
  
  await conversation.sendMessage(message);
  res.status(200).json({ status: 'ok' });
});

// WebSocket handling
function sendWebSocketEvent(conversationId: string, event: string, data: any) {
  const ws = clients.get(conversationId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

wss.on('connection', (ws, req) => {
  const conversationId = req.url?.split('/').pop();
  if (conversationId) {
    clients.set(conversationId, ws);
  }
  
  ws.on('close', () => {
    if (conversationId) {
      clients.delete(conversationId);
    }
  });
});

server.listen(3000, () => {
  console.log('Example Assistant API listening on port 3000');
});
```

### Step 4: Create React UI (L4)

```typescript
// services/mcsreact/src/assistants/ExampleAssistant/ExampleAssistantPage.tsx
import React, { useState, useEffect } from 'react';
import { ExampleAssistantClient } from './ExampleAssistantClient';

export const ExampleAssistantPage: React.FC = () => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  
  const client = new ExampleAssistantClient('http://localhost:3000');
  
  const startConversation = async () => {
    const { conversationId } = await client.startConversation('Hello!');
    setConversationId(conversationId);
    
    // Connect WebSocket
    client.connectWebSocket(conversationId, (event, data) => {
      if (event === 'message') {
        setMessages(prev => [...prev, data]);
      }
    });
  };
  
  const sendMessage = async () => {
    if (conversationId && input) {
      await client.sendMessage(conversationId, input);
      setInput('');
    }
  };
  
  return (
    <div>
      <h1>Example Assistant</h1>
      {!conversationId ? (
        <button onClick={startConversation}>Start Conversation</button>
      ) : (
        <>
          <div>
            {messages.map((msg, i) => (
              <div key={i}>{msg.content}</div>
            ))}
          </div>
          <input value={input} onChange={e => setInput(e.target.value)} />
          <button onClick={sendMessage}>Send</button>
        </>
      )}
    </div>
  );
};
```

## Tool-to-Plugin Mapping Template

For each assistant, create a mapping document:

```markdown
# [Assistant Name] Tool-to-Plugin Mapping

## Tools
1. **ToolName** → PLUGIN_NAME
   - SDK Methods: method1, method2
   - Plugin Actions: action1, action2
   - Status: ✅/⚠️/❌

## Configuration
- ENV_VAR_1: Description
- ENV_VAR_2: Description
```

## Checklist for New Assistant Integration

- [ ] Define assistant tools in SDK (`sdk/src/tools/`)
- [ ] Generate L1 plugins (`scripts/generate-plugin.py`)
- [ ] Implement plugin action handlers
- [ ] Create tool-to-plugin mapping document
- [ ] Create L3 API service (`services/[assistant]-api/`)
- [ ] Create React UI components (`services/mcsreact/src/assistants/[Assistant]/`)
- [ ] Add API client (`services/mcsreact/src/assistants/[Assistant]/[Assistant]Client.ts`)
- [ ] Test L1 plugin execution
- [ ] Test L2 SDK tool calls
- [ ] Test L3 API endpoints
- [ ] Test L4 UI integration
- [ ] Test end-to-end flow
- [ ] Document configuration requirements
- [ ] Add to main navigation/routing

## File Structure Template

```
project/
├── sdk/src/tools/
│   └── [Tool]Tool.ts
├── services/capabilitiesmanager/src/plugins/
│   └── [PLUGIN]/
│       ├── main.py
│       ├── manifest.json
│       ├── requirements.txt
│       └── README.md
├── services/[assistant]-api/
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
└── services/mcsreact/src/assistants/[Assistant]/
    ├── [Assistant]Page.tsx
    ├── [Assistant]Client.ts
    └── index.ts
```

## Next Steps

Use this pattern to implement all 15 V2 assistants systematically.

