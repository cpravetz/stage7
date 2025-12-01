import { PluginOutput, createAuthenticatedAxios } from '@cktmcs/shared';
import { StepStatus } from '../agents/Step';
import { AgentSet } from '../AgentSet';
import { Step } from '../agents/Step';

export class CrossAgentDependencyResolver {
    private agentSet: AgentSet;
    private authenticatedApi: any;

    constructor(agentSet: AgentSet) {
        this.agentSet = agentSet;
        this.authenticatedApi = createAuthenticatedAxios({
            serviceId: 'AgentSet',
            clientSecret: process.env.CLIENT_SECRET || 'defaultSecret',
            securityManagerUrl: process.env.SECURITY_MANAGER_URL || 'http://securitymanager:5010',
        });
    }

    async getStepOutput(stepId: string, outputName: string): Promise<PluginOutput | null> {
        const stepDetails = await this.getStepDetails(stepId);
        if (stepDetails && stepDetails.result) {
            return stepDetails.result.find(o => o.name === outputName) || null;
        }
        return null;
    }

    async getStepStatus(stepId: string): Promise<StepStatus | null> {
        const stepDetails = await this.getStepDetails(stepId);
        return stepDetails?.status || null;
    }

    async getStepDetails(stepId: string): Promise<Step | null> {
        const location = await this.agentSet.getStepLocation(stepId);
        if (!location) {
            console.warn(`[CrossAgentDependencyResolver] No location found for step ${stepId}`);
            return null;
        }

        if (location.agentSetUrl === this.agentSet.url) {
            const agent = this.agentSet.agents.get(location.agentId);
            if (agent) {
                const step = agent.steps.find(s => s.id === stepId);
                if (step) {
                    return step;
                }
            }
        }
        
        try {
            const response = await this.authenticatedApi.get(`http://${location.agentSetUrl}/agent/step/${stepId}`);
            if (response.data) {
                // The data is a plain object, so we need to reconstruct a Step instance.
                // This is a simplified reconstruction. A more robust implementation might be needed.
                return new Step({
                    ...response.data,
                    persistenceManager: this.agentSet.persistenceManager, // HACK: this is not ideal
                    crossAgentResolver: this,
                });
            }
        } catch (error) {
            console.error(`[CrossAgentDependencyResolver] Error fetching step details for ${stepId} from ${location.agentSetUrl}:`, error);
        }

        return null;
    }
}
