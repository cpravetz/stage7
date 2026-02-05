# Data Flow Diagrams & Visualizations

## Current State (Broken) - The Problem

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  User: "Add character Alice"                                     │
│           ↓                                                       │
│  CharacterCreationStudio                                         │
│           ↓                                                       │
│  setCharacters([...characters, alice])                           │
│           ↓                                                       │
│  Local State: characters = [alice]  ✓ VISIBLE IN UI             │
│                                                                   │
│           ╔════════════════════════════════════════╗             │
│           ║    PROBLEM: Data never leaves here     ║             │
│           ╚════════════════════════════════════════╝             │
│                                                                   │
│  sendMessage("I've added character Alice")                       │
│           ↓ TEXT ONLY, NOT STRUCTURED DATA                      │
│           │                                                       │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BRAIN SERVICE (LLM)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Receives: "I've added character Alice"                          │
│  Processes: Text only, no structure                              │
│  Responds: "Interesting! Tell me more about Alice..."            │
│           ↓ TEXT RESPONSE ONLY                                   │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FRONTEND (Chat Display)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Response appears in chat:                                       │
│  "Interesting! Tell me more about Alice..."                      │
│                                                                   │
│  ✓ User sees conversation                                        │
│  ✗ But character data never saved                                │
│  ✗ Reload page → data gone                                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│          SCRIPTWRITER API (COMPLETELY ISOLATED)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Tools available:                                                │
│  - ContentGenerationTool   ✗ NEVER CALLED                        │
│  - ContentPlannerTool      ✗ NEVER CALLED                        │
│                                                                   │
│  Knows about:                                                    │
│  - Characters:    ✗ UNKNOWN                                      │
│  - Plots:         ✗ UNKNOWN                                      │
│  - Dialogues:     ✗ UNKNOWN                                      │
│                                                                   │
│  Database:        ✗ EMPTY                                        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

RESULT: 
  Alice character → Stuck in browser memory
               → Never reaches API
               → Never persisted to database
               → Lost on page reload
