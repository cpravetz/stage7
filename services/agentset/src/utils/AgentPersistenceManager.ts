import { WorkProduct, Deliverable } from '@cktmcs/shared';
import { OutputType, MissionFile, MapSerializer, PluginOutput, createAuthenticatedAxios } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { StepLocation } from './../types/DelegationTypes';



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
    private missionControlUrl: string;
    private authenticatedApi: any;
    private securityManagerUrl: string;

    constructor(
        librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040',
        authenticatedApi?: any
    ) {
        this.librarianUrl = librarianUrl;
        this.missionControlUrl = process.env.MISSIONCONTROL_URL || 'missioncontrol:5030';
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

    async saveWorkProduct(step: any, result: PluginOutput[], outputType: OutputType = OutputType.INTERIM): Promise<void> {
        if (!step || !step.id) {
            console.error('Cannot save work product: step or step.id is missing');
            return;
        }

        // Determine if any output of this step is marked as deliverable
        // This relies on the `isDeliverable` property being correctly set on the PluginOutput objects
        // by mapPluginOutputsToCustomNames.
        const stepHasDeliverableOutputs = result.some(r => r.isDeliverable);

        // Find the actual deliverable output object that needs to be streamed
        const deliverableOutput = result.find(r => r.isDeliverable);

        // Step 1: Always save the metadata-rich WorkProduct to 'step-outputs'
        try {
            // Exclude large file content from this payload if it's going to be streamed separately.
            // The `isDeliverable` flag is already on the PluginOutput objects in `result`.
            const metadataResult = result.map(r => {
                if (r.isDeliverable && r.result instanceof Buffer) {
                    // Create a copy to modify without affecting the original result array
                    return { ...r, result: `[File Content Stored Separately as Deliverable for Step ${step.id}]` };
                }
                return r;
            });

            const serializedData = MapSerializer.transformForSerialization(metadataResult);

            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeOutput`, {
                agentId: step.ownerAgentId,
                stepId: step.id,
                data: serializedData,
                outputType: outputType, // Add the output type to the metadata
                isDeliverable: stepHasDeliverableOutputs // Overall flag for the step
            });
            console.log(`Saved work product metadata for step ${step.id} isDeliverable=${stepHasDeliverableOutputs}`);

        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error saving work product metadata for step ${step.id}:`, error instanceof Error ? error.message : String(error));
        }

        // Step 2 & 3: If it's a deliverable, stream the file to the new endpoint
        if (deliverableOutput && deliverableOutput.result !== undefined && deliverableOutput.result !== null) {
            try {
                let dataToSend: string | Buffer;
                if (deliverableOutput.result instanceof Buffer || typeof deliverableOutput.result === 'string') {
                    dataToSend = deliverableOutput.result;
                } else {
                    // Convert non-string/non-Buffer results to a JSON string
                    dataToSend = JSON.stringify(deliverableOutput.result);
                    // Update mimeType to application/json if it was text/plain and we stringified an object/boolean
                    if (deliverableOutput.mimeType === 'text/plain' && typeof deliverableOutput.result !== 'string') {
                        deliverableOutput.mimeType = 'application/json';
                    }
                }

                const queryParams = new URLSearchParams({
                    agentId: step.ownerAgentId,
                    missionId: step.missionId,
                    // Use fileName from deliverableOutput, fallback to a generic name
                    originalName: deliverableOutput.fileName || `deliverable_${deliverableOutput.name}.bin`,
                    mimeType: deliverableOutput.mimeType || 'application/octet-stream'
                }).toString();

                const url = `http://${this.librarianUrl}/deliverable/${step.id}?${queryParams}`;

                const uploadResponse = await this.authenticatedApi.post(url, dataToSend, {
                    headers: { 'Content-Type': deliverableOutput.mimeType || 'application/octet-stream' }
                });
                console.log(`Successfully streamed deliverable for step ${step.id} output '${deliverableOutput.name}'`);

                // Fetch the full deliverable metadata from Librarian to get the canonical missionFile object
                let missionFile: any | null = null;
                try {
                    const deliverableResp = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadDeliverable/${step.id}`);
                    if (deliverableResp && deliverableResp.data && deliverableResp.data.data) {
                        missionFile = deliverableResp.data.data.missionFile;
                    }
                } catch (err) {
                    console.warn(`Failed to fetch deliverable metadata from Librarian for step ${step.id}:`, err instanceof Error ? err.message : err);
                }

                // Notify MissionControl to attach the uploaded file to the mission
                try {
                    const incomingDeliverable: any = {
                        isDeliverable: true,
                        stepId: step.id,
                        missionFile: missionFile || {
                            id: uploadResponse?.data?.assetId || `deliverable_${step.id}`,
                            originalName: deliverableOutput.fileName || `deliverable_${deliverableOutput.name}.bin`,
                            mimeType: deliverableOutput.mimeType || 'application/octet-stream'
                        }
                    };

                    await this.authenticatedApi.post(`http://${this.missionControlUrl}/missions/${step.missionId}/files/add`, incomingDeliverable);
                    console.log(`Notified MissionControl to attach deliverable for step ${step.id} to mission ${step.missionId}`);
                } catch (err) {
                    console.warn(`Failed to notify MissionControl about deliverable for step ${step.id}:`, err instanceof Error ? err.message : err);
                }

            } catch (error) {
                analyzeError(error as Error);
                console.error(`Error streaming deliverable for step ${step.id} output '${deliverableOutput.name}':`, error instanceof Error ? error.message : String(error));
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

    async saveStepLocation(location: StepLocation): Promise<void> {
        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                id: location.stepId,
                data: location,
                storageType: 'mongo',
                collection: 'step-locations'
            });
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error saving step location for step ${location.stepId}:`, error instanceof Error ? error.message : error);
        }
    }

    async getStepLocation(stepId: string): Promise<StepLocation | null> {
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${stepId}`, {
                params: { storageType: 'mongo', collection: 'step-locations' }
            });
            return response.data.data;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error loading step location for step ${stepId}:`, error instanceof Error ? error.message : error);
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