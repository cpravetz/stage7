import { WorkProduct, Deliverable } from '@cktmcs/shared';
import { MissionFile, MapSerializer, PluginOutput, createAuthenticatedAxios } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';


export interface AgentState {
    id: string;
    status: string;
    output: any;
    inputs: Map<string, any>;
    missionId: string;
    steps: any[];
    dependencies: string[];
    capabilitiesManagerUrl: string;
    brainUrl: string;
    trafficManagerUrl: string;
    librarianUrl: string;
    conversation: any[];
    missionContext: string;
    role?: string;
    roleCustomizations?: any;
    lastFailedStep?: any;
}

export interface StepEvent {
    eventType: string;
    stepId: string;
    missionId: string;
    timestamp: string;
    error?: {
        message: string;
        stack?: string;
        type?: string;
    };
    context?: any;
    recoveryAttempt?: number;
    strategy?: string;
}

export class AgentPersistenceManager {
    private librarianUrl: string;
    private authenticatedApi: any;
    private securityManagerUrl: string;

    constructor(
        librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040',
        authenticatedApi?: any
    ) {
        this.librarianUrl = librarianUrl;
        this.securityManagerUrl = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';

        // If authenticatedApi is provided, use it, otherwise create a new one
        if (authenticatedApi) {
            this.authenticatedApi = authenticatedApi;
        } else {
            // Create authenticated API client
            this.authenticatedApi = createAuthenticatedAxios(
                'AgentPersistenceManager',
                this.securityManagerUrl,
                process.env.CLIENT_SECRET || 'stage7AuthSecret'
            );
        }
    }

