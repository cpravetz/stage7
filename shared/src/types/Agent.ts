import { Status } from './Status';
import { PluginInput } from './Plugin';

export interface Agent {
    id: string;
    actionVerb: string;
    goal: string;
    status: Status;
    prerequisites?: string[];  // IDs of prerequisite agents
}

export interface AgentConfig {
    actionVerb: string;
    inputs? : Map<string, PluginInput>;
    missionId: string;
    dependencies?: string[];
    postOfficeUrl: string;
    agentSetUrl: string;
    id: string;
    missionContext: string;
}
