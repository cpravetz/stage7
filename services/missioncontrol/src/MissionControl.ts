import axios from 'axios';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { AgentStatistics, Mission, PluginParameterType, Status } from '@cktmcs/shared';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { BaseEntity, MessageType, InputValue, MapSerializer, ServiceTokenManager } from '@cktmcs/shared';
import { MissionStatistics } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { rateLimit } from 'express-rate-limit';

interface CustomRequest extends Request {
    user?: {
      id?: string;
      iat?: number;
      exp?: number;
      // Add any other properties that might be in the user object
    };
  }

class MissionControl extends BaseEntity {
    private missions: Map<string, Mission> = new Map();
    private clientMissions: Map<string, Set<string>> = new Map();
    private trafficManagerUrl: string = process.env.TRAFFICMANAGER_URL || 'trafficmanager:5080';
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private brainUrl: string = process.env.BRAIN_URL || 'brain:5070';
    private engineerUrl: string = process.env.ENGINEER_URL || 'engineer:5050';

    // Add: Map to track pending user input requests
    private pendingUserInputs: Map<string, { missionId: string, stepId: string, agentId: string }> = new Map();

    constructor() {
        super('MissionControl', 'MissionControl', process.env.HOST || 'missioncontrol', process.env.PORT || '5030');

        // Initialize token manager for service-to-service authentication
        const serviceId = 'MissionControl';
        const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
        this.tokenManager = ServiceTokenManager.getInstance(
            `http://${this.securityManagerUrl}`,
            serviceId,
            serviceSecret
        );

        this.initializeServer();
        setInterval(() => this.getAndPushAgentStatistics(), 5000);
    }

