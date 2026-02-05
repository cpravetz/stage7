# Implementation Guide: Solution 1 - Bidirectional Sync

## Overview

Implement a synchronization layer that bridges Frontend UI state ↔ Assistant API.

This solution is the **quickest path to functionality** and can be implemented incrementally without major architectural changes.

## Architecture

```
Frontend UI Component
    ↓
(1) Local State Update (immediate UX response)
    ↓
(2) DataSyncManager.syncToAPI()
    ↓
Scriptwriter-Assistant-API
    ↓
(3) Save to Database
    ↓
(4) Process with Tools (if needed)
    ↓
(5) Return Result with Server ID
    ↓
DataSyncManager.syncFromAPI()
    ↓
(6) Update Local State with Persistence Info
    ↓
Frontend UI Re-renders with Persisted Data
```

## Step 1: Create DataSyncManager

**File:** `services/mcsreact/src/assistants/shared/DataSyncManager.ts`

```typescript
import { AssistantClient } from './AssistantClient';
import { ConversationMessage } from '@cktmcs/sdk';

export interface SyncMessage {
  type: 'data_sync';
  dataType: 'character' | 'plot' | 'dialogue' | 'scene' | 'insight';
  operation: 'create' | 'update' | 'delete';
  payload: any;
  conversationId: string;
  clientId: string;
  timestamp: number;
}

export interface SyncResponse {
  success: boolean;
  dataType: string;
  operation: string;
  serverId?: string;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * Manages bidirectional synchronization between frontend state and assistant API
 */
export class DataSyncManager {
  private assistantClient: AssistantClient;
  private pendingSyncs: Map<string, Promise<SyncResponse>> = new Map();
  private syncCallbacks: Map<string, (response: SyncResponse) => void> = new Map();

  constructor(assistantClient: AssistantClient) {
    this.assistantClient = assistantClient;
  }

  /**
   * Send structured data to API for processing and persistence
   */
  async syncToAPI(
    dataType: string,
    operation: 'create' | 'update' | 'delete',
    payload: any,
    conversationId: string,
    clientId: string
  ): Promise<SyncResponse> {
    const syncId = `${dataType}-${operation}-${Date.now()}-${Math.random()}`;
    
    const syncMessage: SyncMessage = {
      type: 'data_sync',
      dataType: dataType as any,
      operation,
      payload,
      conversationId,
      clientId,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      // Store callback for when response arrives
      this.syncCallbacks.set(syncId, (response: SyncResponse) => {
        this.pendingSyncs.delete(syncId);
        this.syncCallbacks.delete(syncId);
        
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Sync failed'));
        }
      });

      // Send to API via assistant client
      this.assistantClient.sendMessage(
        JSON.stringify({ ...syncMessage, syncId })
      ).catch(err => {
        this.syncCallbacks.delete(syncId);
        this.pendingSyncs.delete(syncId);
        reject(err);
      });

      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        if (this.syncCallbacks.has(syncId)) {
          this.syncCallbacks.delete(syncId);
          this.pendingSyncs.delete(syncId);
          reject(new Error(`Sync ${syncId} timed out`));
        }
      }, 30000);

      this.pendingSyncs.set(syncId, new Promise(r => r({ success: false })));
    });
  }

  /**
   * Process incoming sync response from API
   */
  handleSyncResponse(message: ConversationMessage): void {
    try {
      // Message content should contain sync response
      const content = typeof message.content === 'string'
        ? JSON.parse(message.content)
        : message.content;

      if (content.type === 'data_sync_response' && content.syncId) {
        const callback = this.syncCallbacks.get(content.syncId);
        if (callback) {
          callback(content as SyncResponse);
        }
      }
    } catch (e) {
      console.warn('[DataSyncManager] Could not parse sync response:', e);
    }
  }

  /**
   * Get all pending syncs (for debugging/monitoring)
   */
  getPendingSyncs(): Array<{ id: string; timestamp: number }> {
    return Array.from(this.pendingSyncs.keys()).map(id => ({
      id,
      timestamp: parseInt(id.split('-')[2])
    }));
  }

  /**
   * Cancel a pending sync
   */
  cancelSync(syncId: string): void {
    this.syncCallbacks.delete(syncId);
    this.pendingSyncs.delete(syncId);
  }
}
```

## Step 2: Extend BaseAssistantPage

**File:** `services/mcsreact/src/assistants/shared/BaseAssistantPage.tsx`