```

---

## Solution 1 - Bidirectional Sync (RECOMMENDED)

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  (1) User Action:                                                │
│      User: "Add character Alice"                                 │
│           ↓                                                       │
│  (2) LOCAL UPDATE (Optimistic):                                  │
│      setCharacters([...characters, {                             │
│        id: 'temp-123',                                           │
│        name: 'Alice',                                            │
│        persisted: false                                          │
│      }])                                                          │
│      ▲ Character appears immediately in UI                       │
│           ↓                                                       │
│  (3) SYNC TO API:                                                │
│      dataSyncManager.syncToAPI({                                 │
│        type: 'character',                                        │
│        operation: 'create',                                      │
│        payload: { name: 'Alice' },                               │
│        conversationId, clientId                                  │
│      })                                                           │
│           ↓                                                       │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼ HTTP POST /character
┌─────────────────────────────────────────────────────────────────┐
│                   SCRIPTWRITER API                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  (4) RECEIVE SYNC REQUEST:                                       │
│      POST /conversations/conv-123/character                      │
│      Body: { name: 'Alice', ... }                                │
│           ↓                                                       │
│  (5) VALIDATE:                                                   │
│      if (!name) return 400 error                                 │
│           ↓                                                       │
│  (6) PERSIST:                                                    │
│      character = CharacterStorage.create({                       │
│        conversationId: 'conv-123',                               │
│        name: 'Alice',                                            │
│        createdAt: now                                            │
│      })                                                           │
│      // Saves to SQLite database                                 │
│           ↓                                                       │
│  (7) RETURN RESULT:                                              │
│      Response: {                                                 │
│        success: true,                                            │
│        serverId: 'char-456',                                     │
│        data: { id: 'char-456', name: 'Alice', ... },             │
│        message: 'Character saved'                                │
│      }                                                            │
│           ↓                                                       │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼ HTTP Response 200
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  (8) RECEIVE RESPONSE:                                           │
│      response = {                                                │
│        success: true,                                            │
│        serverId: 'char-456'                                      │
│      }                                                            │
│           ↓                                                       │
│  (9) UPDATE STATE WITH SERVER ID:                                │
│      onUpdateCharacter('temp-123', {                             │
│        id: 'char-456',                                           │
│        persisted: true                                           │
│      })                                                           │
│           ↓                                                       │
│  (10) UI UPDATES:                                                │
│       Character now shows:                                       │
│       ┌─────────────────────────┐                                │
│       │ Alice                   │ [Saved] ✓                      │
│       │ Description: ...        │                                │
│       └─────────────────────────┘                                │
│           ↓                                                       │
│  (11) NOTIFY BRAIN:                                              │
│       sendMessage("I've created character Alice (saved)")        │
│           ↓ TEXT + CONTEXT                                       │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BRAIN SERVICE (LLM)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Receives: "I've created character Alice (saved)"                │
│  Knows: Data is persisted, can reason about it                   │
│  Responds: "Great! Alice is now saved. What's her motivation?"   │
│           ↓                                                       │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FRONTEND (Chat Display)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  (12) FINAL STATE:                                               │
│       ✓ Character in local state (with server ID)                │
│       ✓ Character in database (persisted)                        │
│       ✓ Conversation continues naturally                         │
│       ✓ Reload page → Character reloads from DB                  │
│       ✓ Tools can access character data from API                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Solution 2 - SDK Enhancement (Automatic)

```
┌──────────────────────────────────────────────────────────────────┐
│                       FRONTEND (React)                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  User: "I've created a character named Alice, a detective"        │
│           ↓                                                        │
│  sendMessage(message)  ← Single message to API                    │
│           ↓                                                        │
└──────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    SCRIPTWRITER API (Enhanced)                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Message arrives:                                                 │
│  "I've created a character named Alice, a detective"              │
│           ↓                                                        │
│  ╔══════════════════════════════════════════════════════════╗    │
│  ║ (1) MessageExtractor analyzes text                       ║    │
│  ║     Pattern matching:                                    ║    │
│  ║     - Detects: "created a character named X"             ║    │
│  ║     - Confidence: 0.85                                   ║    │
│  ║     - Extracts: { name: 'Alice', role: 'detective' }     ║    │
│  ╚══════════════════════════════════════════════════════════╝    │
│           ↓                                                        │
│  ╔══════════════════════════════════════════════════════════╗    │
│  ║ (2) AutoDataProcessingTool automatically invoked         ║    │
│  ║     Tool sees: { type: 'character', operation: 'create' }║    │
│  ╚══════════════════════════════════════════════════════════╝    │
│           ↓                                                        │
│  ╔══════════════════════════════════════════════════════════╗    │
│  ║ (3) CharacterDataHandler processes                       ║    │
│  ║     - Validates data                                     ║    │
│  ║     - Generates ID: 'char-789'                           ║    │
│  ║     - Saves to database                                  ║    │
│  ║     - Returns: {                                         ║    │
│  ║         success: true,                                   ║    │
│  ║         id: 'char-789',                                  ║    │
│  ║         name: 'Alice',                                   ║    │
│  ║         message: 'Character saved'                       ║    │
│  ║       }                                                   ║    │
│  ╚══════════════════════════════════════════════════════════╝    │
│           ↓                                                        │
│  ╔══════════════════════════════════════════════════════════╗    │
│  ║ (4) LLM processes message (normal flow)                  ║    │
│  ║     Responds: "Great! Alice the detective is now..."     ║    │
│  ╚══════════════════════════════════════════════════════════╝    │
│           ↓                                                        │
│  ╔══════════════════════════════════════════════════════════╗    │
│  ║ (5) Combine results                                      ║    │
│  ║     Response includes:                                   ║    │
│  ║     - LLM response                                       ║    │
│  ║     - Tool result with character ID                      ║    │
│  ║     - shouldSync: true                                   ║    │
│  ╚══════════════════════════════════════════════════════════╝    │
│           ↓                                                        │
└──────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────┐
│                       FRONTEND (React)                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  (6) Receive response with:                                       │
│      - LLM message: "Great! Alice the detective is now..."        │
│      - Tool result: { id: 'char-789', name: 'Alice' }             │
│      - shouldSync: true                                           │
│           ↓                                                        │
│  (7) Event: 'assistantDataSynced'                                 │
│      Window event dispatched with tool results                    │
│           ↓                                                        │
│  (8) CharacterCreationStudio listens:                             │
│      window.addEventListener('assistantDataSynced', (e) => {      │
│        const { characterId, name } = e.detail;                    │
│        setCharacters(prev => [...prev, {                          │
│          id: characterId,                                         │
│          name,                                                    │
│          persisted: true                                          │
│        }]);                                                       │
│      });                                                          │
│           ↓                                                        │
│  (9) UI Updates:                                                  │
│      Character appears with [Saved] badge                         │
│      No manual UI update code needed!                             │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘

AUTOMATIC DATA FLOW:
  Natural Language → Pattern Detection → Tool Invocation
    → Database Persist → Result Sync → UI Update

NO MANUAL SYNC CALLS NEEDED!
```

---

## State Comparison

### Before Solution 1

```javascript
// After adding character in UI and reloading:

// In CharacterCreationStudio:
characters === []  // ✗ Empty - data was lost!

// In database:
SELECT * FROM characters;  // ✗ No rows

