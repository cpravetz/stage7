import { Agent } from '../agents/Agent';
import { Step } from '../agents/Step';
import { AgentSet } from '../AgentSet';

export class OwnershipTransferManager {
    private agentSet: AgentSet;

    constructor(agentSet: AgentSet) {
        this.agentSet = agentSet;
    }

    public async transferStep(stepId: string, fromAgentId: string, toAgentId: string): Promise<{ success: boolean, error?: string }> {
        const fromAgent = this.agentSet.agents.get(fromAgentId);
        const toAgent = this.agentSet.agents.get(toAgentId);

        if (!fromAgent || !toAgent) {
            return { success: false, error: 'Could not find one or both agents for transfer.' };
        }

        const stepIndex = fromAgent.steps.findIndex(s => s.id === stepId);
        if (stepIndex === -1) {
            return { success: false, error: `Step ${stepId} not found on agent ${fromAgentId}.` };
        }

        const [step] = fromAgent.steps.splice(stepIndex, 1);

        step.currentOwnerAgentId = toAgentId;
        step.delegationHistory.push({
            fromAgentId: fromAgentId,
            toAgentId: toAgentId,
            timestamp: new Date().toISOString(),
            reason: `Delegated for role specialization.`,
            transferId: '' // This should be generated
        });
        step.lastOwnershipChange = new Date().toISOString();
        step.isRemotelyOwned = toAgent.id !== step.ownerAgentId;

        toAgent.steps.push(step);

        await this.agentSet.updateStepLocation(stepId, toAgentId, this.agentSet.url);

        return { success: true };
    }
}
