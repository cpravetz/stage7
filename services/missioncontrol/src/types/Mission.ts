import { Agent } from './Agent';
import { Status } from './Status';

export interface Mission {
    id: string;
    //clientId: string;  // Id of creating client
    goal: string;
    //agents: Agent[];    // Agents involved in the mission
    status: Status;     // Current status of the mission
    name: string;
    missionContext: string;
    createdAt: Date;
    updatedAt: Date;
}
