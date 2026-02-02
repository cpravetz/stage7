import express from 'express';
import { MapSerializer, AgentSetManagerStatistics, AgentStatistics, InputValue, ServiceTokenManager, createAuthenticatedAxios, analyzeError } from '@cktmcs/shared';

interface AgentSetLink {
    id: string;
    url: string; // URL of the Agent Set application
    agentCount: number;
    maxAgents: number;
}

export class AgentSetManager {
    private agentSets: Map<string, AgentSetLink> = new Map();
    private agentToSetMap: Map<string, string> = new Map();
    private maxAgentsPerSet: number;
    private postOfficeUrl: string;
    private refreshInterval: NodeJS.Timeout;
    private securityManagerUrl: string;
    private tokenManager: ServiceTokenManager;
    private authenticatedApi: any;

    constructor(
        maxAgentsPerSet: number = 250,
        postOfficeUrl: string = 'http://postoffice:5020',
    ) {
        this.maxAgentsPerSet = maxAgentsPerSet;
        this.postOfficeUrl = postOfficeUrl;
        this.refreshInterval = setInterval(() => this.refreshAgentSets(), 60000);

        this.securityManagerUrl = process.env.SECURITY_MANAGER_URL || 'http://securitymanager:5010';
        const serviceId = 'MissionControl';
        const serviceSecret = process.env.CLIENT_SECRET || 'defaultSecret';
        this.tokenManager = ServiceTokenManager.getInstance(
            this.securityManagerUrl,
            serviceId,
            serviceSecret
        );

        this.authenticatedApi = createAuthenticatedAxios({
            serviceId: serviceId,
            securityManagerUrl: this.securityManagerUrl,
            clientSecret: serviceSecret,
        });
    }

    private async apiCall(method: 'get' | 'post' | 'put' | 'delete', url: string, data?: any): Promise<any> {
        const fullUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `http://${url}`;
        try {
            return this.authenticatedApi[method](fullUrl, data);
        } catch (error) {
            console.error(`Error in authenticated apiCall: ${error instanceof Error ? error.message : 'No message'}`);
            throw error;
        }
    }

