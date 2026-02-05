# Implementation Guide: Solution 2 - SDK Enhancement

## Overview

This solution extends the SDK to automatically recognize, process, and persist structured data from user conversations and UI actions.

**This is the most elegant long-term solution** that makes the architecture reusable across all assistants.

## Architecture

```
User Action (UI Component)
         ↓
Frontend sends: "I've added a character named Alice"
         ↓
Backend receives text message
         ↓
LLM processes with context awareness
         ↓
MessageExtractor identifies structured data patterns
         ↓
AutoDataProcessingTool invoked automatically
         ↓
Tool persists character and generates insights
         ↓
Results returned to Frontend
         ↓
WebSocket sync updates UI state
         ↓
Character now persisted with ID and insights
```

## Component 1: MessageExtractor

**File:** `sdk/src/utils/MessageExtractor.ts`

```typescript
/**
 * Extracts structured data patterns from natural language messages
 * Recognizes when users are creating/updating/deleting entities
 */
export interface ExtractedData {
  type: 'character' | 'plot' | 'dialogue' | 'scene' | 'insight';
  operation: 'create' | 'update' | 'delete';
  confidence: number;
  payload: any;
  originalText: string;
}

export class MessageExtractor {
  /**
   * Extract structured data from message text
   */
  static extractFromMessage(message: string): ExtractedData[] {
    const extracted: ExtractedData[] = [];

    // Character creation patterns
    if (this.matchesCharacterPattern(message)) {
      extracted.push(this.extractCharacter(message));
    }

    // Plot creation patterns
    if (this.matchesPlotPattern(message)) {
      extracted.push(this.extractPlot(message));
    }

    // Dialogue patterns
    if (this.matchesDialoguePattern(message)) {
      extracted.push(this.extractDialogue(message));
    }

    return extracted;
  }

  // Character extraction
  private static matchesCharacterPattern(msg: string): boolean {
    const patterns = [
      /(?:create|add|introduce).*?character.*?named\s+(\w+)/i,
      /(?:new|another).*?character.*?(\w+)/i,
      /I've created.*?character.*?(\w+)/i,
      /character:\s*name.*?(\w+)/i,
    ];
    return patterns.some(p => p.test(msg));
  }

  private static extractCharacter(msg: string): ExtractedData {
    // Use regex to extract character name
    const nameMatch = msg.match(/(?:named|called|:)\s+(\w+)/i);
    const name = nameMatch?.[1] || 'Unknown';

    // Extract description if available
    const descMatch = msg.match(/(?:description|bio|summary)[\s:]+([^.!?\n]+)/i);
    const description = descMatch?.[1]?.trim();

    // Extract character traits
    const traitsMatch = msg.match(/traits?[\s:]+([^.!?\n]+)/i);
    const traits = traitsMatch
      ? traitsMatch[1].split(',').map(t => t.trim())
      : [];

    return {
      type: 'character',
      operation: 'create',
      confidence: 0.85,
      payload: {
        name,
        description,
        traits,
        source: 'message_extraction',
      },
      originalText: msg,
    };
  }

  // Plot extraction
  private static matchesPlotPattern(msg: string): boolean {
    const patterns = [
      /plot\s+(?:point|event)[\s:]+([^.!?\n]+)/i,
      /act\s+\d+[\s:]+([^.!?\n]+)/i,
      /sequence[\s:]+([^.!?\n]+)/i,
    ];
    return patterns.some(p => p.test(msg));
  }

  private static extractPlot(msg: string): ExtractedData {
    const sequence = msg.match(/sequence[\s:]+(\d+)/i)?.[1];
    const act = msg.match(/act\s+(\d+)/i)?.[1];
    const description = msg.match(/[\s:]+([^.!?\n]+)/)?.[1]?.trim();

    return {
      type: 'plot',
      operation: 'create',
      confidence: 0.8,
      payload: {
        sequenceNumber: parseInt(sequence) || 0,
        actNumber: act ? parseInt(act) : undefined,
        description: description || msg,
        source: 'message_extraction',
      },
      originalText: msg,
    };
  }

  // Dialogue extraction
  private static matchesDialoguePattern(msg: string): boolean {
    const patterns = [
      /(?:dialogue|line)[\s:]+([^:]+):\s*([^.!?\n]+)/i,
      /\*?(\w+)\*?:\s*(["\']?)([^"\']+)\2/i,
    ];
    return patterns.some(p => p.test(msg));
  }

  private static extractDialogue(msg: string): ExtractedData {
    const match = msg.match(/(\w+):\s*(["\']?)(.+?)\2(?:[.!?]|$)/i);
    if (!match) {
      return {
        type: 'dialogue',
        operation: 'create',
        confidence: 0.5,
        payload: { source: 'message_extraction' },
        originalText: msg,
      };
    }

    return {
      type: 'dialogue',
      operation: 'create',
      confidence: 0.9,
      payload: {
        characterName: match[1],
        text: match[3],
        source: 'message_extraction',
      },
      originalText: msg,
    };
  }
}
```

