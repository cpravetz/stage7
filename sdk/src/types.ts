
// Placeholder for JsonSchema definition
export type JsonSchema = {
  type: string;
  properties?: { [key: string]: JsonSchema };
  required?: string[];
  description?: string;
  enum?: (string | number | boolean)[];
  items?: JsonSchema;
  // Add other common JSON schema properties as needed
};
export type ConversationEvent = 'message' | 'tool_call' | 'tool_output' | 'human_input_required' | 'error' | 'end';

export type AssistantEventSource = 'ui' | 'user' | 'brain' | 'system';

export interface AssistantEvent {
  type: string; // e.g. domain.character.create, state.scene.update
  payload: any;
  conversationId?: string;
  clientId?: string;
  schemaVersion?: string;
  source?: AssistantEventSource;
  collection?: string; // optional explicit collection override
  operation?: 'create' | 'update' | 'delete' | 'upsert';
  entityId?: string;
  timestamp?: string;
}

export interface AssistantStateDelta {
  type: string; // e.g. state.delta
  conversationId: string;
  collection: string;
  operation: 'create' | 'update' | 'delete' | 'upsert';
  data?: any;
  entityId?: string;
  timestamp: string;
}

export interface ConversationMessage {
  sender: 'user' | 'assistant' | 'tool';
  type: 'text' | 'tool_call' | 'tool_output' | 'human_input_prompt';
  content: string | object; // Text for 'text', ToolCall/ToolOutput object for others
  timestamp: Date;
  metadata?: any;
  id?: string; // Unique identifier for message deduplication
}

export interface MissionDetails {
  id: string;
  name: string;
  status: string;
  startDate: string;
  targetDate: string;
}


// Interface for the client that communicates with the Core Engine (Layer 1)
// This will be implemented separately within the SDK to abstract L1 interactions.
export interface ICoreEngineClient {
  startMission(
    initialGoal: string,
    assistantId: string,
    toolManifest: { name: string; description: string; inputSchema: JsonSchema }[],
    frontendClientId: string,
    context?: {
      userId?: string;
      agentClass?: string;
      instanceId?: string;
      missionContext?: string;
    }
  ): Promise<string>; // Returns missionId (conversationId)
  getMissionDetails(missionId: string): Promise<MissionDetails>;
  sendMessageToMission(missionId: string, message: string): Promise<void>;
  submitHumanInputToMission(missionId: string, stepId: string, response: string): Promise<void>;
  getMissionHistory(missionId: string): Promise<ConversationMessage[]>;
  onMissionEvent(missionId: string, handler: (event: ConversationEvent, data: any) => void): () => void; // Returns unsubscribe function
  requestHumanInput(
    missionId: string,
    inputType: string,
    prompt: string,
    metadata?: any
  ): Promise<string>;
  executeTool(missionId: string, toolName: string, args: any): Promise<any>;
  getContext(assistantId: string): Promise<any>;
  updateContext(assistantId: string, newContext: any): Promise<void>;
  endMission(missionId: string): Promise<void>;
  // Additional methods for tool execution, step management, etc.
}

// Error types
export class SdkError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'SdkError';
  }
}

export class ToolExecutionError extends SdkError {
  constructor(message: string, public toolName: string, public details?: any) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export class ConversationError extends SdkError {
  constructor(message: string, public conversationId: string, public details?: any) {
    super(message);
    this.name = 'ConversationError';
  }
}

export class HumanInputTimeoutError extends SdkError {
  constructor(message: string, public conversationId: string, public stepId: string) {
    super(message);
    this.name = 'HumanInputTimeoutError';
  }
}

export interface ScheduledContent {
  date: Date;
  title: string;
  platform: string;
}

// Simplified versions of types for backward compatibility
export type ConversationEventSimple = 'message' | 'tool_call' | 'tool_output' | 'human_input_required' | 'human_input_response' | 'error' | 'end';

export interface ConversationMessageSimple {
  sender: 'user' | 'assistant' | 'tool';
  type: 'text' | 'tool_call' | 'tool_output' | 'human_input_prompt';
  content: string | object;
  timestamp: Date;
  metadata?: any;
  id?: string; // Unique identifier for message deduplication
}

export interface JsonSchemaSimple {
  [key: string]: any;
}

export interface ICoreEngineClientSimple {
  startMission(
    initialGoal: string,
    assistantId: string,
    toolManifest: { name: string; description: string; inputSchema: JsonSchemaSimple }[],
    context?: {
      userId?: string;
      agentClass?: string;
      instanceId?: string;
      missionContext?: string;
    }
  ): Promise<string>;
  sendMessageToMission(missionId: string, message: string): Promise<void>;
  submitHumanInputToMission(missionId: string, stepId: string, response: string): Promise<void>;
  getMissionHistory(missionId: string): Promise<ConversationMessageSimple[]>;
  endMission(missionId: string): Promise<void>;
  onMissionEvent(missionId: string, handler: (event: ConversationEventSimple, data: any) => void): () => void;
  requestHumanInput(missionId: string, inputType: string, prompt: string, metadata?: any): Promise<string>;
  getContext(assistantId: string): Promise<any>;
  updateContext(assistantId: string, newContext: any): Promise<void>;
  getMissionDetails(missionId: string): Promise<MissionDetails>;
}

export interface MissionDetailsSimple {
  id: string;
  name: string;
  status: string;
  startDate: string;
  targetDate: string;
}

export class SdkErrorSimple extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SdkError';
  }
}

export class ToolExecutionErrorSimple extends SdkErrorSimple {
  constructor(message: string) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export class HumanInputTimeoutErrorSimple extends SdkErrorSimple {
  constructor(message: string) {
    super(message);
    this.name = 'HumanInputTimeoutError';
  }
}

export interface ApprovalRequest {
  id: string;
  type: 'Content Draft' | 'SEO Strategy' | 'Publishing Approval';
  description: string;
  status: 'pending' | 'approved' | 'rejected';
}

// CTO Assistant related interfaces
export interface DoraMetrics {
  deploymentFrequency: { value: string; trend: number };
  leadTime: { value: string; trend: number };
  changeFailureRate: { value: string; trend: number };
  timeToRestore: { value: string; trend: number };
}

export interface Incident {
  id: string;
  severity: 'High' | 'Medium' | 'Low';
  title: string;
  assignee: string;
}

export interface SecurityAlert {
  cve: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  title: string;
  project: string;
}

export interface CloudSpend {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color: string;
  }[];
}

export interface RepositoryStats {
  totalCommits: number;
  openPullRequests: number;
  closedPullRequests: number;
  branches: number;
  // Add other repository statistics as needed
}