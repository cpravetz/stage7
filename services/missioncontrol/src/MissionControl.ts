import axios from 'axios';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { AgentStatistics, Mission, Status } from '@cktmcs/shared';
import { generateGuid } from './utils/generateGuid';
import { BaseEntity, MessageType, PluginInput, MapSerializer } from '@cktmcs/shared';
import { MissionStatistics } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { rateLimit } from 'express-rate-limit';
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';

interface CustomRequest extends Request {
    user?: {
      id?: string;
      iat?: number;
      exp?: number;
      // Add any other properties that might be in the user object
    };
  }

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
});

class MissionControl extends BaseEntity {
    private missions: Map<string, Mission> = new Map();
    private clientMissions: Map<string, Set<string>> = new Map();
    private trafficManagerUrl: string = process.env.TRAFFIC_MANAGER_URL || 'trafficmanager:5080';
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private brainUrl: string = process.env.BRAIN_URL || 'brain:5060';
    private engineerUrl: string = process.env.ENGINEER_URL || 'engineer:5050';
    private securityManagerUrl: string = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010';

    constructor() {
        super('MissionControl', 'MissionControl', process.env.HOST || 'missioncontrol', process.env.PORT || '5050');
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

        app.use((req: Request, res: Response, next: NextFunction) => {this.verifyToken(req, res, next)});

        app.post('/message', (req, res) => this.handleMessage(req, res));

        app.listen(this.port, () => {
            console.log(`MissionControl is running on port ${this.port}`);
        });
    }

    private async handleMessage(req: express.Request, res: express.Response) {
        try {
            await this.processMessage(req.body, (req as any).user);
            res.status(200).send({ message: 'Message processed successfully' });
        } catch (error) { analyzeError(error as Error);
            console.error('Error processing message:', error instanceof Error ? error.message : error);
            res.status(502).send({ error: 'Internal server error' });
        }
    }

    // Override the handleQueueMessage method from BaseEntity
    protected async handleQueueMessage(message: any) {
        try {
            // For queue messages, we don't have user info from JWT
            // We'll need to handle authorization differently or get user info another way
            const userId = message.userId || 'system';
            const user = { id: userId };

            await this.processMessage(message, user);
            console.log(`Queue message of type ${message.type} processed successfully`);
        } catch (error) { analyzeError(error as Error);
            console.error('Error processing queue message:', error instanceof Error ? error.message : error);
        }
    }

    // Common message processing logic for both HTTP and queue messages
    private async processMessage(message: any, user: any) {
        const { type, sender, content, clientId } = message;
        console.log(`user: `, user);
        const missionId = message.missionId ? message.missionId : (message.content?.missionId ? message.content.missionId : null);
        console.log(`Processing message of type ${type} from ${sender} for mission ${missionId}`);

        switch (type) {
            case MessageType.CREATE_MISSION:
                await this.createMission(content, clientId, user.id);
                break;
            case MessageType.PAUSE:
                if (missionId) {
                    await this.pauseMission(missionId);
                }
                break;
            case MessageType.RESUME:
                if (missionId) {
                    await this.resumeMission(missionId);
                }
                break;
            case MessageType.ABORT:
                if (missionId) {
                    await this.abortMission(missionId);
                }
                break;
            case MessageType.SAVE:
                const mission = missionId ? this.missions.get(missionId) : null;
                if (mission) {
                    const missionName = message.missionName ? message.missionName : (mission.name ? mission.name : `mission ${new Date()}`);
                    await this.saveMission(missionId, missionName);
                }
                break;
            case MessageType.LOAD:
                await this.loadMission(missionId, clientId, user.id);
                break;
            case MessageType.USER_MESSAGE:
                await this.handleUserMessage(content, clientId, missionId);
                break;
            default:
                // Call the base class handler for standard message types
                await super.handleBaseMessage(message);
        }
    }

