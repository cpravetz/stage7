import express from 'express';
import { Agent } from './agents/Agent';
import { MapSerializer, BaseEntity } from '@cktmcs/shared';
import { v4 as uuidv4 } from 'uuid';
import { AgentSetStatistics, AgentStatistics, PluginInput } from '@cktmcs/shared';
import { AgentPersistenceManager } from './utils/AgentPersistenceManager';
import { analyzeError } from '@cktmcs/errorhandler';
import { setInterval } from 'timers';

const app = express();

export class AgentSet extends BaseEntity {
    agents: Map<string, Agent> = new Map(); // Store agents by their ID
    maxAgents: number = 10; // Example limit for agents in this set
    persistenceManager: AgentPersistenceManager = new AgentPersistenceManager();

    constructor() {
        super(uuidv4(), 'AgentSet', process.env.HOST || 'agentset', process.env.PORT || '9000');
        this.initializeServer();
        setInterval(() => {
            if (global.gc) {
                global.gc();
            }
        }, 5 * 60 * 1000);
    }


    // Initialize Express server to manage agent lifecycle
    private initializeServer() {
        app.use(express.json());

        app.post('/message', (req, res) => this.handleMessage(req, res));

        // Add a new agent to the set
        app.post('/addAgent', (req, res) => this.addAgent(req, res));

        app.post('/agent/:agentId/message', (req, res) => this.handleAgentMessage(req, res));
        
        app.get('/agent/:agentId/output', (req, res) => this.getAgentOutput(req, res));

        // Pause mission agents
        app.post('/pauseAgents', async (req, res) => {
            const { missionId } = req.body;
            console.log(`Agentset Pausing agents for mission ${missionId}`);
            const agents = Array.from(this.agents.values()).filter(agent => agent.getMissionId() === missionId);
            console.log(`Agentset Pausing ${agents.length}agents for mission ${missionId}`);
            for (const agent of agents) {
                await agent.pause();
            }
            res.status(200).send({ message: 'All agents paused' });
        });

        // Resume mission agents
        app.post('/resumeAgents', async (req, res) => {
            const { missionId } = req.body;
            console.log(`Agentset Resuming agents for mission ${missionId}`);
            const agents = Array.from(this.agents.values()).filter(agent => agent.getMissionId() === missionId);
            for (const agent of agents) {
                await agent.resume();
            }
            res.status(200).send({ message: 'All agents resumed' });
        });

        app.post('/resumeAgent', async (req, res) => {
            const { agentId } = req.body;
            console.log(`Agentset Resuming agent ${agentId}`);
            const agent = this.agents.get(agentId);
            if (agent) {
                await agent.resume();
                res.status(200).send({ message: `Agent resumed` });
            } else {
                res.status(404).send({ error: 'Agent not found' });
            }
        });

        // Abort mission agents
        app.post('/abortAgent', async (req, res) => {
            const { agentId } = req.body;
            console.log(`Agentset Aborting agent ${agentId}`);
            const agent = this.agents.get(agentId);
            if (agent) {
                await agent.abort();
                res.status(200).send({ message: `Agent aborted` });
            } else {
                res.status(404).send({ error: 'Agent not found' });
            }
        });

        app.get('/statistics/:missionId', (req, res) => { this.getAgentStatistics(req, res) });
        app.post('/updateFromAgent', (req, res) => { this.updateFromAgent(req, res) });
        app.get('/agent/:agentId/output', async (req, res) => {
            const { agentId } = req.params;
            const agent = this.agents.get(agentId);

            if (!agent) {
                res.status(404).send({ error: `Agent with id ${agentId} not found` });
            }
            else {
                try {
                    const output = await agent.getOutput();
                    res.status(200).send({ output });
                } catch (error) { analyzeError(error as Error);
                    console.error('Error fetching output for agent %s:', agentId, error instanceof Error ? error.message : error);
                    res.status(500).send({ error: `Failed to fetch output for agent ${agentId}` });
                }
            }
        });


        app.post('/saveAgent', async (req, res) => {
            const { agentId } = req.body;
            try {
                const agent = this.agents.get(agentId);
                if (!agent) {
                    res.status(404).send({ error: 'Agent not found' });
                    return;
                }
                await agent.saveAgentState();
                res.status(200).send({ message: 'Agent saved successfully', agentId: agent.id });
            } catch (error) { analyzeError(error as Error);
                console.error('Error saving agent:', error instanceof Error ? error.message : error);
                res.status(500).send({ error: 'Failed to save agent' });
            }
        });

        app.listen(this.port, () => {
            console.log(`AgentSet application running on ${this.url}`);
        });

    }

