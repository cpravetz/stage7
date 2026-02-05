## Complete Assistant Inventory

### All 20 Backend Assistant APIs (SDK-First)

| # | Assistant | Collections | Location |
|----|-----------|-------------|----------|
| 1 | **Songwriter** | lyric, melody, chordProgression, songStructure, songInsight, productionTechnique | agents/songwriter-assistant-api |
| 2 | **Scriptwriter** | character, scene, dialogue | agents/scriptwriter-assistant-api |
| 3 | **Sports Wager Advisor** | strategy, game, wager, analyticsInsight, alert | agents/sports-wager-advisor-api |
| 4 | **Restaurant Operations** | reservation, menuItem, staffSchedule, inventory, guestFeedback, tableStatus, kitchenOrder | agents/restaurant-ops-assistant-api |
| 5 | **Career Coach** | careerProfile, jobListing, application, interviewSession, negotiationData, developmentPlan, resumeOptimization | agents/career-assistant-api |
| 6 | **Customer Support** | ticket, customer, escalation, improvement, responseTemplate, sentimentData | agents/support-assistant-api |
| 7 | **Educational Tutor** | learningPlan, student, assessment, curriculum, analyticsData, resource, schedule, engagement | agents/education-assistant-api |
| 8 | **Healthcare Advisor** | appointment, carePlan, patient, medicalRecord, triage, riskAssessment, collaboration, resource, analyticsData | agents/healthcare-assistant-api |
| 9 | **Content Creator** | contentGoal, contentPiece, platformPerformance, audienceDemographics, audienceInterests, scheduledContent, approvalRequest, seoMetrics, seoSuggestion, trendingTopic | agents/content-creator-assistant-api |
| 10 | **Event Planner** | vendor, budgetData, attendee, task, venue, document, analyticsData | agents/event-assistant-api |
| 11 | **Financial Analyst** | stock, portfolio, marketData | agents/finance-assistant-api |
| 12 | **Performance Analytics** | businessUnit, employee, campaign, performanceMetric, program | agents/performance-analytics-api |
| 13 | **Project Manager** | project, task, timelineItem, resource, risk, budgetItem, stakeholderCommunication, calendarEvent | agents/pm-assistant-api |
| 14 | **Marketing Campaign** | campaign, contentItem, calendarEvent, performanceMetric, roiAnalysis, stakeholderReport, approvalRequest | agents/marketing-assistant-api |
| 15 | **HR Recruitment** | jobPosting, candidate, interview, hiringAnalytics, complianceRecord | agents/hr-assistant-api |
| 16 | **Hotel Operations** | room, guest, guestRequest, housekeepingTask, hotelReservation, invoice, maintenanceRequest, conciergeRequest | agents/hotel-ops-assistant-api |
| 17 | **Sales CRM** | deal, lead, customer, salesActivity, salesForecast, performanceMetric | agents/sales-assistant-api |
| 18 | **Legal Advisor** | caseFile, legalDocument, researchResult, contractAnalysis, complianceIssue | agents/legal-assistant-api |
| 19 | **Executive Coach** | leadershipAssessment, developmentPlan | agents/executive-assistant-api |
| 20 | **Investment Advisor** | portfolio, marketAlert, investmentStrategy | agents/investment-advisor-assistant-api |

**Status**: All 20 verified with zero compilation errors

### Frontend Components (24 total in services/mcsreact/src/assistants/)

Frontend components are wired to use SDK-first event-driven pattern via BaseAssistantPage. See each assistant folder for detailed collection mappings.

---

## Migration Pattern (Standard Template)

Every SDK-first assistant follows this standardized 6-step pattern:

### Step 1: Define Collections

Identify all data types your assistant manages (e.g., ticket, customer, escalation for Customer Support Assistant).

### Step 2: Component Props Interface

Add SDK-first props: sendEvent, assistantState, getState, mergeAssistantState, conversationId

### Step 3: Initialize Collections in useEffect

Pre-load collections on component mount using getState(collection_name)

### Step 4: Extract State with useMemo

Convert assistantState object to usable data structures (single items or arrays)

### Step 5: Create buildEvent Helper

Helper function that creates events with conversation context

### Step 6: Integrate with BaseAssistantPage

Render component inside BaseAssistantPage children prop

---

See [README.md](./README.md) for usage examples and [ASSISTANT_STARTUP_GUIDE.md](./ASSISTANT_STARTUP_GUIDE.md) for deployment details.
# SDK Architecture & API Design
# SDK-First Event-Driven Architecture & API Design

