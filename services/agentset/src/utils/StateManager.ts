import { AgentPersistenceManager } from './AgentPersistenceManager';
import { AgentStatus } from './agentStatus';
import { Step } from '../agents/Step';

export class StateManager {
    private agentPersistenceManager: AgentPersistenceManager;
    private agentId: string;

    constructor(agentId: string, agentPersistenceManager: AgentPersistenceManager) {
        this.agentId = agentId;
        this.agentPersistenceManager = agentPersistenceManager;
    }

    async saveState(agent: any): Promise<void> {
        try {
            await this.agentPersistenceManager.saveAgent({
                id: agent.id,
                status: agent.status,
                output: agent.output,
                inputs: agent.inputs,
                missionId: agent.missionId,
                steps: agent.steps,
                dependencies: agent.dependencies,
                capabilitiesManagerUrl: agent.capabilitiesManagerUrl,
                brainUrl: agent.brainUrl,
                trafficManagerUrl: agent.trafficManagerUrl,
                librarianUrl: agent.librarianUrl,
                conversation: agent.conversation
            });
            console.log('Agent state saved successfully.');
        } catch (error) {
            console.error('Error saving agent state:', error instanceof Error ? error.message : error);
        }
    }

    async loadState(agent: any): Promise<void> {
        try {
            const state = await this.agentPersistenceManager.loadAgent(this.agentId);
            if (state) {
                agent.status = state.status;
                agent.output = state.output;
                agent.inputs = state.inputs;
                agent.missionId = state.missionId;
                agent.steps = state.steps;
                agent.dependencies = state.dependencies;
                agent.capabilitiesManagerUrl = state.capabilitiesManagerUrl;
                agent.brainUrl = state.brainUrl;
                agent.trafficManagerUrl = state.trafficManagerUrl;
                agent.librarianUrl = state.librarianUrl;
                agent.conversation = state.conversation || [];
                console.log('Agent state loaded successfully.');
            }
        } catch (error) {
            console.error('Error loading agent state:', error instanceof Error ? error.message : error);
        }
    }
}