    private async updateAgentSets(isInitialPopulation: boolean = false): Promise<void> {
        if (!isInitialPopulation && this.agentSets.size > 0) {
            return;
        }

        if (isInitialPopulation && this.agentSets.size === 0) {
            try {
                await this.createNewAgentSet();
                return;
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error creating new AgentSet:', error instanceof Error ? error.message : error);
            }
        }

        if (this.agentSets.size === 0) {
            let retryCount = isInitialPopulation ? 3 : 1;
            const retryDelay = 2000;

            while (retryCount > 0) {
                try {
                    const response = await this.apiCall('get', `${this.postOfficeUrl}/requestComponent?type=AgentSet`);
                    const agentSetComponents = response.data.components;

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

            if (this.agentSets.size === 0) {
                try {
                    await this.createNewAgentSet();
                } catch (error) {
                    analyzeError(error as Error);
                    console.error('Error creating new AgentSet:', error instanceof Error ? error.message : error);
                }
            }
        }
    }

    private reassignAgentsFromSet(removedSetId: string): void {
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

    async removeEmptySets() {
        for (const [id, set] of this.agentSets.entries()) {
            if (set.agentCount === 0) {
                this.removeAgentSet(id);
            }
        }
    }

    private removeAgentSet(id: string): void {
        this.reassignAgentsFromSet(id);
        this.agentSets.delete(id);
        console.log(`Removed AgentSet ${id}`);
    }

    async getAgentUrl(agentId: string): Promise<string | undefined> {
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
        await this.ensureAgentSets();
        return Array.from(this.agentSets.values()).map(set => set.url);
    }

    async getAgentSetUrlForAgent(agentId: string): Promise<string | undefined> {
        if (this.agentSets.size === 0) {
            try {
                await this.createNewAgentSet();
            } catch (error) {
                console.error('Error creating new agent set:', error instanceof Error ? error.message : error);
            }
        }

        const setId = this.agentToSetMap.get(agentId);

        if (setId && this.agentSets.has(setId)) {
            const agentSet = this.agentSets.get(setId);
            return agentSet?.url;
        }

        if (this.agentSets.size > 0) {
            const firstSetId = Array.from(this.agentSets.keys())[0];
            const firstSet = this.agentSets.get(firstSetId);

            if (firstSet) {
                this.agentToSetMap.set(agentId, firstSetId);
                return firstSet.url;
            }
        }

        return undefined;
    }

    async updateAgentLocation(agentId: string, agentSetUrl: string): Promise<void> {
        await this.ensureAgentSets();

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

        this.agentToSetMap.set(agentId, targetSetId);
    }

    private async getAvailableAgentSet(): Promise<AgentSetLink | undefined> {
        await this.ensureAgentSets();
        return Array.from(this.agentSets.values()).find(set => set.agentCount < this.maxAgentsPerSet);
    }

    async assignAgentToSet(agentId: string, actionVerb: string, inputs: Map<string, InputValue>, missionId: string, missionContext: string): Promise<string> {
        await this.ensureAgentSets();

        let availableSet = await this.getAvailableAgentSet();

        if (!availableSet) {
            throw new Error('No available agent set found after initialization.');
        }

        this.agentToSetMap.set(agentId, availableSet.id);

        try {
            const payload = {
                agentId,
                actionVerb,
                inputs: MapSerializer.transformForSerialization(inputs),
                missionId,
                missionContext
            };
            const response = await this.apiCall('post', `${availableSet.url}/addAgent`, payload);

            availableSet.agentCount++;
            return response.data;
        } catch (error) {
            analyzeError(error as Error);
            this.agentToSetMap.delete(agentId);
            console.error('Failed to assign agent to set:', error instanceof Error ? error.message : error);
            throw new Error(`Failed to assign agent ${agentId} to set ${availableSet.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async removeAgentFromSet(agentId: string): Promise<void> {
        console.log(`AgentSetManager: Attempting to remove agent ${agentId} from tracking.`);
        const agentSetId = this.agentToSetMap.get(agentId);

        if (agentSetId) {
            const agentSet = this.agentSets.get(agentSetId);
            if (agentSet) {
                if (agentSet.agentCount > 0) {
                    agentSet.agentCount--;
                } else {
                    console.warn(`AgentSetManager: AgentSet ${agentSetId} already has 0 agentCount before decrementing for agent ${agentId}.`);
                }
                console.log(`AgentSetManager: Decremented agent count for AgentSet ${agentSetId} to ${agentSet.agentCount} due to removal of agent ${agentId}.`);
            } else {
                console.warn(`AgentSetManager: AgentSet ${agentSetId} not found in agentSets map for agent ${agentId}.`);
            }
            console.log(`AgentSetManager: Agent ${agentId} removed from agentToSetMap.`);
        } else {
            console.warn(`AgentSetManager: Agent ${agentId} not found in agentToSetMap.`);
        }
    }

    async sendMessageToAgent(agentId: string, message: any): Promise<any> {
        const agentSetUrl = await this.getAgentUrl(agentId);
        if (!agentSetUrl) {
            console.error(`No AgentSet found for agent ${agentId}`);
        }

        try {
            const response = await this.apiCall('post', `${agentSetUrl}/agent/${agentId}/message`, message);
            return response.data;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error sending message to agent ${agentId}:`, error instanceof Error ? error.message : error);
        }
    }

    async pauseAgents(missionId: string) {
        const pausePromises = Array.from(this.agentSets.values()).map(async (set) => {
            try {
                await this.apiCall('post', `${set.url}/pauseAgents`, { missionId });
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
                await this.apiCall('post', `${set.url}/abortAgents`, { missionId });
            } catch (error) {
                analyzeError(error as Error);
            }
        });

        const results = await Promise.allSettled(abortPromises);

        const failedSets = results.filter(result => result.status === 'rejected').length;
        if (failedSets > 0) {
            console.warn(`Failed to abort agents in ${failedSets} sets for mission ${missionId}`);
        }
    }

    async resumeAgents(missionId: string) {
        const resumePromises = Array.from(this.agentSets.values()).map(async (set) => {
            try {
                await this.apiCall('post', `${set.url}/resumeAgents`, { missionId });
            } catch (error) {
                analyzeError(error as Error);
            }
        });

        const results = await Promise.allSettled(resumePromises);

        const failedSets = results.filter(result => result.status === 'rejected').length;
        if (failedSets > 0) {
            console.warn(`Failed to resume agents in ${failedSets} sets for mission ${missionId}`);
        }
    }

    async resumeAgent(agentId: string) {
        const setUrl = await this.getAgentSetUrlForAgent(agentId);
        if (!setUrl) {
            console.error(`No AgentSet found for agent ${agentId}`);
        }

        await this.apiCall('post', `${setUrl}/resumeAgent`, { agentId });
    }

    async distributeUserMessage(req: express.Request) {
        console.log(`AgentSetManager: distributeUserMessage called with request body:`, req.body);
        const messagePromises = Array.from(this.agentSets.values()).map(async (set) => {
            try {
                await this.apiCall('post', `${set.url}/message`, req.body);
            } catch (error) {
                analyzeError(error as Error);
            }
        });

        const results = await Promise.allSettled(messagePromises);

        const failedSets = results.filter(result => result.status === 'rejected').length;
        if (failedSets > 0) {
            console.warn(`Failed to message agents in ${failedSets} sets`);
        }
    }

    isValidUrl(url: string): boolean {
        const urlPattern = /^https?:\/\/[a-zA-Z0-9-_\.]+:\d+$/;
        return urlPattern.test(url);
    }

    isValidMissionId(missionId: string): boolean {
        const missionIdPattern = /^[a-zA-Z0-9-]+$/;
        const result = missionIdPattern.test(missionId);
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
            agentStatisticsByType: {
                totalAgents: 0,
                agentCountByStatus: {},
                agentSetCount: 0,
            },
        };
        try {
            console.log(`AgentSetManager getting statistics from ${this.agentSets.size} AgentSets}`);
            for (const agentSet of this.agentSets.values()) {
                stats.agentSetsCount++;
                try {
                    if (!this.isValidUrl(agentSet.url)) {
                        console.error(`Invalid URL: ${agentSet.url}`);
                        return stats;
                    }
                    console.log(`[AgentSetManager] Requesting statistics from AgentSet at ${agentSet.url} for missionId: ${missionId}`);
                    const response = await this.apiCall('get', `${agentSet.url}/statistics/${encodeURIComponent(missionId)}`);
                    const serializedStats = response.data;
                    serializedStats.agentsByStatus = MapSerializer.transformFromSerialization(serializedStats.agentsByStatus);
                    stats.totalAgentsCount += serializedStats.agentsCount;

                    if (serializedStats.agentsByStatus instanceof Map) {
                        serializedStats.agentsByStatus.forEach((agents: AgentStatistics[], status: string) => {
                            if (!stats.agentsByStatus.has(status)) {
                                stats.agentsByStatus.set(status, [...agents]);
                            } else {
                                stats.agentsByStatus.get(status)!.push(...agents);
                            }
                        });
                    } else {
                        Object.entries(serializedStats.agentsByStatus).forEach(([status, agents]) => {
                            if (!stats.agentsByStatus.has(status)) {
                                stats.agentsByStatus.set(status, [...agents as AgentStatistics[]]);
                            } else {
                                stats.agentsByStatus.get(status)!.push(...agents as AgentStatistics[]);
                            }
                        });
                    }
                } catch (error) {
                    console.error(`[AgentSetManager] Error fetching statistics from AgentSet at ${agentSet.url} for missionId: ${missionId}:`, error);
                }
            }
            const agentCountByStatus: Record<string, number> = {};
            stats.agentsByStatus.forEach((agents, status) => {
                agentCountByStatus[status] = agents.length;
            });

            return {
                agentSetsCount: stats.agentSetsCount,
                totalAgentsCount: stats.totalAgentsCount,
                agentsByStatus: stats.agentsByStatus,
                agentStatisticsByType: {
                    totalAgents: stats.totalAgentsCount,
                    agentCountByStatus: agentCountByStatus,
                    agentSetCount: stats.agentSetsCount,
                },
            };
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error fetching agent statistics:', error instanceof Error ? error.message : error);
            return {
                agentSetsCount: stats.agentSetsCount,
                totalAgentsCount: stats.totalAgentsCount,
                agentsByStatus: MapSerializer.transformForSerialization(stats.agentsByStatus),
                agentStatisticsByType: {
                    totalAgents: stats.totalAgentsCount,
                    agentCountByStatus: {},
                    agentSetCount: stats.agentSetsCount,
                },
            };
        }
    }

    async getAgentsByMission(missionId: string): Promise<any[]> {
        if (!this.isValidMissionId(missionId)) {
            throw new Error(`Invalid missionId: ${missionId}`);
        }
        const allAgents: any[] = [];
        const allAgentSetUrls = Array.from(this.agentSets.values()).map(set => set.url);

        const requests = allAgentSetUrls.map(url => {
            return this.apiCall('get', `${url}/mission/${missionId}/agents`)
                .then(response => response.data)
                .catch(error => {
                    console.error(`Failed to get agents from ${url} for mission ${missionId}:`, error.message);
                    return [];
                });
        });

        const results = await Promise.all(requests);
        results.forEach(agents => allAgents.push(...agents));

        const uniqueAgents = Array.from(new Map(allAgents.map(agent => [agent.id, agent])).values());

        return uniqueAgents;
    }

    async loadOneAgent(agentId: string): Promise<boolean> {
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
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error loading agent ${agentId}:`, error instanceof Error ? error.message : error);
            return false;
        }
    }

    async loadAgents(missionId: string): Promise<boolean> {
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
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error loading agents for mission ${missionId}:`, error instanceof Error ? error.message : error);
            return false;
        }
    }

