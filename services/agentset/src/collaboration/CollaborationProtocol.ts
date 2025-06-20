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
  content: any;
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
    content,
    timestamp: new Date().toISOString(),
    ...options
  };
}
