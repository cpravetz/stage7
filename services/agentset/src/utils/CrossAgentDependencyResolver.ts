import { PluginOutput } from '@cktmcs/shared';
import { StepStatus } from '../agents/Step';
import { AgentSet } from '../AgentSet';
import { Step } from '../agents/Step';

export class CrossAgentDependencyResolver {
    private agentSet: AgentSet;

    constructor(agentSet: AgentSet) {
        this.agentSet = agentSet;
    }

    async getStepOutput(stepId: string, outputName: string): Promise<PluginOutput | null> {
        const location = await this.agentSet.getStepLocation(stepId);
        if (!location) {
            return null;
        }

        // If the step is in the same AgentSet, we can try to get it directly
        if (location.agentSetUrl === this.agentSet.url) {
            const agent = this.agentSet.agents.get(location.agentId);
            if (agent) {
                const step = agent.steps.find(s => s.id === stepId);
                if (step && step.result) {
                    return step.result.find(o => o.name === outputName) || null;
                }
            }
        }

        // If the step is in a different AgentSet, we need to make an API call
        // This part needs to be implemented, likely involving the TrafficManager
        // to find the other AgentSet and then making a request to it.
        console.warn(`Cross-agent dependency resolution for step ${stepId} is not fully implemented.`);
        return null;
    }

    async getStepStatus(stepId: string): Promise<StepStatus | null> {
        const location = await this.agentSet.getStepLocation(stepId);
        if (!location) {
            return null;
        }

        if (location.agentSetUrl === this.agentSet.url) {
            const agent = this.agentSet.agents.get(location.agentId);
            if (agent) {
                const step = agent.steps.find(s => s.id === stepId);
                if (step) {
                    return step.status;
                }
            }
        }
        
        console.warn(`Cross-agent status check for step ${stepId} is not fully implemented.`);
        return null;
    }
}