**Last Updated**: February 2026  
**Migration Status**: ✅ 20 Backend APIs + 24 Frontend Components with SDK-First Event-Driven Pattern  
**Build Status**: All migrations verified with zero compilation errors

## Overview

The SDK-first event-driven architecture represents a fundamental shift in the Agent Development Kit from imperative patterns to reactive state management with persistent data storage via the Librarian service. This architecture powers all 24 frontend assistant components and 20 backend assistant APIs.

### Three-Layer Data Flow

```
Frontend (React)
  ↓ (User Action)
Event: { type: 'domain.collection.operation', payload: {...}, entityId: '...' }
  ↓ (sendEvent via WebSocket)
BaseAssistantPage
  ↓ (Event Dispatch & Processing)
Assistant API → Librarian Service (MongoDB/Redis/Chroma)
  ↓ (Data Persistence)
assistantState: { [collection]: { [entityId]: data } }
  ↓ (Reactive Updates)
Frontend receives updated assistantState, component re-renders
```

### Key Principles

1. **Event-Driven**: All state changes flow through structured events, not imperative calls
2. **Persistent**: Librarian service (MongoDB/Redis/Chroma) is single source of truth
3. **Reactive**: Frontend components respond to state changes through props and useMemo
4. **Collection-Based**: Data organized into domain-specific collections (ticket, customer, campaign, etc.)
5. **Conversation-Scoped**: All data tied to conversationId for multi-user/multi-conversation support

---

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

## SDK-First Core Features

### 1. LibrarianClient: Persistent Data Interface

The `LibrarianClient` is the unified interface for all data persistence:

```typescript
interface LibrarianClient {
  // Store/update data in a named collection
  storeData(
    collection: string,
    data: any,
    conversationId?: string
  ): Promise<void>;
  
  // Query data by attributes
  queryData(
    collection: string,
    query: Record<string, any>,
    conversationId?: string
  ): Promise<any[]>;
  
  // Load all data in a collection
  loadData(
    collection: string,
    conversationId?: string
  ): Promise<any[]>;
  
  // Delete data from collection
  deleteData(
    collection: string,
    entityId: string,
    conversationId?: string
  ): Promise<void>;
}
```

**Backend Storage Strategy**:
- **MongoDB**: Document-based storage for structured data (records, documents, events)
- **Redis**: In-memory cache layer for frequently accessed data and fast queries
- **Chroma**: Vector database for semantic search and embedding-based queries

### 2. Event System: Structured State Changes

All state changes flow through structured events:

```typescript
interface SDKEvent {
  type: string;                    // 'domain.collection.operation' format
  payload: {
    [key: string]: any;            // Domain-specific data
    conversationId: string;        // Links to conversation
  };
  entityId?: string;               // References collection entity
}
```

**Event Type Patterns**:
- `domain.ticket.create` - Create new entity
- `domain.ticket.update` - Modify existing entity
- `domain.ticket.delete` - Remove entity
- `domain.customer.analyze` - Special operations
- `domain.campaign.schedule` - Advanced workflows

### 3. Assistant State Management

Frontend receives state organized by collection and keyed by entity ID:

```typescript
interface AssistantState {
  ticket?: Record<string, TicketData>;
  customer?: Record<string, CustomerData>;
  campaign?: Record<string, CampaignData>;
  // ... domain-specific collections
}
```

**Accessing State in Components**:

```typescript
// Extract single item
const firstTicket = useMemo(() => 
  assistantState.ticket?.[Object.keys(assistantState.ticket || {})[0]],
  [assistantState]
);

// Extract all items as array
const tickets = useMemo(() => 
  Object.values(assistantState.ticket || {}).map(v => v),
  [assistantState]
);

// Find filtered items
const openTickets = useMemo(() =>
  Object.values(assistantState.ticket || {})
    .filter(t => t.status === 'open'),
  [assistantState]
);
```

### 4. sendEvent: Frontend-Backend Communication

Frontend components communicate exclusively through events:

```typescript
interface RenderProps {
  sendEvent: (event: SDKEvent) => Promise<void>;
  assistantState: any;
  getState: (collection: string, query?: any) => Promise<any>;
  mergeAssistantState: (collection: string, items: any[]) => void;
  conversationId: string;
}

// Event handler example
const handleCreateTicket = useCallback(async () => {
  await sendEvent({
    type: 'domain.ticket.create',
    payload: {
      title: 'New Support Ticket',
      status: 'open',
      priority: 'high',
      conversationId
    },
    entityId: 'ticket-' + Date.now()
  });
}, [sendEvent, conversationId]);
```

---

## Core Classes

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
