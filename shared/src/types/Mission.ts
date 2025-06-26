import { Status } from './Status';

export interface MissionFile {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
    uploadedBy: string;
    storagePath: string;
    description?: string;
}

export interface Mission {
    id: string;
    userId: string;  // Id of creating client
    goal: string;
    status: Status;     // Current status of the mission
    name: string;
    missionContext: string;
    createdAt: Date;
    updatedAt: Date;
    attachedFiles?: MissionFile[];  // Files attached to this mission
}
