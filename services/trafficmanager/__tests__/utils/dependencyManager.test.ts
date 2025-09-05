import { dependencyManager, DependencyManager as DependencyManagerClass } from '../src/utils/dependencyManager';
import { AgentStatus } from '../src/utils/status';

describe('DependencyManager', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For Date.now() if used internally

        // Reset the singleton instance's internal state
        (dependencyManager as any).dependencies = {};

        // Suppress console logs
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('registerDependencies', () => {
        it('should register dependencies for an agent', async () => {
            await dependencyManager.registerDependencies('agent1', ['dep1', 'dep2']);
            expect((dependencyManager as any).dependencies['agent1']).toEqual({ agentId: 'agent1', dependencies: ['dep1', 'dep2'] });
        });

        it('should overwrite existing dependencies for an agent', async () => {
            await dependencyManager.registerDependencies('agent1', ['dep1']);
            await dependencyManager.registerDependencies('agent1', ['dep3']);
            expect((dependencyManager as any).dependencies['agent1']).toEqual({ agentId: 'agent1', dependencies: ['dep3'] });
        });
    });

    describe('getDependencies', () => {
        it('should return dependencies for an agent', async () => {
            await dependencyManager.registerDependencies('agent1', ['dep1', 'dep2']);
            const deps = await dependencyManager.getDependencies('agent1');
            expect(deps).toEqual(['dep1', 'dep2']);
        });

        it('should return empty array if no dependencies registered', async () => {
            const deps = await dependencyManager.getDependencies('agent1');
            expect(deps).toEqual([]);
        });
    });

    describe('areDependenciesSatisfied', () => {
        let getAgentStatusSpy: jest.SpyInstance;

        beforeEach(() => {
            getAgentStatusSpy = jest.spyOn(dependencyManager as any, 'getAgentStatus');
        });

        it('should return true if no dependencies', async () => {
            const satisfied = await dependencyManager.areDependenciesSatisfied('agent1');
            expect(satisfied).toBe(true);
            expect(getAgentStatusSpy).not.toHaveBeenCalled();
        });

        it('should return true if all dependencies are completed', async () => {
            await dependencyManager.registerDependencies('agent1', ['dep1', 'dep2']);
            getAgentStatusSpy.mockResolvedValue(AgentStatus.COMPLETED);

            const satisfied = await dependencyManager.areDependenciesSatisfied('agent1');
            expect(satisfied).toBe(true);
            expect(getAgentStatusSpy).toHaveBeenCalledWith('dep1');
            expect(getAgentStatusSpy).toHaveBeenCalledWith('dep2');
        });

        it('should return false if any dependency is not completed', async () => {
            await dependencyManager.registerDependencies('agent1', ['dep1', 'dep2']);
            getAgentStatusSpy.mockResolvedValueOnce(AgentStatus.COMPLETED);
            getAgentStatusSpy.mockResolvedValueOnce(AgentStatus.RUNNING); // dep2 not completed

            const satisfied = await dependencyManager.areDependenciesSatisfied('agent1');
            expect(satisfied).toBe(false);
        });

        it('should handle nested dependencies (recursive check)', async () => {
            await dependencyManager.registerDependencies('agentA', ['agentB']);
            await dependencyManager.registerDependencies('agentB', ['agentC']);
            getAgentStatusSpy.mockImplementation(async (agentId: string) => {
                if (agentId === 'agentC') return AgentStatus.COMPLETED;
                return AgentStatus.RUNNING; // Default for others
            });

            const satisfied = await dependencyManager.areDependenciesSatisfied('agentA');
            expect(satisfied).toBe(false);
            expect(getAgentStatusSpy).toHaveBeenCalledWith('agentB');
            expect(getAgentStatusSpy).toHaveBeenCalledWith('agentC');
        });

        it('should handle errors in getAgentStatus and return false', async () => {
            await dependencyManager.registerDependencies('agent1', ['dep1']);
            getAgentStatusSpy.mockRejectedValueOnce(new Error('Status fetch error'));

            const satisfied = await dependencyManager.areDependenciesSatisfied('agent1');
            expect(satisfied).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error retrieving status for agent'), expect.any(Error));
        });
    });

    describe('getAllDependencies', () => {
        it('should return all registered dependencies', async () => {
            await dependencyManager.registerDependencies('agent1', ['dep1']);
            await dependencyManager.registerDependencies('agent2', ['dep3', 'dep4']);
            const allDeps = await dependencyManager.getAllDependencies();
            expect(allDeps).toEqual({
                agent1: { agentId: 'agent1', dependencies: ['dep1'] },
                agent2: { agentId: 'agent2', dependencies: ['dep3', 'dep4'] },
            });
        });

        it('should return empty object if no dependencies registered', async () => {
            const allDeps = await dependencyManager.getAllDependencies();
            expect(allDeps).toEqual({});
        });
    });

    describe('getAgentStatus (private)', () => {
        it('should return AgentStatus.RUNNING as placeholder', async () => {
            const status = await (dependencyManager as any).getAgentStatus('any-agent');
            expect(status).toBe(AgentStatus.RUNNING);
        });
    });

    describe('isAgentCompleted', () => {
        it('should return true if agent exists in dependencies (placeholder)', async () => {
            await dependencyManager.registerDependencies('agent1', []);
            expect(dependencyManager.isAgentCompleted('agent1')).toBe(true);
        });

        it('should return false if agent does not exist in dependencies (placeholder)', () => {
            expect(dependencyManager.isAgentCompleted('non-existent')).toBe(false);
        });
    });
});