```typescript
// Add to imports
import { DataSyncManager, SyncResponse } from './DataSyncManager';

// Modify BaseAssistantPageProps
interface BaseAssistantPageProps {
  // ... existing props
  onDataSync?: (response: SyncResponse) => void;
}

// Inside BaseAssistantPage component
const dataSyncManager = useMemo(
  () => new DataSyncManager(client),
  [client]
);

// Add to message handling
const handleNewMessage = useCallback((msg: ConversationMessage) => {
  // Handle sync responses
  if (typeof msg.content === 'string' && msg.content.includes('data_sync_response')) {
    dataSyncManager.handleSyncResponse(msg);
  }
  
  setGlobalConversationHistory((prev: any) => [...prev, msg]);
}, [setGlobalConversationHistory, dataSyncManager]);

// Pass sync manager to children
const childProps = {
  conversationId,
  messages: visibleMessages,
  sendMessage: handleSendMessage,
  isLoading: loading,
  error: error,
  humanInputRequired: globalPendingUserInput,
  submitHumanInput: handleSubmitHumanInput,
  clientId,
  dataSyncManager,  // NEW: Pass to children
};

return (
  <Box>
    {children?.(childProps)}
  </Box>
);
```

## Step 3: Update Component Props

**File:** `services/mcsreact/src/assistants/ScriptwriterAssistant/ScriptwriterAssistant.tsx`

```typescript
import { DataSyncManager } from '../shared/DataSyncManager';

interface AssistantRenderProps {
  messages: ConversationMessage[];
  sendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
  submitHumanInput: (response: string, inputStepId: string) => void;
  clientId: string;
  conversationId: string;
  dataSyncManager: DataSyncManager;  // NEW
}

const ScriptwriterAssistantView: React.FC<AssistantRenderProps> = ({
  messages,
  sendMessage,
  isLoading,
  error,
  humanInputRequired,
  submitHumanInput,
  clientId,
  conversationId,
  dataSyncManager,  // NEW
}) => {
  // ... rest of component
};
```

## Step 4: Implement Character Persistence

**File:** `services/mcsreact/src/assistants/ScriptwriterAssistant/CharacterCreationStudio.tsx`

