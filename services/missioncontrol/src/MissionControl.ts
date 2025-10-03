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
            this.securityManagerUrl,
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
        app.use(express.json({ limit: '50mb' }));

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

        app.post('/missions/:missionId/files/add', (req, res) => {
            this.addAttachedFile(req, res).catch((error: any) => {
                console.error('Error in addAttachedFile:', error);
                res.status(500).send({ error: 'Internal server error' });
            });
        });

        app.delete('/missions/:missionId/files/:fileId', (req, res) => {
            this.removeAttachedFile(req, res).catch((error: any) => {
                console.error('Error in removeAttachedFile:', error);
                res.status(500).send({ error: 'Internal server error' });
            });
        });

        app.post('/missions/:missionId/files/remove', (req, res) => {
            this.removeAttachedFile(req, res).catch((error: any) => {
                console.error('Error in removeAttachedFile:', error);
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
            case MessageType.LIST_MISSIONS:
                const missions = await this.listMissions(effectiveUserId);
                return { status: 'listed', missions: missions };
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

    private async fetchAndPushStatsForMission(missionId: string, clientId: string): Promise<MissionStatistics | null> {
        try {
            console.log(`Fetching and pushing statistics for mission ${missionId} to client ${clientId}`);
    
            const [llmCallsResponse, engineerStatisticsResponse] = await Promise.all([
                this.authenticatedApi.get(`http://${this.brainUrl}/getLLMCalls`).catch((error: any) => {
                    console.warn(`Failed to fetch LLM calls for mission ${missionId}:`, error instanceof Error ? error.message : error);
                    return { data: { llmCalls: 0 } };
                }),
                this.authenticatedApi.get(`http://${this.engineerUrl}/statistics`).catch((error: any) => {
                    console.warn(`Failed to fetch engineer statistics for mission ${missionId}:`, error instanceof Error ? error.message : error);
                    return { data: { newPlugins: [] } };
                })
            ]);
    
            const trafficManagerResponse = await this.authenticatedApi.get(`http://${this.trafficManagerUrl}/getAgentStatistics/${missionId}`);
            const trafficManagerStatistics = trafficManagerResponse.data;
    
            trafficManagerStatistics.agentStatisticsByStatus = MapSerializer.transformFromSerialization(trafficManagerStatistics.agentStatisticsByStatus);
    
            if (trafficManagerStatistics.agentStatisticsByStatus instanceof Map) {
                trafficManagerStatistics.agentStatisticsByStatus.forEach((agentList: AgentStatistics[]) => {
                    agentList.forEach((agentStat: any) => {
                        if (agentStat.steps && typeof agentStat.steps === 'object' && !Array.isArray(agentStat.steps)) {
                            console.warn(`MissionControl: Reconstructing steps for agent ${agentStat.id} which were an object.`);
                            try {
                                agentStat.steps = Object.values(agentStat.steps);
                            } catch (e) {
                                console.error(`MissionControl: Failed to reconstruct steps for agent ${agentStat.id}:`, e);
                                agentStat.steps = [];
                            }
                        } else if (!agentStat.steps || !Array.isArray(agentStat.steps)) {
                            if (!agentStat.steps) console.warn(`MissionControl: Agent ${agentStat.id} was missing steps array, initializing to [].`);
                            else console.warn(`MissionControl: Agent ${agentStat.id} steps was not an array, re-initializing to []. Original:`, agentStat.steps);
                            agentStat.steps = [];
                        }
                    });
                });
            }
    
            const missionStats: MissionStatistics = {
                llmCalls: llmCallsResponse.data.llmCalls,
                agentCountByStatus: trafficManagerStatistics.agentStatisticsByType.agentCountByStatus,
                agentStatistics: MapSerializer.transformForSerialization(trafficManagerStatistics.agentStatisticsByStatus),
                engineerStatistics: engineerStatisticsResponse.data
            };
    
            await this.authenticatedApi.post(`http://${this.postOfficeUrl}/message`, {
                type: MessageType.STATISTICS,
                sender: this.id,
                recipient: 'user',
                clientId: clientId,
                content: missionStats
            });
    
            console.log(`Successfully sent statistics for mission ${missionId} to client ${clientId}`);
            return missionStats;
    
        } catch (error) {
            console.error(`Error fetching and pushing stats for mission ${missionId}:`, error instanceof Error ? error.message : error);
            if (error instanceof Error && error.stack) {
                console.error(error.stack);
            }
            return null;
        }
    }

    /**
     * Handle agent statistics updates from TrafficManager
     * @param req Request
     * @param res Response
     */
    private async handleAgentStatisticsUpdate(req: express.Request, res: express.Response) {
        try {
            const { agentId, missionId, statistics } = req.body;
            if (!uuidValidate(missionId)) {
                res.status(400).send({ error: 'Invalid missionId format' });
                return;
            }
            
            console.log(`Received statistics update for agent ${agentId} in mission ${missionId}. Triggering push to clients.`);
            console.log(`Agent ${agentId} statistics:`, JSON.stringify(statistics, null, 2));

            // Find the clients associated with this mission and push updated stats to them.
            const promises: Promise<any>[] = [];
            for (const [clientId, missionIds] of this.clientMissions.entries()) {
                if (missionIds.has(missionId)) {
                    console.log(`Found client ${clientId} for mission ${missionId}, queueing statistics update.`);
                    promises.push(this.fetchAndPushStatsForMission(missionId, clientId));
                }
            }

            // We don't need to wait for the pushes to complete to respond to the caller (e.g., TrafficManager)
            Promise.all(promises).catch(error => {
                console.error(`An error occurred during the async statistics push from handleAgentStatisticsUpdate for mission ${missionId}:`, error);
            });

            res.status(200).send({ message: 'Agent statistics update acknowledged and is being processed.' });
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error in handleAgentStatisticsUpdate:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to handle agent statistics update' });
        }
    }

    private async reflectOnMission(mission: Mission) {
        console.log(`Reflecting on mission ${mission.id}`);
        try {
            // 1. Gather context for reflection
            // Fetch plan history from TrafficManager
            let planHistory: any[] = [];
            try {
                const trafficManagerResponse = await this.authenticatedApi.get(`http://${this.trafficManagerUrl}/getAgentStatistics/${mission.id}`);
                const trafficManagerStatistics = trafficManagerResponse.data;

                if (trafficManagerStatistics.agentStatisticsByStatus instanceof Map) {
                    trafficManagerStatistics.agentStatisticsByStatus.forEach((agentList: AgentStatistics[]) => {
                        agentList.forEach((agentStat: any) => {
                            if (agentStat.steps && Array.isArray(agentStat.steps)) {
                                agentStat.steps.forEach((step: any) => {
                                    // Map TrafficManager's step format to ACCOMPLISH's expected plan step format
                                    planHistory.push({
                                        number: step.id, // Assuming step.id can serve as number
                                        actionVerb: step.verb,
                                        description: `Agent ${agentStat.id} executed ${step.verb} with status ${step.status}. Result: ${JSON.stringify(step.result)}`,
                                        inputs: {}, // TrafficManager stats don't easily provide original inputs
                                        outputs: { result: JSON.stringify(step.result) } // Use step.result as output
                                    });
                                });
                            }
                        });
                    });
                }
            } catch (error) {
                console.warn(`Failed to fetch agent statistics for plan history:`, error instanceof Error ? error.message : error);
                planHistory = [{ number: 0, description: "Could not retrieve detailed plan history.", actionVerb: "INITIALIZE", inputs: {}, outputs: {} }];
            }

            // Refine work_products
            const workProductsSummary = `Mission Goal: ${mission.goal}. Current Status: ${mission.status}.`;
            // TODO: Future enhancement: Fetch actual work products from Librarian based on mission.id or agent.id

            const inputValues = new Map<string, InputValue>();
            inputValues.set('missionId', { inputName: 'missionId', value: mission.id, valueType: PluginParameterType.STRING, args: {} });
            inputValues.set('plan_history', { inputName: 'plan_history', value: planHistory, valueType: PluginParameterType.ARRAY, args: {} });
            inputValues.set('work_products', { inputName: 'work_products', value: { summary: workProductsSummary }, valueType: PluginParameterType.OBJECT, args: {} });
            inputValues.set('question', { inputName: 'question', value: 'Given the original mission goal and the work completed, is the mission fully accomplished? If not, what is the next logical step?', valueType: PluginParameterType.STRING, args: {} });

            const serializedInputs = MapSerializer.transformForSerialization(inputValues);

            // 2. Call the REFLECT plugin - get capabilities manager URL dynamically
            const serviceUrls = await this.getServiceUrls();
            const response = await this.authenticatedApi.post(`http://${serviceUrls.capabilitiesManagerUrl}/executeAction`, {
                actionVerb: 'REFLECT',
                inputValues: serializedInputs,
                missionId: mission.id,
                dependencies: []
            });

            const result = response.data.result[0];

            // 3. Process the result
            if (result.name === 'plan') {
                console.log(`Reflection resulted in a new plan for mission ${mission.id}.`);
                // TODO: Implement logic to append the new plan to the mission and resume execution
                this.sendStatusUpdate(mission, `Reflection complete. New plan generated.`);
                mission.status = Status.RUNNING; // Or a new status like 'EXTENDING'
            } else if (result.name === 'answer') {
                console.log(`Reflection resulted in an answer for mission ${mission.id}: ${result.result}`);
                this.sendStatusUpdate(mission, `Reflection complete: ${result.result}`);
                mission.status = Status.COMPLETED;
            }

        } catch (error) {
            console.error(`Error during reflection for mission ${mission.id}:`, error instanceof Error ? error.message : error);
            mission.status = Status.ERROR;
            this.sendStatusUpdate(mission, 'Reflection process failed.');
        }
    }

    private async getAndPushAgentStatistics() {
        try {
            if (this.clientMissions.size === 0) {
                return;
            }
            console.log(`Periodic statistics fetch running for ${this.clientMissions.size} client(s).`);

            for (const [clientId, missionIds] of this.clientMissions.entries()) {
                for (const missionId of missionIds) {
                    const mission = this.missions.get(missionId);
                    if (!mission) {
                        continue;
                    }

                    // We need stats for running missions (to update UI) and for completed/errored missions (for reflection check).
                    if (mission.status === Status.RUNNING || mission.status === Status.COMPLETED || mission.status === Status.ERROR) {
                        const missionStats = await this.fetchAndPushStatsForMission(missionId, clientId);

                        // Check for reflection after sending statistics
                        if (missionStats && (mission.status === Status.COMPLETED || mission.status === Status.ERROR)) {
                            const runningAgents = missionStats.agentCountByStatus.RUNNING || 0;
                            if (runningAgents === 0) {
                                console.log(`Mission ${mission.id} has no running agents and is in status ${mission.status}. Initiating reflection.`);
                                mission.status = Status.REFLECTING; // Prevent re-triggering
                                this.reflectOnMission(mission);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            analyzeError(error as Error);
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

    private async addAttachedFile(req: express.Request, res: express.Response) {
        const { missionId } = req.params;
        const missionFile = req.body;

        const mission = this.missions.get(missionId);
        if (!mission) {
            return res.status(404).send({ error: 'Mission not found' });
        }

        if (!mission.attachedFiles) {
            mission.attachedFiles = [];
        }

        // Avoid duplicates
        if (!mission.attachedFiles.find(f => f.id === missionFile.id)) {
            mission.attachedFiles.push(missionFile);
            mission.updatedAt = new Date();
            await this.saveMissionState(mission);
            this.sendStatusUpdate(mission, `File ${missionFile.originalName} added`);
        }

        res.status(200).send({ status: 'File added' });
    }

    private async removeAttachedFile(req: express.Request, res: express.Response) {
        const { missionId } = req.params;
        const fileId = req.params.fileId || req.body.fileId;

        const mission = this.missions.get(missionId);
        if (!mission) {
            return res.status(404).send({ error: 'Mission not found' });
        }

        if (mission.attachedFiles) {
            const initialLength = mission.attachedFiles.length;
            const originalFile = mission.attachedFiles.find(f => f.id === fileId);
            mission.attachedFiles = mission.attachedFiles.filter(f => f.id !== fileId);
            if (mission.attachedFiles.length < initialLength) {
                mission.updatedAt = new Date();
                await this.saveMissionState(mission);
                this.sendStatusUpdate(mission, `File ${originalFile?.originalName || fileId} removed`);
            }
        }

        res.status(200).send({ status: 'File removed' });
    }

    private async listMissions(userId: string): Promise<Partial<Mission>[]> {
        try {
            console.log(`Listing all missions for user ${userId}`);

            // 1. Get missions from memory
            const inMemoryMissions = Array.from(this.missions.values());

            // 2. Get all missions from storage
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/queryData`, {
                params: {
                    collection: 'missions',
                    query: JSON.stringify({ userId: userId }) // Filter by user
                }
            });
            const storedMissions: Mission[] = response.data.data || [];

            // 3. Combine and deduplicate
            const allMissions = new Map<string, Mission>();
            for (const mission of inMemoryMissions) {
                if (mission.userId === userId) {
                    allMissions.set(mission.id, mission);
                }
            }
            for (const mission of storedMissions) {
                // In-memory version is likely more up-to-date
                if (!allMissions.has(mission.id)) {
                    allMissions.set(mission.id, mission);
                }
            }

            // 4. Format for output
            const missionList = Array.from(allMissions.values()).map(mission => ({
                id: mission.id,
                name: mission.name,
                status: mission.status,
                goal: mission.goal,
                createdAt: mission.createdAt,
                updatedAt: mission.updatedAt,
            }));

            console.log(`Found ${missionList.length} missions for user ${userId}`);
            return missionList;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error listing missions:', error instanceof Error ? error.message : error);
            // Return a mix of in-memory and potentially incomplete data if storage fails
            return Array.from(this.missions.values())
                .filter(m => m.userId === userId)
                .map(mission => ({
                    id: mission.id,
                    name: mission.name,
                    status: mission.status,
                    goal: mission.goal,
                    createdAt: mission.createdAt,
                    updatedAt: mission.updatedAt,
                }));
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
        console.log(`MissionControl: Resuming step ${stepId} for agent ${agentId} in mission ${missionId} with user input:`, userInput);
        try {
            // Send a message to the TrafficManager to forward the user input to the specific agent
            await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/message`, {
                type: MessageType.USER_INPUT_RESPONSE,
                sender: this.id,
                recipient: agentId, // Target the specific agent
                content: {
                    missionId: missionId,
                    stepId: stepId,
                    agentId: agentId,
                    response: userInput
                }
            });
            console.log(`MissionControl: Sent USER_INPUT_RESPONSE to TrafficManager for agent ${agentId}, step ${stepId}.`);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`MissionControl: Error resuming step ${stepId} with user input:`, error instanceof Error ? error.message : error);
        }
    }

}

new MissionControl();