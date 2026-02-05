import { AgentState, AgentPersistenceManager } from './AgentPersistenceManager';
import { Step } from '../agents/Step';
import { MapSerializer } from '@cktmcs/shared';
import { CrossAgentDependencyResolver } from './CrossAgentDependencyResolver';

export class StateManager {
    private agentPersistenceManager: AgentPersistenceManager;
    private agentId: string;
    private crossAgentResolver: CrossAgentDependencyResolver;

    constructor(agentId: string, agentPersistenceManager: AgentPersistenceManager, crossAgentResolver: CrossAgentDependencyResolver) {
        this.agentId = agentId;
        this.agentPersistenceManager = agentPersistenceManager;
        this.crossAgentResolver = crossAgentResolver;
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
                librarianUrl: agent.librarianUrl,
                conversation: agent.conversation,
                missionContext: agent.missionContext,
                userId: agent.userId,
                agentClass: agent.agentClass,
                instanceId: agent.instanceId,
                lastFailedStep: agent.lastFailedStep
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
                agent.steps = stepEvents.map((event: any) => {
                    // event.inputValues and event.outputs are stored in serialized Map shape
                    let deserializedInputValues: Map<string, any> = new Map();
                    let deserializedOutputs: Map<string, any> = new Map();
                    try {
                        if (event.inputValues) {
                            const transformed = MapSerializer.transformFromSerialization(event.inputValues);
                            if (transformed instanceof Map) deserializedInputValues = transformed as Map<string, any>;
                            else if (typeof transformed === 'object') deserializedInputValues = new Map(Object.entries(transformed));
                        }
                    } catch (e) {
                        console.warn('StateManager.applyState: Failed to deserialize inputValues for step', event.stepId, e instanceof Error ? e.message : e);
                    }
                    try {
                        if (event.outputs) {
                            const transformedOut = MapSerializer.transformFromSerialization(event.outputs);
                            if (transformedOut instanceof Map) deserializedOutputs = transformedOut as Map<string, any>;
                            else if (typeof transformedOut === 'object') deserializedOutputs = new Map(Object.entries(transformedOut));
                        }
                    } catch (e) {
                        console.warn('StateManager.applyState: Failed to deserialize outputs for step', event.stepId, e instanceof Error ? e.message : e);
                    }

                    return new Step({
                        id: event.stepId,
                        missionId: event.missionId,
                        ownerAgentId: agent.id,
                        actionVerb: event.actionVerb,
                        inputValues: deserializedInputValues,
                        description: event.description,
                        dependencies: event.dependencies,
                        outputs: deserializedOutputs,
                        status: event.status,
                        recommendedRole: event.recommendedRole,
                        persistenceManager: this.agentPersistenceManager,
                        crossAgentResolver: this.crossAgentResolver
                    });
                });

                agent.dependencies = state.dependencies;
                agent.capabilitiesManagerUrl = state.capabilitiesManagerUrl;
                agent.brainUrl = state.brainUrl;
                agent.librarianUrl = state.librarianUrl;
                agent.conversation = state.conversation || [];
                agent.missionContext = state.missionContext;
                agent.userId = state.userId;
                agent.agentClass = state.agentClass;
                agent.instanceId = state.instanceId;
                agent.role = state.role || 'executor';
                agent.roleCustomizations = state.roleCustomizations;
                agent.lastFailedStep = state.lastFailedStep;
                console.log('Agent state applied successfully.');
            }
        } catch (error) {
            console.error('Error applying agent state:', error instanceof Error ? error.message : error);
        }
    }
}