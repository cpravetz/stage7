export interface ConversationMessage {
  id?: string;
  content: string;
  persistent?: boolean;
  sender: 'user' | 'system' | 'agent';
  timestamp?: string;
}

/**
 * This file provides browser-compatible versions of the shared package types and utilities.
 * It excludes any Node.js-specific modules like crypto.
 */

// Define the types needed by the frontend
export interface Message {
  type: string;
  content: any;
}

export enum MessageType {
  MISSION_CREATED = 'MISSION_CREATED',
  MISSION_UPDATED = 'MISSION_UPDATED',
  MISSION_COMPLETED = 'MISSION_COMPLETED',
  AGENT_CREATED = 'AGENT_CREATED',
  AGENT_UPDATED = 'AGENT_UPDATED',
  AGENT_COMPLETED = 'AGENT_COMPLETED',
  USER_INPUT_REQUEST = 'USER_INPUT_REQUEST',
  USER_INPUT_RESPONSE = 'USER_INPUT_RESPONSE',
  STATISTICS = 'STATISTICS',
  ERROR = 'ERROR',
  WORK_PRODUCT = 'WORK_PRODUCT',
  REQUEST = 'REQUEST',
  WORK_PRODUCT_UPDATE = 'WORK_PRODUCT_UPDATE',
  AGENT_UPDATE = 'AGENT_UPDATE',
  STATUS_UPDATE = 'STATUS_UPDATE',
  ANSWER = 'ANSWER',
  USER_MESSAGE = 'USER_MESSAGE'
}

export interface AgentStep {
  id: string;
  status: string;
  name: string;
  verb?: string;
  startTime?: number;
  endTime?: number;
  dependencies?: string[];
  actionVerb?: string; // Added
  ownerAgentId?: string; // Added
  inputReferences?: SerializedMap; // Added
  inputValues?: SerializedMap; // Added
  description?: string; // Added
  outputs?: any; // Added - could be SerializedMap or other structure
  result?: any; // Added - could be an array of PluginOutput or other structure
}

export interface AgentStatistics {
  agentId: string;
  id?: string;
  status: string;
  startTime: number;
  endTime?: number;
  llmCalls: number;
  activeLLMCalls: number;
  pluginCalls: number;
  steps: AgentStep[];
  color?: string;
}

export interface MissionStatistics {
  missionId?: string;
  startTime?: number;
  endTime?: number;
  llmCalls: number;
  activeLLMCalls: number;
  agentCount?: number;
  activeAgents?: number;
  completedAgents?: number;
  failedAgents?: number;
  agentCountByStatus?: Record<string, number>;
  agentStatistics?: Map<string, Array<AgentStatistics>>;
  engineerStatistics?: {
    newPlugins: string[];
  };
}

// Serializer for Map objects and complex object structures
export interface SerializedMap {
  _type: 'Map';
  entries: [string, any][];
}

export class MapSerializer {
  static serialize(map: Map<string, any>): SerializedMap {
    return {
      _type: 'Map',
      entries: Array.from(map.entries())
    };
  }

  static deserialize(obj: any): Map<any, any> {
    if (obj._type === 'Map' && Array.isArray(obj.entries)) {
      return new Map(obj.entries);
    }
    return new Map();
  }

  static isSerializedMap(obj: any): any {
    return obj && obj._type === 'Map' && Array.isArray(obj.entries);
  }

  // Recursively transforms Maps in an object for serialization
  static transformForSerialization(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (obj instanceof Map) {
      return this.serialize(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.transformForSerialization(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.transformForSerialization(value);
      }
      return result;
    }
    return obj;
  }

  // Recursively restores Maps in a deserialized object
  static transformFromSerialization(obj: any): any {
    if (obj && obj._type === 'Map') {
      return new Map(obj.entries);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.transformFromSerialization(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.transformFromSerialization(value);
      }
      return result;
    }
    return obj;
  }
}

export type AnswerType = 'text' | 'number' | 'boolean' | 'multipleChoice' | 'file';
