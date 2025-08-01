import { Agent } from '../agents/Agent';
import { WorkProduct } from './WorkProduct';
import { MapSerializer, PluginOutput, createAuthenticatedAxios } from '@cktmcs/shared';
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

        const state = MapSerializer.transformForSerialization(agent);

        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                id: agent.id,
                data: state,
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
                params: { collection: 'agents' }
            });
            console.log(`Agent ${agentId} deleted successfully`);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error deleting agent ${agentId}:`, error instanceof Error ? error.message : error);
        }
    }

    async saveWorkProduct(workProduct: WorkProduct): Promise<void> {
        if (!workProduct || !workProduct.agentId || !workProduct.stepId) {
            console.error('Cannot save work product: missing required fields', workProduct);
            return;
        }

        console.log(`Saving work product for agent ${workProduct.agentId}, step ${workProduct.stepId}`);
        try {
            // Ensure data is properly serialized
            const serializedData = Array.isArray(workProduct.data)
                ? workProduct.data.map(item => {
                    if (item && item.result && typeof item.result === 'object') {
                        return { ...item, result: MapSerializer.transformForSerialization(item.result) };
                    }
                    return item;
                })
                : MapSerializer.transformForSerialization(workProduct.data);

            return await this.authenticatedApi.post(`http://${this.librarianUrl}/storeWorkProduct`, {
                agentId: workProduct.agentId,
                stepId: workProduct.stepId,
                data: serializedData
            });
        } catch (error) { analyzeError(error as Error);
            console.error(`Error saving work product for agent ${workProduct.agentId}, step ${workProduct.stepId}:`, error instanceof Error ? error.message : String(error));
        }
    }

    async loadWorkProduct(agentId: string, stepId: string): Promise<WorkProduct | null> {
        if (!agentId || !stepId) {
            console.error('Cannot load work product: missing agent ID or step ID');
            return null;
        }

        try {
            console.log(`Loading work product for agent ${agentId}, step ${stepId}`);
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadWorkProduct/${stepId}`);

            if (!response.data || !response.data.data) {
                console.log(`No work product found for step ${stepId} (this is normal if step hasn't been executed yet)`);
                return null;
            }

            return new WorkProduct(
                agentId,
                stepId,
                MapSerializer.transformFromSerialization(response.data.data) as PluginOutput[]
            );
        } catch (error) {
            // 404 errors are normal when work products don't exist yet
            if ((error as any).response?.status === 404) {
                console.log(`Work product not found for step ${stepId} (step may not have been executed yet)`);
                return null;
            }

            analyzeError(error as Error);
            console.error(`Error loading work product ${agentId}_${stepId}:`, error instanceof Error ? error.message : error);
            return null;
        }
    }

    async loadAllWorkProducts(agentId: string): Promise<WorkProduct[]> {
        if (!agentId) {
            console.error('Cannot load work products: missing agent ID');
            return [];
        }

        try {
            console.log(`Loading all work products for agent ${agentId}`);
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadAllWorkProducts/${agentId}`);

            if (!response.data || !Array.isArray(response.data)) {
                console.error(`No work products found for agent ${agentId}`);
                return [];
            }

            return response.data.map((wp: any) => {
                if (!wp || !wp.stepId || !wp.data) {
                    console.error(`Invalid work product data for agent ${agentId}:`, wp);
                    return null;
                }
                return new WorkProduct(
                    agentId,
                    wp.stepId,
                    MapSerializer.transformFromSerialization(wp.data) as PluginOutput[]
                );
            }).filter((wp: WorkProduct | null) => wp !== null) as WorkProduct[];
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading all work products for agent ${agentId}:`, error instanceof Error ? error.message : error);
            return [];
        }
    }

}