    private async loadAgentToSet(agentId: string, agentSetUrl: string): Promise<boolean> {
        try {
            const response = await this.apiCall('post', `${agentSetUrl}/loadAgent`, { agentId });
            if (response.status === 200) {
                this.agentToSetMap.set(agentId, agentSetUrl);
                console.log(`Agent ${agentId} loaded successfully to ${agentSetUrl}`);
                return true;
            } else {
                console.error(`Failed to load agent ${agentId} to ${agentSetUrl}`);
                return false;
            }
        } catch (error) {
            analyzeError(error as Error);
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
            const response = await this.apiCall('get', `${this.postOfficeUrl}/getAgentIdsByMission/${missionId}`);
            return response.data;
        } catch (error) {
            analyzeError(error as Error);
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
        } catch (error) {
            analyzeError(error as Error);
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
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error saving agents for mission ${missionId}:`, error instanceof Error ? error.message : error);
            return false;
        }
    }

    private async saveAgentInSet(agentId: string, agentSetUrl: string): Promise<boolean> {
        try {
            const response = await this.apiCall('post', `${agentSetUrl}/saveAgent`, { agentId });
            if (response.status === 200) {
                console.log(`Agent ${agentId} saved successfully in ${agentSetUrl}`);
                return true;
            } else {
                console.error(`Failed to save agent ${agentId} in ${agentSetUrl}`);
                return false;
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error saving agent ${agentId} in ${agentSetUrl}:`, error instanceof Error ? error.message : error);
            return false;
        }
    }

    private async createNewAgentSet(): Promise<void> {
        if (this.agentSets.has('primary-agentset')) {
            return;
        }

        const primaryAgentSetUrl = process.env.PRIMARY_AGENTSET_URL || 'http://agentset:5100';

        const primaryAgentSet = {
            id: 'primary-agentset',
            url: primaryAgentSetUrl,
            agentCount: 0,
            maxAgents: this.maxAgentsPerSet,
        };

        this.agentSets.set(primaryAgentSet.id, primaryAgentSet);
        console.log('Ensured primary agentset reference exists:', primaryAgentSet);
    }

    async destroy(): Promise<void> {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}

export const agentSetManager = new AgentSetManager();
