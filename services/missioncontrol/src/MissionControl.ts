import axios from 'axios';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { Mission, Status } from '@cktmcs/shared';
import { generateGuid } from './utils/generateGuid';
import { BaseEntity, TrafficManagerStatistics, MissionStatistics, MessageType, PluginInput } from '@cktmcs/shared';
import { verifyToken } from '@cktmcs/shared';

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
    

    constructor() {
        super(generateGuid(), 'MissionControl', process.env.HOST || 'missioncontrol', process.env.PORT || '5050');
        this.initializeServer();
        setInterval(() => this.getAndPushAgentStatistics(), 5000);
    }

    private initializeServer() {
        const app = express();
        app.use(express.json());
        app.use((req: Request, res: Response, next: NextFunction) => {
            verifyToken(req, res, next);
        });

        app.post('/message', (req, res) => this.handleMessage(req, res));

        app.listen(this.port, () => {
            console.log(`MissionControl is running on port ${this.port}`);
        });
    }

    private async handleMessage(req: express.Request, res: express.Response) {
        const { type, sender, content, clientId, user } = req.body;
        const missionId = req.body.missionId ? req.body.missionId : (req.body.content.missionId ? req.body.content.missionId : null);
        console.log(`Received message of type ${type} from ${sender} for mission ${missionId}`);
        const mission = missionId ? this.missions.get(missionId) : null;

        try {
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
                    if (mission) {
                        const missionName = req.body.missionName ? req.body.missionName : (mission.name ? mission.name : `mission ${new Date()}`);
                        await this.saveMission(missionId, missionName);
                    }
                    break;
                case MessageType.LOAD:
                    await this.loadMission(missionId, clientId, user.id);
                    break;
                default:
                    console.log(`Unhandled message type: ${type}`);
            }
            res.status(200).send({ message: 'Message processed successfully' });
        } catch (error) {
            console.error('Error processing message:', error);
            res.status(500).send({ error: 'Internal server error' });
        }
    }

    private async createMission(content: any, clientId: string, userId: string) {
        this.logAndSay(`Creating mission with goal: ${content.goal}`);
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
            const inputs: Object = { goal: {inputName: 'goal', inputValue: mission.goal, args: {} }};
            await api.post(`http://${this.trafficManagerUrl}/createAgent`, { actionVerb: 'ACCOMPLISH', inputs, missionId: mission.id, dependencies: [] });
            mission.status = Status.RUNNING;
            this.sendStatusUpdate(mission, 'Mission started');
        } catch (error) {
            console.error('Error starting mission:', error);
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
        } catch (error) {
            console.error('Error loading mission:', error);
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
        } catch (error) {
            console.error('Error saving mission:', error);
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
        } catch (error) {
            console.error('Error saving mission state:', error);
            throw error;
        }
    }

    private async loadMissionState(missionId: string): Promise<Mission | null> {
        try {
            const response = await api.get(`http://${this.librarianUrl}/loadData/${missionId}?storageType=mongo?collection=missions`);
            return response.data;
        } catch (error) {
            console.error('Error loading mission state:', error);
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
                    console.error(`Error sending status update to client ${clientId}:`, error);
                });
            }
        }
    }

    private async getAndPushAgentStatistics() {
        try {
            const [llmCallsResponse, engineerStatisticsResponse] = await Promise.all([
                api.get(`http://${this.brainUrl}/getLLMCalls`),
                api.get(`http://${this.engineerUrl}/statistics`)
            ]);

            for (const [clientId, missionIds] of this.clientMissions.entries()) {
                for (const missionId of missionIds) {
                    const mission = this.missions.get(missionId);
                    if (!mission) continue;

                    const trafficManagerResponse = await api.get(`http://${this.trafficManagerUrl}/getAgentStatistics/${missionId}`);
                    const trafficManagerStatistics: TrafficManagerStatistics = trafficManagerResponse.data;

                    const missionStats: MissionStatistics = {
                        llmCalls: llmCallsResponse.data.llmCalls,
                        agentCountByStatus: trafficManagerStatistics.agentStatisticsByType.agentCountByStatus,
                        runningAgents: trafficManagerStatistics.runningAgentStatistics.runningAgents,
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
        } catch (error) {
            console.error('Error fetching and pushing agent statistics:', error);
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
}

new MissionControl();