    private initializeServer() {
        const app = express();

        app.use(rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 1000, // max 100 requests per windowMs
        }));
        app.use(express.json());

        // Use authentication middleware from BaseEntity
        app.use((req: Request, res: Response, next: NextFunction) => {
            this.verifyToken(req, res, next);
        });

        app.post('/message', (req, res) => {
            this.handleMessage(req, res).catch((error: any) => {
                console.error('Error in handleMessage:', error);
                res.status(500).send({ error: 'Internal server error' });
            });
        });

        app.post('/agentStatisticsUpdate', (req, res) => {
            this.handleAgentStatisticsUpdate(req, res).catch((error: any) => {
                console.error('Error in handleAgentStatisticsUpdate:', error);
                res.status(500).send({ error: 'Internal server error' });
            });
        });

        app.post('/userInputResponse', (req, res) => {
            this.handleUserInputResponse(req, res).catch((error: any) => {
                console.error('Error in handleUserInputResponse:', error);
                res.status(500).send({ error: 'Internal server error' });
            });
        });

        app.listen(this.port, () => {
            console.log(`MissionControl is running on port ${this.port}`);
        });
    }

    private async handleMessage(req: express.Request, res: express.Response) {
        try {
            console.log(`MissionControl received HTTP message:`, req.body);

            // Log the message type for debugging
            console.log(`MissionControl handling message of type ${req.body.type} from ${req.body.sender}`);

            // Special handling for CREATE_MISSION messages
            if (req.body.type === 'CREATE_MISSION') {
                try {
                    const { content, clientId, userId } = req.body;
                    // Use userId from message payload if available, otherwise fall back to req.user or 'system'
                    const effectiveUserId = userId || (req as any).user?.id || 'system';

                    // TEMPORARY: Add debug logging
                    console.log('Creating mission with content:', content);
                    console.log('Client ID:', clientId);
                    console.log('User ID:', effectiveUserId);

                    // Create the mission
                    const mission = await this.createMission(content, clientId, effectiveUserId);
                    console.log(`Mission created successfully: ${mission.id}`);

                    return res.status(200).send({
                        message: 'Mission created successfully',
                        missionId: mission.id,
                        status: mission.status
                    });
                } catch (missionError) {
                    console.error('Error creating mission:', missionError instanceof Error ? missionError.message : missionError);
                    if (missionError instanceof Error && missionError.stack) {
                        console.error(missionError.stack);
                    }
                    return res.status(500).send({
                        error: 'Error creating mission',
                        message: missionError instanceof Error ? missionError.message : 'Unknown error'
                    });
                }
            }

            // For other message types
            // Pass both the user from req.user and the message itself to processMessage
            // so it can extract userId from either source
            const result = await this.processMessage(req.body, (req as any).user);
            console.log(`Message processed successfully, result:`, result);
            res.status(200).send({ message: 'Message processed successfully', result });
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error processing message:', error instanceof Error ? error.message : error);
            if (error instanceof Error) {
                console.error(error.stack);
            }
            res.status(500).send({
                error: 'Error processing message',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Override the handleQueueMessage method from BaseEntity
    protected async handleQueueMessage(message: any) {
        try {
            console.log(`MissionControl received queue message:`, message);

            // For queue messages, we don't have user info from JWT
            // We'll need to handle authorization differently or get user info another way
            const userId = message.userId || 'system';
            const user = { id: userId };

            const result = await this.processMessage(message, user);
            console.log(`Queue message of type ${message.type} processed successfully, result:`, result);

            // If the message has a replyTo field, send a response back to the queue
            if (message.replyTo && this.mqClient && this.mqClient.isConnected()) {
                try {
                    await this.mqClient.publishMessage('stage7', message.replyTo, {
                        type: 'RESPONSE',
                        correlationId: message.correlationId,
                        content: result
                    }, {
                        correlationId: message.correlationId
                    });
                    console.log(`Sent response to ${message.replyTo} for message ${message.correlationId}`);
                } catch (replyError) {
                    console.error('Error sending reply to queue:', replyError);
                }
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error processing queue message:', error instanceof Error ? error.message : error);
            if (error instanceof Error) {
                console.error(error.stack);
            }

            // If the message has a replyTo field, send an error response back to the queue
            if (message && message.replyTo && this.mqClient && this.mqClient.isConnected()) {
                try {
                    await this.mqClient.publishMessage('stage7', message.replyTo, {
                        type: 'ERROR',
                        correlationId: message.correlationId,
                        content: {
                            error: error instanceof Error ? error.message : 'Unknown error',
                            status: 'error'
                        }
                    }, {
                        correlationId: message.correlationId
                    });
                } catch (replyError) {
                    console.error('Error sending error reply to queue:', replyError);
                }
            }
        }
    }

    // Common message processing logic for both HTTP and queue messages
    private async processMessage(message: any, user: any) {
        const { type, sender, content, clientId, userId } = message;
        console.log(`Processing message from user:`, user);
        const missionId = message.missionId ? message.missionId : (message.content?.missionId ? message.content.missionId : null);
        console.log(`Processing message of type ${type} from ${sender} for mission ${missionId}`);

        // Use userId from message if available, otherwise fall back to user.id or 'system'
        const effectiveUserId = userId || (user && user.id) || 'system';
        console.log(`Using effectiveUserId: ${effectiveUserId}`);

        let result;
        switch (type) {
            case MessageType.CREATE_MISSION:
                result = await this.createMission(content, clientId, effectiveUserId);
                return { missionId: result?.id, status: result?.status };
            case MessageType.PAUSE:
                if (missionId) {
                    await this.pauseMission(missionId);
                    return { missionId, status: 'paused' };
                }
                break;
            case MessageType.RESUME:
                if (missionId) {
                    await this.resumeMission(missionId);
                    return { missionId, status: 'resumed' };
                }
                break;
            case MessageType.ABORT:
                if (missionId) {
                    await this.abortMission(missionId);
                    return { missionId, status: 'aborted' };
                }
                break;
            case MessageType.SAVE:
                const mission = missionId ? this.missions.get(missionId) : null;
                if (mission) {
                    const missionName = message.missionName ? message.missionName : (mission.name ? mission.name : `mission ${new Date()}`);
                    await this.saveMission(missionId, missionName);
                    return { missionId, status: 'saved', name: missionName };
                }
                break;
            case MessageType.LOAD:
                const loadedMission = await this.loadMission(missionId, clientId, effectiveUserId);
                return { missionId, status: 'loaded', mission: loadedMission };
            case MessageType.USER_MESSAGE:
                await this.handleUserMessage(content, clientId, missionId);
                return { missionId, status: 'message_sent' };
            default:
                // Call the base class handler for standard message types
                await super.handleBaseMessage(message);
                return { status: 'message_handled' };
        }

        return { status: 'no_action_taken' };
    }

    private async createMission(content: any, clientId: string, userId: string) {
        try {
            this.logAndSay(`Creating mission with goal: ${content.goal}`);
            console.log(`MissionControl creating mission with goal: ${content.goal} for client: ${clientId}`);

            // Clear action plan cache before creating new mission
            await this.clearActionPlanCache();

            const missionId = uuidv4();
            console.log(`Generated mission ID: ${missionId}`);

            const mission: Mission = {
                id: missionId,
                userId: userId,
                name: content.name || `Mission ${new Date().toISOString().replace(/:/g, '-')}`,
                goal: content.goal,
                missionContext: content.missionContext || '',
                status: Status.INITIALIZING,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            this.missions.set(mission.id, mission);
            this.addClientMission(clientId, mission.id);

            console.log(`Mission created: ${mission.id}, Name: ${mission.name}, Client: ${clientId}`);
            this.sendStatusUpdate(mission, 'Mission created');

            // Create the inputs map for the agent
            const inputs = new Map<string, InputValue>();
            inputs.set('goal', {
                inputName: 'goal',
                value: mission.goal,
                valueType: PluginParameterType.STRING,
                args: {}
            });

            // Add mission context if available
            if (mission.missionContext) {
                inputs.set('missionContext', {
                    inputName: 'missionContext',
                    value: mission.missionContext,
                    valueType: PluginParameterType.STRING,
                    args: {}
                });
            }

            console.log('Serializing inputs for TrafficManager...');
            const serializedInputs = MapSerializer.transformForSerialization(inputs);

            // Create the agent through TrafficManager
            console.log(`Sending createAgent request to TrafficManager for mission ${mission.id}`);

            const createAgentResponse = await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/createAgent`, {
                actionVerb: 'ACCOMPLISH',
                inputs: serializedInputs,
                missionId: mission.id,
                missionContext: mission.missionContext,
                dependencies: []
            });

            console.log(`TrafficManager createAgent response:`, createAgentResponse.data);
            mission.status = Status.RUNNING;
            this.sendStatusUpdate(mission, 'Mission started');

            // Save the mission state
            await this.saveMissionState(mission);
            console.log(`Mission ${mission.id} state saved`);

            return mission;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error creating/starting mission:', error instanceof Error ? error.message : error);

            // If we have a mission object, update its status
            if (content && content.goal) {
                const failedMission = Array.from(this.missions.values())
                    .find(m => m.goal === content.goal && m.status === Status.INITIALIZING);

                if (failedMission) {
                    failedMission.status = Status.ERROR;
                    this.sendStatusUpdate(failedMission, `Error starting mission: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }

            throw error; // Re-throw to allow caller to handle
        }
    }

    private async pauseMission(missionId: string) {
        console.log(`in Mission.pauseMission() for mission: ${missionId}`);
        const mission = this.missions.get(missionId);
        if (mission) {
            mission.status = Status.PAUSED;
            await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/pauseAgents`, { missionId: missionId });
            this.sendStatusUpdate(mission, 'Mission paused');
        } else {
            console.error('Mission to pause not found:', missionId);
        }
    }

    private async clearActionPlanCache() {
        try {
            await this.authenticatedApi.delete(`http://${this.librarianUrl}/deleteCollection`, {
                params: {
                    collection: 'actionPlans'
                }
            });
            console.log('Action plan cache cleared successfully');
        } catch (error) {
            console.error('Error clearing action plan cache:', error instanceof Error ? error.message : error);
            // Don't throw - we don't want to block mission creation if cache clear fails
        }
    }

    private async resumeMission(missionId: string) {
        const mission = this.missions.get(missionId);
        if (mission) {
            mission.status = Status.RUNNING;
            await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/resumeAgents`, { missionId: missionId });
            this.sendStatusUpdate(mission, 'Mission resumed');
        } else {
            console.error('Mission to resume not found:', missionId);
        }
    }

    private async abortMission(missionId: string) {
        const mission = this.missions.get(missionId);
        if (mission) {
            mission.status = Status.ABORTED;
            await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/abortAgents`, { missionId: missionId });
            this.sendStatusUpdate(mission, 'Mission aborted');
            this.missions.delete(missionId);
            for (const [clientId, missionIds] of this.clientMissions.entries()) {
                if (missionIds.has(missionId)) {
                    this.removeClientMission(clientId, missionId);
                }
            }
        } else {
            console.error('Mission to abort not found:', missionId);
        }
    }

    private async loadMission(missionId: string, clientId: string, userId: string) {
        try {
            console.log(`Loading mission ${missionId} for client ${clientId} and user ${userId}`);

            const mission = await this.loadMissionState(missionId);
            if (!mission) {
                console.error('Mission not found:', missionId);
                throw new Error(`Mission ${missionId} not found`);
            }

            if (mission.userId !== userId) {
                console.error(`User ${userId} not authorized to load mission ${missionId}`);
                throw new Error('Access denied: You do not have permission to access this mission');
            }

            this.missions.set(missionId, mission);

            console.log(`Loading agents for mission ${missionId} from TrafficManager`);
            const loadAgentsResponse = await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/loadAgents`, { missionId });
            console.log(`TrafficManager loadAgents response:`, loadAgentsResponse.data);

            this.addClientMission(clientId, missionId);
            console.log(`Mission loaded: ${missionId}, Name: ${mission.name || 'Unnamed'}, Client: ${clientId}`);
            this.sendStatusUpdate(mission, `Mission loaded: ${mission.name || 'Unnamed'}`);

            return mission;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error loading mission:', error instanceof Error ? error.message : error);
            throw error; // Re-throw to allow caller to handle
        }
    }

    private async saveMission(missionId: string, missionName?: string) {
        const mission = this.missions.get(missionId);
        if (!mission) {
            console.error('Mission not found:', missionId);
            return;
        }
        try {
            if (missionName) mission.name = missionName;
            await this.saveMissionState(mission);
            await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/saveAgents`, { missionId });
            console.log(`Mission saved: ${missionId}, Name: ${mission.name || 'Unnamed'}`);
            this.sendStatusUpdate(mission, `Mission saved: ${mission.name || 'Unnamed'}`);
        } catch (error) { analyzeError(error as Error);
            console.error('Error saving mission:', error instanceof Error ? error.message : error);
        }
    }

    private async handleUserMessage(content: { missionId: string, message: string }, clientId: string, missionId: string) {
        const mission = this.missions.get(missionId);
        if (!mission) {
            console.error('Mission not found:', missionId);
            return;
        }

        try {
            // Send the user message to the TrafficManager for distribution
            await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/distributeUserMessage`, {
                type: MessageType.USER_MESSAGE,
                sender: 'user',
                recipient: 'agents',
                content: {
                    missionId: missionId,
                    message: content.message
                },
                clientId: clientId
            });

            console.log(`User message for mission ${missionId} sent to TrafficManager for distribution`);

            // Update mission status
            mission.updatedAt = new Date();
            this.sendStatusUpdate(mission, 'User message received and sent to agents');

        } catch (error) { analyzeError(error as Error);
            console.error('Error handling user message:', error instanceof Error ? error.message : error);
        }
    }

    private async saveMissionState(mission: Mission) {
        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                id: mission.id,
                userId: mission.userId,
                data: mission,
                collection: 'missions',
                storageType: 'mongo'
            });
        } catch (error) { analyzeError(error as Error);
            console.error('Error saving mission state:', error instanceof Error ? error.message : error);
        }
    }

    private async loadMissionState(missionId: string): Promise<Mission | null> {
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${missionId}`, {
                params: {
                    storageType: 'mongo',
                    collection: 'missions'
                }
            });
            return response.data.data;
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading mission state:', error instanceof Error ? error.message : error);
            return null;
        }
    }

    private sendStatusUpdate(mission: Mission, statusMessage: string) {
        const statusUpdate = {
            type: MessageType.STATUS_UPDATE,
            content: {
                id: mission.id,
                name: mission.name,
                status: mission.status,
                active: mission.status !== Status.ABORTED && mission.status !== Status.COMPLETED,
                goal: mission.goal,
                updatedAt: mission.updatedAt,
                message: statusMessage
            }
        };

        for (const [clientId, missionIds] of this.clientMissions.entries()) {
            if (missionIds.has(mission.id)) {
                this.authenticatedApi.post(`http://${this.postOfficeUrl}/message`, {
                    type: MessageType.STATUS_UPDATE,
                    sender: this.id,
                    recipient: 'user',
                    clientId: clientId,
                    data: statusUpdate
                }).catch((error: any) => {
                    console.error(`Error sending status update to client ${clientId}:`, error instanceof Error ? error.message : error);
                });
            }
        }
    }

    /**
     * Handle agent statistics updates from TrafficManager
     * @param req Request
     * @param res Response
     */
    private async handleAgentStatisticsUpdate(req: express.Request, res: express.Response) {
        try {
            const { agentId, missionId, statistics, timestamp } = req.body;
            if (!uuidValidate(missionId)) {
                res.status(400).send({ error: 'Invalid missionId format' });
            }
            // Stop sending stats for missions that are not changing
            const mission = this.missions.get(missionId);
            if (!mission || mission.status !== Status.RUNNING) {
                res.status(204).send({ message: 'Mission not found or not running' });
            }
            console.log(`Received statistics update for agent ${agentId} in mission ${missionId}`);

            // Store the statistics for this agent
            // For now, we'll just log them and rely on the getAndPushAgentStatistics method
            // to fetch the latest statistics from TrafficManager when needed
            console.log(`Agent ${agentId} statistics:`, JSON.stringify(statistics, null, 2));

            // Find the clients associated with this mission
            if (missionId) {
                for (const [clientId, missionIds] of this.clientMissions.entries()) {
                    if (missionIds.has(missionId)) {
                        console.log(`Found client ${clientId} for mission ${missionId}, sending statistics update`);
                        // Push statistics directly to this client
                        try {
                            const [llmCallsResponse, engineerStatisticsResponse] = await Promise.all([
                                this.authenticatedApi.get(`http://${this.brainUrl}/getLLMCalls`).catch((error: any) => {
                                    console.warn('Failed to fetch LLM calls:', error instanceof Error ? error.message : error);
                                    return { data: { llmCalls: 0 } };
                                }),
                                this.authenticatedApi.get(`http://${this.engineerUrl}/statistics`).catch((error: any) => {
                                    console.warn('Failed to fetch engineer statistics:', error instanceof Error ? error.message : error);
                                    return { data: { newPlugins: [] } };
                                })
                            ]);

                            // Get agent statistics from TrafficManager
                            const trafficManagerResponse = await this.authenticatedApi.get(`http://${this.trafficManagerUrl}/getAgentStatistics/${missionId}`);
                            const trafficManagerStatistics = trafficManagerResponse.data;

                            // Create mission statistics
                            const missionStats: MissionStatistics = {
                                llmCalls: llmCallsResponse.data.llmCalls,
                                agentCountByStatus: trafficManagerStatistics.agentStatisticsByType.agentCountByStatus,
                                agentStatistics: MapSerializer.transformForSerialization(trafficManagerStatistics.agentStatisticsByStatus),
                                engineerStatistics: engineerStatisticsResponse.data
                            };

                            // Log before sending
                            console.log('MissionControl: Sending agentStatistics to PostOffice for client', clientId);
                            console.log('MissionControl: Sending agentStatistics to PostOffice for client', clientId, 'Data:', JSON.stringify(missionStats.agentStatistics, null, 2));

                            // Send statistics to client
                            await this.authenticatedApi.post(`http://${this.postOfficeUrl}/message`, {
                                type: MessageType.STATISTICS,
                                sender: this.id,
                                recipient: 'user',
                                clientId: clientId, // Include clientId
                                content: missionStats
                            });
                            console.log(`Statistics update sent to client ${clientId} for mission ${missionId}`);
                        } catch (error) {
                            console.error(`Error sending statistics to client ${clientId}:`, error instanceof Error ? error.message : error);
                        }
                    }
                }
            }

            res.status(200).send({ message: 'Agent statistics updated successfully.' });
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error updating agent statistics:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to update agent statistics' });
        }
    }

    private async getAndPushAgentStatistics() {
        try {
            console.log('Fetching agent statistics...');
            const [llmCallsResponse, engineerStatisticsResponse] = await Promise.all([
                this.authenticatedApi.get(`http://${this.brainUrl}/getLLMCalls`).catch((error: any) => {
                    console.warn('Failed to fetch LLM calls:', error instanceof Error ? error.message : error);
                    return { data: { llmCalls: 0 } };
                }),
                this.authenticatedApi.get(`http://${this.engineerUrl}/statistics`).catch((error: any) => {
                    console.warn('Failed to fetch engineer statistics:', error instanceof Error ? error.message : error);
                    return { data: { newPlugins: [] } };
                })
            ]);

            console.log(`Received LLM calls count: ${llmCallsResponse.data.llmCalls}`);
            console.log(`Received engineer statistics: ${JSON.stringify(engineerStatisticsResponse.data)}`);

            // Check if we have any client missions
            if (this.clientMissions.size === 0) {
                console.log('No client missions found, skipping statistics update');
                return;
            }

            console.log(`Found ${this.clientMissions.size} client(s) with missions`);

            for (const [clientId, missionIds] of this.clientMissions.entries()) {
                console.log(`Processing statistics for client ${clientId} with ${missionIds.size} mission(s)`);

                for (const missionId of missionIds) {
                    console.log(`Fetching statistics for mission ${missionId}`);
                    const mission = this.missions.get(missionId);
                    if (!mission || mission.status !== Status.RUNNING) {
                        console.log(`Mission ${missionId} not found or not running, skipping`);
                        continue;
                    }

                    console.log(`Fetching agent statistics from TrafficManager for mission ${missionId}`);
                    const trafficManagerResponse = await this.authenticatedApi.get(`http://${this.trafficManagerUrl}/getAgentStatistics/${missionId}`);
                    const trafficManagerStatistics = trafficManagerResponse.data;

                    // Log raw statistics received from TrafficManager (for debugging purposes)
                    // console.log('MissionControl: Raw TM Stats agentStatisticsByStatus:', JSON.stringify(trafficManagerStatistics.agentStatisticsByStatus, null, 2));

                    trafficManagerStatistics.agentStatisticsByStatus = MapSerializer.transformFromSerialization(trafficManagerStatistics.agentStatisticsByStatus);

                    // Log deserialized statistics (for debugging purposes)
                    // console.log('MissionControl: Deserialized TM Stats agentStatisticsByStatus:', JSON.stringify(Array.from(trafficManagerStatistics.agentStatisticsByStatus.entries()), null, 2));

                    // Attempt to fix/ensure agentStat.steps is a proper array
                    if (trafficManagerStatistics.agentStatisticsByStatus instanceof Map) {
                        trafficManagerStatistics.agentStatisticsByStatus.forEach((agentList: AgentStatistics[], status: string) => {
                            agentList.forEach((agentStat: any) => { // Use 'any' temporarily for potential object-form steps
                                if (agentStat.steps && typeof agentStat.steps === 'object' && !Array.isArray(agentStat.steps)) {
                                    console.warn(`MissionControl: Reconstructing steps for agent ${agentStat.id} which were an object.`);
                                    try {
                                        agentStat.steps = Object.values(agentStat.steps);
                                    } catch (e) {
                                        console.error(`MissionControl: Failed to reconstruct steps for agent ${agentStat.id}:`, e);
                                        agentStat.steps = []; // Default to empty array on reconstruction failure
                                    }
                                } else if (!agentStat.steps || !Array.isArray(agentStat.steps)) {
                                    // If steps is missing, null, or not an array (and not an object handled above), ensure it's an empty array.
                                    if (!agentStat.steps) console.warn(`MissionControl: Agent ${agentStat.id} was missing steps array, initializing to [].`);
                                    else console.warn(`MissionControl: Agent ${agentStat.id} steps was not an array, re-initializing to []. Original:`, agentStat.steps);
                                    agentStat.steps = [];
                                }
                                // Further ensure each step object has the required fields (optional, for deeper integrity)
                                if (agentStat.steps.forEach) { // Check if it's an array now
                                    agentStat.steps.forEach((step: any, index: number) => {
                                        if (!step || typeof step.id === 'undefined' || typeof step.verb === 'undefined' || typeof step.status === 'undefined') {
                                            console.warn(`MissionControl: Agent ${agentStat.id}, step ${index} is malformed, ensuring default structure. Original:`, step);
                                            // This might be too aggressive if partial data is better than none.
                                            // For now, just logging, could replace with a default StepStat structure.
                                        }
                                    });
                                }
                            });
                        });
                    }


                    let totalDependencies = 0;
                    if (trafficManagerStatistics.agentStatisticsByStatus?.values) {
                        totalDependencies = Array.from(trafficManagerStatistics.agentStatisticsByStatus.values())
                        .flat()
                        .reduce<number>((totalCount, agent) =>
                            totalCount + (agent as AgentStatistics).steps.reduce<number>((stepCount, step) =>
                                stepCount + (step.dependencies?.length || 0), 0
                            ), 0);
                    }
                    console.log(`Total step dependencies across all agents: ${totalDependencies}`);

                    const missionStats: MissionStatistics = {
                        llmCalls: llmCallsResponse.data.llmCalls,
                        agentCountByStatus: trafficManagerStatistics.agentStatisticsByType.agentCountByStatus,
                        agentStatistics: MapSerializer.transformForSerialization(trafficManagerStatistics.agentStatisticsByStatus),
                        engineerStatistics: engineerStatisticsResponse.data
                    };

                    console.log(`Sending statistics update to PostOffice for client ${clientId}`);
                    console.log(`Statistics summary: LLM calls: ${missionStats.llmCalls}, Agent count: ${Object.values(missionStats.agentCountByStatus || {}).reduce((sum, count) => sum + count, 0)}`);

                    // Log before sending
                    console.log('MissionControl (periodic): Sending agentStatistics to PostOffice for client', clientId, 'mission:', missionId, 'Data:', JSON.stringify(missionStats.agentStatistics, null, 2));

                    await this.authenticatedApi.post(`http://${this.postOfficeUrl}/message`, {
                        type: MessageType.STATISTICS,
                        sender: this.id,
                        recipient: 'user',
                        clientId: clientId, // Make sure clientId is included
                        content: missionStats
                    });
                    console.log(`Statistics update sent to PostOffice for client ${clientId}`);
                }
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Error fetching and pushing agent statistics:', error instanceof Error ? error.message : error);
            if (error instanceof Error && error.stack) {
                console.error(error.stack);
            }
        }
    }

    private addClientMission(clientId: string, missionId: string) {
        if (!this.clientMissions.has(clientId)) {
            this.clientMissions.set(clientId, new Set());
        }
        this.clientMissions.get(clientId)!.add(missionId);
    }

    private removeClientMission(clientId: string, missionId: string) {
        if (this.clientMissions.has(clientId)) {
            this.clientMissions.get(clientId)!.delete(missionId);
            if (this.clientMissions.get(clientId)!.size === 0) {
                this.clientMissions.delete(clientId);
            }
        }
    }

    // Add: Handler for user input response
    private async handleUserInputResponse(req: express.Request, res: express.Response) {
        const { requestId, response } = req.body;
        const pending = this.pendingUserInputs.get(requestId);
        if (!pending) {
            res.status(404).send({ error: 'No pending user input for this requestId' });
            return;
        }
        // Resume the step with the user's response
        await this.resumeStepWithUserInput(pending.missionId, pending.stepId, pending.agentId, response);
        this.pendingUserInputs.delete(requestId);
        res.status(200).send({ message: 'User input processed' });
    }

    // Add: Resume step logic (stub, to be implemented as per your step engine)
    private async resumeStepWithUserInput(missionId: string, stepId: string, agentId: string, userInput: any) {
        // TODO: Implement logic to resume the paused step with the provided user input
        console.log(`Resuming step ${stepId} for agent ${agentId} in mission ${missionId} with user input:`, userInput);
        // Example: fetch the step, update its input, and continue processing
    }

    // In your step execution logic, when you get a pending_user_input result from the plugin:
    // this.pendingUserInputs.set(request_id, { missionId, stepId, agentId });
}

new MissionControl();