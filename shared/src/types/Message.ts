/**
 * Message types used throughout the system
 */
export enum MessageType {
    STATEMENT = "statement",
    REQUEST = "request",
    RESPONSE = "response",
    ANSWER = "answer",
    STATISTICS = "agentStatistics",
    CLIENT_CONNECT = "connect",
    PAUSE = "pause",
    ABORT = "abort",
    RESUME = "resume",
    SAVE = "save",
    LOAD = "load",
    WORK_PRODUCT_UPDATE = "workProductUpdate",
    REGISTER="REGISTER",
    AGENT_UPDATE = "agentUpdate",
    AGENT_MESSAGE = "agentMessage",
    CREATE_MISSION = "createMission",
    STATUS_UPDATE = "statusUpdate",
    STEP_FAILURE = "stepFailure",
    USER_MESSAGE = "userMessage",
    CHAT_REQUEST = "chatRequest",
    CHAT_RESPONSE = "chatResponse",
    GENERATE_REQUEST = "generateRequest",
    GENERATE_RESPONSE = "generateResponse",
    PLUGIN_EXECUTION = "pluginExecution",
    PLUGIN_RESULT = "pluginResult",
    PLUGIN_ERROR = "pluginError",
    PLUGIN_PROGRESS = "pluginProgress",
    PLUGIN_CANCEL = "pluginCancel"
}

/**
 * Standard message interface used for communication between services
 */
export interface Message {
    type: MessageType;
    sender: string;
    recipient?: string;
    content?: any;
    clientId?: string;
    data?: any;
    requiresSync?: boolean; // Indicates if the message requires a synchronous response
    timestamp?: string; // ISO timestamp for message tracking
  }