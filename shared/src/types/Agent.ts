import { Status } from './Status';
import { InputValue } from './Plugin';

export interface Agent {
    id: string;
    actionVerb: string;
    goal: string;
    status: Status;
    prerequisites?: string[];  // IDs of prerequisite agents
}

export interface AgentConfig {
    actionVerb: string;
    inputValues? : Map<string, InputValue>;
    missionId: string;
    dependencies?: string[];
    postOfficeUrl: string;
    agentSetUrl: string;
    id: string;
    missionContext: string;
    role?: string;
    roleCustomizations?: any;
}

export enum OutputType {
    INTERIM = 'Interim',
    FINAL = 'Final',
    PLAN = 'Plan',
}

export enum LLMConversationType {
    TextToText = 'TextToText',
    TextToImage = 'TextToImage',
    TextToAudio = 'TextToAudio',
    TextToVideo = 'TextToVideo',
    AudioToText = 'AudioToText',
    ImageToText = 'ImageToText',
    ImageToImage = 'ImageToImage',
    ImageToAudio = 'ImageToAudio',
    ImageToVideo = 'ImageToVideo',
    VideoToText = 'VideoToText',
    VideoToImage = 'VideoToImage',
    VideoToAudio = 'VideoToAudio',
    VideoToVideo = 'VideoToVideo',
    TextToCode = 'TextToCode',
    CodeToText = 'CodeToText',
}