```typescript
import { DataSyncManager, SyncResponse } from '../shared/DataSyncManager';

interface CharacterCreationStudioProps {
  characters: Character[];
  onCreateCharacter: (character: Character) => void;
  onDeleteCharacter: (characterId: string) => void;
  onUpdateCharacter: (characterId: string, updates: Partial<Character>) => void;
  dataSyncManager: DataSyncManager;  // NEW
  conversationId: string;             // NEW
  clientId: string;                   // NEW
}

const CharacterCreationStudio: React.FC<CharacterCreationStudioProps> = ({
  characters,
  onCreateCharacter,
  onDeleteCharacter,
  onUpdateCharacter,
  dataSyncManager,
  conversationId,
  clientId,
}) => {
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [savedCharacters, setSavedCharacters] = useState<Set<string>>(new Set());

  const handleAddCharacter = async (characterData: Omit<Character, 'id'>) => {
    // Generate temporary ID for optimistic update
    const tempId = `temp-${Date.now()}`;
    const character: Character = {
      ...characterData,
      id: tempId,
      createdAt: new Date().toISOString(),
      persisted: false,
    };

    // 1. Update local state immediately (optimistic update)
    onCreateCharacter(character);
    setIsSaving(tempId);

    try {
      // 2. Sync to API
      const response = await dataSyncManager.syncToAPI(
        'character',
        'create',
        {
          name: character.name,
          description: character.description,
          arcType: character.arcType,
          traits: character.traits,
          backstory: character.backstory,
          goals: character.goals,
          conflicts: character.conflicts,
        },
        conversationId,
        clientId
      );

      // 3. Update local state with server ID
      if (response.success && response.serverId) {
        onUpdateCharacter(tempId, {
          id: response.serverId,
          persisted: true,
        });
        setSavedCharacters(prev => new Set([...prev, response.serverId!]));

        // 4. Notify assistant
        await sendMessage(
          `I've created a new character: ${character.name}${
            character.description ? ` - ${character.description}` : ''
          }. This has been saved.`
        );
      } else {
        throw new Error(response.error || 'Failed to save character');
      }
    } catch (error) {
      console.error('[CharacterStudio] Failed to save character:', error);
      // Optionally: Remove the character on error
      // onDeleteCharacter(tempId);
      // Show error toast to user
    } finally {
      setIsSaving(null);
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    const character = characters.find(c => c.id === characterId);
    if (!character || !character.persisted) {
      // Only delete locally if not persisted
      onDeleteCharacter(characterId);
      return;
    }

    setIsSaving(characterId);
    try {
      // 1. Delete from API
      const response = await dataSyncManager.syncToAPI(
        'character',
        'delete',
        { id: characterId },
        conversationId,
        clientId
      );

      if (response.success) {
        // 2. Remove from local state
        onDeleteCharacter(characterId);
        setSavedCharacters(prev => {
          const next = new Set(prev);
          next.delete(characterId);
          return next;
        });

        // 3. Notify assistant
        await sendMessage(`I've removed the character: ${character.name}.`);
      }
    } catch (error) {
      console.error('[CharacterStudio] Failed to delete character:', error);
    } finally {
      setIsSaving(null);
    }
  };

  const handleUpdateCharacter = async (characterId: string, updates: Partial<Character>) => {
    const character = characters.find(c => c.id === characterId);
    if (!character) return;

    // 1. Update local state
    onUpdateCharacter(characterId, updates);

    // Only sync to API if persisted
    if (!character.persisted) return;

    setIsSaving(characterId);
    try {
      // 2. Sync to API
      const response = await dataSyncManager.syncToAPI(
        'character',
        'update',
        { id: characterId, ...updates },
        conversationId,
        clientId
      );

      if (response.success) {
        // 3. Notify assistant (optional)
        await sendMessage(`I've updated the character: ${character.name}.`);
      }
    } catch (error) {
      console.error('[CharacterStudio] Failed to update character:', error);
    } finally {
      setIsSaving(null);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6">Characters</Typography>
      <Box sx={{ mb: 2 }}>
        {/* Character form */}
        <Button
          onClick={() => handleAddCharacter(formData)}
          disabled={isSaving !== null}
        >
          {isSaving ? 'Saving...' : 'Add Character'}
        </Button>
      </Box>

      {/* Character list with save indicators */}
      {characters.map(char => (
        <Box key={char.id} sx={{ mb: 2, p: 1, border: '1px solid #ccc' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle1">{char.name}</Typography>
              {char.persisted && (
                <Chip label="Saved" size="small" color="success" />
              )}
              {isSaving === char.id && (
                <Chip label="Saving..." size="small" />
              )}
            </Box>
            <Box>
              <IconButton
                onClick={() => handleUpdateCharacter(char.id, { /* updates */ })}
                disabled={isSaving !== null}
              >
                Edit
              </IconButton>
              <IconButton
                onClick={() => handleDeleteCharacter(char.id)}
                disabled={isSaving !== null}
              >
                Delete
              </IconButton>
            </Box>
          </Box>
          <Typography variant="body2">{char.description}</Typography>
        </Box>
      ))}
    </Box>
  );
};

export default CharacterCreationStudio;
```

## Step 5: Add API Endpoints

**File:** `agents/scriptwriter-assistant-api/src/routes/dataRoutes.ts`

```typescript
import express, { Router, Request, Response } from 'express';
import { CharacterStorage } from '../storage/CharacterStorage';
import { PlotStorage } from '../storage/PlotStorage';
import { DialogueStorage } from '../storage/DialogueStorage';

const router = Router();

// Character endpoints
router.post('/conversations/:conversationId/character', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { name, description, arcType, traits, backstory, goals, conflicts } = req.body;

    // Validate
    if (!name) {
      return res.status(400).json({ error: 'Character name is required' });
    }

    // Save to database
    const character = await CharacterStorage.create({
      conversationId,
      name,
      description,
      arcType,
      traits,
      backstory,
      goals,
      conflicts,
      createdAt: new Date(),
    });

    res.json({
      type: 'data_sync_response',
      success: true,
      dataType: 'character',
      operation: 'create',
      serverId: character.id,
      data: character,
      message: `Character "${name}" has been created and persisted.`,
    });
  } catch (error) {
    console.error('[API] Error creating character:', error);
    res.status(500).json({
      type: 'data_sync_response',
      success: false,
      error: (error as Error).message,
    });
  }
});

router.put('/conversations/:conversationId/character/:characterId', async (req: Request, res: Response) => {
  try {
    const { conversationId, characterId } = req.params;
    const updates = req.body;

    const character = await CharacterStorage.update(characterId, updates);

    res.json({
      type: 'data_sync_response',
      success: true,
      dataType: 'character',
      operation: 'update',
      data: character,
      message: `Character has been updated.`,
    });
  } catch (error) {
    console.error('[API] Error updating character:', error);
    res.status(500).json({
      type: 'data_sync_response',
      success: false,
      error: (error as Error).message,
    });
  }
});

