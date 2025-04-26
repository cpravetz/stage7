import express from 'express';
import { Agent } from './agents/Agent';
import { MapSerializer, BaseEntity } from '@cktmcs/shared';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { AgentSetStatistics, PluginInput } from '@cktmcs/shared';
import { AgentPersistenceManager } from './utils/AgentPersistenceManager';
import { analyzeError } from '@cktmcs/errorhandler';
import { setInterval } from 'timers';
import { AgentLifecycleManager } from './lifecycle/AgentLifecycleManager';
import { CollaborationManager } from './collaboration/CollaborationManager';
import { SpecializationFramework } from './specialization/SpecializationFramework';
import { DomainKnowledge } from './specialization/DomainKnowledge';

export class AgentSet extends BaseEntity {
    agents: Map<string, Agent> = new Map(); // Store agents by their ID
    maxAgents: number = 10; // Example limit for agents in this set
    persistenceManager: AgentPersistenceManager;
    private trafficManagerUrl: string = process.env.TRAFFICMANAGER_URL || 'trafficmanager:5080';
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private brainUrl: string = process.env.BRAIN_URL || 'brain:5070';
    private app: express.Application;


    // Agent systems
    private lifecycleManager: AgentLifecycleManager;
    private collaborationManager: CollaborationManager;
    private specializationFramework: SpecializationFramework;
    private domainKnowledge: DomainKnowledge;

    constructor() {
        // Use a fixed ID for the AgentSet to avoid multiple registrations
        super('primary-agentset', 'AgentSet', process.env.HOST || 'agentset', process.env.PORT || '5100');

        // Initialize Express app
        this.app = express();

        // Initialize persistence manager with authenticated API
        this.persistenceManager = new AgentPersistenceManager(this.librarianUrl, this.authenticatedApi);

        // Initialize agent systems
        this.lifecycleManager = new AgentLifecycleManager(this.persistenceManager, this.trafficManagerUrl);
        this.collaborationManager = new CollaborationManager(
            this.agents,
            this.librarianUrl,
            this.trafficManagerUrl,
            this.brainUrl,
            this.authenticatedApi
        );
        this.specializationFramework = new SpecializationFramework(this.agents, this.librarianUrl, this.brainUrl);
        const knowledgeDomainsArray = this.specializationFramework.getAllKnowledgeDomains();
        const knowledgeDomainsMap = new Map(knowledgeDomainsArray.map(domain => [domain.id, domain]));
        this.domainKnowledge = new DomainKnowledge(knowledgeDomainsMap, this.librarianUrl, this.brainUrl);

        this.initializeServer();

        // Set up garbage collection
        setInterval(() => {
            if (global.gc) {
                global.gc();
            }
        }, 5 * 60 * 1000);

        // Log that we're using a fixed ID
        console.log(`AgentSet initialized with fixed ID: primary-agentset`);
    }