// In global conversation:
// Only text messages, no structured data
```

### After Solution 1

```javascript
// After adding character in UI and reloading:

// In CharacterCreationStudio:
characters === [
  { 
    id: 'char-456',
    name: 'Alice',
    persisted: true  // ✓ Marked as saved
  }
]

// In database:
SELECT * FROM characters WHERE id = 'char-456';
// ✓ Row exists

// Reload page:
// Characters load from DB on component mount
// ✓ Data persists

// In conversation:
// Text messages + references to persisted data
```

---

## Data Transformation Pipeline

### Current (Broken)
```
UI Input
  ↓
Local State
  ↓ (stuck here)
└→ Lost on page reload
```

### Solution 1
```
UI Input
  ↓
Local State (optimistic)
  ↓
API Sync Request
  ↓
Validation
  ↓
Database Insert
  ↓
Generate Server ID
  ↓
API Response
  ↓
Update Local State with ID
  ↓
UI Shows [Saved] Badge
  ↓
Persisted (survives reload)
```

### Solution 2
```
UI Input
  ↓
Message to API
  ↓
MessageExtractor
  ↓ (NLP pattern matching)
AutoDataProcessingTool
  ↓
DataHandler
  ↓
Validation + ID Generation
  ↓
Database Insert
  ↓
Tool Result
  ↓
Event Dispatch
  ↓
UI Auto-updates
  ↓
Persisted + Auto-synced
```

---

## Request/Response Format Examples

### Solution 1 - Sync Request

```json
// Frontend → API
{
  "type": "data_sync",
  "dataType": "character",
  "operation": "create",
  "payload": {
    "name": "Alice",
    "description": "A mysterious detective",
    "traits": ["clever", "mysterious"],
    "arcType": "Protagonist"
  },
  "conversationId": "conv-123456",
  "clientId": "client-789",
  "timestamp": 1706830800000
}
```

### Solution 1 - Sync Response

```json
// API → Frontend
{
  "type": "data_sync_response",
  "success": true,
  "dataType": "character",
  "operation": "create",
  "serverId": "char-456",
  "data": {
    "id": "char-456",
    "conversationId": "conv-123456",
    "name": "Alice",
    "description": "A mysterious detective",
    "traits": ["clever", "mysterious"],
    "arcType": "Protagonist",
    "createdAt": "2026-02-02T22:40:00Z",
    "updatedAt": "2026-02-02T22:40:00Z"
  },
  "message": "Character \"Alice\" has been created and saved to your project.",
  "metadata": {
    "timestamp": 1706830805000,
    "conversationId": "conv-123456",
    "processedAt": 1706830804999
  }
}
```

### Solution 2 - Auto Tool Invocation

```json
// Internal - API processes automatically
{
  "type": "tool_call",
  "tool": "AutoDataProcessing",
  "args": {
    "dataType": "character",
    "operation": "create",
    "payload": {
      "name": "Alice",
      "description": "A mysterious detective",
      "source": "message_extraction"
    },
    "conversationId": "conv-123456"
  }
}
```

---

## Error Handling Flows

### Solution 1 - Error Recovery

```
Sync Request (create character)
    ↓
Validation fails (missing name)
    ↓
Response: { success: false, error: "Name required" }
    ↓
Frontend catches error
    ↓
Remove character from local state
    ↓
Show error toast: "Failed to save character"
    ↓
User tries again with valid data
    ↓
Success
```

### Retry Logic

```
Initial Attempt
    ↓ fails
Retry 1 (after 1s)
    ↓ fails
Retry 2 (after 3s)
    ↓ fails
Retry 3 (after 7s)
    ↓ succeeds!
    ↓
Character saved
```

---

## Integration Points

### Components That Need Solution 1

```
ScriptwriterAssistant
├── CharacterCreationStudio
│   └── needs: create, update, delete character
├── PlotStructureHub
│   └── needs: create, update, delete plot points
├── DialogueWritingWorkshop
│   └── needs: create, update, delete dialogues
├── ScriptFormattingCenter
│   └── needs: save format settings
└── ScriptAnalysisDashboard
    └── needs: save analysis results
```

### All Assistants Using Same Pattern

```
Each Assistant needs:
├── DataSyncManager instance
├── Storage layer (SQLite)
│   ├── CharacterStorage
│   ├── PlotStorage
│   ├── DialogueStorage
│   └── etc.
├── API endpoints
│   ├── POST /character (create)
│   ├── PUT /character/{id} (update)
│   ├── DELETE /character/{id} (delete)
│   └── GET /characters (list)
└── Component updates
    ├── Add sync calls on create/update/delete
    ├── Show persisted badges
    └── Handle errors
```

---

This visualization makes clear why the current architecture is broken and how each solution fixes it.
