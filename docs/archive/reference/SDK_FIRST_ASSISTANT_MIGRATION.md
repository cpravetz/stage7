# SDK-First Assistant Migration Guide

## Pattern Overview

All assistants follow the same SDK-first event/state pattern:

1. **Remove local state** - Replace `useState([])` with `useMemo` reading from `assistantState`
2. **Add event emission** - Replace direct state updates with `sendEvent(buildEvent(...))`
3. **Add state hydration** - Load initial state on mount via `getState()` and `mergeAssistantState()`
4. **Update prop signatures** - Add `sendEvent`, `assistantState`, `getState`, `mergeAssistantState`, `conversationId`

---

## Step-by-Step Migration Template

### 1. Update AssistantRenderProps Interface

**Before:**
```typescript
interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent?: (event: any) => Promise<void>;  // Optional
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { ... } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
    clientId: string;
}
```

**After:**
```typescript
interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent: (event: any) => Promise<void>;  // Required
    assistantState: any;  // NEW
    getState: (collection: string, query?: any) => Promise<any>;  // NEW
    mergeAssistantState: (collection: string, items: any[]) => void;  // NEW
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { ... } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
    clientId: string;
    conversationId: string;  // NEW
}
```

### 2. Replace Local State with Assistant State

**Before:**
```typescript
const [characters, setCharacters] = useState<Character[]>([]);
const [stories, setStories] = useState<Story[]>([]);
```

**After:**
```typescript
const characters = useMemo(() => 
  Object.values(assistantState?.character || {}) as Character[], 
  [assistantState]
);

const stories = useMemo(() => 
  Object.values(assistantState?.story || {}) as Story[], 
  [assistantState]
);
```

### 3. Add State Hydration on Mount

**Add this useEffect:**
```typescript
useEffect(() => {
  if (!conversationId) return;
  
  const loadState = async () => {
    const [charactersState, storiesState] = await Promise.all([
      getState('character'),
      getState('story'),
    ]);

    mergeAssistantState('character', charactersState?.data || []);
    mergeAssistantState('story', storiesState?.data || []);
  };

  loadState().catch((err) => {
    console.error('[AssistantName] Failed to load state:', err);
  });
}, [conversationId, getState, mergeAssistantState]);
```

### 4. Create Event Builder Helper

**Add this callback:**
```typescript
const buildEvent = useCallback((type: string, payload: any, entityId?: string) => ({
  type,
  payload,
  entityId,
  schemaVersion: '1.0',
  source: 'ui'
}), []);
```

### 5. Replace State Updates with Events

**Before:**
```typescript
onCreateCharacter={(character) => {
  setCharacters(prev => [...prev, character]);
  sendMessage(`I've added a new character: ${character.name}`);
}}

onDeleteCharacter={(characterId) => {
  setCharacters(prev => prev.filter(c => c.id !== characterId));
  sendMessage(`I've removed the character`);
}}

onUpdateCharacter={(characterId, updates) => {
  setCharacters(prev => prev.map(c => 
    c.id === characterId ? { ...c, ...updates } : c
  ));
  sendMessage(`I've updated the character`);
}}
```

**After:**
```typescript
onCreateCharacter={(character) => {
  sendEvent(buildEvent('domain.character.create', { ...character }, character.id));
}}

onDeleteCharacter={(characterId) => {
  sendEvent(buildEvent('domain.character.delete', { id: characterId }, characterId));
}}

