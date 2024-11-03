import { AgentStatus } from './status';

interface Dependency {
    agentId: string;
    dependencies: string[]; // List of other agent IDs that this agent depends on
}

class DependencyManager {
    private dependencies: Record<string, Dependency> = {};

    // Register dependencies for an agent
    async registerDependencies(agentId: string, dependentAgentIds: string[]) {
        this.dependencies[agentId] = { agentId, dependencies: dependentAgentIds };
    }

    // Get dependencies for an agent
    async getDependencies(agentId: string): Promise<string[]> {
        const dependency = this.dependencies[agentId];
        return dependency ? dependency.dependencies : [];
    }

    // Check if all dependencies for an agent are satisfied
    async areDependenciesSatisfied(agentId: string): Promise<boolean> {
        const dependency = this.dependencies[agentId];
        if (!dependency) return true; // No dependencies means it's satisfied

        for (const depAgentId of dependency.dependencies) {
            const depStatus = await this.getAgentStatus(depAgentId);
            if (depStatus !== AgentStatus.COMPLETED) {
                return false;
            }
        }

        return true;
    }

    async getAllDependencies(): Promise<Record<string, Dependency>> {
        return this.dependencies;
    }

    // Get the status of an agent (this should be implemented to fetch the actual status)
    private async getAgentStatus(agentId: string): Promise<AgentStatus> {
        // Implement logic to retrieve agent status from your storage or state management system
        // This is a placeholder implementation
        return AgentStatus.RUNNING;
    }

    // Simulate checking if a dependent agent has completed its task
    isAgentCompleted(agentId: string): boolean {
        // You could implement logic here to check the status of dependent agents from the TrafficManager
        // For now, let's assume agents are completed if they exist.
        return !!this.dependencies[agentId]; 
    }
}

export const dependencyManager = new DependencyManager();
