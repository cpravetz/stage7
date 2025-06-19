// No longer using Docker API directly
import express from 'express';
import axios from 'axios';
import { MapSerializer, AgentSetManagerStatistics, AgentStatistics, PluginInput, MessageType, ServiceTokenManager } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

// NOTE: This axios instance doesn't include authentication headers
// We should use authenticatedApi from TrafficManager instead
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
    private securityManagerUrl: string;
    private tokenManager: ServiceTokenManager;

    constructor(
        maxAgentsPerSet: number = 250,
        postOfficeUrl: string = 'postoffice:5020',
        securityManagerUrl: string = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010',
        public authenticatedApi?: any // Optional authenticatedApi from TrafficManager
    ) {
        this.maxAgentsPerSet = maxAgentsPerSet;
        this.postOfficeUrl = postOfficeUrl;
        this.securityManagerUrl = securityManagerUrl;
        this.refreshInterval = setInterval(() => this.refreshAgentSets(), 60000); // Refresh every minute

        // Initialize token manager for service-to-service authentication
        const serviceId = 'TrafficManager';
        const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
        this.tokenManager = ServiceTokenManager.getInstance(
            `http://${this.securityManagerUrl}`,
            serviceId,
            serviceSecret
        );
    }

    /**
     * Helper method to use authenticatedApi when available, falling back to regular api
     * @param method HTTP method (get, post, put, delete)
     * @param url URL to call
     * @param data Optional data for POST/PUT requests
     * @returns Promise with the response
     */
    private async apiCall(method: 'get' | 'post' | 'put' | 'delete', url: string, data?: any): Promise<any> {
        if (this.authenticatedApi) {
            return this.authenticatedApi[method](url, data);
        } else {
            // If authenticatedApi is not available, create a token and use it
            try {
                const token = await this.tokenManager.getToken();
                const headers = {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Authorization': `Bearer ${token}`
                };

                switch (method) {
                    case 'get':
                        return axios.get(url, { headers });
                    case 'post':
                        return axios.post(url, data, { headers });
                    case 'put':
                        return axios.put(url, data, { headers });
                    case 'delete':
                        return axios.delete(url, { headers });
                    default:
                        throw new Error(`Unsupported method: ${method}`);
                }
            } catch (error) {
                console.error(`Error in authenticated apiCall: ${error instanceof Error ? error.message : error}`);
                throw error;
            }
        }
    }


    private async updateAgentSets(isInitialPopulation: boolean = false): Promise<void> {
        console.log(isInitialPopulation ? 'Populating AgentSets...' : 'Refreshing AgentSets...');

        // If we already have AgentSets and this is not an initial population, just return
        if (!isInitialPopulation && this.agentSets.size > 0) {
            console.log(`Using existing ${this.agentSets.size} AgentSets`);
            return;
        }

        // For initial population, if we don't have any AgentSets, create one
        if (isInitialPopulation && this.agentSets.size === 0) {
            try {
                console.log('No AgentSets found. Creating a new one...');
                await this.createNewAgentSet();
                console.log(`Created new AgentSet. Current count: ${this.agentSets.size}`);
                return;
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error creating new AgentSet:', error instanceof Error ? error.message : error);
            }
        }

        // If we still don't have any AgentSets, try to find them through PostOffice as a fallback
        if (this.agentSets.size === 0) {
            let retryCount = isInitialPopulation ? 3 : 1;
            const retryDelay = 2000;

            while (retryCount > 0) {
                try {
                    console.log('Attempting to find AgentSets through PostOffice as fallback...');
                    const response = await this.apiCall('get', `http://${this.postOfficeUrl}/requestComponent?type=AgentSet`);
                    const agentSetComponents = response.data.components;
                    console.log('AgentSet components response:', agentSetComponents.length);

                    if (agentSetComponents.length > 0) {
                        const updatedAgentSets = new Map<string, AgentSetLink>();

                        agentSetComponents.forEach((component: any) => {
                            const existingSet = this.agentSets.get(component.id);
                            updatedAgentSets.set(component.id, {
                                id: component.id,
                                url: component.url,
                                agentCount: existingSet ? existingSet.agentCount : 0,
                                maxAgents: this.maxAgentsPerSet
                            });
                        });

                        this.agentSets = updatedAgentSets;
                        console.log(`AgentSets found through PostOffice. Current count: ${this.agentSets.size}`);
                        return;
                    }
                } catch (error) {
                    analyzeError(error as Error);
                    console.error('Error fetching AgentSet components:', error instanceof Error ? error.message : error);
                }

                retryCount--;
                if (retryCount > 0) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }

            // If we still don't have any AgentSets, create one
            if (this.agentSets.size === 0) {
                try {
                    console.log('No AgentSets found through PostOffice. Creating a new one...');
                    await this.createNewAgentSet();
                    console.log(`Created new AgentSet. Current count: ${this.agentSets.size}`);
                } catch (error) {
                    analyzeError(error as Error);
                    console.error('Error creating new AgentSet:', error instanceof Error ? error.message : error);
                    console.log(`Failed to ${isInitialPopulation ? 'populate' : 'refresh'} AgentSet components`);
                }
            }
        }
    }

    // Method to handle agent reassignment when an AgentSet is removed
    private reassignAgentsFromSet(removedSetId: string): void {
        // Find a new AgentSet to reassign agents to
        const availableSetIds = Array.from(this.agentSets.keys())
            .filter(id => id !== removedSetId);

        if (availableSetIds.length === 0) {
            console.warn('No available AgentSets to reassign agents to');
            return;
        }

        const newSetId = availableSetIds[0];
        const newSet = this.agentSets.get(newSetId);

        if (!newSet) {
            console.warn(`AgentSet ${newSetId} not found for reassignment`);
            return;
        }

        // Reassign all agents from the removed set to the new set
        let reassignedCount = 0;
        this.agentToSetMap.forEach((setId, agentId) => {
            if (setId === removedSetId) {
                this.agentToSetMap.set(agentId, newSetId);
                newSet.agentCount++;
                reassignedCount++;
            }
        });

        console.log(`Reassigned ${reassignedCount} agents from set ${removedSetId} to set ${newSetId}`);
    }

    private async refreshAgentSets(): Promise<void> {
        await this.updateAgentSets(false);
    }

    private async populateAgentSets(): Promise<void> {
        await this.updateAgentSets(true);
    }

    /**
     * Remove empty AgentSets to clean up resources
     */
    async removeEmptySets() {
        for (const [id, set] of this.agentSets.entries()) {
            if (set.agentCount === 0) {
                this.removeAgentSet(id);
            }
        }
    }

    /**
     * Remove an AgentSet and reassign its agents to another set
     * @param id The ID of the AgentSet to remove
     */
    private removeAgentSet(id: string): void {
        // First reassign any agents from this set to another set
        this.reassignAgentsFromSet(id);

        // Then remove the set from our map
        this.agentSets.delete(id);

        console.log(`Removed AgentSet ${id}`);
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

        // If we don't have any AgentSets, create one
        if (this.agentSets.size === 0) {
            console.log('No agent sets exist. Creating a new one...');
            try {
                await this.createNewAgentSet();
                console.log(`Created new AgentSet. Current count: ${this.agentSets.size}`);
            } catch (error) {
                console.error('Error creating new agent set:', error instanceof Error ? error.message : error);
            }
        }

        // Get the set ID from our mapping
        const setId = this.agentToSetMap.get(agentId);
        console.log(`Agent ${agentId} is mapped to set ${setId}`);

        // If we have a set ID, return the URL
        if (setId && this.agentSets.has(setId)) {
            const agentSet = this.agentSets.get(setId);
            console.log(`Found Agent Set for ${agentId}:`, agentSet);
            return agentSet?.url;
        }

        // If we don't have a mapping but we have AgentSets, assign the agent to the first available set
        if (this.agentSets.size > 0) {
            const firstSetId = Array.from(this.agentSets.keys())[0];
            const firstSet = this.agentSets.get(firstSetId);

            if (firstSet) {
                console.log(`No mapping found for agent ${agentId}, assigning to set ${firstSetId}`);
                this.agentToSetMap.set(agentId, firstSetId);
                return firstSet.url;
            }
        }

        console.log(`No Agent Set found or could be created for agent: ${agentId}`);
        return undefined;
    }

    /**
     * Update the location (AgentSet URL) of an agent
     * @param agentId Agent ID
     * @param agentSetUrl Agent set URL
     */
    async updateAgentLocation(agentId: string, agentSetUrl: string): Promise<void> {
        console.log(`Updating location for agent ${agentId} to ${agentSetUrl}`);
        await this.ensureAgentSets();

        // Find the agent set ID by URL
        let targetSetId: string | undefined;

        for (const [id, set] of this.agentSets.entries()) {
            if (set.url === agentSetUrl) {
                targetSetId = id;
                break;
            }
        }

        if (!targetSetId) {
            throw new Error(`Agent set with URL ${agentSetUrl} not found`);
        }

        // Update the agent's location
        this.agentToSetMap.set(agentId, targetSetId);
        console.log(`Updated location for agent ${agentId} to set ${targetSetId} (${agentSetUrl})`);
    }

    private async getAvailableAgentSet(): Promise<AgentSetLink | undefined> {
        console.log('Getting available agent set...');
        await this.ensureAgentSets();
        return Array.from(this.agentSets.values()).find(set => set.agentCount < this.maxAgentsPerSet);
    }

    async assignAgentToSet(agentId: string, actionVerb: string, inputs: Map<string, PluginInput>,  missionId: string, missionContext: string): Promise<string> {
        console.log('Assigning agent to set...');
        console.log('actionVerb: ', actionVerb);
        console.log('inputs: ', inputs);

        // If we don't have any AgentSets, create one directly
        if (this.agentSets.size === 0) {
            console.log('No agent sets exist. Creating a new one...');
            try {
                await this.createNewAgentSet();
                console.log(`Created new AgentSet. Current count: ${this.agentSets.size}`);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error creating new agent set:', error instanceof Error ? error.message : error);
                throw new Error('Failed to create agent set');
            }
        }

        // Get an available set from our internal state
        let availableSet = Array.from(this.agentSets.values()).find(set => set.agentCount < this.maxAgentsPerSet);

        if (!availableSet) {
            console.log('All existing agent sets are full. Creating a new one...');
            try {
                await this.createNewAgentSet();
                availableSet = Array.from(this.agentSets.values()).find(set => set.agentCount < this.maxAgentsPerSet);

                if (!availableSet) {
                    throw new Error('Failed to create an available agent set');
                }
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error creating new agent set:', error instanceof Error ? error.message : error);
                throw new Error('Failed to create agent set');
            }
        }

        console.log(`Using AgentSet ${availableSet.id} at ${availableSet.url} for agent ${agentId}`);
        this.agentToSetMap.set(agentId, availableSet.id);

        try {
            const payload = {
                agentId,
                actionVerb,
                inputs: MapSerializer.transformForSerialization(inputs),
                missionId,
                missionContext
            };
            console.log('Adding agent to set with payload:', payload);
            const response = await this.apiCall('post', `http://${availableSet.url}/addAgent`, payload);

            availableSet.agentCount++;
            return response.data;
        } catch (error) {
            analyzeError(error as Error);
            this.agentToSetMap.delete(agentId);
            console.error('Failed to assign agent to set:', error instanceof Error ? error.message : error);
            throw new Error(`Failed to assign agent ${agentId} to set ${availableSet.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async sendMessageToAgent(agentId: string, message: any): Promise<any> {
        console.log(`Sending message ${message} to agent:`, agentId);
        const agentSetUrl = await this.getAgentUrl(agentId);
        if (!agentSetUrl) {
            console.error(`No AgentSet found for agent ${agentId}`);
        }

        try {
            const response = await this.apiCall('post', `http://${agentSetUrl}/agent/${agentId}/message`, message);
            return response.data;
        } catch (error) { analyzeError(error as Error);
            console.error(`Error sending message to agent ${agentId}:`, error instanceof Error ? error.message : error);
        }
    }

    async pauseAgents(missionId: string) {
        const pausePromises = Array.from(this.agentSets.values()).map(async (set) => {
            try {
                await this.apiCall('post', `http://${set.url}/pauseAgents`, { missionId });
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
                await this.apiCall('post', `http://${set.url}/abortAgents`, { missionId });
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
                await this.apiCall('post', `http://${set.url}/resumeAgents`, { missionId });
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

        await this.apiCall('post', `http://${setUrl}/resumeAgent`, { agentId });
    }

    async distributeUserMessage(req: express.Request) {
        const messagePromises = Array.from(this.agentSets.values()).map(async (set) => {
            try {
                await this.apiCall('post', `http://${set.url}/message`, req.body);
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

    isValidUrl(url: string): boolean {
        // This regex pattern allows for hostnames with optional port numbers
        const urlPattern = /^(?!:\/\/)([a-zA-Z0-9-_]+)(:\d+)?$/;
        return urlPattern.test(url);
    }

    isValidMissionId(missionId: string): boolean {
        // Allow only alphanumeric mission IDs (no special characters)
        const missionIdPattern = /^[a-zA-Z0-9-]+$/;
        const result = missionIdPattern.test(missionId);
        console.log(`[agentSetManager] isValidMissionId: Testing '${missionId}'. Pattern: '${missionIdPattern.toString()}'. Result: ${result}`);
        return result;
    }


    public async getAgentStatistics(missionId: string): Promise<AgentSetManagerStatistics> {
        if (!this.isValidMissionId(missionId)) {
            throw new Error(`Invalid missionId: ${missionId}`);
        }
        let stats: AgentSetManagerStatistics = {
            agentSetsCount: 0,
            totalAgentsCount: 0,
            agentsByStatus: new Map(),
        };
        try {
            console.log(`AgentSetManager getting statistics from ${this.agentSets.size} AgentSets}`);
            for (const agentSet of this.agentSets.values()) {
                stats.agentSetsCount++;
                try {
                    console.log(`AgentSetManager:AgentSet `,agentSet.url,` getting statistics`);
                    if (!this.isValidUrl(agentSet.url)) {
                        console.error(`Invalid URL: ${agentSet.url}`);
                        return stats;
                    }
                    const response = await this.apiCall('get', `http://${agentSet.url}/statistics/${encodeURIComponent(missionId)}`);
                    const serializedStats = response.data;
                    serializedStats.agentsByStatus = MapSerializer.transformFromSerialization(serializedStats.agentsByStatus);
                    console.log(`AgentSetManager:AgentSet `,agentSet.url,` stats: `, serializedStats);
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
                } catch (error) {
                    console.error(`Error fetching agent statistics from ${agentSet.url}:`, error instanceof Error ? error.message : error);
                }
            }
            console.log(`AgentSetManager:Total stats:`, stats);
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
            const response = await this.apiCall('post', `http://${agentSetUrl}/loadAgent`, { agentId });
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
            const response = await this.apiCall('get', `http://${this.postOfficeUrl}/getAgentIdsByMission/${missionId}`);
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
            const response = await this.apiCall('post', `http://${agentSetUrl}/saveAgent`, { agentId });
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
            // IMPORTANT: Always use the same AgentSet URL to avoid multiple instances
            // This ensures we're always using the same AgentSet service
            const defaultAgentSetUrl = 'agentset:5100';
            console.log('Using AgentSet with URL:', defaultAgentSetUrl);

            // Use a consistent ID for the AgentSet to avoid creating multiple references
            const id = 'primary-agentset';

            // Check if we already have this AgentSet in our map
            if (this.agentSets.has(id)) {
                console.log(`AgentSet ${id} already exists, reusing it`);
                return;
            }

            const newSet = {
                id: id,
                url: defaultAgentSetUrl,
                agentCount: 0,
                maxAgents: this.maxAgentsPerSet
            };

            this.agentSets.set(newSet.id, newSet);

            // Skip PostOffice registration to avoid duplicate registrations
            // The AgentSet service registers itself with Consul directly

            console.log('Created new AgentSet reference:', newSet);
            return;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error creating new AgentSet:', error instanceof Error ? error.message : error);
            throw error; // Re-throw to allow caller to handle
        }
    }

    // We're now using the existing AgentSet container instead of creating new ones
}

export const agentSetManager = new AgentSetManager();
