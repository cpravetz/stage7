import { AgentState, AgentPersistenceManager } from './AgentPersistenceManager';
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
                inputs: agent.inputValues,
                missionId: agent.missionId,
                steps: agent.steps,
                dependencies: agent.dependencies,
                capabilitiesManagerUrl: agent.capabilitiesManagerUrl,
                brainUrl: agent.brainUrl,
                trafficManagerUrl: agent.trafficManagerUrl,
                librarianUrl: agent.librarianUrl,
                conversation: agent.conversation,
                missionContext: agent.missionContext
            });
        } catch (error) {
            console.error('Error saving agent state:', error instanceof Error ? error.message : error);
        }
    }

    async loadState(agentId?: string): Promise<any> {
        try {
            const id = agentId || this.agentId;
            const state = await this.agentPersistenceManager.loadAgent(id);
            if (state) {
                console.log(`Agent state loaded successfully for ${id}.`);
                return state;
            }
            return null;
        } catch (error) {
            console.error('Error loading agent state:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    async applyState(agent: any): Promise<void> {
        try {
            const state = await this.loadState();
            if (state) {
                agent.status = state.status;
                agent.output = state.output;
                agent.inputValues = state.inputs;
                agent.missionId = state.missionId;
                
                // Load steps from events
                const stepEvents = await this.agentPersistenceManager.loadStepsForAgent(agent.id);
                agent.steps = stepEvents.map((event: any) => new Step({
                    id: event.stepId,
                    missionId: event.missionId,
                    actionVerb: event.actionVerb,
                    stepNo: event.stepNo,
                    inputValues: new Map(Object.entries(event.inputValues?.entries || {})),
                    description: event.description,
                    dependencies: event.dependencies,
                    outputs: new Map(Object.entries(event.outputs?.entries || {})),
                    status: event.status,
                    recommendedRole: event.recommendedRole,
                    persistenceManager: this.agentPersistenceManager
                }));

                agent.dependencies = state.dependencies;
                agent.capabilitiesManagerUrl = state.capabilitiesManagerUrl;
                agent.brainUrl = state.brainUrl;
                agent.trafficManagerUrl = state.trafficManagerUrl;
                agent.librarianUrl = state.librarianUrl;
                agent.conversation = state.conversation || [];
                agent.missionContext = state.missionContext;
                agent.role = state.role || 'executor';
                agent.roleCustomizations = state.roleCustomizations;
                console.log('Agent state applied successfully.');
            }
        } catch (error) {
            console.error('Error applying agent state:', error instanceof Error ? error.message : error);
        }
    }
}