    private async createMission(content: any, clientId: string, userId: string) {
        this.logAndSay(`Creating mission with goal: ${content.goal}`);

        // Clear action plan cache before creating new mission
        await this.clearActionPlanCache();

        const mission: Mission = {
            id: generateGuid(),
            userId: userId,
            name: content.name,
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

        try {
            const inputs = new Map<string, PluginInput>();
            inputs.set('goal', {
                inputName: 'goal',
                inputValue: mission.goal,
                args: {}
            });
            console.log('Serializing inputs: ', inputs);
            console.log('Serialized: ', MapSerializer.transformForSerialization(inputs));
            await api.post(`http://${this.trafficManagerUrl}/createAgent`, { actionVerb: 'ACCOMPLISH',
                inputs: MapSerializer.transformForSerialization(inputs),
                missionId: mission.id,
                dependencies: [] });
            mission.status = Status.RUNNING;
            this.sendStatusUpdate(mission, 'Mission started');
        } catch (error) { analyzeError(error as Error);
            console.error('Error starting mission:', error instanceof Error ? error.message : error);
            mission.status = Status.ERROR;
            this.sendStatusUpdate(mission, 'Error starting mission');
        }
    }

    private async pauseMission(missionId: string) {
        console.log(`in Mission.pauseMission() for mission: ${missionId}`);
        const mission = this.missions.get(missionId);
        if (mission) {
            mission.status = Status.PAUSED;
            await api.post(`http://${this.trafficManagerUrl}/pauseAgents`, { missionId: missionId });
            this.sendStatusUpdate(mission, 'Mission paused');
        } else {
            console.error('Mission to pause not found:', missionId);
        }
    }

    private async clearActionPlanCache() {
        try {
            await api.delete(`http://${this.librarianUrl}/deleteCollection`, {
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
            await api.post(`http://${this.trafficManagerUrl}/resumeAgents`, { missionId: missionId });
            this.sendStatusUpdate(mission, 'Mission resumed');
        } else {
            console.error('Mission to resume not found:', missionId);
        }
    }

    private async abortMission(missionId: string) {
        const mission = this.missions.get(missionId);
        if (mission) {
            mission.status = Status.ABORTED;
            await api.post(`http://${this.trafficManagerUrl}/abortAgents`, { missionId: missionId });
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
            const mission = await this.loadMissionState(missionId);
            if (!mission) {
                console.error('Mission not found:', missionId);
                return;
            }
            if (mission.userId !== userId) {
                console.error('User not authorized to load this mission');
                return;
            }

            this.missions.set(missionId, mission);
            await api.post(`http://${this.trafficManagerUrl}/loadAgents`, { missionId });
            this.addClientMission(clientId, missionId);
            console.log(`Mission loaded: ${missionId}, Name: ${mission.name || 'Unnamed'}, Client: ${clientId}`);
            this.sendStatusUpdate(mission, `Mission loaded: ${mission.name || 'Unnamed'}`);
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading mission:', error instanceof Error ? error.message : error);
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
            await api.post(`http://${this.trafficManagerUrl}/saveAgents`, { missionId });
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
            await api.post(`http://${this.trafficManagerUrl}/distributeUserMessage`, {
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
            await api.post(`http://${this.librarianUrl}/storeData`, {
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
            const response = await api.get(`http://${this.librarianUrl}/loadData/${missionId}`, {
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
                api.post(`http://${this.postOfficeUrl}/message`, {
                    type: MessageType.STATUS_UPDATE,
                    sender: this.id,
                    recipient: 'user',
                    clientId: clientId,
                    data: statusUpdate
                }).catch(error => {
                    console.error(`Error sending status update to client ${clientId}:`, error instanceof Error ? error.message : error);
                });
            }
        }
    }

    private async getAndPushAgentStatistics() {
        try {
            const [llmCallsResponse, engineerStatisticsResponse] = await Promise.all([
                api.get(`http://${this.brainUrl}/getLLMCalls`).catch(error => {
                    console.warn('Failed to fetch LLM calls:', error instanceof Error ? error.message : error);
                    return { data: { llmCalls: null } };
                }),
                this.authenticatedApi.get(`http://${this.engineerUrl}/statistics`).catch((error: any) => {
                    console.warn('Failed to fetch engineer statistics:', error instanceof Error ? error.message : error);
                    return { data: null };
                })
            ]);

            for (const [clientId, missionIds] of this.clientMissions.entries()) {
                for (const missionId of missionIds) {
                    const mission = this.missions.get(missionId);
                    if (!mission) continue;

                    const trafficManagerResponse = await api.get(`http://${this.trafficManagerUrl}/getAgentStatistics/${missionId}`);
                    const trafficManagerStatistics = trafficManagerResponse.data;
                    trafficManagerStatistics.agentStatisticsByStatus = MapSerializer.transformFromSerialization(trafficManagerStatistics.agentStatisticsByStatus);

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

                    await api.post(`http://${this.postOfficeUrl}/message`, {
                        type: MessageType.STATISTICS,
                        sender: this.id,
                        recipient: 'user',
                        clientId: clientId,
                        content: missionStats
                    });
                }
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Error fetching and pushing agent statistics:', error instanceof Error ? error.message : error);
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

    private async verifyToken(req: CustomRequest, res: Response, next: NextFunction) {
        const clientId = req.body.clientId || req.query.clientId;
        const token = req.headers.authorization?.split(' ')[1];
        console.log(`Verifying token for client ${clientId}`);
        console.log(`Token: ${token}`);

        if (!token) {
            console.log('No token provided');
            return res.status(401).json({ message: 'No token provided' });
        }

        try {
            // Try multiple verification methods in sequence

            // 1. First try to verify locally using the public key from file
            try {
                // Try public.key first
                const publicKeyPath = path.join(__dirname, '../../../shared/keys/public.key');
                if (fs.existsSync(publicKeyPath)) {
                    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
                    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
                    console.log('Token verified locally with public.key');
                    req.user = decoded;
                    return next();
                }

                // Try public.pem if public.key doesn't exist
                const publicPemPath = path.join(__dirname, '../../../shared/keys/public.pem');
                if (fs.existsSync(publicPemPath)) {
                    const publicKey = fs.readFileSync(publicPemPath, 'utf8');
                    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
                    console.log('Token verified locally with public.pem');
                    req.user = decoded;
                    return next();
                }
            } catch (localError) {
                console.log('Local verification with file failed:', localError.message);
            }

            // 2. Try to fetch the public key from SecurityManager and verify
            try {
                const keyResponse = await axios.get(`http://${this.securityManagerUrl}/public-key`);
                const publicKey = keyResponse.data;

                // Save the key for future use
                try {
                    const keysDir = path.join(__dirname, '../../../shared/keys');
                    if (!fs.existsSync(keysDir)) {
                        fs.mkdirSync(keysDir, { recursive: true });
                    }
                    fs.writeFileSync(path.join(keysDir, 'public.key'), publicKey);
                } catch (saveError) {
                    console.warn('Failed to save public key:', saveError.message);
                }

                // Verify with the fetched key
                const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
                console.log('Token verified with fetched public key');
                req.user = decoded;
                return next();
            } catch (fetchError) {
                console.log('Verification with fetched key failed:', fetchError.message);
            }

            // 3. Fall back to SecurityManager verification endpoint
            try {
                const response = await axios.post(`http://${this.securityManagerUrl}/verify`, {}, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.data.valid) {
                    console.log('Token verified by SecurityManager');
                    req.user = response.data.user;
                    return next();
                } else {
                    console.log('Token rejected by SecurityManager:', response.data.error);
                    return res.status(401).json({ message: 'Invalid token' });
                }
            } catch (verifyError) {
                console.error('SecurityManager verification failed:', verifyError.message);
                if (axios.isAxiosError(verifyError)) {
                    console.error('Response data:', verifyError.response?.data);
                    console.error('Response status:', verifyError.response?.status);
                }
            }

            // 4. Try legacy verification with shared secret
            try {
                const sharedSecret = process.env.JWT_SECRET || 'stage7AuthSecret';
                const decoded = jwt.verify(token, sharedSecret);
                console.log('Token verified with legacy shared secret');
                req.user = decoded;
                return next();
            } catch (legacyError) {
                console.log('Legacy verification failed:', legacyError.message);
            }

            // All verification methods failed
            console.error('All token verification methods failed');
            return res.status(401).json({ message: 'Invalid token' });
        } catch (error) {
            console.error(`Unexpected error verifying token for client ${clientId}:`, error);
            return res.status(500).json({ message: 'Error verifying token' });
        }
    }
}

new MissionControl();