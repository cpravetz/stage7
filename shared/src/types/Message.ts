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
    CREATE_MISSION = "createMission",
    STATUS_UPDATE = "statusUpdate",
}

export interface Message {
    type: MessageType;
    sender: string;
    recipient: string;
    content?: any;
    clientId?: string;  
    data?: any;  
  }