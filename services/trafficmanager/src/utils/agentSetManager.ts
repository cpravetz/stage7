import Docker from 'dockerode';
import express from 'express';
import axios from 'axios';
import { MapSerializer, AgentSetManagerStatistics, AgentStatistics, PluginInput, MessageType } from '@cktmcs/shared';
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
    private docker: Docker;

    constructor(maxAgentsPerSet: number = 250, postOfficeUrl: string = 'postoffice:5020') {
        this.maxAgentsPerSet = maxAgentsPerSet;
        this.postOfficeUrl = postOfficeUrl;
        this.refreshInterval = setInterval(() => this.refreshAgentSets(), 60000); // Refresh every minute
        this.docker = new Docker();
    }

    private async refreshAgentSets(): Promise<void> {
        console.log('Refreshing AgentSets...');
        try {
            const response = await api.get(`http://${this.postOfficeUrl}/requestComponent?type=AgentSet`);
            const agentSetComponents = response.data.components;
            
            // Create a new Map to store the updated AgentSets
            const updatedAgentSets = new Map<string, AgentSetLink>();
    
            // Update existing AgentSets and add new ones
            agentSetComponents.forEach((component: any) => {
                const existingSet = this.agentSets.get(component.id);
                updatedAgentSets.set(component.id, {
                    id: component.id,
                    url: component.url,
                    agentCount: existingSet ? existingSet.agentCount : 0,
                    maxAgents: this.maxAgentsPerSet
                });
            });
    
            // Remove AgentSets that no longer exist, but keep their agents
            this.agentSets.forEach((set, id) => {
                if (!updatedAgentSets.has(id)) {
                    const newSetId = updatedAgentSets.keys().next().value;
                    if (newSetId) {
                        // Reassign agents to a new AgentSet
                        this.agentToSetMap.forEach((setId, agentId) => {
                            if (setId === id) {
                                this.agentToSetMap.set(agentId, newSetId);
                                const newSet = updatedAgentSets.get(newSetId);
                                if (newSet) {
                                    newSet.agentCount++;
                                }
                            }
                        });
                    }
                }
            });
    
            // Update the agentSets Map
            this.agentSets = updatedAgentSets;
    
            console.log(`AgentSets refreshed. Current count: ${this.agentSets.size}`);
        } catch (error) {
            console.error('Error refreshing AgentSets:', error instanceof Error ? error.message : error);
            analyzeError(error as Error);
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
                    this.agentSets = new Map(agentSetComponents.map((component: any) => [
                        component.id,
                        {
                            id: component.id,
                            url: component.url,
                            agentCount: 0,
                            maxAgents: this.maxAgentsPerSet
                        }
                    ]));
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
        console.log('Failed to retrieve AgentSet components from PostOffice');
        return;
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
        let availableSet = await this.getAvailableAgentSet();
        if (!availableSet) {
            console.log('No available agent set found. Attempting to create a new one...');
            try {
                await this.createNewAgentSet();
                availableSet = await this.getAvailableAgentSet();
                if (!availableSet) {
                    console.log('No agentSet was available for the new agent.');
                }
                return '';
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error creating new agent set:', error instanceof Error ? error.message : error);
                return '';
            }
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
        } catch (error) {
            analyzeError(error as Error);
            this.agentToSetMap.delete(agentId);
            console.error('Failed to assign agent to set:', error instanceof Error ? error.message : error);
            return '';
        }
    }

    async sendMessageToAgent(agentId: string, message: any): Promise<any> {
        console.log(`Sending message ${message} to agent:`, agentId);
        const agentSetUrl = await this.getAgentUrl(agentId);
        if (!agentSetUrl) {
            console.error(`No AgentSet found for agent ${agentId}`);
        }

        try {
            const response = await api.post(`http://${agentSetUrl}/agent/${agentId}/message`, message);
            return response.data;
        } catch (error) { analyzeError(error as Error);
            console.error(`Error sending message to agent ${agentId}:`, error instanceof Error ? error.message : error);
        }
    }
        
    async pauseAgents(missionId: string) {
        const pausePromises = Array.from(this.agentSets.values()).map(async (set) => {
            try {
                await api.post(`http://${set.url}/pauseAgents`, { missionId });
            } catch (error) {
                analyzeError(error as Error);
            }
        });

        const results = await Promise.allSettled(pausePromises);
        
        const failedSets = results.filter(result => result.status === 'rejected').length;
        if (failedSets > 0) {
            console.warn(`Failed to pause agents in ${failedSets} sets for mission ${missionId}`);
        } else {
            console.log(`Successfully paused all agents for mission ${missionId}`);
        }
    }

    async abortAgents(missionId: string) {
        const abortPromises = Array.from(this.agentSets.values()).map(async (set) => {
            try {
                await api.post(`http://${set.url}/abortAgents`, { missionId });
            } catch (error) {
                analyzeError(error as Error);
            }
        });

        const results = await Promise.allSettled(abortPromises);
        
        const failedSets = results.filter(result => result.status === 'rejected').length;
        if (failedSets > 0) {
            console.warn(`Failed to abort agents in ${failedSets} sets for mission ${missionId}`);
        } else {
            console.log(`Successfully abort all agents for mission ${missionId}`);
        }
    }

    async resumeAgents(missionId: string) {
        const resumePromises = Array.from(this.agentSets.values()).map(async (set) => {
            try {
                await api.post(`http://${set.url}/resumeAgents`, { missionId });
            } catch (error) {
                analyzeError(error as Error);
            }
        });

        const results = await Promise.allSettled(resumePromises);
        
        const failedSets = results.filter(result => result.status === 'rejected').length;
        if (failedSets > 0) {
            console.warn(`Failed to resume agents in ${failedSets} sets for mission ${missionId}`);
        } else {
            console.log(`Successfully resumed all agents for mission ${missionId}`);
        }
    }

    async resumeAgent(agentId: string) {
        const setUrl = await this.getAgentSetUrlForAgent(agentId);
        if (!setUrl) {
            console.error(`No AgentSet found for agent ${agentId}`);
        }
        await api.post(`http://${setUrl}/resumeAgent`, { agentId });
    }

    async distributeUserMessage(req: express.Request) {
        const messagePromises = Array.from(this.agentSets.values()).map(async (set) => {
            try {
                await api.post(`http://${set.url}/message`, req.body);
            } catch (error) {
                analyzeError(error as Error);
            }
        });

        const results = await Promise.allSettled(messagePromises);
        
        const failedSets = results.filter(result => result.status === 'rejected').length;
        if (failedSets > 0) {
            console.warn(`Failed to message agents in ${failedSets} sets`);
        } else {
            console.log(`Successfully messaged all agents`);
        }
    }

    public async getAgentStatistics(missionId: string): Promise<AgentSetManagerStatistics> {
        let stats: AgentSetManagerStatistics = {
            agentSetsCount: 0,
            totalAgentsCount: 0,
            agentsByStatus: new Map(),
        };
        try {
            console.log(`AgentSetManager getting statistics from ${this.agentSets.size} AgentSets}`);
            for (const agentSet of this.agentSets.values()) {
                stats.agentSetsCount++;
                const response = await axios.get(`http://${agentSet.url}/statistics/${missionId}`);
                const serializedStats = MapSerializer.transformFromSerialization(response.data);
                stats.totalAgentsCount += serializedStats.agentsCount;

                // Merge agentsByStatus maps properly
                if (serializedStats.agentsByStatus instanceof Map) {
                    serializedStats.agentsByStatus.forEach((agents: AgentStatistics[], status: string) => {
                        if (!stats.agentsByStatus.has(status)) {
                            stats.agentsByStatus.set(status, [...agents]);
                        } else {
                            stats.agentsByStatus.get(status)!.push(...agents);
                        }
                    });
                } else {
                    // Handle case where it might be a plain object
                    Object.entries(serializedStats.agentsByStatus).forEach(([status, agents]) => {
                        if (!stats.agentsByStatus.has(status)) {
                            stats.agentsByStatus.set(status, [...agents as AgentStatistics[]]);
                        } else {
                            stats.agentsByStatus.get(status)!.push(...agents as AgentStatistics[]);
                        }
                    });
                }
            }
            return stats;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error fetching agent statistics:', error instanceof Error ? error.message : error);
            return stats;
        }
    }

    async loadOneAgent(agentId: string): Promise<boolean> {
        console.log(`Loading agent: ${agentId}`);
        try {
            const agentSetUrl = await this.getAgentSetUrlForAgent(agentId);
            if (!agentSetUrl) {
                const availableSetUrl = await this.getAvailableAgentSetUrl();
                if (!availableSetUrl) {
                    console.error('No available agent set found loadingOneAgent');
                    return false
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

    private async createNewAgentSet(): Promise<void> {
        try {
            const container = await this.createAgentSetContainer();
            const containerInfo = await container.inspect();
            const ipAddress = containerInfo.NetworkSettings.Networks.mcs_network.IPAddress;
            
            const newSet = {
                id: containerInfo.Id,
                url: `http://${ipAddress}:5090`,
                agentCount: 0,
                maxAgents: this.maxAgentsPerSet
            };

            this.agentSets.set(newSet.id, newSet);

            // Register the new AgentSet with PostOffice
            await axios.post(`http://${this.postOfficeUrl}/registerComponent`, {
                type: 'AgentSet',
                url: newSet.url,
                name: `AgentSet-${ipAddress}`
            });
            console.log('Created new AgentSet:', newSet);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error creating new AgentSet:', error instanceof Error ? error.message : error);
        }
    }

    private async createAgentSetContainer(): Promise<Docker.Container> {
        const container = await this.docker.createContainer({
            Image: 'agentset:latest',
            Env: [
                `POSTOFFICE_URL=${this.postOfficeUrl}`,
                `PORT=5090`,
            ],
            NetworkingConfig: {
                EndpointsConfig: {
                    mcs_network: {}
                }
            }
        });

        await container.start();
        return container;
    }
}

export const agentSetManager = new AgentSetManager();
