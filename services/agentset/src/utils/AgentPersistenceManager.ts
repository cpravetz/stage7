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

export class AgentPersistenceManager {
    private librarianUrl: string;

    constructor(librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040') {
        this.librarianUrl = librarianUrl;
    }

    async saveAgent(agent: Agent): Promise<void> {
        const state = MapSerializer.transformForSerialization(agent);
        
        try {
            await api.post(`http://${this.librarianUrl}/storeData`, {
                id: agent.id,
                data: state,
                storageType: 'mongo',
                collection: 'agents'
            });
            console.log('Agent state saved successfully.');
        } catch (error) { analyzeError(error as Error);
            console.error('Error saving agent state:', error instanceof Error ? error.message : error);
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
        //console.log('Saving work product for step:', workProduct.stepId);
        try {
            return await axios.post(`http://${this.librarianUrl}/storeWorkProduct`, {
                agentId: workProduct.agentId,
                stepId: workProduct.stepId,
                data: MapSerializer.transformForSerialization(workProduct.data)
            });
        } catch (error) { analyzeError(error as Error);
            console.error('Error saving work product:', error instanceof Error ? error.message : String(error));
        }
    }

    async loadWorkProduct(agentId: string, stepId: string): Promise<WorkProduct | null> {
        try {
            const response = await axios.get(`http://${this.librarianUrl}/loadWorkProduct/${agentId}/${stepId}`);
            return new WorkProduct(
                    agentId, 
                    stepId, 
                    MapSerializer.transformFromSerialization(response.data) as PluginOutput[]
                    );
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading work product:', error instanceof Error ? error.message : error);
            return null;
        }
    }

    async loadAllWorkProducts(agentId: string): Promise<WorkProduct[]> {
        try {
            const response = await axios.get(`http://${this.librarianUrl}/loadAllWorkProducts/${agentId}`);
            return response.data.map((wp: any) => new WorkProduct(agentId, wp.stepId, MapSerializer.transformFromSerialization(wp.data) as PluginOutput[]));
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading all work products:', error instanceof Error ? error.message : error);
            return [];
        }
    }    

}