    // Initialize Express server to manage agent lifecycle
    private initializeServer() {
        // Add health check endpoints directly to the app
        this.app.get('/healthy', (req: express.Request, res: express.Response) => {
            console.log('Received request to /healthy endpoint');
            res.status(200).json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                message: 'AgentSet service is running'
            });
        });

        this.app.get('/health', (req: express.Request, res: express.Response) => {
            console.log('Received request to /health endpoint');
            res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                message: 'AgentSet service is healthy',
                agentCount: this.agents.size
            });
        });

        this.app.get('/ready', (req: express.Request, res: express.Response) => {
            console.log('Received request to /ready endpoint');
            res.status(200).json({
                ready: true,
                timestamp: new Date().toISOString(),
                message: 'AgentSet service is ready',
                registeredWithPostOffice: this.registeredWithPostOffice
            });
        });

        // Apply JSON parsing middleware
        this.app.use(express.json());

        // Apply authentication middleware to all routes
        // The BaseEntity.verifyToken method already handles skipping authentication for health check endpoints
        this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => this.verifyToken(req, res, next));

        this.app.post('/message', (req: express.Request, res: express.Response) => this.handleMessage(req, res));

        // Add a new agent to the set
        this.app.post('/addAgent', (req: express.Request, res: express.Response) => this.addAgent(req, res));

        this.app.post('/agent/:agentId/message', (req: express.Request, res: express.Response) => this.handleAgentMessage(req, res));

        this.app.get('/agent/:agentId', (req: express.Request, res: express.Response) => this.getAgent(req, res));

        this.app.get('/agent/:agentId/output', (req: express.Request, res: express.Response) => this.getAgentOutput(req, res));

        // Pause mission agents
        this.app.post('/pauseAgents', async (req: express.Request, res: express.Response) => {
            const { missionId } = req.body;
            console.log(`Agentset Pausing agents for mission ${missionId}`);
            const agents = Array.from(this.agents.values()).filter(agent => agent.getMissionId() === missionId);
            console.log(`Agentset Pausing ${agents.length}agents for mission ${missionId}`);
            for (const agent of agents) {
                await agent.pause();
            }
            res.status(200).send({ message: 'All agents paused' });
        });

        // ===== Agent Lifecycle Management Endpoints =====

        // Pause an agent
        this.app.post('/agent/:agentId/pause', async (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                await this.lifecycleManager.pauseAgent(agentId);
                res.status(200).send({ message: `Agent ${agentId} paused` });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Resume an agent
        this.app.post('/agent/:agentId/resume', async (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                await this.lifecycleManager.resumeAgent(agentId);
                res.status(200).send({ message: `Agent ${agentId} resumed` });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Create a checkpoint for an agent
        this.app.post('/agent/:agentId/checkpoint', async (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                await this.lifecycleManager.createCheckpoint(agentId);
                res.status(200).send({ message: `Checkpoint created for agent ${agentId}` });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Create a new version of an agent
        this.app.post('/agent/:agentId/version', async (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                const { description, changes } = req.body;
                const version = await this.lifecycleManager.createVersion(agentId, description, changes);
                res.status(200).send({ version });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Restore an agent to a specific version
        this.app.post('/agent/:agentId/restore/:version', async (req: express.Request, res: express.Response) => {
            try {
                const { agentId, version } = req.params;
                await this.lifecycleManager.restoreVersion(agentId, version);
                res.status(200).send({ message: `Agent ${agentId} restored to version ${version}` });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Migrate an agent to another agent set
        this.app.post('/agent/:agentId/migrate', async (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                const { targetAgentSetUrl } = req.body;
                await this.lifecycleManager.migrateAgent(agentId, targetAgentSetUrl);
                res.status(200).send({ message: `Agent ${agentId} migrated to ${targetAgentSetUrl}` });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Get lifecycle events for an agent
        this.app.get('/agent/:agentId/lifecycle/events', (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                const events = this.lifecycleManager.getLifecycleEvents(agentId);
                res.status(200).send({ events });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Get versions for an agent
        this.app.get('/agent/:agentId/versions', (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                const versions = this.lifecycleManager.getAgentVersions(agentId);
                res.status(200).send({ versions });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Get diagnostics for an agent
        this.app.get('/agent/:agentId/diagnostics', (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                const diagnostics = this.lifecycleManager.getAgentDiagnostics(agentId);
                res.status(200).send({ diagnostics });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Get all agent diagnostics
        this.app.get('/diagnostics', (_req: express.Request, res: express.Response) => {
            try {
                const diagnostics = this.lifecycleManager.getAllAgentDiagnostics();
                res.status(200).send({ diagnostics });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // ===== Agent Collaboration Endpoints =====

        // Delegate a task to an agent
        this.app.post('/delegateTask', async (req: express.Request, res: express.Response) => {
            try {
                const { delegatorId, recipientId, request } = req.body;
                const response = await this.collaborationManager.getTaskDelegation().delegateTask(delegatorId, recipientId, request);
                res.status(200).send(response);
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Update task status
       this.app.post('/taskUpdate', async (req: express.Request, res: express.Response) => {
            try {
                const { taskId, status, result, error } = req.body;
                await this.collaborationManager.getTaskDelegation().updateTaskStatus(taskId, status, result, error);
                res.status(200).send({ message: `Task ${taskId} updated` });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Submit a vote for a conflict
       this.app.post('/conflictVote', async (req: express.Request, res: express.Response) => {
            try {
                const { conflictId, agentId, vote, explanation } = req.body;
                await this.collaborationManager.getConflictResolution().submitVote(conflictId, agentId, vote, explanation);
                res.status(200).send({ message: `Vote submitted for conflict ${conflictId}` });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Resolve a conflict
       this.app.post('/resolveConflict', async (req: express.Request, res: express.Response) => {
            try {
                const { conflictId } = req.body;
                await this.collaborationManager.getConflictResolution().resolveConflict(conflictId);
                res.status(200).send({ message: `Conflict ${conflictId} resolved` });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Get conflicts involving an agent
       this.app.get('/agent/:agentId/conflicts', (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                const conflicts = this.collaborationManager.getConflictResolution().getConflictsInvolvingAgent(agentId);
                res.status(200).send({ conflicts });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Get unresolved conflicts
        this.app.get('/conflicts/unresolved', (req: express.Request, res: express.Response) => {
            try {
                const conflicts = this.collaborationManager.getConflictResolution().getUnresolvedConflicts();
                res.status(200).send({ conflicts });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // ===== Agent Specialization Endpoints =====

        // Assign a role to an agent
       this.app.post('/agent/:agentId/role', async (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                const { roleId, customizations } = req.body;
                const specialization = await this.specializationFramework.assignRole(agentId, roleId, customizations);
                res.status(200).send({ specialization });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Get agent specialization
       this.app.get('/agent/:agentId/specialization', (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                const specialization = this.specializationFramework.getAgentSpecialization(agentId);
                res.status(200).send({ specialization });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Get agents with a specific role
       this.app.get('/role/:roleId/agents', (req: express.Request, res: express.Response) => {
            try {
                const { roleId } = req.params;
                const agents = this.specializationFramework.getAgentsWithRole(roleId);
                res.status(200).send({ agents });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Get all roles
       this.app.get('/roles', (_req, res) => {
            try {
                const roles = this.specializationFramework.getAllRoles();
                res.status(200).send({ roles });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Create a new role
       this.app.post('/roles', (req: express.Request, res: express.Response) => {
            try {
                const role = this.specializationFramework.createRole(req.body);
                res.status(200).send({ role });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Find the best agent for a task
       this.app.post('/findBestAgent', (req: express.Request, res: express.Response) => {
            try {
                const { roleId, knowledgeDomains, missionId } = req.body;
                const agentId = this.specializationFramework.findBestAgentForTask(roleId, knowledgeDomains, missionId);
                res.status(200).send({ agentId });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Find an agent with a specific role
       this.app.post('/findAgentWithRole', (req: express.Request, res: express.Response) => {
            try {
                const { roleId, missionId } = req.body;
                const agentId = this.specializationFramework.findBestAgentForTask(roleId, [], missionId);

                if (agentId) {
                    res.status(200).send({ agentId });
                } else {
                    // If no agent with the role exists, create a new one with the specified role
                    const newAgentId = uuidv4();
                    const newAgentConfig = {
                        agentId: newAgentId,
                        actionVerb: 'ACCOMPLISH',
                        inputs: { goal: { inputValue: `Act as a ${roleId} agent`, inputName: 'goal', args: {} } },
                        missionId: missionId || 'system',
                        roleId: roleId
                    };

                    // Create the new agent asynchronously
                    this.addAgentWithConfig(newAgentConfig)
                        .then(() => console.log(`Created new agent ${newAgentId} with role ${roleId}`))
                        .catch(err => console.error(`Failed to create new agent with role ${roleId}:`, err));

                    res.status(200).send({ agentId: newAgentId, newlyCreated: true });
                }
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Generate a specialized system prompt for an agent
       this.app.post('/agent/:agentId/prompt', async (req: express.Request, res: express.Response) => {
            try {
                const { agentId } = req.params;
                const { taskDescription } = req.body;
                const prompt = await this.specializationFramework.generateSpecializedPrompt(agentId, taskDescription);
                res.status(200).send({ prompt });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Get all knowledge domains
       this.app.get('/knowledgeDomains', (_req, res) => {
            try {
                const domains = this.specializationFramework.getAllKnowledgeDomains();
                res.status(200).send({ domains });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Create a knowledge domain
       this.app.post('/knowledgeDomains', async (req: express.Request, res: express.Response) => {
            try {
                const domain = await this.specializationFramework.createKnowledgeDomain(req.body);
                res.status(200).send({ domain });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Add a knowledge item
       this.app.post('/knowledgeItems', async (req: express.Request, res: express.Response) => {
            try {
                const item = await this.domainKnowledge.addKnowledgeItem(req.body);
                res.status(200).send({ item });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Query knowledge items
       this.app.post('/knowledgeItems/query', (req: express.Request, res: express.Response) => {
            try {
                const items = this.domainKnowledge.queryKnowledgeItems(req.body);
                res.status(200).send({ items });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Generate domain-specific context for a task
       this.app.post('/domainContext', async (req: express.Request, res: express.Response) => {
            try {
                const { domainIds, taskDescription } = req.body;
                const context = await this.domainKnowledge.generateDomainContext(domainIds, taskDescription);
                res.status(200).send({ context });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Import knowledge from external source
       this.app.post('/importKnowledge', async (req: express.Request, res: express.Response) => {
            try {
                const { domainId, source, format } = req.body;
                const items = await this.domainKnowledge.importKnowledge(domainId, source, format);
                res.status(200).send({ items });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Handle collaboration messages from other agent sets
       this.app.post('/collaboration/message', async (req: express.Request, res: express.Response) => {
            try {
                const message = req.body;
                await this.collaborationManager.handleMessage(message);
                res.status(200).send({ message: 'Collaboration message processed successfully' });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // Resume mission agents
       this.app.post('/resumeAgents', async (req: express.Request, res: express.Response) => {
            const { missionId } = req.body;
            console.log(`Agentset Resuming agents for mission ${missionId}`);
            const agents = Array.from(this.agents.values()).filter(agent => agent.getMissionId() === missionId);
            for (const agent of agents) {
                await agent.resume();
            }
            res.status(200).send({ message: 'All agents resumed' });
        });

       this.app.post('/resumeAgent', async (req: express.Request, res: express.Response) => {
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
       this.app.post('/abortAgent', async (req: express.Request, res: express.Response) => {
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

       this.app.get('/statistics/:missionId', (req: express.Request, res: express.Response) => { this.getAgentStatistics(req, res) });
       this.app.post('/updateFromAgent', (req: express.Request, res: express.Response) => { this.updateFromAgent(req, res) });
       this.app.get('/agent/:agentId/output', async (req: express.Request, res: express.Response) => {
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


       this.app.post('/saveAgent', async (req: express.Request, res: express.Response) => {
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

        this.app.listen(this.port, () => {
            console.log(`AgentSet application running on ${this.url}`);
        });

    }

    private async addAgent(req: express.Request, res: express.Response) {
        const { agentId, actionVerb, inputs, missionId, missionContext, roleId, roleCustomizations } = req.body;
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
            agentSetUrl: this.url,
            role: roleId
        };
        const newAgent = new Agent(agentConfig);
        this.agents.set(newAgent.id, newAgent);

        // Register agent with lifecycle manager
        this.lifecycleManager.registerAgent(newAgent);

        // Set up automatic checkpointing
        newAgent.setupCheckpointing(15); // Checkpoint every 15 minutes

        // Assign default role based on action verb if no role is specified
        if (!roleId) {
            const defaultRoleId = this.determineDefaultRole(actionVerb);
            if (defaultRoleId) {
                try {
                    await this.specializationFramework.assignRole(newAgent.id, defaultRoleId);
                    console.log(`Assigned default role ${defaultRoleId} to agent ${newAgent.id}`);
                } catch (error) {
                    console.error(`Error assigning default role to agent ${newAgent.id}:`, error);
                }
            }
        } else {
            // Assign specified role
            try {
                await this.specializationFramework.assignRole(newAgent.id, roleId, roleCustomizations);
                console.log(`Assigned role ${roleId} to agent ${newAgent.id}`);
            } catch (error) {
                console.error(`Error assigning role to agent ${newAgent.id}:`, error);
            }
        }

        res.status(200).send({ message: 'Agent added', agentId: newAgent.id });
    }

    // Add a new agent with a configuration object
    private async addAgentWithConfig(config: any): Promise<string> {
        try {
            const { agentId, actionVerb, inputs, missionId, missionContext, roleId, roleCustomizations } = config;

            if (!agentId || !actionVerb) {
                throw new Error('Missing required parameters');
            }

            if (this.agents.size >= this.maxAgents) {
                throw new Error('Maximum number of agents reached');
            }

            if (this.agents.has(agentId)) {
                throw new Error('Agent with this ID already exists');
            }

            let inputsMap: Map<string, PluginInput>;

            if (inputs?._type === 'Map') {
                inputsMap = MapSerializer.transformFromSerialization(inputs);
            } else {
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

            // Create a new agent
            const agentConfig = {
                actionVerb,
                inputs: inputsMap,
                missionId,
                missionContext,
                id: agentId,
                postOfficeUrl: this.postOfficeUrl,
                agentSetUrl: this.url,
                role: roleId
            };

            const newAgent = new Agent(agentConfig);
            this.agents.set(newAgent.id, newAgent);

            // Register agent with lifecycle manager
            this.lifecycleManager.registerAgent(newAgent);

            // Set up automatic checkpointing
            newAgent.setupCheckpointing(15); // Checkpoint every 15 minutes

            // If a role is specified, assign it to the agent
            if (roleId) {
                try {
                    await this.specializationFramework.assignRole(agentId, roleId, roleCustomizations);
                    console.log(`Assigned role ${roleId} to agent ${agentId}`);
                } catch (error) {
                    console.error(`Failed to assign role ${roleId} to agent ${agentId}:`, error);
                    // Continue anyway, don't fail the agent creation
                }
            } else {
                // Assign default role based on action verb
                const defaultRoleId = this.determineDefaultRole(actionVerb);
                if (defaultRoleId) {
                    try {
                        await this.specializationFramework.assignRole(newAgent.id, defaultRoleId);
                        console.log(`Assigned default role ${defaultRoleId} to agent ${newAgent.id}`);
                    } catch (error) {
                        console.error(`Error assigning default role to agent ${newAgent.id}:`, error);
                    }
                }
            }

            // Start the agent
            newAgent.start();

            return agentId;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
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

    private async getAgent(req: express.Request, res: express.Response) {
        const { agentId } = req.params;
        const agent = this.agents.get(agentId);

        if (!agent) {
            res.status(404).send({ error: `Agent with id ${agentId} not found` });
        }
        else {
            try {
                const agentState = await agent.getAgentState();
                res.status(200).send(agentState);
            } catch (error) { analyzeError(error as Error);
                console.error('Error fetching agent state for agent %s:', agentId, error instanceof Error ? error.message : error);
                res.status(500).send({ error: `Failed to fetch agent state for agent ${agentId}` });
            }
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
        //console.log(`AgentSet:Getting statistics for mission ${missionId}`);

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

        private async updateFromAgent(req: express.Request, res: express.Response) {
            const { agentId, status, statistics } = req.body;
            console.log(`AgentSet received update from agent ${agentId} with status ${status}`);

            const agent = this.agents.get(agentId);
            if (agent) {
                // Save agent state
                await agent.saveAgentState();

                // If we have statistics, send them to TrafficManager
                if (statistics) {
                    try {
                        console.log(`Forwarding statistics for agent ${agentId} to TrafficManager`);
                        await axios.post(`http://${this.trafficManagerUrl}/agentStatisticsUpdate`, {
                            agentId,
                            status,
                            statistics,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        console.error(`Failed to forward statistics to TrafficManager:`,
                            error instanceof Error ? error.message : error);
                    }
                }

                res.status(200).send({ message: 'Agent updated' });
            } else {
                console.warn(`Agent ${agentId} not found in this AgentSet`);
                res.status(404).send({ error: 'Agent not found' });
            }
        }

    /**
     * Determine default role based on action verb
     * @param actionVerb Action verb
     * @returns Role ID or undefined if no matching role
     */
    private determineDefaultRole(actionVerb: string): string | undefined {
        // Map common action verbs to roles
        const actionVerbToRoleMap: Record<string, string> = {
            'research': 'researcher',
            'analyze': 'researcher',
            'investigate': 'researcher',
            'search': 'researcher',
            'find': 'researcher',

            'create': 'creative',
            'generate': 'creative',
            'design': 'creative',
            'write': 'creative',
            'compose': 'creative',

            'evaluate': 'critic',
            'review': 'critic',
            'assess': 'critic',
            'critique': 'critic',
            'judge': 'critic',

            'execute': 'executor',
            'implement': 'executor',
            'perform': 'executor',
            'run': 'executor',
            'do': 'executor',
            'accomplish': 'executor',

            'coordinate': 'coordinator',
            'manage': 'coordinator',
            'organize': 'coordinator',
            'plan': 'coordinator',
            'direct': 'coordinator',

            'advise': 'domain_expert',
            'consult': 'domain_expert',
            'explain': 'domain_expert',
            'teach': 'domain_expert',
            'guide': 'domain_expert'
        };

        // Convert action verb to lowercase and remove any non-alphanumeric characters
        const normalizedVerb = actionVerb ? actionVerb.toLowerCase().replace(/[^a-z0-9]/g, '') : 'accomplish';

        // Check for exact match
        if (actionVerbToRoleMap[normalizedVerb]) {
            return actionVerbToRoleMap[normalizedVerb];
        }

        // Check for partial match
        for (const [verb, role] of Object.entries(actionVerbToRoleMap)) {
            if (normalizedVerb.includes(verb) || verb.includes(normalizedVerb)) {
                return role;
            }
        }

        // Default to executor if no match found
        return 'executor';
    }
}

new AgentSet(); // Start the AgentSet application
