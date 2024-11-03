import { Agent } from '../agents/Agent';
import { WorkProduct } from './WorkProduct';
import axios from 'axios';
import { MapSerializer } from '@cktmcs/shared';

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
            const response = await api.post(`http://${agent.librarianUrl}/storeData`, {
                id: agent.id,
                data: state,
                storageType: 'mongo'
            });
            console.log('Agent state saved successfully.');
            return response.data;
        } catch (error) {
            console.error('Error saving agent state:', error);
            throw new Error('Failed to save agent state.');
        }
    }

    async loadAgent(agentId: string): Promise<any | null> {
        try {
            const response = await axios.get(`http://${this.librarianUrl}/loadData/${agentId}`, {
                params: { storageType: 'mongo' }
            });
            return MapSerializer.transformFromSerialization(response.data);
        } catch (error) {
            console.error('Error loading agent state:', error);
            return null;
        }
    }

    async deleteAgent(agentId: string): Promise<void> {
        // Implement logic to delete agent state from persistent storage
    }

    async saveWorkProduct(workProduct: WorkProduct): Promise<void> {
        console.log('Saving work product:', workProduct);
        try {
            await axios.post(`http://${this.librarianUrl}/storeWorkProduct`, {
                agentId: workProduct.agentId,
                stepId: workProduct.stepId,
                type: workProduct.type,
                data: MapSerializer.transformForSerialization(workProduct.data),
                mimeType: workProduct.mimeType
            });
        } catch (error) {
            console.error('Error saving work product:', error);
            throw new Error('Failed to save work product.');
        }
    }

    async loadWorkProduct(agentId: string, stepId: string): Promise<WorkProduct | null> {
        try {
            const response = await axios.get(`http://${this.librarianUrl}/loadWorkProduct/${agentId}/${stepId}`);
            return new WorkProduct(agentId, 
                    stepId, 
                    response.data.type, 
                    MapSerializer.transformFromSerialization(response.data), 
                    response.data.mimeType || 'application/octet-stream');
        } catch (error) {
            console.error('Error loading work product:', error);
            return null;
        }
    }

    async loadAllWorkProducts(agentId: string): Promise<WorkProduct[]> {
        try {
            const response = await axios.get(`http://${this.librarianUrl}/loadAllWorkProducts/${agentId}`);
            return response.data.map((wp: any) => new WorkProduct(agentId, wp.stepId, wp.data.type, MapSerializer.transformFromSerialization(wp.data), response.data.mimeType || 'application/octet-stream'));
        } catch (error) {
            console.error('Error loading all work products:', error);
            return [];
        }
    }    

}