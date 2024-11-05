import { Status } from './Status';

export interface Agent {
    id: string;
    actionVerb: string;
    goal: string;
    status: Status;
    prerequisites?: string[];  // IDs of prerequisite agents
}