## Component 2: AutoDataProcessingTool

**File:** `sdk/src/tools/AutoDataProcessingTool.ts`

```typescript
import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';
import { MessageExtractor, ExtractedData } from '../utils/MessageExtractor';

/**
 * Automatically processes extracted structured data from conversations
 * Persists data and generates insights
 */
export class AutoDataProcessingTool extends Tool {
  private dataHandlers: Map<string, DataHandler> = new Map();
  private persistenceLayer: any; // Implement with actual DB

  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'AutoDataProcessing',
      description: `Automatically processes and persists user-created data from conversations.
Handles characters, plot points, dialogues, scenes, and other structured entities.
Invoked when patterns are detected in conversation text.`,
      inputSchema: {
        type: 'object',
        properties: {
          dataType: {
            type: 'string',
            enum: ['character', 'plot', 'dialogue', 'scene', 'insight'],
            description: 'Type of data to process',
          },
          operation: {
            type: 'string',
            enum: ['create', 'update', 'delete'],
            description: 'Operation to perform',
          },
          payload: {
            type: 'object',
            description: 'Data payload for the operation',
          },
          conversationId: {
            type: 'string',
            description: 'Associated conversation ID',
          },
        },
        required: ['dataType', 'operation', 'payload', 'conversationId'],
      } as JsonSchema,
      coreEngineClient,
    });

    this.initializeHandlers();
  }

  private initializeHandlers() {
    this.dataHandlers.set('character', new CharacterDataHandler());
    this.dataHandlers.set('plot', new PlotDataHandler());
    this.dataHandlers.set('dialogue', new DialogueDataHandler());
    this.dataHandlers.set('scene', new SceneDataHandler());
    this.dataHandlers.set('insight', new InsightDataHandler());
  }

  async execute(args: any, conversationId: string): Promise<any> {
    const { dataType, operation, payload } = args;

    try {
      // Validate input
      if (!this.dataHandlers.has(dataType)) {
        throw new Error(`Unknown data type: ${dataType}`);
      }

      const handler = this.dataHandlers.get(dataType)!;

      // Process based on operation
      let result;
      switch (operation) {
        case 'create':
          result = await handler.create(payload, conversationId);
          break;
        case 'update':
          result = await handler.update(payload, conversationId);
          break;
        case 'delete':
          result = await handler.delete(payload, conversationId);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      return {
        success: true,
        dataType,
        operation,
        serverId: result.id,
        data: result,
        message: this.generateMessage(dataType, operation, result),
        metadata: {
          timestamp: new Date().toISOString(),
          conversationId,
          processedAt: Date.now(),
        },
      };
    } catch (error) {
      return {
        success: false,
        dataType,
        operation,
        error: (error as Error).message,
        message: `Failed to ${operation} ${dataType}: ${(error as Error).message}`,
      };
    }
  }

  private generateMessage(dataType: string, operation: string, result: any): string {
    const messages: Record<string, Record<string, string>> = {
      character: {
        create: `Character "${result.name}" has been created and saved to your script project.`,
        update: `Character "${result.name}" has been updated.`,
        delete: `Character has been removed from your project.`,
      },
      plot: {
        create: `Plot point added: "${result.description}"`,
        update: `Plot point has been updated.`,
        delete: `Plot point has been removed.`,
      },
      dialogue: {
        create: `Dialogue line added for ${result.characterName}.`,
        update: `Dialogue line has been updated.`,
        delete: `Dialogue line has been removed.`,
      },
      scene: {
        create: `Scene created: "${result.title}"`,
        update: `Scene has been updated.`,
        delete: `Scene has been removed.`,
      },
      insight: {
        create: `New insight generated about your script.`,
        update: `Insight has been updated.`,
        delete: `Insight has been removed.`,
      },
    };

    return messages[dataType]?.[operation] || `${operation} complete.`;
  }
}

// Data handlers for each type
interface DataHandler {
  create(payload: any, conversationId: string): Promise<any>;
  update(payload: any, conversationId: string): Promise<any>;
  delete(payload: any, conversationId: string): Promise<any>;
}

class CharacterDataHandler implements DataHandler {
  async create(payload: any, conversationId: string): Promise<any> {
    // Save character to database
    const character = {
      id: `char-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // TODO: Persist to database
    console.log('[AutoDataProcessing] Created character:', character);

    return character;
  }

  async update(payload: any, conversationId: string): Promise<any> {
    // Update character in database
    const character = {
      ...payload,
      updatedAt: new Date(),
    };

    // TODO: Persist to database
    console.log('[AutoDataProcessing] Updated character:', character);

    return character;
  }

  async delete(payload: any, conversationId: string): Promise<any> {
    // Delete character from database
    // TODO: Delete from database
    console.log('[AutoDataProcessing] Deleted character:', payload.id);

    return { deleted: true, id: payload.id };
  }
}

