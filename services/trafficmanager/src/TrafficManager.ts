import express from 'express';
import { BaseEntity, createAuthenticatedAxios } from '@cktmcs/shared';

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

        this.app.listen(this.port, () => {
            console.log(`TrafficManager running on ${this.url}`);
        });
    }
}

new TrafficManager();