    private async addAgent(req: express.Request, res: express.Response) {
        const { agentId, actionVerb, inputs, missionId, missionContext } = req.body;
        console.log('Adding agent with req.body', req.body);
        console.log('Adding agent with inputs', inputs);
        let inputsMap: Map<string, PluginInput>;
        
        if (inputs?._type === 'Map') {
            inputsMap = MapSerializer.transformFromSerialization(inputs);
        }else {
            if (inputs instanceof Map) {
                inputsMap = inputs;
            } else {
                inputsMap = new Map();
                for (const [key, value] of Object.entries(inputs)) {
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
        }
        console.log(`addAgent provided inputs:`, inputs);
        console.log(`addAgent inputsMap:`, inputsMap);
        const agentConfig = { 
            actionVerb, 
            inputs: inputsMap, 
            missionId, 
            missionContext,
            id: agentId, 
            postOfficeUrl: this.postOfficeUrl,
            agentSetUrl: this.url
        };
        const newAgent = new Agent(agentConfig);
        this.agents.set(newAgent.id, newAgent);

        res.status(200).send({ message: 'Agent added', agentId: newAgent.id });
    }

    private async handleAgentMessage(req: express.Request, res: express.Response) {
        const { agentId } = req.params;
        const message = req.body;
        const agent = this.agents.get(agentId);

        if (agent) {
            try {
                await agent.handleMessage(message);
                res.status(200).send({ status: 'Message delivered to agent' });
            } catch (error) { analyzeError(error as Error);
                console.error('Error delivering message to agent %s:', agentId, error instanceof Error ? error.message : error);
                res.status(500).send({ error: 'Failed to deliver message to agent' });
            }
        } else {
            res.status(404).send({ error: 'Agent not found' });
        }
    }

    private async getAgentOutput(req: express.Request, res: express.Response) {
        const { agentId } = req.params;
        const agent = this.agents.get(agentId);

        if (agent) {
            try {
                const output = await agent.getOutput();
                res.status(200).send(output);
            } catch (error) { analyzeError(error as Error);
                console.error('Error fetching output for agent %s:', agentId, error instanceof Error ? error.message : error);
                res.status(500).send({ error: 'Failed to fetch agent output' });
            }
        } else {
            res.status(404).send({ error: 'Agent not found' });
        }
    }

    private async handleMessage(req: express.Request, res: express.Response) {
        const message = req.body;
        await super.handleBaseMessage(message);

        if (message.forAgent) {
          const agentId = message.forAgent;
          const agent = this.agents.get(agentId);
    
          if (agent) {
            try {
                await agent.handleMessage(message);
                res.status(200).send({ status: 'Message delivered to agent' });
            } catch (error) { analyzeError(error as Error);
                console.error('Error delivering message to agent %s:', agentId, error instanceof Error ? error.message : error);
                res.status(500).send({ error: 'Failed to deliver message to agent' });
            }
          } else {
            res.status(404).send({ error: `Agent ${agentId} not found in this AgentSet` });
          }
        } else {
            const { missionId } = req.body.content.missionId;
            const agents = Array.from(this.agents.values()).filter(agent => agent.getMissionId() === missionId);
            for (const agent of agents) {
                await agent.handleMessage(message);
            }

          // Handle messages for the AgentSet itself
          console.log('Processing message in AgentSet');
          res.status(200).send({ status: 'Message received and processed by AgentSet' });
        }
    }

    private async getAgentStatistics(req: express.Request, res: express.Response) {
        const { missionId } = req.params;
        if (!missionId) {
            console.log(`AgentSet:Missing missionId parameter`);
            return res.status(400).send('Missing missionId parameter');
        }
    
        let stats  : AgentSetStatistics = {
            agentsByStatus: new Map(),
            agentsCount: 0
        };
        console.log(`AgentSet:Getting statistics for mission ${missionId}`);

        for (const agent of this.agents.values()) {
            if (agent.getMissionId() === missionId) {
                const status = agent.getStatus();
                const agentStats = await agent.getStatistics();
                //console.log(`AgentSet:Agent `,agent.id,` has stats `, agentStats);
                if (!stats.agentsByStatus.has(status)) {
                    // If the status doesn't exist in the Map, create a new array with this agent's stats
                    stats.agentsByStatus.set(status, [agentStats]);
                } else {
                    // If the status already exists, append this agent's stats to the existing array
                    stats.agentsByStatus.get(status)!.push(agentStats);
                }
                stats.agentsCount++;
            }
        }
        const serializedStats = {
            agentsByStatus: MapSerializer.transformForSerialization(stats.agentsByStatus),
            agentsCount: stats.agentsCount
        };
        
        //console.log(`AgentSet:Sending statistics for mission ${missionId}`, JSON.stringify(serializedStats, null, 2));
        res.status(200).send(serializedStats);
    }

        private updateFromAgent(req: express.Request, res: express.Response) {
            const { agentId, status } = req.body;
            const agent = this.agents.get(agentId);
            if (agent) {
                agent.saveAgentState();
                res.status(200).send({ message: 'Agent updated' });
            } else {
                res.status(201).send({ error: 'Agent not found' });
            }
        }
}

new AgentSet(); // Start the AgentSet application
