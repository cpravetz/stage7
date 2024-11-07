import axios from 'axios';
import { MapSerializer, AgentSetManagerStatistics, AgentSetStatistics, AgentStatistics, PluginInput } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });


interface AgentSetLink {
    id: string;
    url: string; // URL of the Agent Set application
    agentCount: number;
    maxAgents: number;
}


class AgentSetManager {
    private agentSets: Map<string, AgentSetLink> = new Map();
    private agentToSetMap: Map<string, string> = new Map();
    private maxAgentsPerSet: number;
    private postOfficeUrl: string;
    private refreshInterval: NodeJS.Timeout;

    constructor(maxAgentsPerSet: number = 250, postOfficeUrl: string = 'postoffice:5020') {
        this.maxAgentsPerSet = maxAgentsPerSet;
        this.postOfficeUrl = postOfficeUrl;
        this.refreshInterval = setInterval(() => this.refreshAgentSets(), 60000); // Refresh every minute
    }

    private async refreshAgentSets(): Promise<void> {
        console.log('Refreshing AgentSets...');
        try {
            const response = await api.get(`http://${this.postOfficeUrl}/requestComponent?type=AgentSet`);
            const agentSetComponents = response.data.components;
            // Update existing AgentSets and add new ones
            const updatedAgentSets = new Map<string, AgentSetLink>();
            agentSetComponents.map((component: any) => {
                const agentSetLink: AgentSetLink = {
                    id: component.id,
                    url: component.url,
                    agentCount: 0,
                    maxAgents: this.maxAgentsPerSet
                };
                updatedAgentSets.set(component.id, agentSetLink);
            });
            // Remove AgentSets that no longer exist
            for (const [id, agentSet] of this.agentSets) {
                if (!updatedAgentSets.has(id)) {
                    this.removeAgentSet(id);
                }
            }

            this.agentSets = updatedAgentSets;
            console.log(`AgentSets refreshed. Current count: ${this.agentSets.size}`);
        } catch (error) { analyzeError(error as Error);
            console.error('Error refreshing AgentSets:', error instanceof Error ? error.message : error);
        }
    }


    async removeEmptySets() {
        for (const [id, set] of this.agentSets.entries()) {
            if (set.agentCount === 0) {
                this.removeAgentSet(id);
            }
        }
    }

    private removeAgentSet(id: string): void {
        this.agentSets.delete(id);
        // Remove all agents associated with this AgentSet
        for (const [agentId, setId] of this.agentToSetMap.entries()) {
            if (setId === id) {
                this.agentToSetMap.delete(agentId);
            }
        }
    }

