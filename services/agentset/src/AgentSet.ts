import express from 'express';
import * as http from 'http';
import { Agent } from './agents/Agent';
import { MapSerializer, BaseEntity, createAuthenticatedAxios, PluginParameterType, OutputType } from '@cktmcs/shared';
import { AgentStatistics, AgentSetStatistics, InputValue } from '@cktmcs/shared';
import { AgentPersistenceManager } from './utils/AgentPersistenceManager';
import { AgentLifecycleManager } from './lifecycle/AgentLifecycleManager';
import { analyzeError } from '@cktmcs/errorhandler';
import { setInterval } from 'timers';
import { CollaborationManager } from './collaboration/CollaborationManager';
import { SpecializationFramework } from './specialization/SpecializationFramework';
import { DomainKnowledge } from './specialization/DomainKnowledge';
import { TaskDelegation } from './collaboration/TaskDelegation';
import { ConflictResolution } from './collaboration/ConflictResolution';
import { v4 as uuidv4 } from 'uuid';
import { OwnershipTransferManager } from './utils/OwnershipTransferManager';

export class AgentSet extends BaseEntity {
    agents: Map<string, Agent> = new Map(); // Store agents by their ID
    private specializationFramework: SpecializationFramework;
    private domainKnowledge: DomainKnowledge;
    private taskDelegation: TaskDelegation;
    private conflictResolution: ConflictResolution;
    ownershipTransferManager: OwnershipTransferManager;
    private lifecycleManager: AgentLifecycleManager;
    private collaborationManager: CollaborationManager;

    // Missing properties
    private persistenceManager: AgentPersistenceManager;
    private trafficManagerUrl: string;
    private librarianUrl: string;
    private brainUrl: string;
    private maxAgents: number = 100; // Default max agents
    private lastMemoryCheck: string = new Date().toISOString();
    private stepLocationRegistry: Map<string, { agentId: string; agentSetUrl: string }> = new Map();
    private app: express.Application;

    constructor() {
        super('primary-agentset', 'AgentSet', process.env.HOST || 'agentset', process.env.PORT || '5100');
        this.app = express();
        // Initialize URLs from environment variables or defaults, ensuring http:// prefix
        this.trafficManagerUrl = process.env.TRAFFIC_MANAGER_URL || 'trafficmanager:5000';
        this.librarianUrl = process.env.LIBRARIAN_URL || 'librarian:5040';
        this.brainUrl = process.env.BRAIN_URL || 'brain:5015';
        this.postOfficeUrl = process.env.POST_OFFICE_URL || 'postoffice:5020';

        // The authenticatedApi and securityManagerUrl are initialized by BaseEntity.
        // We can access them directly after super() call.
        // Initialize persistence manager
        this.persistenceManager = new AgentPersistenceManager(undefined, this.authenticatedApi);

        // Initialize memory and lifecycle management
        this.lifecycleManager = new AgentLifecycleManager(this.persistenceManager, this.trafficManagerUrl);

        // Initialize agent systems
        this.ownershipTransferManager = new OwnershipTransferManager(this);
        this.taskDelegation = new TaskDelegation(this.agents, this.trafficManagerUrl, this.ownershipTransferManager);
        this.conflictResolution = new ConflictResolution(this.agents, this.trafficManagerUrl, this.brainUrl);
        this.collaborationManager = new CollaborationManager(
            this,
            this.taskDelegation,
            this.conflictResolution
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
    private initializeServer(): void {
        this.app.get('/health', (req: express.Request, res: express.Response): void => {
            res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                message: 'AgentSet service is healthy',
                agentCount: this.agents.size
            });
        });

        this.app.get('/ready', (req: express.Request, res: express.Response): void => {
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

        this.app.post('/message', this.handleMessage.bind(this));

        // Add a new agent to the set
        this.app.post('/addAgent', this.addAgent.bind(this));

        this.app.post('/createSpecializedAgent', this.createSpecializedAgent.bind(this));

        // Endpoint for agents to notify of their terminal state for removal
        this.app.post('/removeAgent', async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
            const { agentId, status } = req.body;
            if (!agentId || !status) {
                res.status(400).send({ error: 'agentId and status are required for removal' });
                return;
            }
            try {
                await this.removeAgentFromSet(agentId, status);
                res.status(200).send({ message: `Agent ${agentId} processed for removal with status ${status}.` });
            } catch (error) {
                analyzeError(error as Error);
                if (next) {
                    next(error);
                } else if (!res.headersSent) {
                    res.status(500).send({ error: `Error processing agent ${agentId} for removal: ${error instanceof Error ? error.message : String(error)}` });
                }
            }
        });

        this.app.post('/agent/:agentId/message', this.handleAgentMessage.bind(this));

        this.app.get('/agent/:agentId', this.getAgent.bind(this));

        this.app.get('/agent/:agentId/output', this.getAgentOutput.bind(this));

        // Pause mission agents
        this.app.post('/pauseAgents', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            const { missionId } = req.body;
            if (!missionId) {
                res.status(400).send({ error: 'missionId is required' });
            }
            try {
                console.log(`Agentset Pausing agents for mission ${missionId}`);
                const agents = Array.from(this.agents.values()).filter(agent => agent.getMissionId() === missionId);
                console.log(`Agentset Pausing ${agents.length} agents for mission ${missionId}`);
                for (const agent of agents) {
                    await agent.pause();
                }
                res.status(200).send({ message: `All ${agents.length} agents for mission ${missionId} paused` });
            } catch (error) {
                analyzeError(error as Error);
                if (next) next(error); else res.status(500).send({error: "Error pausing agents"});
            }
        });

        // Abort mission agents (mission-wide)
        this.app.post('/abortAgents', this.abortMissionAgents.bind(this));

        // Delegate a task to an agent
        this.app.post('/delegateTask', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const { delegatorId, recipientId, request } = req.body;
                const response = await this.collaborationManager.getTaskDelegation().delegateTask(delegatorId, recipientId, request);
                res.status(200).send(response);
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });



