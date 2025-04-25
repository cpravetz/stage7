import { Agent } from '../agents/Agent';
import { WorkProduct } from './WorkProduct';
import axios from 'axios';
import { MapSerializer, PluginOutput } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });


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

    constructor(librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040') {
        this.librarianUrl = librarianUrl;
    }

    async saveAgent(agent: AgentState): Promise<void> {
        if (!agent || !agent.id) {
            console.error('Cannot save agent: agent is undefined or has no ID');
            return;
        }

        const state = MapSerializer.transformForSerialization(agent);

        try {
            await axios.post(`http://${this.librarianUrl}/storeData`, {
                id: agent.id,
                data: state,
                storageType: 'mongo',
                collection: 'agents'
            });
            console.log(`Agent state saved successfully for agent ${agent.id}.`);
        } catch (error) { analyzeError(error as Error);
            console.error(`Error saving agent state for agent ${agent.id}:`, error instanceof Error ? error.message : error);
        }
    }

    async loadAgent(agentId: string): Promise<any | null> {
        try {
            const response = await axios.get(`http://${this.librarianUrl}/loadData/${agentId}`, {
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

            return await axios.post(`http://${this.librarianUrl}/storeWorkProduct`, {
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
            const response = await axios.get(`http://${this.librarianUrl}/loadWorkProduct/${stepId}`);

            if (!response.data || !response.data.data) {
                console.error(`No data found for work product ${agentId}_${stepId}`);
                return null;
            }

            return new WorkProduct(
                agentId,
                stepId,
                MapSerializer.transformFromSerialization(response.data.data) as PluginOutput[]
            );
        } catch (error) { analyzeError(error as Error);
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
            const response = await axios.get(`http://${this.librarianUrl}/loadAllWorkProducts/${agentId}`);

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