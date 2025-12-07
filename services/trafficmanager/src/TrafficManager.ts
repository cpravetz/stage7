import express from 'express';
import { BaseEntity, AgentStatistics, MissionStatistics, MapSerializer } from '@cktmcs/shared';
import * as MessageModule from '@cktmcs/shared/dist/types/Message';
import { agentSetManager } from './utils/agentSetManager'; // Import the singleton instance

interface AgentLocation {
    agentId: string;
    agentSetUrl: string;
    status: string;
    timestamp: string;
}

interface StepLocation {
    stepId: string;
    agentId: string;
    agentSetUrl: string;
}

export class TrafficManager extends BaseEntity {
    private agentLocations: Map<string, AgentLocation> = new Map();
    private stepLocations: Map<string, StepLocation> = new Map();
    private detailedAgentStats: Map<string, AgentStatistics> = new Map(); // New map to store detailed agent statistics
    private app: express.Application;

    constructor() {
        super('trafficmanager', 'TrafficManager', process.env.HOST || 'trafficmanager', process.env.PORT || '5080');
        this.app = express();
        this.initializeServer();
    }

    private initializeServer(): void {
        this.app.use(express.json());

        this.app.post('/agent/status', (req, res) => {
            const { agentId, status, agentSetUrl } = req.body;
            if (!agentId || !status || !agentSetUrl) {
                return res.status(400).send({ error: 'agentId, status, and agentSetUrl are required' });
            }
            const location: AgentLocation = { agentId, status, agentSetUrl, timestamp: new Date().toISOString() };
            this.agentLocations.set(agentId, location);
            res.status(200).send({ message: 'Agent status updated' });
        });

        this.app.get('/agent/:agentId/location', (req, res) => {
            const { agentId } = req.params;
            const location = this.agentLocations.get(agentId);
            if (location) {
                res.status(200).send(location);
            } else {
                res.status(404).send({ error: 'Agent not found' });
            }
        });

        this.app.post('/step/location', (req, res) => {
            const { stepId, agentId, agentSetUrl } = req.body;
            if (!stepId || !agentId || !agentSetUrl) {
                return res.status(400).send({ error: 'stepId, agentId, and agentSetUrl are required' });
            }
            const location: StepLocation = { stepId, agentId, agentSetUrl };
            this.stepLocations.set(stepId, location);
            res.status(200).send({ message: 'Step location updated' });
        });

        this.app.get('/step/:stepId/location', (req, res) => {
            const { stepId } = req.params;
            const location = this.stepLocations.get(stepId);
            if (location) {
                res.status(200).send(location);
            } else {
                res.status(404).send({ error: 'Step not found' });
            }
        });

        this.app.get('/step/:stepId/location', (req, res) => {
            const { stepId } = req.params;
            const location = this.stepLocations.get(stepId);
            if (location) {
                res.status(200).send(location);
            } else {
                res.status(404).send({ error: 'Step not found' });
            }
        });

        // New endpoint to receive detailed agent statistics from AgentSet
        this.app.post('/agentStatisticsUpdate', (req, res) => {
            const { agentId, status, statistics } = req.body;
            if (!agentId || !status || !statistics) {
                return res.status(400).send({ error: 'agentId, status, and statistics are required' });
            }
            // Update the detailedAgentStats map
            this.detailedAgentStats.set(agentId, statistics);
            res.status(200).send({ message: 'Detailed agent statistics updated' });
        });

        this.app.post('/createAgent', async (req, res) => {
            try {
                const { agentId, actionVerb, inputs, missionId, missionContext } = req.body;
                const response = await agentSetManager.assignAgentToSet(agentId, actionVerb, inputs, missionId, missionContext);
                res.status(200).send(response);
            } catch (error) {
                console.error('Error creating agent:', error);
                res.status(500).send({ error: 'Failed to create agent' });
            }
        });

        this.app.get('/getAgentStatistics/:missionId', async (req, res) => {
            try {
                const { missionId } = req.params;
                const agentSetManagerStats = await agentSetManager.getAgentStatistics(missionId);

                // Map AgentSetManagerStatistics to MissionStatistics
                const missionStats: MissionStatistics = {
                    llmCalls: 0, // Default or retrieve from other sources if available
                    activeLLMCalls: 0, // Default or retrieve from other sources if available
                    agentCountByStatus: agentSetManagerStats.agentStatisticsByType.agentCountByStatus,
                    agentStatistics: agentSetManagerStats.agentsByStatus, 
                    engineerStatistics: { newPlugins: [] } // Default or retrieve from other sources if available
                };

                console.log(`TrafficManager: Retrieved and mapped mission statistics for mission ${missionId}`);
                res.status(200).send(MapSerializer.transformForSerialization(missionStats)); // Send the missionStats object directly
            } catch (error) {
                console.error('Error getting agent statistics:', error);
                res.status(500).send({ error: 'Failed to get agent statistics' });
            }
        });

        this.app.listen(this.port, () => {
            console.log(`TrafficManager running on ${this.url}`);
        });
    }

    // Override handleBaseMessage to include AGENT_UPDATE handling
    async handleBaseMessage(message: any): Promise<void> {
        // Log the message receipt
        console.log(`${this.componentType} handling message of type ${message.type} from ${message.sender}`);

        if (message.type === MessageModule.MessageType.AGENT_UPDATE) {
            const { agentId, status, statistics } = message.content;
            if (agentId && status && statistics) {
                this.detailedAgentStats.set(agentId, statistics);
                console.log(`TrafficManager: Updated detailed statistics for agent ${agentId} via RabbitMQ.`);
            } else {
                console.warn(`TrafficManager: Received incomplete AGENT_UPDATE message via RabbitMQ: ${JSON.stringify(message)}`);
            }
            return; // Handled, so return
        }

        // For all other message types, call the base class handler
        await super.handleBaseMessage(message);
    }
}

new TrafficManager();