onUpdateCharacter={(characterId, updates) => {
  sendEvent(buildEvent('domain.character.update', { id: characterId, ...updates }, characterId));
}}
```

### 6. Update Component Props Destructuring

**Before:**
```typescript
const AssistantView: React.FC<AssistantRenderProps> = ({ 
  messages, 
  sendMessage, 
  isLoading, 
  error, 
  clientId 
}) => {
```

**After:**
```typescript
const AssistantView: React.FC<AssistantRenderProps> = ({ 
  messages, 
  sendMessage, 
  sendEvent,
  assistantState,
  getState,
  mergeAssistantState,
  isLoading, 
  error, 
  clientId,
  conversationId
}) => {
```

### 7. Remove Tool Message Type Guards (Optional)

If your assistant was extracting data from tool messages, remove those type guards:

**Remove:**
```typescript
function isToolMessageContent(content: any): content is { tool: string } {
  return typeof content === 'object' && content !== null && 'tool' in content;
}

function isCharacterToolContent(content: any): content is { tool: string; characters: Character[] } {
  return isToolMessageContent(content) && content.tool === 'CharacterTool' && 'characters' in content;
}
```

---

## Event Type Naming Convention

Follow the pattern: `domain.<collection>.<operation>`

**Examples:**
- `domain.character.create` → stores in `assistant_<assistantId>_character`
- `domain.task.update` → updates in `assistant_<assistantId>_task`
- `domain.recipe.delete` → deletes from `assistant_<assistantId>_recipe`
- `domain.reservation.create` → stores in `assistant_<assistantId>_reservation`

---

## Collection Names by Assistant

| Assistant | Collections |
|-----------|------------|
| Scriptwriter | `character`, `story`, `dialogue`, `plotPoint`, `scriptInsight` |
| Songwriter | `lyric`, `melody`, `chordProgression`, `songStructure`, `songInsight`, `productionTechnique` |
| ProjectManager | `project`, `task`, `timelineItem`, `resource`, `risk`, `budgetItem`, `stakeholderCommunication`, `calendarEvent` |
| RestaurantOps | `reservation`, `menuItem`, `staffSchedule`, `inventoryItem`, `guestFeedback`, `tableStatus`, `kitchenOrder` |
| Sales CRM | `lead`, `opportunity`, `account`, `contact`, `activity`, `forecast` |
| HR Recruitment | `jobPosting`, `candidate`, `interview`, `offer`, `onboarding` |
| Event Planner | `event`, `venue`, `vendor`, `attendee`, `schedule`, `budget` |
| Content Creator | `contentIdea`, `draft`, `campaign`, `asset`, `publishingSchedule` |

---

## Complete Example: Scriptwriter Assistant

See [services/mcsreact/src/assistants/ScriptwriterAssistant/ScriptwriterAssistant.tsx](../services/mcsreact/src/assistants/ScriptwriterAssistant/ScriptwriterAssistant.tsx) for the complete implemented pattern.

**Key changes:**
1. Removed `useState` for characters, stories, dialogues, plotPoints, insights
2. Added `useMemo` reading from `assistantState`
3. Added `useEffect` for state hydration on mount
4. Added `buildEvent` helper
5. Replaced all `setX(...)` calls with `sendEvent(buildEvent(...))`
6. Updated prop signatures to include SDK-first props

---

## Testing Checklist

After migration, verify:

- [ ] UI components render data from `assistantState`
- [ ] Create actions emit events and data appears in UI
- [ ] Update actions modify data in place
- [ ] Delete actions remove data from UI
- [ ] Page reload restores all data from Librarian
- [ ] No console errors about missing props
- [ ] WebSocket receives `assistant_state` messages
- [ ] Librarian collections contain expected data (check MongoDB)

---

## Rollout Order (Recommended)

1. ✅ Scriptwriter (completed)
2. Songwriter (lyrics, melodies, chords)
3. ProjectManager (tasks, timelines, resources)
4. RestaurantOps (reservations, menu, staff)
5. Sales CRM (leads, opportunities, pipeline)
6. HR Recruitment (jobs, candidates, interviews)
7. Event Planner (events, venues, attendees)
8. Content Creator (ideas, drafts, campaigns)
9. Remaining assistants (financial, healthcare, hotel, etc.)

---

## Common Pitfalls

1. **Forgetting to pass new props** - BaseAssistantPage now provides `assistantState`, `getState`, `mergeAssistantState`, `conversationId`. Pass them down.

2. **Not awaiting state load** - The `useEffect` for hydration must complete before UI renders from cache.

3. **Mixing local state with assistant state** - Don't use `useState` for persistent data. Only use for ephemeral UI state (tab index, modal open, etc.).

4. **Wrong collection names** - Must match the event type. `domain.character.create` → collection `character` (not `characters`).

5. **Missing entityId** - Events should include `entityId` matching `payload.id` for updates/deletes.

---

## Need Help?

- Check [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for SDK-first architecture overview
- See [sdk/src/Assistant.ts](../sdk/src/Assistant.ts) for `handleEvent()` implementation
- Review [sdk/src/LibrarianClient.ts](../sdk/src/LibrarianClient.ts) for storage interface
- Look at [services/mcsreact/src/context/WebSocketContext.tsx](../services/mcsreact/src/context/WebSocketContext.tsx) for `assistant_state` handling
