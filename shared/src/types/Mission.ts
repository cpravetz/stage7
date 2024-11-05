import { Status } from './Status';

export interface Mission {
    id: string;
    userId: string;  // Id of creating client
    goal: string;
    status: Status;     // Current status of the mission
    name: string;
    missionContext: string;
    createdAt: Date;
    updatedAt: Date;
}
