import { Agent } from './Agent';
import { Status } from './Status';

export interface Mission {
    id: string;
    goal: string;
    agents: Agent[];
    status: Status;
    name: string;
    createdAt: string;
    updatedAt: string;
}