    async saveAgent(agent: AgentState): Promise<void> {
        if (!agent || !agent.id) {
            console.error('Cannot save agent: agent is undefined or has no ID');
            return;
        }

        const stateToSave = MapSerializer.transformForSerialization(agent);

        // Exclude the steps array from the main agent document to prevent it from getting too large
        if (stateToSave.steps) {
            delete stateToSave.steps;
        }

        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                id: agent.id,
                data: stateToSave,
                storageType: 'mongo',
                collection: 'agents'
            });
        } catch (error) { analyzeError(error as Error);
            console.error(`Error saving agent state for agent ${agent.id}:`, error instanceof Error ? error.message : error);
        }
    }


    async logEvent(event: any): Promise<void> {
        if (!event) {
            console.error('Cannot log event: event is undefined or null');
            return;
        }
        try {
            const eventWithTimestamp = {
                ...event,
                timestamp: new Date().toISOString()
            };
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                id: event.id || undefined,
                data: eventWithTimestamp,
                storageType: 'mongo',
                collection: 'events'
            });
            console.log(`Event logged successfully: ${JSON.stringify(eventWithTimestamp)}`);
        } catch (error) { analyzeError(error as Error);
            console.error('Error logging event:', error instanceof Error ? error.message : error);
        }
    }

    async loadAgent(agentId: string): Promise<any | null> {
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${agentId}`, {
                params: { storageType: 'mongo', collection: 'agents' }
            });
            return MapSerializer.transformFromSerialization(response.data.data);
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading agent state:', error instanceof Error ? error.message : error);
            return null;
        }
    }

    async deleteAgent(agentId: string): Promise<void> {
        // Implement logic to delete agent state from persistent storage
        try {
            await this.authenticatedApi.delete(`http://${this.librarianUrl}/deleteData/${agentId}`, {
                params: { storageType: 'mongo', collection: 'agents' }
            });
            console.log(`Agent ${agentId} deleted successfully`);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error deleting agent ${agentId}:`, error instanceof Error ? error.message : error);
        }
    }

    async loadStepsForAgent(agentId: string): Promise<any[]> {
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/queryData`, {
                params: {
                    storageType: 'mongo',
                    collection: 'events',
                    query: {
                        agentId: agentId,
                        eventType: 'step_created'
                    },
                    options: {
                        sort: { timestamp: 1 } // Sort by timestamp to maintain order
                    }
                }
            });
            if (response.data && Array.isArray(response.data.data)) {
                return response.data.data;
            }
            return [];
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error loading steps for agent ${agentId}:`, error instanceof Error ? error.message : error);
            return [];
        }
    }

    async saveWorkProduct(step: any, result: PluginOutput[]): Promise<void> {
        if (!step || !step.id) {
            console.error('Cannot save work product: step or step.id is missing');
            return;
        }

        const isDeliverable = step.hasDeliverableOutputs();
        const deliverableOutput = isDeliverable ? result.find(r => (r as any).isDeliverable) : undefined;

        // Step 1: Always save the metadata-rich WorkProduct to 'step-outputs'
        try {
            // Exclude large file content from this payload
            const metadataResult = result.map(r => {
                if ((r as any).isDeliverable && r.result instanceof Buffer) {
                    return { ...r, result: `[File Content Stored Separately as Deliverable for Step ${step.id}]` };
                }
                return r;
            });

            const serializedData = MapSerializer.transformForSerialization(metadataResult);

            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeOutput`, {
                agentId: step.ownerAgentId,
                stepId: step.id,
                data: serializedData,
                isDeliverable: isDeliverable
            });
            console.log(`Saved work product metadata for step ${step.id}`);

        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error saving work product metadata for step ${step.id}:`, error instanceof Error ? error.message : String(error));
        }

        // Step 2 & 3: If it's a deliverable, stream the file to the new endpoint
        if (isDeliverable && deliverableOutput && deliverableOutput.result instanceof Buffer) {
            try {
                const fileContent: Buffer = deliverableOutput.result;
                const queryParams = new URLSearchParams({
                    agentId: step.ownerAgentId,
                    missionId: step.missionId,
                    originalName: (deliverableOutput as any).fileName || 'deliverable.bin',
                    mimeType: (deliverableOutput as any).mimeType || 'application/octet-stream'
                }).toString();

                const url = `http://${this.librarianUrl}/deliverable/${step.id}?${queryParams}`;

                await this.authenticatedApi.post(url, fileContent, {
                    headers: { 'Content-Type': 'application/octet-stream' }
                });
                console.log(`Successfully streamed deliverable for step ${step.id}`);

            } catch (error) {
                analyzeError(error as Error);
                console.error(`Error streaming deliverable for step ${step.id}:`, error instanceof Error ? error.message : String(error));
            }
        }
    }



    async loadStep(stepId: string): Promise<any | null> {
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/queryData`, {
                params: {
                    storageType: 'mongo',
                    collection: 'events',
                    query: {
                        stepId: stepId,
                        eventType: 'step_created'
                    },
                    options: {
                        limit: 1
                    }
                }
            });
            if (response.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
                return response.data.data[0];
            }
            return null;
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading step ${stepId}:`, error instanceof Error ? error.message : error);
            return null;
        }
    }

    async loadStepWorkProduct(agentId: string, stepId: string): Promise<WorkProduct | null> {
        try {
            const response = await this.authenticatedApi.get(
                `http://${this.librarianUrl}/loadStepOutput/${stepId}`,
                { params: { storageType: 'mongo' } }
            );
            return response.data.data;
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading step output:', error instanceof Error ? error.message : error);
            return null;
        }
    }

    async loadDeliverable(agentId: string, stepId: string): Promise<Deliverable | null> {
        try {
            const response = await this.authenticatedApi.get(
                `http://${this.librarianUrl}/loadDeliverable/${stepId}`,
                { params: { storageType: 'mongo' } }
            );
            return response.data.data;
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading deliverable:', error instanceof Error ? error.message : error);
            return null;
        }
    }

    async getStepEvents(stepId: string): Promise<StepEvent[]> {
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/queryData`, {
                params: {
                    storageType: 'mongo',
                    collection: 'step_events',
                    query: { stepId }
                }
            });
            return response.data.data || [];
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error getting step events for step ${stepId}:`, error instanceof Error ? error.message : error);
            return [];
        }
    }

    async getStepErrorHistory(stepId: string): Promise<StepEvent[]> {
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/queryData`, {
                params: {
                    storageType: 'mongo',
                    collection: 'step_events',
                    query: { 
                        stepId,
                        eventType: { $in: ['step_error', 'step_failure', 'recovery_attempt'] }
                    }
                }
            });
            return response.data.data || [];
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error getting error history for step ${stepId}:`, error instanceof Error ? error.message : error);
            return [];
        }
    }

    async getRecoveryAttempts(stepId: string): Promise<number> {
        try {
            const events = await this.getStepEvents(stepId);
            return events.filter(e => 
                e.eventType === 'recovery_attempt' || 
                e.eventType === 'step_retry'
            ).length;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error getting recovery attempts for step ${stepId}:`, error instanceof Error ? error.message : error);
            return 0;
        }
    }

    async clearStepHistory(stepId: string): Promise<void> {
        try {
            await this.authenticatedApi.delete(`http://${this.librarianUrl}/deleteData`, {
                params: {
                    storageType: 'mongo',
                    collection: 'step_events',
                    query: { stepId }
                }
            });
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error clearing history for step ${stepId}:`, error instanceof Error ? error.message : error);
        }
    }

    async loadAllDeliverables(agentId: string): Promise<Deliverable[]> {
        if (!agentId) {
            console.error('Cannot load deliverables: missing agent ID');
            return [];
        }

        try {
            console.log(`Loading all deliverables for agent ${agentId}`);
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadAllDeliverables/${agentId}`);

            if (!response.data || !Array.isArray(response.data)) {
                console.error(`No deliverables found for agent ${agentId}`);
                return [];
            }

            return response.data.map((d: any) => {
                if (!d || !d.stepId || !d.data) {
                    console.error(`Invalid deliverable data for agent ${agentId}:`, d);
                    return null;
                }
                return {
                    ...d,
                    data: MapSerializer.transformFromSerialization(d.data) as PluginOutput[]
                } as Deliverable;
            }).filter((d: Deliverable | null) => d !== null) as Deliverable[];
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading all deliverables for agent ${agentId}:`, error instanceof Error ? error.message : error);
            return [];
        }
    }

    async loadAllStepOutputs(agentId: string): Promise<WorkProduct[]> {
        if (!agentId) {
            console.error('Cannot load step outputs: missing agent ID');
            return [];
        }

        try {
            console.log(`Loading all step outputs for agent ${agentId}`);
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadAllStepOutputs/${agentId}`);

            if (!response.data || !Array.isArray(response.data)) {
                console.error(`No step outputs found for agent ${agentId}`);
                return [];
            }

            return response.data.map((wp: any) => {
                if (!wp || !wp.stepId || !wp.data) {
                    console.error(`Invalid step output data for agent ${agentId}:`, wp);
                    return null;
                }
                return {
                    ...wp,
                    data: MapSerializer.transformFromSerialization(wp.data) as PluginOutput[]
                } as WorkProduct;
            }).filter((wp: WorkProduct | null) => wp !== null) as WorkProduct[];
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading all step outputs for agent ${agentId}:`, error instanceof Error ? error.message : error);
            return [];
        }
    }

    async getFileContentFromLibrarian(agentId: string, missionFile: MissionFile): Promise<string | Buffer | null> {
        try {
            if (!this.librarianUrl) {
                console.error('Librarian service not available to get file content.');
                return null;
            }
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/assets/deliverables/${missionFile.id}`, {
                responseType: 'arraybuffer'
            });
            console.log(`[Agent ${agentId}] Successfully fetched content for MissionFile ${missionFile.id}.`);
            if (missionFile.mimeType && missionFile.mimeType.startsWith('text/')) {
                return response.data.toString('utf8');
            }
            return response.data;
        } catch (error) {
            console.error(`[Agent ${agentId}] Error getting file content for MissionFile ${missionFile.id}:`, error instanceof Error ? error.message : error);
            return null;
        }
    }


}