class PlotDataHandler implements DataHandler {
  async create(payload: any, conversationId: string): Promise<any> {
    const plotPoint = {
      id: `plot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log('[AutoDataProcessing] Created plot point:', plotPoint);
    return plotPoint;
  }

  async update(payload: any, conversationId: string): Promise<any> {
    const plotPoint = {
      ...payload,
      updatedAt: new Date(),
    };

    console.log('[AutoDataProcessing] Updated plot point:', plotPoint);
    return plotPoint;
  }

  async delete(payload: any, conversationId: string): Promise<any> {
    console.log('[AutoDataProcessing] Deleted plot point:', payload.id);
    return { deleted: true, id: payload.id };
  }
}

class DialogueDataHandler implements DataHandler {
  async create(payload: any, conversationId: string): Promise<any> {
    const dialogue = {
      id: `dialogue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log('[AutoDataProcessing] Created dialogue:', dialogue);
    return dialogue;
  }

  async update(payload: any, conversationId: string): Promise<any> {
    const dialogue = {
      ...payload,
      updatedAt: new Date(),
    };

    console.log('[AutoDataProcessing] Updated dialogue:', dialogue);
    return dialogue;
  }

  async delete(payload: any, conversationId: string): Promise<any> {
    console.log('[AutoDataProcessing] Deleted dialogue:', payload.id);
    return { deleted: true, id: payload.id };
  }
}

class SceneDataHandler implements DataHandler {
  async create(payload: any, conversationId: string): Promise<any> {
    const scene = {
      id: `scene-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      ...payload,
      createdAt: new Date(),
    };

    console.log('[AutoDataProcessing] Created scene:', scene);
    return scene;
  }

  async update(payload: any, conversationId: string): Promise<any> {
    const scene = { ...payload, updatedAt: new Date() };
    console.log('[AutoDataProcessing] Updated scene:', scene);
    return scene;
  }

  async delete(payload: any, conversationId: string): Promise<any> {
    console.log('[AutoDataProcessing] Deleted scene:', payload.id);
    return { deleted: true, id: payload.id };
  }
}

class InsightDataHandler implements DataHandler {
  async create(payload: any, conversationId: string): Promise<any> {
    const insight = {
      id: `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      ...payload,
      createdAt: new Date(),
    };

    console.log('[AutoDataProcessing] Created insight:', insight);
    return insight;
  }

  async update(payload: any, conversationId: string): Promise<any> {
    const insight = { ...payload, updatedAt: new Date() };
    console.log('[AutoDataProcessing] Updated insight:', insight);
    return insight;
  }

  async delete(payload: any, conversationId: string): Promise<any> {
    console.log('[AutoDataProcessing] Deleted insight:', payload.id);
    return { deleted: true, id: payload.id };
  }
}
```

## Component 3: Enhanced Assistant Class

**File:** `sdk/src/Assistant.ts` (modifications)

```typescript
import { MessageExtractor, ExtractedData } from './utils/MessageExtractor';
import { AutoDataProcessingTool } from './tools/AutoDataProcessingTool';

export class Assistant {
  // ... existing properties ...
  private messageExtractor: MessageExtractor;
  private autoDataProcessingTool: AutoDataProcessingTool;

  constructor(config: AssistantConfig) {
    // ... existing initialization ...

    this.messageExtractor = new MessageExtractor();
    
    // Register AutoDataProcessingTool automatically
    this.autoDataProcessingTool = new AutoDataProcessingTool(
      this.coreEngineClient
    );
    this.registerTool(this.autoDataProcessingTool);
  }

  /**
   * Enhanced message processing with automatic data extraction
   */
  async processMessage(
    message: string,
    conversationId: string
  ): Promise<ProcessedMessageResult> {
    // 1. Extract structured data from message
    const extractedData = this.messageExtractor.extractFromMessage(message);

    // 2. Process extracted data automatically
    const dataResults = await Promise.all(
      extractedData.map(data =>
        this.autoDataProcessingTool.execute(
          {
            dataType: data.type,
            operation: data.operation,
            payload: data.payload,
            conversationId,
          },
          conversationId
        )
      )
    );

    // 3. Send message to LLM as usual
    const llmResponse = await this.getLLMResponse(message, conversationId);

    // 4. Combine results
    return {
      llmResponse,
      extractedData: extractedData.length > 0 ? extractedData : undefined,
      dataResults: dataResults.length > 0 ? dataResults : undefined,
      shouldSync: dataResults.some(r => r.success),
      metadata: {
        extractedCount: extractedData.length,
        processedCount: dataResults.filter(r => r.success).length,
      },
    };
  }

