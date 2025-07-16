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
    TextToText = 'text/text',
    TextToImage = 'text/image',
    TextToAudio = 'text/audio',
    TextToVideo = 'text/video',
    AudioToText = 'audio/text',
    ImageToText = 'image/text',
    ImageToImage = 'image/image',
    ImageToAudio = 'image/audio',
    ImageToVideo = 'image/video',
    VideoToText = 'video/text',
    VideoToImage = 'video/image',
    VideoToAudio = 'video/audio',
    VideoToVideo = 'video/video',
    TextToCode = 'text/code',
    CodeToText = 'code/text',
}