        // Submit a vote for a conflict
       this.app.post('/conflictVote', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const { conflictId, agentId, vote, explanation } = req.body;
                await this.collaborationManager.getConflictResolution().submitVote(conflictId, agentId, vote, explanation);
                res.status(200).send({ message: `Vote submitted for conflict ${conflictId}` });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Resolve a conflict
       this.app.post('/resolveConflict', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const { conflictId } = req.body;
                await this.collaborationManager.getConflictResolution().resolveConflict(conflictId);
                res.status(200).send({ message: `Conflict ${conflictId} resolved` });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Get conflicts involving an agent
       this.app.get('/agent/:agentId/conflicts', (req: express.Request, res: express.Response): void => {
            try {
                const { agentId } = req.params;
                const conflicts = this.collaborationManager.getConflictResolution().getConflictsInvolvingAgent(agentId);
                res.status(200).send({ conflicts });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Get unresolved conflicts
        this.app.get('/conflicts/unresolved', (req: express.Request, res: express.Response): void => {
            try {
                const conflicts = this.collaborationManager.getConflictResolution().getUnresolvedConflicts();
                res.status(200).send({ conflicts });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // ===== Agent Specialization Endpoints =====

        // Assign a role to an agent
       this.app.post('/agent/:agentId/role', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const { agentId } = req.params;
                const { roleId, customizations } = req.body;
                const specialization = await this.specializationFramework.assignRole(agentId, roleId, customizations);
                res.status(200).send({ specialization });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Update an agent's system prompt with a lesson learned
        this.app.post('/agent/:agentId/updatePrompt', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const { agentId } = req.params;
                const { lessonLearned } = req.body;

                if (!lessonLearned) {
                    res.status(400).send({ error: 'lessonLearned is required' });
                    return;
                }

                const specialization = await this.specializationFramework.updateSystemPrompt(agentId, lessonLearned);

                if (!specialization) {
                    res.status(404).send({ error: `Agent ${agentId} not found or has no specialization` });
                    return;
                }

                res.status(200).send({
                    success: true,
                    message: 'System prompt updated successfully',
                    specialization
                });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Get agent performance data
        this.app.get('/agent/:agentId/performance', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const { agentId } = req.params;
                const performanceData = this.specializationFramework.getAgentPerformanceData(agentId);

                if (!performanceData) {
                    res.status(404).send({ error: `Agent ${agentId} not found or has no performance data` });
                    return;
                }

                // Convert Map to object for JSON serialization
                const performanceObject = Object.fromEntries(performanceData);

                res.status(200).send({
                    agentId,
                    performanceData: performanceObject
                });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Get agent specialization
       this.app.get('/agent/:agentId/specialization', (req: express.Request, res: express.Response): void => {
            try {
                const { agentId } = req.params;
                const specialization = this.specializationFramework.getAgentSpecialization(agentId);
                res.status(200).send({ specialization });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Get agents with a specific role
       this.app.get('/role/:roleId/agents', (req: express.Request, res: express.Response): void => {
            try {
                const { roleId } = req.params;
                const agents = this.specializationFramework.getAgentsWithRole(roleId);
                res.status(200).send({ agents });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Get all roles
       this.app.get('/roles', (_req, res): void => {
            try {
                const roles = this.specializationFramework.getAllRoles();
                res.status(200).send({ roles });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Create a new role
       this.app.post('/roles', (req: express.Request, res: express.Response): void => {
            try {
                const role = this.specializationFramework.createRole(req.body);
                res.status(200).send({ role });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Find the best agent for a task
       this.app.post('/findBestAgent', (req: express.Request, res: express.Response): void => {
            try {
                const { roleId, knowledgeDomains, missionId } = req.body;
                const agentId = this.specializationFramework.findBestAgentForTask(roleId, knowledgeDomains, missionId);
                res.status(200).send({ agentId });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Find an agent with a specific role
       this.app.post('/findAgentWithRole', (req: express.Request, res: express.Response): void => {
            try {
                const { roleId, missionId } = req.body;
                                const agentId = this.specializationFramework.findBestAgentForTask(roleId, '', [], missionId);

                if (agentId) {
                    res.status(200).send({ agentId });
                } else {
                    // No agent with the role exists - return null to let current agent handle the task
                    res.status(200).send({ agentId: null });
                }
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Generate a specialized system prompt for an agent
       this.app.post('/agent/:agentId/prompt', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const { agentId } = req.params;
                const { taskDescription } = req.body;
                const prompt = await this.specializationFramework.generateSpecializedPrompt(agentId, taskDescription);
                res.status(200).send({ prompt });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Get all knowledge domains
       this.app.get('/knowledgeDomains', (_req, res): void => {
            try {
                const domains = this.specializationFramework.getAllKnowledgeDomains();
                res.status(200).send({ domains });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Create a knowledge domain
       this.app.post('/knowledgeDomains', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const domain = await this.specializationFramework.createKnowledgeDomain(req.body);
                res.status(200).send({ domain });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Add a knowledge item
       this.app.post('/knowledgeItems', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const item = await this.domainKnowledge.addKnowledgeItem(req.body);
                res.status(200).send({ item });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Query knowledge items
       this.app.post('/knowledgeItems/query', (req: express.Request, res: express.Response): void => {
            try {
                const items = this.domainKnowledge.queryKnowledgeItems(req.body);
                res.status(200).send({ items });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Generate domain-specific context for a task
       this.app.post('/domainContext', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const { domainIds, taskDescription } = req.body;
                const context = await this.domainKnowledge.generateDomainContext(domainIds, taskDescription);
                res.status(200).send({ context });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Import knowledge from external source
       this.app.post('/importKnowledge', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const { domainId, source, format } = req.body;
                const items = await this.domainKnowledge.importKnowledge(domainId, source, format);
                res.status(200).send({ items });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Handle collaboration messages from other agent sets
       this.app.post('/collaboration/message', async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const message = req.body;
                await this.collaborationManager.handleMessage(message);
                res.status(200).send({ message: 'Collaboration message processed successfully' });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        // Resume mission agents
       this.app.post('/resumeAgents', async (req: express.Request, res: express.Response): Promise<void> => {
            const { missionId } = req.body;
            if (!missionId) { // Added check
                res.status(400).send({ error: 'missionId is required' });
                return;
            }
            try {
                console.log(`Agentset Resuming agents for mission ${missionId}`);
                const agents = Array.from(this.agents.values()).filter(agent => agent.getMissionId() === missionId);
                for (const agent of agents) {
                    await agent.resume();
                }
                res.status(200).send({ message: 'All agents resumed' });
            } catch (error) {
                analyzeError(error as Error);
                if (!res.headersSent) {
                    res.status(500).send({ error: 'Error resuming agents' });
                }
            }
        });

       this.app.post('/resumeAgent', async (req: express.Request, res: express.Response): Promise<void> => {
            const { agentId } = req.body;
            if (!agentId) { // Added check
                res.status(400).send({ error: 'agentId is required' });
                return;
            }
            console.log(`Agentset Resuming agent ${agentId}`);
            const agent = this.agents.get(agentId);
            if (agent) {
                try { // Added try-catch
                    await agent.resume();
                    res.status(200).send({ message: `Agent resumed` });
                } catch (error) {
                    analyzeError(error as Error);
                    if (!res.headersSent) {
                        res.status(500).send({ error: `Error resuming agent ${agentId}`});
                    }
                }
            } else {
                res.status(404).send({ error: 'Agent not found' });
            }
        });

        // Abort individual agent
       this.app.post('/abortAgent', async (req: express.Request, res: express.Response): Promise<void> => {
            const { agentId } = req.body;
             if (!agentId) { // Added check
                res.status(400).send({ error: 'agentId is required' });
                return;
            }
            console.log(`Agentset Aborting agent ${agentId}`);
            const agent = this.agents.get(agentId);
            if (agent) {
                try { // Added try-catch
                    await agent.abort();
                    res.status(200).send({ message: `Agent aborted` });
                } catch (error) {
                    analyzeError(error as Error);
                    if (!res.headersSent) {
                        res.status(500).send({ error: `Error aborting agent ${agentId}`});
                    }
                }
            } else {
                res.status(404).send({ error: 'Agent not found' });
            }
        });

       this.app.get('/statistics/:missionId', this.getAgentStatistics.bind(this));
       this.app.post('/updateFromAgent', this.updateFromAgent.bind(this));

       // Endpoint to get details for a specific step
       this.app.get('/agent/step/:stepId', this.getStepDetailsHandler.bind(this));

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
       
               // ===== Step Location Registry Endpoints =====
       
               this.app.post('/step-location', async (req: express.Request, res: express.Response) => {
                   const { stepId, agentId, agentSetUrl } = req.body;
                   if (!stepId || !agentId || !agentSetUrl) {
                       res.status(400).send({ error: 'stepId, agentId, and agentSetUrl are required' });
                       return;
                   }
                   try {
                       await this.registerStepLocation(stepId, agentId, agentSetUrl);
                       res.status(201).send({ message: `Step ${stepId} registered` });
                   } catch (error) {
                       analyzeError(error as Error);
                       res.status(500).send({ error: 'Failed to register step location' });
                   }
               });
       
               this.app.put('/step-location/:stepId', async (req: express.Request, res: express.Response) => {
                   const { stepId } = req.params;
                   const { agentId, agentSetUrl } = req.body;
                   if (!agentId || !agentSetUrl) {
                       res.status(400).send({ error: 'agentId and agentSetUrl are required' });
                       return;
                   }
                   try {
                       await this.updateStepLocation(stepId, agentId, agentSetUrl);
                       res.status(200).send({ message: `Step ${stepId} location updated` });
                   } catch (error) {
                       analyzeError(error as Error);
                       res.status(500).send({ error: 'Failed to update step location' });
                   }
               });
       
               this.app.get('/step-location/:stepId', async (req: express.Request, res: express.Response) => {
                   const { stepId } = req.params;
                   try {
                       const location = await this.getStepLocation(stepId);
                       if (location) {
                           res.status(200).send(location);
                       } else {
                           res.status(404).send({ error: `Step ${stepId} not found` });
                       }
                   } catch (error) {
                       analyzeError(error as Error);
                       res.status(500).send({ error: 'Failed to get step location' });
                   }
               });
       
               this.app.listen(this.port, () => {
                   console.log(`AgentSet application running on ${this.url}`);
               });
       
           }
    // ===== Step Location Registry Methods =====

    public async registerStepLocation(stepId: string, agentId: string, agentSetUrl: string): Promise<void> {
        this.stepLocationRegistry.set(stepId, { agentId, agentSetUrl });
        console.log(`Registered step ${stepId} to agent ${agentId} at ${agentSetUrl}`);
    }

    public async updateStepLocation(stepId: string, newAgentId: string, newAgentSetUrl: string): Promise<void> {
        if (this.stepLocationRegistry.has(stepId)) {
            this.stepLocationRegistry.set(stepId, { agentId: newAgentId, agentSetUrl: newAgentSetUrl });
            console.log(`Updated step ${stepId} to new agent ${newAgentId} at ${newAgentSetUrl}`);
        } else {
            throw new Error(`Step with id ${stepId} not found in registry.`);
        }
    }

    public async getStepLocation(stepId: string): Promise<{ agentId: string; agentSetUrl: string } | null> {
        const location = this.stepLocationRegistry.get(stepId);
        return location || null;
    }

    

    private async notifyTrafficManager(agentId: string, status: string): Promise<void> {
        try {
            const response = await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/agent/status`, {
                agentId,
                status,
                timestamp: new Date().toISOString()
            });
            console.log(`Successfully notified TrafficManager about agent ${agentId} status: ${status}`);
            return response.data;
        } catch (error) {
            console.error(`Failed to notify TrafficManager about agent ${agentId}:`, error);
            throw error;
        }
    }

    private async removeAgentFromSet(agentId: string, status: string): Promise<void> {
        console.log(`Attempting to remove agent ${agentId} with status ${status} from AgentSet.`);
        const agent = this.agents.get(agentId);

        if (agent) {
            try {
                
                // Cleanup agent resources
                await agent.cleanup();
                
                // Remove from lifecycle manager
                if (this.lifecycleManager) {
                    this.lifecycleManager.unregisterAgent(agentId);
                }

                // Clear from memory
                this.agents.delete(agentId);

                console.log(`Agent ${agentId} removed from AgentSet. Current agent count: ${this.agents.size}`);

                // Notify TrafficManager
                try {
                    await this.notifyTrafficManager(agentId, status);
                } catch (error) {
                    console.warn(`Failed to notify TrafficManager about agent ${agentId} removal:`, error);
                }
            } catch (error) {
                console.error(`Error during cleanup for agent ${agentId}:`, error);
                // Continue with removal even if cleanup fails
                this.agents.delete(agentId);
            }
        } else {
            console.warn(`Agent ${agentId} not found in AgentSet during removal attempt. Status was: ${status}.`);
        }
    }

    private async abortMissionAgents(req: express.Request, res: express.Response): Promise<void> {
        const { missionId } = req.body;

        if (!missionId) {
            res.status(400).send({ error: 'missionId is required to abort agents.' });
            return;
        }

        console.log(`AgentSet: Received request to abort all agents for mission ${missionId}.`);
        let abortedCount = 0;
        const promises: Promise<void>[] = [];

        try {
            for (const agent of this.agents.values()) {
                if (agent.getMissionId() === missionId) {
                    console.log(`AgentSet: Aborting agent ${agent.id} for mission ${missionId}.`);
                    promises.push(agent.abort()); // agent.abort() is async and will notify for removal
                    abortedCount++;
                }
            }

            await Promise.allSettled(promises); // Wait for all abort operations to settle

            console.log(`AgentSet: ${abortedCount} agents targeted for abort for mission ${missionId}. Agent-initiated removal will follow.`);
            res.status(200).send({ message: `${abortedCount} agents for mission ${missionId} have been signaled to abort.` });

        } catch (error) {
            analyzeError(error as Error);
            console.error(`AgentSet: Error during mission-wide abort for ${missionId}:`, error instanceof Error ? error.message : String(error));
            if (!res.headersSent) {
                res.status(500).send({ error: `Failed to abort agents for mission ${missionId}.` });
            }
        }
    }

    private async addAgent(req: express.Request, res: express.Response): Promise<void> {
        let { agentId, actionVerb, inputs, missionId, missionContext, roleId, roleCustomizations } = req.body;
        
        // If agentId is not provided in the request body, generate one
        if (!agentId) {
            agentId = uuidv4();
            console.log(`Generated new agentId: ${agentId} for incoming request.`);
        }

        let inputsMap: Map<string, InputValue>;

        if (inputs?._type === 'Map') {
            inputsMap = MapSerializer.transformFromSerialization(inputs);
        } else {
            if (inputs instanceof Map) {
                inputsMap = inputs;
            } else if (inputs === undefined || inputs === null) {
                inputsMap = new Map();
            } else {
                inputsMap = new Map();
                for (const [key, value] of Object.entries(inputs)) {
                    if (typeof value === 'object' && value !== null && 'value' in value) {
                        inputsMap.set(key, value as InputValue);
                    } else {
                        inputsMap.set(key, {
                            inputName: key,
                            value: value,
                            valueType: PluginParameterType.ANY,
                            args: { [key]: value }
                        });
                    }
                }
            }
        }
        // console.log(`addAgent provided inputs:`, inputs);
        // console.log(`addAgent inputsMap:`, inputsMap);
        const agentConfig = {
            actionVerb,
            inputValues: inputsMap,
            missionId,
            missionContext,
            id: agentId,
            postOfficeUrl: this.postOfficeUrl,
            agentSetUrl: this.url,
            role: roleId,
            agentSet: this
        };
        const newAgent = new Agent(agentConfig);
        this.agents.set(newAgent.id, newAgent);

        // AWAIT THE INITIALIZATION PROMISE
        const initializedSuccessfully = await newAgent.initialized;
        if (!initializedSuccessfully) {
            // Handle initialization failure
            console.error(`Agent ${newAgent.id} failed to initialize.`);
            res.status(500).send({ error: `Agent ${newAgent.id} failed to initialize.` });
            return;
        }

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

    private async createSpecializedAgent(req: express.Request, res: express.Response): Promise<void> {
        const { roleId, missionId, missionContext } = req.body;
        const agentId = uuidv4();
        const agentConfig = {
            agentId: agentId,
            actionVerb: 'ACCOMPLISH',
            inputs: new Map(),
            missionId: missionId,
            missionContext: missionContext,
            roleId: roleId,
        };
        await this.addAgentWithConfig(agentConfig);
        res.status(200).send({ agentId: agentId });
    }

    // Add a new agent with a configuration object
    private async addAgentWithConfig(config: any): Promise<string> { // Not a route handler, signature is fine
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

            let inputsMap: Map<string, InputValue>;

            if (inputs?._type === 'Map') {
                inputsMap = MapSerializer.transformFromSerialization(inputs);
            } else {
                if (inputs instanceof Map) {
                    inputsMap = inputs;
                } else if (inputs === undefined || inputs === null) {
                    inputsMap = new Map();
                } else {
                    inputsMap = new Map();
                    for (const [key, value] of Object.entries(inputs)) {
                        if (typeof value === 'object' && value !== null && 'value' in value) {
                            inputsMap.set(key, value as InputValue);
                        } else {
                            inputsMap.set(key, {
                                inputName: key,
                                value: value,
                                valueType: PluginParameterType.ANY,
                                args: { [key]: value }
                            });
                        }
                    }
                }
            }

            // Create a new agent
            const agentConfig = {
                actionVerb,
                inputValues: inputsMap,
                missionId,
                missionContext,
                id: agentId,
                postOfficeUrl: this.postOfficeUrl,
                agentSetUrl: this.url,
                role: roleId,
                agentSet: this
            };

            const newAgent = new Agent(agentConfig);
            this.agents.set(newAgent.id, newAgent);

            // AWAIT THE INITIALIZATION PROMISE
            const initializedSuccessfully = await newAgent.initialized;
            if (!initializedSuccessfully) {
                throw new Error(`Agent ${newAgent.id} failed to initialize.`);
            }

            // Set up automatic checkpointing
            newAgent.setupCheckpointing(15); // Checkpoint every 15 minutes

            // If a role is specified, assign it to the agent

            return agentId;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    private async handleAgentMessage(req: express.Request, res: express.Response): Promise<void> {
        const { agentId } = req.params;
        const message = req.body;
        const agent = this.agents.get(agentId);

        if (agent) {
            try {
                await agent.handleMessage(message);
                res.status(200).send({ status: 'Message delivered to agent' });
            } catch (error) { analyzeError(error as Error);
                console.error('Error delivering message to agent %s:', agentId, error instanceof Error ? error.message : error);
                if (!res.headersSent) {
                    res.status(500).send({ error: 'Failed to deliver message to agent' });
                }
            }
        } else {
            if (!res.headersSent) {
                res.status(404).send({ error: 'Agent not found' });
            }
        }
    }

    private async getAgent(req: express.Request, res: express.Response): Promise<void> {
        const { agentId } = req.params;
        const agent = this.agents.get(agentId);

        if (!agent) {
            res.status(404).send({ error: `Agent with id ${agentId} not found` });
            return;
        }
        else {
            try {
                const agentState = await agent.getAgentState();
                res.status(200).send(agentState);
            } catch (error) { analyzeError(error as Error);
                console.error('Error fetching agent state for agent %s:', agentId, error instanceof Error ? error.message : error);
                if (!res.headersSent) {
                    res.status(500).send({ error: `Failed to fetch agent state for agent ${agentId}` });
                }
            }
        }
    }

    private async getAgentOutput(req: express.Request, res: express.Response): Promise<void> {
        const { agentId } = req.params;
        const agent = this.agents.get(agentId);

        if (agent) {
            try {
                const output = await agent.getOutput();
                res.status(200).send(output);
            } catch (error) { analyzeError(error as Error);
                console.error('Error fetching output for agent %s:', agentId, error instanceof Error ? error.message : error);
                if (!res.headersSent) {
                    res.status(500).send({ error: 'Failed to fetch agent output' });
                }
            }
        } else {
            if (!res.headersSent) {
                res.status(404).send({ error: 'Agent not found' });
            }
        }
    }

    private async handleMessage(req: express.Request, res: express.Response): Promise<void> {
        const message = req.body;
        await super.handleBaseMessage(message);

        // Handle USER_INPUT_RESPONSE messages specially
        if (message.type === 'USER_INPUT_RESPONSE') {
            const { requestId, answer } = message.content;
            console.log(`AgentSet received USER_INPUT_RESPONSE for request ${requestId}`);

            // Find the agent waiting for this specific request
            let messageDelivered = false;
            for (const agent of this.agents.values()) {
                if (agent.isWaitingForUserInput && agent.isWaitingForUserInput(requestId)) {
                    try {
                        await agent.handleMessage(message);
                        messageDelivered = true;
                        console.log(`Delivered USER_INPUT_RESPONSE to agent ${agent.id}`);
                        break; // Only one agent should be waiting for this specific request
                    } catch (error) {
                        console.error(`Error delivering USER_INPUT_RESPONSE to agent ${agent.id}:`, error);
                    }
                }
            }

            if (!res.headersSent) {
                if (messageDelivered) {
                    res.status(200).send({ status: 'User input response delivered to waiting agent' });
                } else {
                    // Check if any agents are stuck with unresolved placeholders
                    const fixedAny = await this.checkAndFixStuckAgents();
                    if (fixedAny) {
                        res.status(200).send({ status: 'Fixed stuck agent with unresolved placeholders' });
                    } else {
                        res.status(404).send({ error: 'No agent found waiting for this user input request' });
                    }
                }
            }
            return;
        }

        if (message.forAgent) {
          const agentId = message.forAgent;
          const agent = this.agents.get(agentId);

          if (agent) {
            try {
                await agent.handleMessage(message);
                res.status(200).send({ status: 'Message delivered to agent' });
            } catch (error) { analyzeError(error as Error);
                console.error('Error delivering message to agent %s:', agentId, error instanceof Error ? error.message : error);
                if (!res.headersSent) {
                    res.status(500).send({ error: 'Failed to deliver message to agent' });
                }
            }
          } else {
            if (!res.headersSent) {
                res.status(404).send({ error: `Agent ${agentId} not found in this AgentSet` });
            }
          }
        } else {
            // This branch previously had an issue: req.body.content.missionId;
            // Assuming this was meant to be message.content.missionId or similar structure from typical messages.
            // For safety, adding a check.
            let missionId;
            if (message.content && message.content.missionId) {
                missionId = message.content.missionId;
            } else if (message.missionId) { // Fallback if missionId is top-level in message
                missionId = message.missionId;
            }

            if (missionId) {
                const agents = Array.from(this.agents.values()).filter(agent => agent.getMissionId() === missionId);
                for (const agent of agents) {
                    // This part is tricky, if multiple agents, can't send multiple res.send
                    // This looks like it should be a message distribution, not an HTTP response per agent.
                    // Assuming the original intent was to process for all, and then send one response.
                    await agent.handleMessage(message);
                }
            }

          // Handle messages for the AgentSet itself
          console.log('Processing message in AgentSet (broadcast or general)');
          if (!res.headersSent) {
            res.status(200).send({ status: 'Message received and processed by AgentSet for relevant agents or self' });
          }
        }
    }

    private async getAgentStatistics(req: express.Request, res: express.Response): Promise<void> {
        const { missionId } = req.params;
        if (!missionId) {
            console.log(`AgentSet:Missing missionId parameter`);
            res.status(400).send('Missing missionId parameter');
            return;
        }

        try {
            // Group agents by status and collect their detailed statistics
            const agentStatisticsByStatus = new Map<string, AgentStatistics[]>();
            let totalAgentCount = 0;
            const allSteps: { id: string, verb: string, status: string, dependencies?: string[] }[] = [];

            for (const agent of this.agents.values()) {
                console.log(`AgentSet: Checking agent ${agent.id} for mission ${missionId}`);
                if (agent.getMissionId() === missionId) {
                    const status = agent.getStatus();
                    totalAgentCount++;

                    // Ensure the array for this status exists
                    if (!agentStatisticsByStatus.has(status)) {
                        agentStatisticsByStatus.set(status, []);
                    }

                    // Get agent's detailed statistics
                    // Assuming Agent class has a method like toAgentStatistics() that returns AgentStatistics
                    // Get agent's detailed statistics using the agent's own getStatistics method
                    const agentStat: AgentStatistics = await agent.getStatistics();
                    agentStatisticsByStatus.get(status)!.push(agentStat);
                    console.log('AgentSet: Collected statistics for agent', agent.id, 'Status:', status, 'Statistics:', agentStat);
                    // Collect all steps for totalSteps count
                    allSteps.push(...agentStat.steps);
                }
            }

            const stats = {
                agentsByStatus: MapSerializer.transformForSerialization(agentStatisticsByStatus),
                agentsCount: totalAgentCount,
                memoryUsage: process.memoryUsage(),
                lastGC: this.lastMemoryCheck,
                totalSteps: allSteps.length
            };

            res.status(200).json(stats);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error in getAgentStatistics for mission ${missionId}:`, error);
            if (!res.headersSent) {
                res.status(500).send({ error: `Failed to get statistics for mission ${missionId}` });
            }
        }
    }

        private async updateFromAgent(req: express.Request, res: express.Response): Promise<void> {
            const { agentId, status, statistics } = req.body;
            console.log(`AgentSet received update from agent ${agentId} with status ${status}`);

            const agent = this.agents.get(agentId);
            if (agent) {
                try {
                    await agent.saveAgentState();
                    if (statistics) {
                        await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/agentStatisticsUpdate`, {
                            agentId,
                            status,
                            statistics,
                            timestamp: new Date().toISOString()
                        });
                    }
                    res.status(200).send({ message: 'Agent updated' });
                } catch (error) {
                    analyzeError(error as Error);
                    console.error(`Error in updateFromAgent for agent ${agentId}:`, error);
                    if (!res.headersSent) {
                        res.status(500).send({ error: `Failed to update agent ${agentId}` });
                    }
                }
            } else {
                console.warn(`Agent ${agentId} not found in this AgentSet`);
                if (!res.headersSent) {
                    res.status(404).send({ error: 'Agent not found' });
                }
            }
        }

    private async getStepDetailsHandler(req: express.Request, res: express.Response): Promise<void> {
        const { stepId } = req.params;
        if (!stepId) {
            res.status(400).send({ error: 'stepId is required' });
            return;
        }

        try {
            const stepDetails = await this.getStepDetails(stepId);
            if (!stepDetails) {
                res.status(404).send({ error: `Step with id ${stepId} not found` });
                return;
            }
            res.status(200).send(stepDetails);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error fetching step details for step ${stepId}:`, error instanceof Error ? error.message : String(error));
            if (!res.headersSent) {
                res.status(500).send({ error: `Failed to fetch step details for step ${stepId}` });
            }
        }
    }

    private async getStepDetails(stepId: string): Promise<any | null> {
        for (const agent of this.agents.values()) {
            const step = agent.steps.find(s => s.id === stepId);
            if (step) {
                // Assuming the 'step' object already contains all necessary details
                // If not, you might need to fetch additional info from the agent or step object
                return {
                    verb: step.actionVerb,
                    description: step.description,
                    status: step.status,
                    dependencies: step.dependencies,
                    inputReferences: MapSerializer.transformForSerialization(step.inputReferences),
                    inputValues: MapSerializer.transformForSerialization(step.inputValues),
                    results: step.result, 
                    agentId: agent.id, // Optionally include agentId for context
                };
            }
        }
        return null; // Step not found
    }

    /**
     * Forward a collaboration message to remote agent sets or external systems.
     * This is called by CollaborationManager when a message is not for a local agent.
     */
    async forwardCollaborationMessage(message: any): Promise<void> {
        // TODO: Implement actual remote forwarding logic (e.g., via HTTP, MQ, etc.)
        console.log('Forwarding collaboration message remotely:', message);
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

            'code' : 'coder',
            
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

    /**
     * Check for agents stuck waiting for user input with unresolved placeholders and fix them
     */
    private async checkAndFixStuckAgents(): Promise<boolean> {
        let fixedAny = false;

        for (const agent of this.agents.values()) {
            try {
                if (agent.checkAndFixStuckUserInput) {
                    const fixed = await agent.checkAndFixStuckUserInput();
                    if (fixed) {
                        console.log(`Fixed stuck agent ${agent.id} with unresolved placeholders`);
                        fixedAny = true;
                    }
                }
            } catch (error) {
                console.error(`Error checking/fixing stuck agent ${agent.id}:`, error);
            }
        }

        return fixedAny;
    }
}

new AgentSet(); // Start the AgentSet application