    private async populateAgentSets(retryCount: number = 3, retryDelay: number = 2000): Promise<void> {
        console.log('Populating AgentSets...');
        while (retryCount > 0) {
            try {
                const response = await api.get(`http://${this.postOfficeUrl}/requestComponent?type=AgentSet`);
                const agentSetComponents = response.data.components;
                console.log('AgentSet components response:', agentSetComponents.length);
                if (agentSetComponents.length > 0) {
                    this.agentSets = agentSetComponents.map((component: any) => ({
                        id: component.id,
                        url: component.url,
                        agentCount: 0,
                        maxAgents: this.maxAgentsPerSet
                    }));
                    return;
                }
            } catch (error) { analyzeError(error as Error);
                console.error('Error fetching AgentSet components:', error instanceof Error ? error.message : error);
            }

            retryCount--;
            if (retryCount > 0) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        throw new Error('Failed to retrieve AgentSet components from PostOffice');
    }

    async getAgentUrl(agentId: string): Promise<string | undefined> {
        console.log('Getting agent URL for agent:', agentId);
        await this.ensureAgentSets();
        const setId = this.agentToSetMap.get(agentId);
        if (setId) {
            const agentSet = this.agentSets.get(setId);
            return agentSet?.url;
        }
        return undefined;
    }

    private async ensureAgentSets(): Promise<void> {
        if (this.agentSets.size === 0) {
            await this.populateAgentSets();
        }
    }

    async getAgentSetUrls(): Promise<string[]> {
        console.log('Getting agent set URLs...');
        await this.ensureAgentSets();
        return Array.from(this.agentSets.values()).map(set => set.url);
    }
    
    async getAgentSetUrlForAgent(agentId: string): Promise<string | undefined> {
        console.log('Getting agent set URL for agent:', agentId);
        await this.ensureAgentSets();
        const setId = this.agentToSetMap.get(agentId);
        
        console.log('Agent Set Map:', this.agentSets);
        console.log('Agent to Set Map:', this.agentToSetMap);
        console.log('Requested Agent ID:', agentId);
        console.log('Found Set ID:', setId);
    
    
        if (setId) {
            const agentSet = this.agentSets.get(setId);
            console.log('Found Agent Set:', agentSet);
            return agentSet?.url;
        }
        console.log('No Agent Set found for agent:', agentId);
        return undefined;
    }
        
    private async getAvailableAgentSet(): Promise<AgentSetLink | undefined> {
        console.log('Getting available agent set...');
        await this.ensureAgentSets();
        return Array.from(this.agentSets.values()).find(set => set.agentCount < this.maxAgentsPerSet);
    }

    async assignAgentToSet(agentId: string, actionVerb: string, inputs: Map<string, PluginInput>,  missionId: string, missionContext: string): Promise<string> {
        console.log('Assigning agent to set...');
        const availableSet = await this.getAvailableAgentSet();
        if (!availableSet) {
            throw new Error('No available agent set found');
        }

        this.agentToSetMap.set(agentId, availableSet.id);
        
        try {
            const response = await api.post(`http://${availableSet.url}/addAgent`, MapSerializer.transformForSerialization({
                agentId,
                actionVerb,
                inputs,
                missionId,
                missionContext
            }));

            availableSet.agentCount++;
            return response.data;
        } catch (error) { analyzeError(error as Error);
            this.agentToSetMap.delete(agentId);
            console.error('Failed to assign agent to set:', error instanceof Error ? error.message : error);
            throw new Error('Failed to assign agent to set');
        }
    }

    async sendMessageToAgent(agentId: string, message: any): Promise<any> {
        console.log(`Sending message ${message} to agent:`, agentId);
        const agentSetUrl = await this.getAgentUrl(agentId);
        if (!agentSetUrl) {
            throw new Error(`No AgentSet found for agent ${agentId}`);
        }

        try {
            const response = await api.post(`http://${agentSetUrl}/agent/${agentId}/message`, message);
            return response.data;
        } catch (error) { analyzeError(error as Error);
            console.error(`Error sending message to agent ${agentId}:`, error instanceof Error ? error.message : error);
            throw error;
        }
    }
        
    async pauseAgents(missionId: string) {
        console.log('agentSetManager: Pausing agents for mission:', missionId);
        this.agentSets.forEach(async set => {
            await api.post(`http://${set.url}/pauseAgents`, { missionId });
        });
    }

    async abortAgents(missionId: string) {
        console.log('Aborting agents for mission:', missionId);
        this.agentSets.forEach(async set => {
            await api.post(`http://${set.url}/abortAgents`, { missionId });
        });
    }

    async resumeAgents(missionId: string) {
        console.log('Resuming agents for mission:', missionId);
        this.agentSets.forEach(async set => {
            await api.post(`http://${set.url}/resumeAgents`, { missionId });
        });
    }

    async resumeAgent(agentId: string) {
        const setUrl = await this.getAgentSetUrlForAgent(agentId);
        if (!setUrl) {
            throw new Error(`No AgentSet found for agent ${agentId}`);
        }
        await api.post(`http://${setUrl}/resumeAgent`, { agentId });
    }

    public async getAgentStatistics(missionId: string): Promise<AgentSetManagerStatistics> {

        let stats : AgentSetManagerStatistics = {
            agentSetsCount: 0,
            totalAgentsCount: 0,
            agentsByStatus: new Map()
        };
        try {
            for (const agentSet of this.agentSets.values()) {
                stats.agentSetsCount++;
                const response = await axios.get(`http://${agentSet.url}/statistics/${missionId}`);
                const serializedStats = response.data;
                stats.totalAgentsCount += serializedStats.agentsCount;
            // Merge agentCountByStatus
                Object.entries(serializedStats.agentsByStatus).forEach(([status, agents]) => {
                    if (!stats.agentsByStatus.has(status)) {
                        stats.agentsByStatus.set(status, [...agents as Array<AgentStatistics>]);
                    } else {
                        stats.agentsByStatus.get(status)!.push(...agents as Array<AgentStatistics>);
                    }
                });
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Error fetching agent statistics:', error instanceof Error ? error.message : error);
        }
        
        return stats;
    }

    async loadOneAgent(agentId: string): Promise<boolean> {
        console.log(`Loading agent: ${agentId}`);
        try {
            const agentSetUrl = await this.getAgentSetUrlForAgent(agentId);
            if (!agentSetUrl) {
                const availableSetUrl = await this.getAvailableAgentSetUrl();
                if (!availableSetUrl) {
                    throw new Error('No available agent set found');
                }
                return this.loadAgentToSet(agentId, availableSetUrl);
            }
            return this.loadAgentToSet(agentId, agentSetUrl);
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading agent ${agentId}:`, error instanceof Error ? error.message : error);
            return false;
        }
    }

    async loadAgents(missionId: string): Promise<boolean> {
        console.log(`Loading agents for mission: ${missionId}`);
        try {
            const agentIds = await this.getAgentIdsByMission(missionId);
            if (agentIds.length === 0) {
                console.log(`No agents found for mission ${missionId}`);
                return true;
            }

            const results = await Promise.all(agentIds.map(agentId => this.loadOneAgent(agentId)));
            const allLoaded = results.every(result => result);

            if (allLoaded) {
                console.log(`All agents for mission ${missionId} loaded successfully`);
            } else {
                console.error(`Some agents for mission ${missionId} failed to load`);
            }

            return allLoaded;
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading agents for mission ${missionId}:`, error instanceof Error ? error.message : error);
            return false;
        }
    }

    private async loadAgentToSet(agentId: string, agentSetUrl: string): Promise<boolean> {
        try {
            const response = await api.post(`http://${agentSetUrl}/loadAgent`, { agentId });
            if (response.status === 200) {
                this.agentToSetMap.set(agentId, agentSetUrl);
                console.log(`Agent ${agentId} loaded successfully to ${agentSetUrl}`);
                return true;
            } else {
                console.error(`Failed to load agent ${agentId} to ${agentSetUrl}`);
                return false;
            }
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading agent ${agentId} to ${agentSetUrl}:`, error instanceof Error ? error.message : error);
            return false;
        }
    }

    private async getAvailableAgentSetUrl(): Promise<string | undefined> {
        const availableSet = await this.getAvailableAgentSet();
        return availableSet?.url;
    }

    private async getAgentIdsByMission(missionId: string): Promise<string[]> {
        try {
            const response = await api.get(`http://${this.postOfficeUrl}/getAgentIdsByMission/${missionId}`);
            return response.data;
        } catch (error) { analyzeError(error as Error);
            console.error('Error getting agent IDs by mission:', error instanceof Error ? error.message : error);
            return [];
        }
    }

    async saveOneAgent(agentId: string): Promise<boolean> {
        console.log(`Saving agent: ${agentId}`);
        try {
            const agentSetUrl = await this.getAgentSetUrlForAgent(agentId);
            if (!agentSetUrl) {
                console.error(`No AgentSet found for agent ${agentId}`);
                return false;
            }
            return this.saveAgentInSet(agentId, agentSetUrl);
        } catch (error) { analyzeError(error as Error);
            console.error(`Error saving agent ${agentId}:`, error instanceof Error ? error.message : error);
            return false;
        }
    }

    async saveAgents(missionId: string): Promise<boolean> {
        console.log(`Saving agents for mission: ${missionId}`);
        try {
            const agentIds = await this.getAgentIdsByMission(missionId);
            if (agentIds.length === 0) {
                console.log(`No agents found for mission ${missionId}`);
                return true;
            }

            const results = await Promise.all(agentIds.map(agentId => this.saveOneAgent(agentId)));
            const allSaved = results.every(result => result);

            if (allSaved) {
                console.log(`All agents for mission ${missionId} saved successfully`);
            } else {
                console.error(`Some agents for mission ${missionId} failed to save`);
            }

            return allSaved;
        } catch (error) { analyzeError(error as Error);
            console.error(`Error saving agents for mission ${missionId}:`, error instanceof Error ? error.message : error);
            return false;
        }
    }

    private async saveAgentInSet(agentId: string, agentSetUrl: string): Promise<boolean> {
        try {
            const response = await api.post(`http://${agentSetUrl}/saveAgent`, { agentId });
            if (response.status === 200) {
                console.log(`Agent ${agentId} saved successfully in ${agentSetUrl}`);
                return true;
            } else {
                console.error(`Failed to save agent ${agentId} in ${agentSetUrl}`);
                return false;
            }
        } catch (error) { analyzeError(error as Error);
            console.error(`Error saving agent ${agentId} in ${agentSetUrl}:`, error instanceof Error ? error.message : error);
            return false;
        }
    }
    
}

export const agentSetManager = new AgentSetManager();
