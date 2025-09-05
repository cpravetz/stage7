import { agentSetManager, AgentSetManager as AgentSetManagerClass } from '../src/utils/agentSetManager';
import { MapSerializer, AgentSetManagerStatistics, AgentStatistics, InputValue, MessageType, ServiceTokenManager } from '@cktmcs/shared';
import axios from 'axios';
import express from 'express';

// Mock external dependencies
jest.mock('axios');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'),
    ServiceTokenManager: jest.fn(() => ({
        getToken: jest.fn().mockResolvedValue('mock-token'),
    })),
}));
jest.mock('@cktmcs/errorhandler');

describe('AgentSetManager', () => {
    let mockAuthenticatedApi: any;
    let mockServiceTokenManager: jest.Mocked<ServiceTokenManager>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    const MOCK_POSTOFFICE_URL = 'postoffice:5020';
    const MOCK_SECURITYMANAGER_URL = 'securitymanager:5010';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock authenticatedApi (passed from TrafficManager)
        mockAuthenticatedApi = {
            post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
            get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
            put: jest.fn().mockResolvedValue({ status: 200, data: {} }),
            delete: jest.fn().mockResolvedValue({ status: 200, data: {} }),
        };

        // Mock ServiceTokenManager
        mockServiceTokenManager = new ServiceTokenManager('url', 'id', 'secret') as jest.Mocked<ServiceTokenManager>;

        // Suppress console logs
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Re-instantiate agentSetManager to ensure clean state and apply mocks
        // This is a bit tricky because agentSetManager is exported as a const instance.
        // We need to re-assign its internal properties or re-create it if possible.
        // For now, we'll re-assign its authenticatedApi and clear its internal maps.
        (agentSetManager as any).authenticatedApi = mockAuthenticatedApi;
        (agentSetManager as any).agentSets.clear();
        (agentSetManager as any).agentToSetMap.clear();
        (agentSetManager as any).tokenManager = mockServiceTokenManager;
        (agentSetManager as any).postOfficeUrl = MOCK_POSTOFFICE_URL;
        (agentSetManager as any).securityManagerUrl = MOCK_SECURITYMANAGER_URL;

        // Ensure initial population is done for most tests
        jest.spyOn(agentSetManager as any, 'createNewAgentSet').mockResolvedValue(undefined);
        jest.spyOn(agentSetManager as any, 'updateAgentSets').mockResolvedValue(undefined);
        jest.spyOn(agentSetManager as any, 'populateAgentSets').mockResolvedValue(undefined);

        // Manually call constructor logic that sets up interval
        // This is usually done by the TrafficManager constructor
        // For isolated testing, we need to ensure the interval is cleared
        if ((agentSetManager as any).refreshInterval) {
            clearInterval((agentSetManager as any).refreshInterval);
        }
        (agentSetManager as any).refreshInterval = setInterval(() => {}, 60000); // Mock interval
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize properties and set up refresh interval', () => {
            // Properties are set in beforeEach
            expect(agentSetManager.authenticatedApi).toBe(mockAuthenticatedApi);
            expect(agentSetManager.tokenManager).toBe(mockServiceTokenManager);
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
        });
    });

    describe('apiCall', () => {
        it('should use authenticatedApi if available', async () => {
            await agentSetManager['apiCall']('post', 'http://test.url/endpoint', { data: 'test' });
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith('http://test.url/endpoint', { data: 'test' });
        });

        it('should use tokenManager and axios if authenticatedApi is not available', async () => {
            (agentSetManager as any).authenticatedApi = undefined;
            (axios.post as jest.Mock).mockResolvedValueOnce({ data: 'axios-response' });

            const result = await agentSetManager['apiCall']('post', 'http://test.url/endpoint', { data: 'test' });

            expect(mockServiceTokenManager.getToken).toHaveBeenCalledTimes(1);
            expect(axios.post).toHaveBeenCalledWith('http://test.url/endpoint', { data: 'test' }, expect.objectContaining({
                headers: { Authorization: 'Bearer mock-token' }
            }));
            expect(result).toEqual({ data: 'axios-response' });
        });

        it('should handle errors in apiCall', async () => {
            mockAuthenticatedApi.post.mockRejectedValueOnce(new Error('API call failed'));
            await expect(agentSetManager['apiCall']('post', 'http://test.url/endpoint', {})).rejects.toThrow('API call failed');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error in authenticated apiCall'), expect.any(Error));
        });
    });

    describe('updateAgentSets', () => {
        it('should create a new AgentSet if initial population and no sets exist', async () => {
            jest.spyOn(agentSetManager as any, 'createNewAgentSet').mockResolvedValue(undefined);
            await agentSetManager['updateAgentSets'](true); // isInitialPopulation = true
            expect(agentSetManager['createNewAgentSet']).toHaveBeenCalledTimes(1);
        });

        it('should not create new AgentSet if not initial population and sets exist', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'url1', agentCount: 0, maxAgents: 10 });
            jest.spyOn(agentSetManager as any, 'createNewAgentSet');
            await agentSetManager['updateAgentSets'](false);
            expect(agentSetManager['createNewAgentSet']).not.toHaveBeenCalled();
        });

        it('should fetch AgentSets from PostOffice as fallback', async () => {
            (agentSetManager as any).agentSets.clear(); // Ensure no sets
            jest.spyOn(agentSetManager as any, 'createNewAgentSet').mockResolvedValue(undefined); // Prevent createNewAgentSet
            jest.spyOn(agentSetManager as any, 'apiCall').mockResolvedValueOnce({ data: { components: [{ id: 'po-set', type: 'AgentSet', url: 'http://po-agentset' }] } });

            await agentSetManager['updateAgentSets'](true);

            expect(agentSetManager['apiCall']).toHaveBeenCalledWith('get', `http://${MOCK_POSTOFFICE_URL}/requestComponent?type=AgentSet`);
            expect((agentSetManager as any).agentSets.has('po-set')).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('AgentSets found through PostOffice'));
        });

        it('should retry fetching from PostOffice on error', async () => {
            (agentSetManager as any).agentSets.clear();
            jest.spyOn(agentSetManager as any, 'createNewAgentSet').mockResolvedValue(undefined);
            jest.spyOn(agentSetManager as any, 'apiCall')
                .mockRejectedValueOnce(new Error('PO error'))
                .mockResolvedValueOnce({ data: { components: [{ id: 'po-set-retry', type: 'AgentSet', url: 'http://po-agentset-retry' }] } });

            await agentSetManager['updateAgentSets'](true);

            expect(agentSetManager['apiCall']).toHaveBeenCalledTimes(2);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching AgentSet components'), expect.any(Error));
            expect((agentSetManager as any).agentSets.has('po-set-retry')).toBe(true);
        });
    });

    describe('removeEmptySets', () => {
        it('should remove AgentSets with agentCount of 0', () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'url1', agentCount: 0, maxAgents: 10 });
            (agentSetManager as any).agentSets.set('set2', { id: 'set2', url: 'url2', agentCount: 5, maxAgents: 10 });
            jest.spyOn(agentSetManager as any, 'removeAgentSet');

            agentSetManager.removeEmptySets();

            expect(agentSetManager['removeAgentSet']).toHaveBeenCalledWith('set1');
            expect(agentSetManager['removeAgentSet']).not.toHaveBeenCalledWith('set2');
            expect((agentSetManager as any).agentSets.has('set1')).toBe(false);
            expect((agentSetManager as any).agentSets.has('set2')).toBe(true);
        });
    });

    describe('removeAgentSet', () => {
        it('should remove an AgentSet and reassign agents', () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'url1', agentCount: 2, maxAgents: 10 });
            (agentSetManager as any).agentSets.set('set2', { id: 'set2', url: 'url2', agentCount: 0, maxAgents: 10 });
            (agentSetManager as any).agentToSetMap.set('agent1', 'set1');
            (agentSetManager as any).agentToSetMap.set('agent2', 'set1');

            agentSetManager['removeAgentSet']('set1');

            expect((agentSetManager as any).agentSets.has('set1')).toBe(false);
            expect((agentSetManager as any).agentToSetMap.get('agent1')).toBe('set2');
            expect((agentSetManager as any).agentToSetMap.get('agent2')).toBe('set2');
            expect((agentSetManager as any).agentSets.get('set2').agentCount).toBe(2);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Removed AgentSet set1'));
        });
    });

    describe('getAgentUrl', () => {
        it('should return agent URL if found', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            (agentSetManager as any).agentToSetMap.set('agent1', 'set1');
            const url = await agentSetManager.getAgentUrl('agent1');
            expect(url).toBe('http://agentset1');
        });

        it('should return undefined if agent not found', async () => {
            const url = await agentSetManager.getAgentUrl('non-existent');
            expect(url).toBeUndefined();
        });
    });

    describe('getAgentSetUrls', () => {
        it('should return URLs of all known AgentSets', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            (agentSetManager as any).agentSets.set('set2', { id: 'set2', url: 'http://agentset2', agentCount: 0, maxAgents: 10 });
            const urls = await agentSetManager.getAgentSetUrls();
            expect(urls).toEqual(['http://agentset1', 'http://agentset2']);
        });
    });

    describe('getAgentSetUrlForAgent', () => {
        it('should return existing AgentSet URL for agent', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            (agentSetManager as any).agentToSetMap.set('agent1', 'set1');
            const url = await agentSetManager.getAgentSetUrlForAgent('agent1');
            expect(url).toBe('http://agentset1');
        });

        it('should assign agent to first available set if not mapped', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            const url = await agentSetManager.getAgentSetUrlForAgent('new-agent');
            expect(url).toBe('http://agentset1');
            expect((agentSetManager as any).agentToSetMap.get('new-agent')).toBe('set1');
        });

        it('should create new AgentSet if none exist and then assign', async () => {
            (agentSetManager as any).agentSets.clear();
            jest.spyOn(agentSetManager as any, 'createNewAgentSet').mockImplementationOnce(() => {
                (agentSetManager as any).agentSets.set('primary-agentset', { id: 'primary-agentset', url: 'agentset:5100', agentCount: 0, maxAgents: 250 });
                return Promise.resolve();
            });
            const url = await agentSetManager.getAgentSetUrlForAgent('new-agent-no-sets');
            expect(agentSetManager['createNewAgentSet']).toHaveBeenCalledTimes(1);
            expect(url).toBe('agentset:5100');
            expect((agentSetManager as any).agentToSetMap.get('new-agent-no-sets')).toBe('primary-agentset');
        });
    });

    describe('updateAgentLocation', () => {
        it('should update agent location successfully', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            await agentSetManager.updateAgentLocation('agent1', 'http://agentset1');
            expect((agentSetManager as any).agentToSetMap.get('agent1')).toBe('set1');
        });

        it('should throw error if agent set URL not found', async () => {
            await expect(agentSetManager.updateAgentLocation('agent1', 'http://non-existent-set')).rejects.toThrow('Agent set with URL http://non-existent-set not found');
        });
    });

    describe('assignAgentToSet', () => {
        const mockInputs = new Map<string, InputValue>();
        mockInputs.set('goal', { inputName: 'goal', value: 'test', valueType: PluginParameterType.STRING, args: {} });

        beforeEach(() => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            jest.spyOn(agentSetManager as any, 'getAvailableAgentSet').mockResolvedValue({ id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
        });

        it('should assign agent to set and increment agent count', async () => {
            mockAuthenticatedApi.post.mockResolvedValueOnce({ data: { agentId: 'new-agent' } });
            const result = await agentSetManager.assignAgentToSet('new-agent', 'ACCOMPLISH', mockInputs, 'mission1', 'context');

            expect((agentSetManager as any).agentToSetMap.get('new-agent')).toBe('set1');
            expect((agentSetManager as any).agentSets.get('set1').agentCount).toBe(1);
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith('http://agentset1/addAgent', expect.any(Object));
            expect(result).toEqual({ agentId: 'new-agent' });
        });

        it('should throw error if no available agent set', async () => {
            jest.spyOn(agentSetManager as any, 'getAvailableAgentSet').mockResolvedValue(undefined);
            await expect(agentSetManager.assignAgentToSet('new-agent', 'ACCOMPLISH', mockInputs, 'mission1', 'context')).rejects.toThrow('No available agent set found after initialization.');
        });

        it('should handle errors during assignment', async () => {
            mockAuthenticatedApi.post.mockRejectedValueOnce(new Error('Add agent failed'));
            await expect(agentSetManager.assignAgentToSet('new-agent', 'ACCOMPLISH', mockInputs, 'mission1', 'context')).rejects.toThrow('Failed to assign agent new-agent to set set1: Add agent failed');
            expect((agentSetManager as any).agentToSetMap.has('new-agent')).toBe(false); // Should clean up mapping
        });
    });

    describe('removeAgentFromSet', () => {
        it('should remove agent from tracking and decrement count', () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'url1', agentCount: 5, maxAgents: 10 });
            (agentSetManager as any).agentToSetMap.set('agent1', 'set1');

            agentSetManager.removeAgentFromSet('agent1');

            expect((agentSetManager as any).agentSets.get('set1').agentCount).toBe(4);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Decremented agent count'));
        });

        it('should warn if agentSet not found', () => {
            (agentSetManager as any).agentToSetMap.set('agent1', 'non-existent-set');
            agentSetManager.removeAgentFromSet('agent1');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('AgentSet non-existent-set not found'));
        });

        it('should warn if agent not found in map', () => {
            agentSetManager.removeAgentFromSet('non-existent-agent');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Agent non-existent-agent not found in agentToSetMap'));
        });
    });

    describe('sendMessageToAgent', () => {
        const MOCK_MESSAGE = { type: MessageType.REQUEST, content: 'hello' };

        it('should send message to agent successfully', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentUrl').mockResolvedValueOnce('http://agentset1');
            mockAuthenticatedApi.post.mockResolvedValueOnce({ data: { success: true } });

            const result = await agentSetManager.sendMessageToAgent('agent1', MOCK_MESSAGE);

            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith('http://agentset1/agent/agent1/message', MOCK_MESSAGE);
            expect(result).toEqual({ success: true });
        });

        it('should log error if no AgentSet URL found', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentUrl').mockResolvedValueOnce(undefined);
            await agentSetManager.sendMessageToAgent('agent1', MOCK_MESSAGE);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('No AgentSet found for agent'));
        });

        it('should handle errors during sending message', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentUrl').mockResolvedValueOnce('http://agentset1');
            mockAuthenticatedApi.post.mockRejectedValueOnce(new Error('Send error'));
            await agentSetManager.sendMessageToAgent('agent1', MOCK_MESSAGE);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error sending message to agent'), expect.any(Error));
        });
    });

    describe('pauseAgents', () => {
        it('should send pause message to all AgentSets', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            (agentSetManager as any).agentSets.set('set2', { id: 'set2', url: 'http://agentset2', agentCount: 0, maxAgents: 10 });

            await agentSetManager.pauseAgents('mission1');

            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith('http://agentset1/pauseAgents', { missionId: 'mission1' });
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith('http://agentset2/pauseAgents', { missionId: 'mission1' });
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully paused all agents for mission mission1'));
        });

        it('should warn if some AgentSets fail to pause', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            mockAuthenticatedApi.post.mockRejectedValueOnce(new Error('Pause failed'));

            await agentSetManager.pauseAgents('mission1');

            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to pause agents in 1 sets for mission mission1'));
        });
    });

    describe('abortAgents', () => {
        it('should send abort message to all AgentSets', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            await agentSetManager.abortAgents('mission1');
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith('http://agentset1/abortAgents', { missionId: 'mission1' });
        });
    });

    describe('resumeAgents', () => {
        it('should send resume message to all AgentSets', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            await agentSetManager.resumeAgents('mission1');
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith('http://agentset1/resumeAgents', { missionId: 'mission1' });
        });
    });

    describe('resumeAgent', () => {
        it('should send resume message to specific agent', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentSetUrlForAgent').mockResolvedValueOnce('http://agentset1');
            await agentSetManager.resumeAgent('agent1');
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith('http://agentset1/resumeAgent', { agentId: 'agent1' });
        });
    });

    describe('distributeUserMessage', () => {
        it('should distribute user message to all AgentSets', async () => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            const mockReq = { body: { message: 'user message' } } as express.Request;
            await agentSetManager.distributeUserMessage(mockReq);
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith('http://agentset1/message', { message: 'user message' });
        });
    });

    describe('isValidUrl', () => {
        it('should return true for valid URLs', () => {
            expect(agentSetManager.isValidUrl('agentset:5100')).toBe(true);
            expect(agentSetManager.isValidUrl('my-agentset')).toBe(true);
            expect(agentSetManager.isValidUrl('my-agentset:8080')).toBe(true);
        });

        it('should return false for invalid URLs', () => {
            expect(agentSetManager.isValidUrl('http://agentset')).toBe(false);
            expect(agentSetManager.isValidUrl('agentset/')).toBe(false);
            expect(agentSetManager.isValidUrl('agentset:port')).toBe(false);
        });
    });

    describe('isValidMissionId', () => {
        it('should return true for valid mission IDs', () => {
            expect(agentSetManager.isValidMissionId('mission-123')).toBe(true);
            expect(agentSetManager.isValidMissionId('missionABC')).toBe(true);
        });

        it('should return false for invalid mission IDs', () => {
            expect(agentSetManager.isValidMissionId('mission_123')).toBe(false);
            expect(agentSetManager.isValidMissionId('mission!@#')).toBe(false);
        });
    });

    describe('getAgentStatistics', () => {
        const MOCK_MISSION_ID = 'mission-stats';

        beforeEach(() => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            (agentSetManager as any).agentSets.set('set2', { id: 'set2', url: 'http://agentset2', agentCount: 0, maxAgents: 10 });

            mockAuthenticatedApi.get.mockImplementation((url: string) => {
                if (url.includes('agentset1')) {
                    return Promise.resolve({ data: { agentsCount: 2, agentsByStatus: MapSerializer.transformForSerialization(new Map([['RUNNING', [{ id: 'a1' }, { id: 'a2' }]]])) } });
                }
                if (url.includes('agentset2')) {
                    return Promise.resolve({ data: { agentsCount: 1, agentsByStatus: MapSerializer.transformForSerialization(new Map([['COMPLETED', [{ id: 'a3' }]]])) } });
                }
                return Promise.resolve({ data: {} });
            });
        });

        it('should return aggregated agent statistics', async () => {
            const stats = await agentSetManager.getAgentStatistics(MOCK_MISSION_ID);

            expect(stats.agentSetsCount).toBe(2);
            expect(stats.totalAgentsCount).toBe(3);
            expect(stats.agentsByStatus.get('RUNNING')).toEqual([{ id: 'a1' }, { id: 'a2' }]);
            expect(stats.agentsByStatus.get('COMPLETED')).toEqual([{ id: 'a3' }]);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('AgentSetManager getting statistics'));
        });

        it('should throw error for invalid missionId', async () => {
            await expect(agentSetManager.getAgentStatistics('invalid_mission!')).rejects.toThrow('Invalid missionId: invalid_mission!');
        });

        it('should handle errors fetching statistics from individual AgentSets', async () => {
            mockAuthenticatedApi.get.mockImplementation((url: string) => {
                if (url.includes('agentset1')) return Promise.reject(new Error('Fetch error'));
                if (url.includes('agentset2')) return Promise.resolve({ data: { agentsCount: 1, agentsByStatus: MapSerializer.transformForSerialization(new Map([['COMPLETED', [{ id: 'a3' }]]])) } });
                return Promise.resolve({ data: {} });
            });

            const stats = await agentSetManager.getAgentStatistics(MOCK_MISSION_ID);

            expect(stats.totalAgentsCount).toBe(1); // Only from set2
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching statistics from AgentSet at http://agentset1'), expect.any(Error));
        });
    });

    describe('getAgentsByMission', () => {
        const MOCK_MISSION_ID = 'mission-roster';

        beforeEach(() => {
            (agentSetManager as any).agentSets.set('set1', { id: 'set1', url: 'http://agentset1', agentCount: 0, maxAgents: 10 });
            (agentSetManager as any).agentSets.set('set2', { id: 'set2', url: 'http://agentset2', agentCount: 0, maxAgents: 10 });

            mockAuthenticatedApi.get.mockImplementation((url: string) => {
                if (url.includes('agentset1')) {
                    return Promise.resolve({ data: [{ id: 'a1', missionId: MOCK_MISSION_ID }] });
                }
                if (url.includes('agentset2')) {
                    return Promise.resolve({ data: [{ id: 'a2', missionId: MOCK_MISSION_ID }] });
                }
                return Promise.resolve({ data: [] });
            });
        });

        it('should return agents by mission from all AgentSets', async () => {
            const agents = await agentSetManager.getAgentsByMission(MOCK_MISSION_ID);
            expect(agents).toEqual([{ id: 'a1', missionId: MOCK_MISSION_ID }, { id: 'a2', missionId: MOCK_MISSION_ID }]);
            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith('http://agentset1/mission/mission-roster/agents');
            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith('http://agentset2/mission/mission-roster/agents');
        });

        it('should handle errors fetching agents from individual AgentSets', async () => {
            mockAuthenticatedApi.get.mockImplementation((url: string) => {
                if (url.includes('agentset1')) return Promise.reject(new Error('Fetch error'));
                if (url.includes('agentset2')) return Promise.resolve({ data: [{ id: 'a2', missionId: MOCK_MISSION_ID }] });
                return Promise.resolve({ data: [] });
            });

            const agents = await agentSetManager.getAgentsByMission(MOCK_MISSION_ID);
            expect(agents).toEqual([{ id: 'a2', missionId: MOCK_MISSION_ID }]);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to get agents from http://agentset1'), expect.any(Error));
        });
    });

    describe('loadOneAgent', () => {
        const MOCK_AGENT_ID = 'agent-load';

        beforeEach(() => {
            jest.spyOn(agentSetManager as any, 'getAgentSetUrlForAgent').mockResolvedValueOnce(undefined); // Agent not mapped
            jest.spyOn(agentSetManager as any, 'getAvailableAgentSetUrl').mockResolvedValueOnce('http://agentset-available');
            jest.spyOn(agentSetManager as any, 'loadAgentToSet').mockResolvedValueOnce(true);
        });

        it('should load agent to an available set if not mapped', async () => {
            const loaded = await agentSetManager.loadOneAgent(MOCK_AGENT_ID);
            expect(agentSetManager['loadAgentToSet']).toHaveBeenCalledWith(MOCK_AGENT_ID, 'http://agentset-available');
            expect(loaded).toBe(true);
        });

        it('should load agent to its mapped set if mapped', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentSetUrlForAgent').mockResolvedValueOnce('http://agentset-mapped');
            const loaded = await agentSetManager.loadOneAgent(MOCK_AGENT_ID);
            expect(agentSetManager['loadAgentToSet']).toHaveBeenCalledWith(MOCK_AGENT_ID, 'http://agentset-mapped');
            expect(loaded).toBe(true);
        });

        it('should return false if no available agent set', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentSetUrlForAgent').mockResolvedValueOnce(undefined);
            jest.spyOn(agentSetManager as any, 'getAvailableAgentSetUrl').mockResolvedValueOnce(undefined);
            const loaded = await agentSetManager.loadOneAgent(MOCK_AGENT_ID);
            expect(loaded).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('No available agent set found loadingOneAgent'));
        });

        it('should handle errors', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentSetUrlForAgent').mockRejectedValueOnce(new Error('URL error'));
            const loaded = await agentSetManager.loadOneAgent(MOCK_AGENT_ID);
            expect(loaded).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading agent'), expect.any(Error));
        });
    });

    describe('loadAgents', () => {
        const MOCK_MISSION_ID = 'mission-load-agents';

        beforeEach(() => {
            jest.spyOn(agentSetManager as any, 'getAgentIdsByMission').mockResolvedValueOnce(['a1', 'a2']);
            jest.spyOn(agentSetManager, 'loadOneAgent').mockResolvedValue(true);
        });

        it('should load all agents for a mission', async () => {
            const allLoaded = await agentSetManager.loadAgents(MOCK_MISSION_ID);
            expect(agentSetManager['loadOneAgent']).toHaveBeenCalledWith('a1');
            expect(agentSetManager['loadOneAgent']).toHaveBeenCalledWith('a2');
            expect(allLoaded).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('All agents for mission mission-load-agents loaded successfully'));
        });

        it('should return true if no agents found for mission', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentIdsByMission').mockResolvedValueOnce([]);
            const allLoaded = await agentSetManager.loadAgents(MOCK_MISSION_ID);
            expect(allLoaded).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No agents found for mission mission-load-agents'));
        });

        it('should return false if some agents fail to load', async () => {
            jest.spyOn(agentSetManager, 'loadOneAgent')
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);
            const allLoaded = await agentSetManager.loadAgents(MOCK_MISSION_ID);
            expect(allLoaded).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Some agents for mission mission-load-agents failed to load'));
        });

        it('should handle errors', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentIdsByMission').mockRejectedValueOnce(new Error('Get IDs error'));
            const allLoaded = await agentSetManager.loadAgents(MOCK_MISSION_ID);
            expect(allLoaded).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading agents for mission'), expect.any(Error));
        });
    });

    describe('saveOneAgent', () => {
        const MOCK_AGENT_ID = 'agent-save';

        beforeEach(() => {
            jest.spyOn(agentSetManager as any, 'getAgentSetUrlForAgent').mockResolvedValueOnce('http://agentset-mapped');
            jest.spyOn(agentSetManager as any, 'saveAgentInSet').mockResolvedValueOnce(true);
        });

        it('should save one agent successfully', async () => {
            const saved = await agentSetManager.saveOneAgent(MOCK_AGENT_ID);
            expect(agentSetManager['saveAgentInSet']).toHaveBeenCalledWith(MOCK_AGENT_ID, 'http://agentset-mapped');
            expect(saved).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Saving agent: ${MOCK_AGENT_ID}`));
        });

        it('should return false if no AgentSet URL found', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentSetUrlForAgent').mockResolvedValueOnce(undefined);
            const saved = await agentSetManager.saveOneAgent(MOCK_AGENT_ID);
            expect(saved).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('No AgentSet found for agent'));
        });

        it('should handle errors', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentSetUrlForAgent').mockRejectedValueOnce(new Error('URL error'));
            const saved = await agentSetManager.saveOneAgent(MOCK_AGENT_ID);
            expect(saved).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error saving agent'), expect.any(Error));
        });
    });

    describe('saveAgents', () => {
        const MOCK_MISSION_ID = 'mission-save-agents';

        beforeEach(() => {
            jest.spyOn(agentSetManager as any, 'getAgentIdsByMission').mockResolvedValueOnce(['a1', 'a2']);
            jest.spyOn(agentSetManager, 'saveOneAgent').mockResolvedValue(true);
        });

        it('should save all agents for a mission', async () => {
            const allSaved = await agentSetManager.saveAgents(MOCK_MISSION_ID);
            expect(agentSetManager['saveOneAgent']).toHaveBeenCalledWith('a1');
            expect(agentSetManager['saveOneAgent']).toHaveBeenCalledWith('a2');
            expect(allSaved).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('All agents for mission mission-save-agents saved successfully'));
        });

        it('should return true if no agents found for mission', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentIdsByMission').mockResolvedValueOnce([]);
            const allSaved = await agentSetManager.saveAgents(MOCK_MISSION_ID);
            expect(allSaved).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No agents found for mission mission-save-agents'));
        });

        it('should return false if some agents fail to save', async () => {
            jest.spyOn(agentSetManager, 'saveOneAgent')
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);
            const allSaved = await agentSetManager.saveAgents(MOCK_MISSION_ID);
            expect(allSaved).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Some agents for mission mission-save-agents failed to save'));
        });

        it('should handle errors', async () => {
            jest.spyOn(agentSetManager as any, 'getAgentIdsByMission').mockRejectedValueOnce(new Error('Get IDs error'));
            const allSaved = await agentSetManager.saveAgents(MOCK_MISSION_ID);
            expect(allSaved).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error saving agents for mission'), expect.any(Error));
        });
    });

    describe('createNewAgentSet', () => {
        it('should ensure primary agentset reference exists', async () => {
            (agentSetManager as any).agentSets.clear(); // Ensure no existing sets
            await agentSetManager['createNewAgentSet']();
            expect((agentSetManager as any).agentSets.has('primary-agentset')).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Ensured primary agentset reference exists'));
        });

        it('should not create new agentset if primary already exists', async () => {
            (agentSetManager as any).agentSets.set('primary-agentset', { id: 'primary-agentset', url: 'url', agentCount: 0, maxAgents: 0 });
            await agentSetManager['createNewAgentSet']();
            expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Ensured primary agentset reference exists'));
        });
    });
});
