import { Agent } from '../agents/Agent';
import { v4 as uuidv4 } from 'uuid';

/**
 * Collaboration message types
 */
export enum CollaborationMessageType {
  KNOWLEDGE_SHARE = 'knowledge_share',
  TASK_DELEGATION = 'task_delegation',
  TASK_RESULT = 'task_result',
  TASK_STATUS = 'task_status',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  COORDINATION = 'coordination',
  RESOURCE_REQUEST = 'resource_request',
  RESOURCE_RESPONSE = 'resource_response'
}

/**
 * Collaboration message
 */
export interface CollaborationMessage {
  id: string;
  type: CollaborationMessageType;
  senderId: string;
  recipientId: string | 'broadcast';
  /**
   * @deprecated Use payload instead. 'content' is kept for backward compatibility.
   */
  content?: any;
  /**
   * The main message payload. Use this for all new code.
   */
  payload: any;
  timestamp: string;
  conversationId?: string;
  inReplyTo?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  expiresAt?: string;
}

/**
 * Task delegation request
 */
export interface TaskDelegationRequest {
  taskId: string;
  taskType: string;
  description: string;
  inputs: Record<string, any>;
  deadline?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  context?: Record<string, any>;
}

/**
 * Task delegation response
 */
export interface TaskDelegationResponse {
  taskId: string;
  accepted: boolean;
  reason?: string;
  estimatedCompletion?: string;
}

/**
 * Task result
 */
export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
  metrics?: {
    startTime: string;
    endTime: string;
    duration: number;
  };
}

/**
 * Knowledge sharing
 */
export interface KnowledgeSharing {
  topic: string;
  content: any;
  confidence: number;
  source?: string;
  timestamp: string;
  format: 'text' | 'json' | 'binary' | 'reference';
  tags?: string[];
}

/**
 * Conflict resolution request
 */
export interface ConflictResolutionRequest {
  conflictId: string;
  description: string;
  conflictingData: any[];
  resolutionOptions?: any[];
  deadline?: string;
}

/**
 * Conflict resolution response
 */
export interface ConflictResolutionResponse {
  conflictId: string;
  resolution: any;
  explanation: string;
}

/**
 * Task update payload for collaboration messages
 */
export interface TaskUpdatePayload {
  stepId: string;
  status?: string; // Use StepStatus if available
  description?: string;
  newInputs?: Record<string, any>; // Use PluginInput if available
  updateInputs?: Record<string, any>;
}

/**
 * Coordination message data
 */
export interface CoordinationData {
  type: string;
  senderId: string;
  targetAgentId?: string;
  payload?: any;
  signalId?: string;
  infoKeys?: string[];
  timestamp: string;
}

/**
 * Resource response for resource sharing
 */
export interface ResourceResponse {
  requestId: string;
  granted: boolean;
  resource: string;
  data?: any;
  message?: string;
  senderId: string;
}

/**
 * Conflict resolution result (for processConflictResolution)
 */
export interface ConflictResolution {
  resolvedStepId?: string;
  chosenAction: string;
  reasoning?: string;
  stepModifications?: any;
  newPlan?: any[];
}

/**
 * Collaboration protocol interface
 */
export interface CollaborationProtocol {
  /**
   * Send a collaboration message
   * @param message Message to send
   */
  sendMessage(message: CollaborationMessage): Promise<void>;
  
  /**
   * Handle a received collaboration message
   * @param message Received message
   */
  handleMessage(message: CollaborationMessage): Promise<void>;
  
  /**
   * Delegate a task to another agent
   * @param recipientId Recipient agent ID
   * @param request Task delegation request
   * @returns Task delegation response
   */
  delegateTask(senderId: string, recipientId: string, request: TaskDelegationRequest): Promise<TaskDelegationResponse>;
  
  /**
   * Share knowledge with other agents
   * @param senderId Sender agent ID
   * @param recipientId Recipient agent ID or 'broadcast'
   * @param knowledge Knowledge to share
   */
  shareKnowledge(senderId: string, recipientId: string | 'broadcast', knowledge: KnowledgeSharing): Promise<void>;
  
  /**
   * Request conflict resolution
   * @param senderId Sender agent ID
   * @param recipientId Recipient agent ID
   * @param request Conflict resolution request
   * @returns Conflict resolution response
   */
  resolveConflict(senderId: string, recipientId: string, request: ConflictResolutionRequest): Promise<ConflictResolutionResponse>;
}

/**
 * Create a new collaboration message
 * @param type Message type
 * @param senderId Sender agent ID
 * @param recipientId Recipient agent ID or 'broadcast'
 * @param content Message content
 * @param options Additional options
 * @returns Collaboration message
 */
export function createCollaborationMessage(
  type: CollaborationMessageType,
  senderId: string,
  recipientId: string | 'broadcast',
  content: any,
  options: Partial<CollaborationMessage> = {}
): CollaborationMessage {
  return {
    id: uuidv4(),
    type,
    senderId,
    recipientId,
    // Always set payload (prefer options.payload, else use content)
    payload: options.payload !== undefined ? options.payload : content,
    // Set content for backward compatibility
    content,
    timestamp: new Date().toISOString(),
    ...options
  };
}
