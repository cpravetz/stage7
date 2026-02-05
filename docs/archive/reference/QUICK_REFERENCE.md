# Quick Reference: SDK-First, Librarian-Backed Architecture

## Goal

The SDK should provide a generalized, assistant-agnostic data loop where:

1. **Frontend emits events** (UI actions)
2. **Assistant API owns data** and persists to **Librarian** (Mongo/Redis/Chroma)
3. **Brain messages** are interpreted by the API and can trigger tool calls
4. **Tools/system APIs** are invoked by the API based on events and chat
5. **Frontend renders** the authoritative data from the API

No per-assistant interim patterns, no SQLite, no scriptwriter-specific flow.

---

## SDK-First Final State (Canonical Flow)

```
Frontend UI Action → SDK Event → Assistant API
                                ├→ Librarian write/read
                                ├→ Tool invocation
                                ├→ System API calls
                                └→ Emits state update
                                            ↓
                                     Frontend renders

Chat (User/Brain) → SDK Message → Assistant API
                                ├→ Message interpretation
                                ├→ Librarian update/query
                                ├→ Tool invocation
                                └→ Emits state update
```

---

## Required SDK Capabilities (Gaps to Close)

1. **Event channel** for structured UI events
   - Create/update/delete domain data
   - Typed schema with versioning

2. **Unified message interpreter**
   - Interprets user and Brain messages
   - Produces structured intents
   - Routes to tool invocations and data updates

3. **Data ownership in API**
   - All data persisted in Librarian
   - API is the source of truth
   - Frontend never owns durable state

4. **State sync pipeline**
   - API emits canonical state deltas
   - Frontend subscribes and renders

5. **Tool and System API orchestration**
   - Tools are invoked by interpreted intents/events
   - Results feed back into Librarian + state updates

---

## Minimal SDK Abstractions (Final State Only)

### 1) Event Ingestion

```
SDK.emitEvent({
  type: 'domain.character.create',
  payload: { name, description, traits },
  conversationId,
  clientId,
  schemaVersion: '1.0'
})
```

### 2) Message Interpretation

```
SDK.interpretMessage({
  sender: 'user' | 'brain',
  content: 'Add a protagonist named Alice',
  conversationId,
  clientId
})
→ [{ intent: 'character.create', args: { name: 'Alice' } }]
```

### 3) Data Ownership via Librarian

```
Librarian.save({
  collection: 'characters',
  conversationId,
  data: { id, name, traits, ... }
})
```

### 4) State Updates to Frontend

```
SDK.emitStateDelta({
  type: 'characters.updated',
  data: { id, name, ... },
  conversationId
})
```

---

## What Changes Now

- **No per-assistant data sync managers**
- **No SQLite**
- **No scriptwriter-specific flows**
- **All data flows through SDK → Assistant API → Librarian**
- **Frontend becomes a pure renderer of API state**

---

## Next Actions (SDK-First Only)

1. **Confirm SDK event/message interfaces** (schemas + types)
2. **Add Librarian adapter** to SDK (Mongo/Redis/Chroma)
3. **Implement interpreter pipeline** (messages → intents → tools/data)
4. **Define state delta protocol** to frontend
5. **Update assistant APIs to register schemas/tools once**

---

## Non-Goals

- No interim per-assistant fixes
- No assistant-specific storage
- No duplicate logic in frontend
- No timelines/budgets in this doc

- `sdk/src/Assistant.ts`
- All assistant index files

---

## Success Criteria

### Solution 1 is Working When:

```typescript
// In browser console after implementation:

// 1. Add character in UI
characterStudio.handleAddCharacter({ name: 'Alice' });
// → Character appears in UI immediately

// 2. Check if saved to database
const response = await fetch('/api/character/char-123');
console.log(response.json());
// → { id: 'char-123', name: 'Alice', persisted: true }

// 3. Reload page
location.reload();
// → Character still appears (loaded from DB)

// 4. Check brain service
// → Received message about character being added
// → But data is with API, not stored in Brain
```

### Solution 2 is Ready When:

```typescript
// MessageExtractor recognizes natural language
const msg = "I've created a character named Alice";
const extracted = MessageExtractor.extractFromMessage(msg);
// → Returns: { type: 'character', operation: 'create', name: 'Alice' }

// Tool is auto-invoked
// → No manual sync calls needed
// → Data persisted automatically

// Results flow back
// → UI updated with server ID
// → "Saved" badge appears
```

---

## Immediate Action Items

### For Tech Lead

1. **Read** ARCHITECTURE_ANALYSIS.md (30 min)
2. **Decide** which solution fits your timeline (15 min)
3. **Create** implementation task board (30 min)
4. **Assign** Solution 1 Phase 1 to developer (5 min)
5. **Schedule** weekly sync on progress (5 min)

**Total: ~1.5 hours to unblock team**

### For Developer

1. **Read** SOLUTION_1_BIDIRECTIONAL_SYNC.md (45 min)
2. **Create** DataSyncManager skeleton (2 hours)
3. **Test** with console logs (1 hour)
4. **Add** first save endpoint (2 hours)
5. **Integrate** with CharacterCreationStudio (3 hours)
6. **Test** end-to-end (2 hours)

**Total: ~11 hours for first working version**

---

## Common Questions

**Q: Do we need to change the Brain service?**  
A: No. Brain is fine. The problem is the bridge between UI and API.

**Q: Why not just make UI send data to API automatically?**  
A: That's exactly what Solution 1 does via DataSyncManager.

**Q: When should we do Solution 2?**  
A: After Solution 1 works and you have 3+ assistants using it.

**Q: Is real-time collaboration possible?**  
A: Yes, with Solution 3. Solutions 1-2 give you durability first.

**Q: How do I know which components need fixing?**  
A: Any that have `useState` and don't sync to API. Check Scriptwriter, Content Creator, PM, Event, HR, Finance assistants.

---

## Resources

📄 **Full Analysis**: ARCHITECTURE_ANALYSIS.md  
📄 **Solution 1 Code**: SOLUTION_1_BIDIRECTIONAL_SYNC.md  
📄 **Solution 2 Design**: SOLUTION_2_SDK_ENHANCEMENT.md  
📄 **This Summary**: DATA_FLOW_FIX_SUMMARY.md  

Start with this document, then dive deeper into solution-specific guides.

---

**Last Updated:** February 2, 2026  
**Status:** Ready for implementation  
**Confidence:** High (patterns validated across multiple assistants)