router.delete('/conversations/:conversationId/character/:characterId', async (req: Request, res: Response) => {
  try {
    const { characterId } = req.params;

    await CharacterStorage.delete(characterId);

    res.json({
      type: 'data_sync_response',
      success: true,
      dataType: 'character',
      operation: 'delete',
      message: 'Character has been deleted.',
    });
  } catch (error) {
    console.error('[API] Error deleting character:', error);
    res.status(500).json({
      type: 'data_sync_response',
      success: false,
      error: (error as Error).message,
    });
  }
});

// Similar endpoints for plots, dialogues, etc.

export default router;
```

## Step 6: Create Storage Layer

**File:** `agents/scriptwriter-assistant-api/src/storage/CharacterStorage.ts`

```typescript
import Database from 'better-sqlite3';
import path from 'path';

export interface Character {
  id: string;
  conversationId: string;
  name: string;
  description?: string;
  arcType?: string;
  traits?: string[];
  backstory?: string;
  goals?: string[];
  conflicts?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const DB_PATH = process.env.DATA_DIR || path.join(__dirname, '../../data');
const db = new Database(path.join(DB_PATH, 'scriptwriter.db'));

export class CharacterStorage {
  static init() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        arcType TEXT,
        traits TEXT,
        backstory TEXT,
        goals TEXT,
        conflicts TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        INDEX idx_conversation (conversationId)
      )
    `);
  }

  static create(data: Omit<Character, 'id' | 'updatedAt'>): Character {
    const id = `char-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const stmt = db.prepare(`
      INSERT INTO characters (
        id, conversationId, name, description, arcType, traits,
        backstory, goals, conflicts, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.conversationId,
      data.name,
      data.description || null,
      data.arcType || null,
      data.traits ? JSON.stringify(data.traits) : null,
      data.backstory || null,
      data.goals ? JSON.stringify(data.goals) : null,
      data.conflicts ? JSON.stringify(data.conflicts) : null,
      now.toISOString(),
      now.toISOString()
    );

    return { ...data, id, updatedAt: now };
  }

  static update(id: string, updates: Partial<Character>): Character {
    const now = new Date();
    const existing = this.getById(id);
    if (!existing) throw new Error(`Character ${id} not found`);

    const stmt = db.prepare(`
      UPDATE characters SET
        name = ?,
        description = ?,
        arcType = ?,
        traits = ?,
        backstory = ?,
        goals = ?,
        conflicts = ?,
        updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(
      updates.name ?? existing.name,
      updates.description ?? existing.description,
      updates.arcType ?? existing.arcType,
      updates.traits ? JSON.stringify(updates.traits) : existing.traits,
      updates.backstory ?? existing.backstory,
      updates.goals ? JSON.stringify(updates.goals) : existing.goals,
      updates.conflicts ? JSON.stringify(updates.conflicts) : existing.conflicts,
      now.toISOString(),
      id
    );

    return this.getById(id)!;
  }

  static getById(id: string): Character | null {
    const stmt = db.prepare('SELECT * FROM characters WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToEntity(row) : null;
  }

  static getByConversation(conversationId: string): Character[] {
    const stmt = db.prepare('SELECT * FROM characters WHERE conversationId = ?');
    const rows = stmt.all(conversationId) as any[];
    return rows.map(row => this.rowToEntity(row));
  }

  static delete(id: string): void {
    const stmt = db.prepare('DELETE FROM characters WHERE id = ?');
    stmt.run(id);
  }

  private static rowToEntity(row: any): Character {
    return {
      ...row,
      traits: row.traits ? JSON.parse(row.traits) : [],
      goals: row.goals ? JSON.parse(row.goals) : [],
      conflicts: row.conflicts ? JSON.parse(row.conflicts) : [],
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
```

## Implementation Checklist

- [ ] Create DataSyncManager
- [ ] Update BaseAssistantPage to pass dataSyncManager
- [ ] Update ScriptwriterAssistant component props
- [ ] Implement character persistence in CharacterCreationStudio
- [ ] Implement plot persistence in PlotStructureHub
- [ ] Implement dialogue persistence in DialogueWritingWorkshop
- [ ] Add API endpoints for character CRUD
- [ ] Add API endpoints for plot CRUD
- [ ] Add API endpoints for dialogue CRUD
- [ ] Create storage layer with database initialization
- [ ] Add error handling and retry logic
- [ ] Test end-to-end data flow
- [ ] Verify data persists across page reloads
- [ ] Apply same pattern to all other assistants