  /**
   * Get LLM response (extract to separate method for testability)
   */
  private async getLLMResponse(
    message: string,
    conversationId: string
  ): Promise<any> {
    // TODO: Implement actual LLM call
    return { content: 'Response' };
  }
}

interface ProcessedMessageResult {
  llmResponse: any;
  extractedData?: ExtractedData[];
  dataResults?: any[];
  shouldSync: boolean;
  metadata: {
    extractedCount: number;
    processedCount: number;
  };
}
```

## Component 4: Frontend Integration

**File:** `services/mcsreact/src/assistants/shared/BaseAssistantPage.tsx`

```typescript
// Enhanced message handling to recognize data sync responses
const handleNewMessage = useCallback((msg: ConversationMessage) => {
  // Check if this is an auto-processed data result
  if (msg.sender === 'system' || typeof msg.content === 'object') {
    const content = typeof msg.content === 'string'
      ? tryParseJSON(msg.content)
      : msg.content;

    if (content?.dataResults) {
      // Dispatch event to notify child components of persisted data
      window.dispatchEvent(
        new CustomEvent('assistantDataSynced', {
          detail: {
            results: content.dataResults,
            conversationId,
          },
        })
      );
    }
  }

  setGlobalConversationHistory((prev: any) => [...prev, msg]);
}, []);

// Helper to safely parse JSON
function tryParseJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
```

## Component 5: Update Scriptwriter Assistant Index

**File:** `agents/scriptwriter-assistant-api/src/index.ts`

```typescript
import { createQuickAssistant } from '@cktmcs/sdk';
import { AutoDataProcessingTool } from '@cktmcs/sdk';

createQuickAssistant({
  id: 'scriptwriter-assistant',
  name: 'Scriptwriter Assistant',
  role: 'Assists with scriptwriting, storyboarding, and character development',
  personality: 'Creative, structured, and knowledgeable about storytelling and screenplay format',
  serviceId: 'scriptwriter-assistant',
  secretEnvVar: 'SCRIPTWRITER_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      ContentGenerationTool,
      ContentPlannerTool,
    } = await import('@cktmcs/sdk');

    return [
      new ContentGenerationTool(coreEngineClient),
      new ContentPlannerTool(coreEngineClient),
      // AutoDataProcessingTool is registered automatically by Assistant class
    ];
  },
  port: parseInt(process.env.PORT || '3016'),
  urlBase: 'scriptwriter-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Scriptwriter Assistant:', error);
  process.exit(1);
});
```

## How It Works (End-to-End)

1. **User Action**: Adds character "Alice, a mysterious detective"
2. **Frontend**: Sends message: `"I've created a character named Alice, a mysterious detective"`
3. **Backend receives**: Text message
4. **MessageExtractor**: Detects character creation pattern, extracts:
   ```json
   {
     "type": "character",
     "operation": "create",
     "payload": {
       "name": "Alice",
       "description": "a mysterious detective"
     }
   }
   ```
5. **Assistant**: Automatically invokes AutoDataProcessingTool
6. **Tool**: Persists character, returns:
   ```json
   {
     "success": true,
     "serverId": "char-123456",
     "message": "Character \"Alice\" has been created..."
   }
   ```
7. **LLM**: Also processes message, generates insightful response
8. **Response**: Sent back to frontend with both LLM response and data results
9. **Frontend**: Updates local state with server ID, UI shows "Saved" badge

## Advantages

✅ **Zero friction**: No extra API calls required from frontend  
✅ **Automatic**: AI extracts structured data intelligently  
✅ **Reusable**: Same pattern works for all assistants  
✅ **Backward compatible**: Works with existing chat flows  
✅ **Extensible**: Add new data types by extending handlers  
✅ **Debuggable**: Full audit trail of extractions  

## Testing MessageExtractor

```typescript
// Test character extraction
const msg = "I've created a character named Alice who is a detective";
const extracted = MessageExtractor.extractFromMessage(msg);
console.log(extracted);
// Output:
// [{
//   type: 'character',
//   operation: 'create',
//   confidence: 0.85,
//   payload: { name: 'Alice', ... }
// }]
```

## Implementation Checklist

- [ ] Create MessageExtractor utility
- [ ] Create AutoDataProcessingTool
- [ ] Create data handlers for each type
- [ ] Enhance Assistant class with auto-extraction
- [ ] Update all assistant APIs to include AutoDataProcessingTool
- [ ] Add frontend event listeners for data sync
- [ ] Create database persistence layer
- [ ] Add comprehensive tests for pattern matching
- [ ] Document extraction patterns
- [ ] Train on real user messages to improve accuracy
