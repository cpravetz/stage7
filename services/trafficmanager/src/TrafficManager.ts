import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { agentSetManager } from './utils/agentSetManager';
import { dependencyManager } from './utils/dependencyManager';
import { AgentStatus } from './utils/status';
import { Message, MessageType,TrafficManagerStatistics,
        BaseEntity, PluginInput, MapSerializer } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';


// NOTE: This axios instance doesn't include authentication headers
// Use this.authenticatedApi instead for all API calls that require authentication
const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });


export class TrafficManager extends BaseEntity {
    private app: express.Application;

    constructor() {
        super('TrafficManager', 'TrafficManager', `trafficmanager`, process.env.PORT || '5080');
        this.app = express();
        this.app.use(express.json());

        // Update the agentSetManager with our authenticatedApi
        agentSetManager.authenticatedApi = this.authenticatedApi;

        this.setupRoutes();
        this.startServer();
    }

    private setupRoutes() {
        // Create a router for all routes
        const router = express.Router();

        // Use the BaseEntity verifyToken method for authentication
        this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            // Skip authentication for health endpoints
            if (req.path === '/health' || req.path === '/ready') {
                return next();
            }

            // Use the BaseEntity verifyToken method
            this.verifyToken(req, res, next);
        });

        // Define routes on the router
        router.post('/message', this.handleMessageRoute.bind(this));
        router.post('/createAgent', this.createAgentRoute.bind(this));
        router.post('/checkDependencies', this.checkDependenciesRoute.bind(this));
        router.post('/pauseAgents', this.pauseAgentsRoute.bind(this));
        router.post('/abortAgents', this.abortAgentsRoute.bind(this));
        router.post('/resumeAgents', this.resumeAgentsRoute.bind(this));
        router.get('/getAgentStatistics/:missionId', this.getAgentStatisticsRoute.bind(this));
        router.post('/checkBlockedAgents', this.checkBlockedAgentsRoute.bind(this));
        router.get('/dependentAgents/:agentId', this.getDependentAgentsRoute.bind(this));
        router.post('/distributeUserMessage', this.distributeUserMessageRoute.bind(this));
        router.get('/getAgentLocation/:agentId', this.getAgentLocationRoute.bind(this));
        router.post('/updateAgentLocation', this.updateAgentLocationRoute.bind(this));
        router.post('/agentStatisticsUpdate', this.agentStatisticsUpdateRoute.bind(this));

        // Use the router
        this.app.use(router);
    }

    // Route handler methods
    private handleMessageRoute(req: express.Request, res: express.Response) {
        this.handleMessage(req, res);
    }

    private async createAgentRoute(req: express.Request, res: express.Response, next: express.NextFunction) {
        try {
            await this.createAgent(req, res);
        } catch (error) {
            next(error);
        }
    }

    private checkDependenciesRoute(req: express.Request, res: express.Response) {
        this.checkDependencies(req, res);
    }

    private async pauseAgentsRoute(req: express.Request, res: express.Response, next: express.NextFunction) {
        try {
            await this.pauseAgents(req, res);
        } catch (error) {
            analyzeError(error as Error);
            next(error);
        }
    }

    private async abortAgentsRoute(req: express.Request, res: express.Response) {
        await this.abortAgents(req, res);
    }

    private async resumeAgentsRoute(req: express.Request, res: express.Response) {
        await this.resumeAgents(req, res);
    }

    private async getAgentStatisticsRoute(req: express.Request, res: express.Response) {
        await this.getAgentStatistics(req, res);
    }

    private async checkBlockedAgentsRoute(req: express.Request, res: express.Response) {
        await this.checkBlockedAgents(req, res);
    }

    private getDependentAgentsRoute(req: express.Request, res: express.Response) {
        this.getDependentAgents(req, res);
    }

    private async distributeUserMessageRoute(req: express.Request, res: express.Response) {
        await this.distributeUserMessage(req, res);
    }

    private async getAgentLocationRoute(req: express.Request, res: express.Response) {
        await this.getAgentLocation(req, res);
    }

    private async updateAgentLocationRoute(req: express.Request, res: express.Response) {
        await this.updateAgentLocation(req, res);
    }

    private async agentStatisticsUpdateRoute(req: express.Request, res: express.Response) {
        await this.handleAgentStatisticsUpdate(req, res);
    }

    private getAgentSetsForMission(missionId: string) {
        // Implementation to return AgentSets for the given mission
        // This might involve looking up which AgentSets have agents for this mission
    }

    private async captureAgentStatus(agentId: string, status: AgentStatus) {
        try {
            await this.updateAgentStatusInStorage(agentId, status);
        } catch (error) { analyzeError(error as Error);
            console.error('Error capturing agent status for agent %s:', agentId, error instanceof Error ? error.message : error);
        }
    }

    private async updateAgentStatus(message: Message) {
        const agentId = message.sender;
        const status = message.content.status;
        console.log(`Updating status for agent ${agentId} to ${status}`);
        try {
            if (status === 'CHECK') {
                // Just return the current status without updating
                const currentStatus = await this.getAgentStatus(agentId);
                return { status: currentStatus };
            }

            // Perform actions based on the new status
            switch (status) {
                case AgentStatus.COMPLETED:
                    await this.handleAgentCompletion(agentId);
                    break;
                case AgentStatus.ERROR:
                    await this.handleAgentError(agentId);
                    break;
                case AgentStatus.PAUSED:
                    await this.handleAgentPaused(agentId);
                    break;
                // Add more cases as needed
            }

            await this.updateAgentStatusInStorage(agentId, status);

            // Check if this status update affects any dependent agents
            await this.checkDependentAgents(agentId);

            return { message: `Agent ${agentId} status updated to ${status}` }
        } catch (error) { analyzeError(error as Error);
            console.error(`Error updating status for agent %s:`, agentId, error instanceof Error ? error.message : error);
            return { error: 'Failed to update agent status' };
        }
    }


    private async handleAgentCompletion(agentId: string) {
        console.log(`Agent ${agentId} has completed its task`);

        try {
            // Fetch the agent's final output
            const agentOutput = await this.fetchAgentOutput(agentId);

            // Update the agent's status in storage
            await this.updateAgentStatusInStorage(agentId, AgentStatus.COMPLETED);

            // Check and update dependent agents
            await this.updateDependentAgents(agentId);

            // Clean up any resources associated with this agent
            await this.cleanupAgentResources(agentId);

        } catch (error) { analyzeError(error as Error);
            this.logAndSay(`An error occurred while processing the completion of agent ${agentId}`);
        }
    }

    private async fetchAgentOutput(agentId: string): Promise<any> {
        try {
            // Get the AgentSet URL for the given agent
            const agentSetUrl = await agentSetManager.getAgentSetUrlForAgent(agentId);

            if (!agentSetUrl) {
                console.error(`No AgentSet found for agent ${agentId}`);
                return {};
            }

            // Make a request to the AgentSet to fetch the agent's output
            const response = await this.authenticatedApi.get(`http://${this.ensureProtocol(agentSetUrl)}/agent/${agentId}/output`);

            if (response.status === 200 && response.data) {
                return response.data.output;
            } else {
                console.error(`Failed to fetch output for agent ${agentId}`);
                return {};
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error fetching output for agent %s:`, agentId, error instanceof Error ? error.message : error);
            return {};
        }
    }
    private async updateDependentAgents(completedAgentId: string) {
        const dependentAgents = await dependencyManager.getDependencies(completedAgentId);
        for (const depAgentId of dependentAgents) {
            const canProceed = await this.checkDependenciesRecursive(depAgentId);
            if (canProceed) {
                agentSetManager.resumeAgent(depAgentId);
                this.say(`Dependent agent ${depAgentId} has been resumed`);
            }
        }
    }

    private async cleanupAgentResources(agentId: string) {
        // Implement any necessary cleanup logic
        // This could include removing temporary files, freeing up memory, etc.
        console.log(`Cleaning up resources for agent ${agentId}`);
        // For example:
        // await this.removeTemporaryFiles(agentId);
        // await this.freeUpMemory(agentId);
    }
    private async handleAgentError(agentId: string) {
        this.logAndSay(`Agent ${agentId} encountered an error`);
        // Implement error handling logic
        // For example, you might want to retry the agent's task or notify an administrator
    }

    private async handleAgentPaused(agentId: string) {
        console.log(`Agent ${agentId} has been paused`);
        // Implement any necessary logic for paused agents
        // For example, you might want to reallocate resources or update scheduling
    }

    private async checkDependentAgents(agentId: string) {
        const dependentAgents = await dependencyManager.getDependencies(agentId);
        for (const depAgentId of dependentAgents) {
            const canResume = await this.checkDependenciesRecursive(depAgentId);
            if (canResume) {
                agentSetManager.resumeAgent(depAgentId);
            }
        }
    }

    private async getAgentStatistics(req: express.Request, res: express.Response) {
        const { missionId } = req.params;
        if (!missionId) {
            return res.status(400).send('Missing missionId parameter');
        }
        try {
            const agentSetManagerStatistics = await agentSetManager.getAgentStatistics(missionId);
            let agentCountByStatus: Map<string, number>;
            // Convert agentsByStatus to a map of [status, count] records
            if (agentSetManagerStatistics.agentsByStatus.entries()) {
                agentCountByStatus = new Map(
                    Array.from(agentSetManagerStatistics.agentsByStatus.entries())
                        .map(([status, agents]) => [status, agents.length])
                );
            } else {
                agentCountByStatus = new Map();
            }

            const trafficManagerStatistics: TrafficManagerStatistics = {
                agentStatisticsByType: {
                    totalAgents: agentSetManagerStatistics.totalAgentsCount,
                    agentCountByStatus: Object.fromEntries(agentCountByStatus),
                    agentSetCount: agentSetManagerStatistics.agentSetsCount
                },
                agentStatisticsByStatus: MapSerializer.transformForSerialization(agentSetManagerStatistics.agentsByStatus)
            };

            res.status(200).json(MapSerializer.transformForSerialization(trafficManagerStatistics));
        } catch (error) { //analyzeError(error as Error);
            console.error('Error fetching agent statistics:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Failed to fetch agent statistics' });
        }
    }

    private async handleMessage(req: express.Request, res: express.Response) {
        try {
            const message = req.body;
            const result = await this.processMessage(message);
            res.status(200).send(result || { status: 'Message received and processed by TrafficManager' });
        } catch (error) { analyzeError(error as Error);
            console.error('Error processing message:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to process message' });
        }
    }

    // Override the handleQueueMessage method from BaseEntity
    protected async handleQueueMessage(message: any) {
        try {
            await this.processMessage(message);
            console.log(`Queue message of type ${message.type} processed successfully`);
        } catch (error) { analyzeError(error as Error);
            console.error('Error processing queue message:', error instanceof Error ? error.message : error);
        }
    }

    // Common message processing logic for both HTTP and queue messages
    private async processMessage(message: any): Promise<any> {
        console.log('Processing message:', message);
        await super.handleBaseMessage(message);

        if (message.forAgent) {
            // This message is intended for a specific agent
            try {
                await this.forwardMessageToAgent(message);
                return { status: 'Message forwarded to agent' };
            } catch (error) { analyzeError(error as Error);
                console.error('Error forwarding message to agent:', error instanceof Error ? error.message : error);
                throw error; // Re-throw to be caught by the caller
            }
        } else {
            // Process the message based on its content
            if (message.type === MessageType.AGENT_UPDATE) {
                return await this.updateAgentStatus(message);
            }

            console.log('Processing message in TrafficManager');
            return { status: 'Message processed by TrafficManager' };
        }
    }

    private async forwardMessageToAgent(message: any) {
        const agentId = message.forAgent;
        const agentSetUrl = await agentSetManager.getAgentSetUrlForAgent(agentId);

        if (!agentSetUrl) {
            console.error(`No AgentSet found for agent ${agentId}`);
            return;
        }

        try {
            const response = await this.authenticatedApi.post(`${this.ensureProtocol(agentSetUrl)}/message`, {
                ...message,
                forAgent: agentId
            });
            console.log(`Message forwarded to agent ${agentId} via AgentSet at ${agentSetUrl}`);
            return response.data;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error forwarding message to agent %s:`, agentId, error instanceof Error ? error.message : error);
        }
    }

    private ensureProtocol(url: string): string {
        return url.startsWith('http://') || url.startsWith('https://') ? url : `http://${url}`;
    }

    private startServer() {
        this.app.listen(this.port, () => {
            console.log(`TrafficManager running on port ${this.port}`);
        });
    }

    private async createAgent(req: express.Request, res: express.Response) {
        console.log('createAgent req.body: ', req.body);
        const { actionVerb, inputs, dependencies, missionId, missionContext } = req.body;
        const inputsDeserialized = MapSerializer.transformFromSerialization(inputs);
        let inputsMap: Map<string, PluginInput>;

        if (inputsDeserialized instanceof Map) {
            inputsMap = inputsDeserialized;
        } else {
            inputsMap = new Map();
            for (const [key, value] of Object.entries(inputsDeserialized)) {
                if (typeof value === 'object' && value !== null && 'inputValue' in value) {
                    inputsMap.set(key, value as PluginInput);
                } else {
                    inputsMap.set(key, {
                        inputName: key,
                        inputValue: value,
                        args: { [key]: value }
                    });
                }
            }
        }
        console.log('Inputs converted to InputsMap', inputsMap);
        try {
            const agentId = uuidv4();

            if (dependencies) {
                await dependencyManager.registerDependencies(agentId, dependencies);
            }
            const dependenciesSatisfied = await this.checkDependenciesRecursive(agentId);
            if (!dependenciesSatisfied) {
                await this.captureAgentStatus(agentId, AgentStatus.PAUSED);
                return res.status(200).send({ message: 'Agent created but waiting for dependencies.', agentId });
            }
            const response = await agentSetManager.assignAgentToSet(agentId, actionVerb, inputsMap, missionId, missionContext);
            await this.captureAgentStatus(agentId, AgentStatus.RUNNING);

            res.status(200).send({ message: 'Agent created and assigned.', agentId, response });
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error creating agent:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to create agent' });
        }
    }

    private async checkDependenciesRecursive(agentId: string): Promise<boolean> {
        const dependencies = await dependencyManager.getDependencies(agentId);

        if (!dependencies || dependencies.length === 0) {
            return true;
        }

        for (const depAgentId of dependencies) {
            const depStatus = await this.getAgentStatus(depAgentId);

            if (depStatus !== AgentStatus.COMPLETED) {
                const depDependenciesSatisfied = await this.checkDependenciesRecursive(depAgentId);

                if (!depDependenciesSatisfied) {
                    return false;
                }
            }
        }

        return true;
    }

    private agentStatusMap: Map<string, AgentStatus> = new Map();

    private async getAgentStatus(agentId: string): Promise<AgentStatus> {

        try {
            // Check if the status is in our in-memory cache
            if (this.agentStatusMap.has(agentId)) {
                return this.agentStatusMap.get(agentId)!;
            }

            // If not in cache, try to fetch from a persistent storage (e.g., database)
            const status = await this.fetchAgentStatusFromStorage(agentId);

            if (status) {
                // Update the cache
                this.agentStatusMap.set(agentId, status);
                return status;
            }

            // If the agent is not found, return a default status
            console.warn(`Agent ${agentId} not found. Returning default status.`);
            return AgentStatus.INITIALIZING;
        } catch (error) { analyzeError(error as Error);
            console.error(`Error retrieving status for agent %s:`, agentId, error instanceof Error ? error.message : error);
            return AgentStatus.UNKNOWN;
        }
    }

    private async fetchAgentStatusFromStorage(agentId: string): Promise<AgentStatus | null> {
        // This is a placeholder for fetching the status from a persistent storage
        // In a real implementation, you would query your database or storage service here
        // For now, we'll simulate a delay and return a random status
        console.log(`Fetching status for agent ${agentId} from storage...`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay
        const statuses = Object.values(AgentStatus);
        return statuses[Math.floor(Math.random() * statuses.length)] as AgentStatus;
    }

    // Update this method to use the new agentStatusMap
    private async updateAgentStatusInStorage(agentId: string, status: AgentStatus): Promise<void> {
        // This is a placeholder for updating the status in a persistent storage
        // In a real implementation, you would update your database or storage service here
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay
        console.log(`Updated status for agent ${agentId} to ${status} in storage`);
    }

    private async pauseAgents(req: express.Request, res: express.Response) {
        console.log('TrafficManager: Pausing agents for mission:', req.body);
        const { missionId } = req.body;
        try {
            await agentSetManager.pauseAgents(missionId);
            res.status(200).send({ message: 'Agent paused successfully.' });
        } catch (error) { analyzeError(error as Error);
            console.error('Error pausing agent:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to pause agent' });
        }
    }

    private async abortAgents(req: express.Request, res: express.Response) {
        const { missionId } = req.body;
        try {
            await agentSetManager.abortAgents(missionId);
            res.status(200).send({ message: 'Agent aborted successfully.' });
        } catch (error) { analyzeError(error as Error);
            console.error('Error aborting agent:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to abort agent' });
        }
    }

    private async resumeAgents(req: express.Request, res: express.Response) {
        const { missionId } = req.body;
        try {
            await agentSetManager.resumeAgents(missionId);
            res.status(200).send({ message: 'Agent resumed successfully.' });
        } catch (error) { analyzeError(error as Error);
            console.error('Error resuming agent:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to resume agent' });
        }
    }

    private async checkDependencies(req: express.Request, res: express.Response) {
        const { agentId } = req.body;

        try {
            const dependenciesSatisfied = await dependencyManager.areDependenciesSatisfied(agentId);

            if (dependenciesSatisfied) {
                await this.captureAgentStatus(agentId, AgentStatus.RUNNING);
                res.status(200).send({ message: 'Dependencies satisfied. Agent resumed.' });
            } else {
                res.status(200).send({ message: 'Dependencies not yet satisfied.' });
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Error checking dependencies:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to check dependencies' });
        }
    }

    private async checkBlockedAgents(req: express.Request, res: express.Response) {
        const { completedAgentId } = req.body;
        console.log('Checking agents blocked by completedAgentId:', completedAgentId);

        if (!completedAgentId) {
            return res.status(400).send({ error: 'completedAgentId is required' });
        }

        try {
            const blockedAgents = await dependencyManager.getDependencies(completedAgentId);
            let unblockedCount = 0;
            for (const blockedAgentId of blockedAgents) {
                const canResume = await this.checkDependenciesRecursive(blockedAgentId);
                if (canResume) {
                    unblockedCount++;
                    console.log('Resuming blocked agent:', blockedAgentId);
                    agentSetManager.resumeAgent(blockedAgentId);
                }
            }
            console.log(`Unblocked ${unblockedCount} of ${blockedAgents.length} agents that were blocked by ${completedAgentId}`);

            res.status(200).send({ message: 'Blocked agents checked and resumed if possible' });
        } catch (error) { analyzeError(error as Error);
            console.error('Error checking blocked agents:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to check blocked agents' });
        }
    }

    private async getDependentAgents(req: express.Request, res: express.Response) {
        const { agentId } = req.params;

        try {
            // Get all dependencies from the dependencyManager
            const allDependencies = await dependencyManager.getAllDependencies();

            // Filter for agents that depend on the given agentId
            const dependentAgents = Object.entries(allDependencies)
                .filter(([_, dependency]) => dependency.dependencies.includes(agentId))
                .map(([dependentAgentId, _]) => dependentAgentId);

            res.status(200).json(dependentAgents);
        } catch (error) { analyzeError(error as Error);
            console.error('Error getting dependent agents:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Failed to get dependent agents' });
        }
    }

    private async distributeUserMessage(req: express.Request, res: express.Response) {

        try {
            await agentSetManager.distributeUserMessage(req);
            res.status(200).send({ message: 'User message distributed successfully' });
        } catch (error) { analyzeError(error as Error);
            console.error('Error distributing user message:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to distribute user message' });
        }
    }

    /**
     * Get the location (AgentSet URL) of an agent
     * @param req Request
     * @param res Response
     */
    private async getAgentLocation(req: express.Request, res: express.Response) {
        const { agentId } = req.params;

        try {
            const agentSetUrl = await agentSetManager.getAgentSetUrlForAgent(agentId);

            if (agentSetUrl) {
                res.status(200).send({ agentId, agentSetUrl });
            } else {
                res.status(404).send({ error: `Agent ${agentId} not found` });
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Error getting agent location:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to get agent location' });
        }
    }

    /**
     * Update the location (AgentSet URL) of an agent
     * @param req Request
     * @param res Response
     */
    private async updateAgentLocation(req: express.Request, res: express.Response) {
        const { agentId, agentSetUrl } = req.body;

        if (!agentId || !agentSetUrl) {
            return res.status(400).send({ error: 'agentId and agentSetUrl are required' });
        }

        try {
            await agentSetManager.updateAgentLocation(agentId, agentSetUrl);
            res.status(200).send({ message: `Agent ${agentId} location updated to ${agentSetUrl}` });
        } catch (error) { analyzeError(error as Error);
            console.error('Error updating agent location:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to update agent location' });
        }
    }

    /**
     * Handle agent statistics updates
     * @param req Request
     * @param res Response
     */
    private async handleAgentStatisticsUpdate(req: express.Request, res: express.Response) {
        const { agentId, status, statistics, missionId, timestamp } = req.body;

        try {
            console.log(`Received statistics update for agent ${agentId} with status ${status}`);

            // Update agent status in our cache
            if (status) {
                this.agentStatusMap.set(agentId, status);
                await this.updateAgentStatusInStorage(agentId, status);
            }

            // Store the statistics for this agent
            if (statistics && missionId) {

                // Forward the statistics to MissionControl
                try {
                    const missionControlUrl = process.env.MISSIONCONTROL_URL || 'missioncontrol:5010';
                    await this.authenticatedApi.post(`http://${missionControlUrl}/agentStatisticsUpdate`, {
                        agentId,
                        missionId,
                        statistics,
                        timestamp: timestamp || new Date().toISOString()
                    });
                    console.log(`Forwarded statistics for agent ${agentId} to MissionControl`);
                } catch (mcError) {
                    console.error(`Failed to forward statistics to MissionControl:`,
                        mcError instanceof Error ? mcError.message : mcError);
                }
            }

            res.status(200).send({ message: 'Agent statistics updated successfully.' });
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error updating agent statistics:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to update agent statistics' });
        }
    }
}

// Instantiate TrafficManager
new TrafficManager();

// Periodic clean-up for removing empty agent sets
setInterval(async () => {
    await agentSetManager.removeEmptySets();
}, 60000); // Clean up every 60 seconds