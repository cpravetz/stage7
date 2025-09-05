import request from 'supertest';
import express from 'express';
import { TrafficManager } from '../src/TrafficManager';
import { agentSetManager } from '../src/utils/agentSetManager';
import { dependencyManager } from '../src/utils/dependencyManager';
import { AgentStatus } from '../src/utils/status';
import { BaseEntity, MapSerializer, MessageType, PluginParameterType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { v4 as uuidv4 } from 'uuid';

// Mock external dependencies
jest.mock('express');
jest.mock('uuid');
jest.mock('../src/utils/agentSetManager');
jest.mock('../src/utils/dependencyManager');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'),
    BaseEntity: jest.fn().mockImplementation(() => ({
        id: 'mock-trafficmanager-id',
        componentType: 'TrafficManager',
        url: 'http://mock-trafficmanager:5080',
        port: '5080',
        authenticatedApi: {
            post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
            get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
        },
        verifyToken: jest.fn((req, res, next) => next()), // Mock verifyToken to just call next
        initializeMessageQueue: jest.fn().mockResolvedValue(undefined),
        initializeServiceDiscovery: jest.fn().mockResolvedValue(undefined),
        registerWithPostOffice: jest.fn().mockResolvedValue(undefined),
        logAndSay: jest.fn().mockResolvedValue(undefined),
    })),
}));
jest.mock('@cktmcs/errorhandler');

// Cast mocked functions
const mockExpress = express as jest.MockedFunction<typeof express>;
const mockUuidv4 = uuidv4 as jest.Mock;
const mockAgentSetManager = agentSetManager as jest.Mocked<typeof agentSetManager>;
const mockDependencyManager = dependencyManager as jest.Mocked<typeof dependencyManager>;
const mockAnalyzeError = analyzeError as jest.Mock;

describe('TrafficManager Service', () => {
    let trafficManager: TrafficManager;
    let mockApp: jest.Mocked<express.Application>;
    let mockAuthenticatedApiPost: jest.Mock;
    let mockAuthenticatedApiGet: jest.Mock;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    // Mock the actual express app instance that TrafficManager will use
    const realExpress = jest.requireActual('express');

    beforeAll(() => {
        // Mock express() to return a controllable app instance
        mockExpress.mockImplementation(() => {
            const app = realExpress();
            // Spy on app.use to capture middleware
            jest.spyOn(app, 'use');
            jest.spyOn(app, 'post');
            jest.spyOn(app, 'get');
            jest.spyOn(app, 'listen');
            return app;
        });
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock the Express app instance
        mockApp = {
            use: jest.fn(),
            post: jest.fn(),
            get: jest.fn(),
            listen: jest.fn((port, callback) => callback()),
        } as unknown as jest.Mocked<express.Application>;

        // Ensure express() returns our mockApp
        mockExpress.mockReturnValue(mockApp);

        // Get the mocked authenticatedApi from the BaseEntity mock
        const BaseEntityMockInstance = new (BaseEntity as jest.Mock)();
        mockAuthenticatedApiPost = BaseEntityMockInstance.authenticatedApi.post;
        mockAuthenticatedApiGet = BaseEntityMockInstance.authenticatedApi.get;

        // Suppress console logs
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Instantiate TrafficManager
        trafficManager = new TrafficManager();

        // Ensure the internal authenticatedApi is the mocked one for consistency
        (trafficManager as any).authenticatedApi = BaseEntityMockInstance.authenticatedApi;

        // Mock agentSetManager and dependencyManager methods
        mockAgentSetManager.assignAgentToSet.mockResolvedValue({ success: true });
        mockAgentSetManager.pauseAgents.mockResolvedValue(undefined);
        mockAgentSetManager.abortAgents.mockResolvedValue(undefined);
        mockAgentSetManager.resumeAgents.mockResolvedValue(undefined);
        mockAgentSetManager.getAgentStatistics.mockResolvedValue({ totalAgentsCount: 0, agentSetsCount: 0, agentsByStatus: new Map() });
        mockAgentSetManager.distributeUserMessage.mockResolvedValue(undefined);
        mockAgentSetManager.getAgentSetUrlForAgent.mockResolvedValue('mock-agentset-url');
        mockAgentSetManager.updateAgentLocation.mockResolvedValue(undefined);
        mockAgentSetManager.getAgentsByMission.mockResolvedValue([]);
        mockAgentSetManager.removeEmptySets.mockResolvedValue(undefined);

        mockDependencyManager.registerDependencies.mockResolvedValue(undefined);
        mockDependencyManager.getDependencies.mockResolvedValue([]);
        mockDependencyManager.getAllDependencies.mockResolvedValue({});

        // Mock uuidv4
        mockUuidv4.mockReturnValue('mock-uuid');

        // Mock process.env for service URLs
        process.env.MISSIONCONTROL_URL = 'mock-missioncontrol:5010';
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('should initialize BaseEntity and configure middleware and routes', () => {
        expect(BaseEntity).toHaveBeenCalledTimes(1);
        expect(BaseEntity).toHaveBeenCalledWith('TrafficManager', 'TrafficManager', 'trafficmanager', '5080');
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // express.json
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // verifyToken middleware
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // router
        expect(mockApp.listen).toHaveBeenCalledWith('5080', expect.any(Function));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('TrafficManager running on port 5080'));

        // Check that agentSetManager.authenticatedApi is set
        expect(mockAgentSetManager.authenticatedApi).toBeDefined();
    });

    describe('POST /message', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/message')[1];
        });

        it('should process message and return success', async () => {
            const mockMessage = { type: MessageType.REQUEST, content: 'test' };
            jest.spyOn(trafficManager as any, 'processMessage').mockResolvedValueOnce({ status: 'processed' });

            const res = await request(mockApp).post('/message').send(mockMessage);

            expect(trafficManager.processMessage).toHaveBeenCalledWith(mockMessage);
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ status: 'processed' });
        });

        it('should return 500 for internal errors', async () => {
            jest.spyOn(trafficManager as any, 'processMessage').mockRejectedValueOnce(new Error('Processing error'));
            const res = await request(mockApp).post('/message').send({});

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to process message' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error processing message'), expect.any(Error));
        });
    });

    describe('POST /createAgent', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/createAgent')[1];
        });

        it('should create an agent successfully', async () => {
            const mockInputs = new Map<string, InputValue>();
            mockInputs.set('goal', { inputName: 'goal', value: 'test', valueType: PluginParameterType.STRING, args: {} });

            const mockReqBody = {
                actionVerb: 'ACCOMPLISH',
                inputs: MapSerializer.transformForSerialization(mockInputs),
                missionId: 'mission-1',
                missionContext: 'context',
                dependencies: [],
            };

            const res = await request(mockApp).post('/createAgent').send(mockReqBody);

            expect(mockUuidv4).toHaveBeenCalledTimes(1);
            expect(mockDependencyManager.registerDependencies).toHaveBeenCalledWith('mock-uuid', []);
            expect(mockAgentSetManager.assignAgentToSet).toHaveBeenCalledWith('mock-uuid', 'ACCOMPLISH', expect.any(Map), 'mission-1', 'context');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'Agent created and assigned.', agentId: 'mock-uuid', response: { success: true } });
        });

        it('should return 500 for internal errors', async () => {
            mockAgentSetManager.assignAgentToSet.mockRejectedValueOnce(new Error('AgentSet error'));
            const res = await request(mockApp).post('/createAgent').send({});

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to create agent' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error creating agent'), expect.any(Error));
        });

        it('should return 200 and message if agent is waiting for dependencies', async () => {
            mockDependencyManager.getDependencies.mockResolvedValueOnce(['dep-agent-id']); // Simulate dependencies
            jest.spyOn(trafficManager as any, 'getAgentStatus').mockResolvedValueOnce(AgentStatus.INITIALIZING); // Dependency not completed

            const mockReqBody = {
                actionVerb: 'ACCOMPLISH',
                inputs: MapSerializer.transformForSerialization(new Map()),
                missionId: 'mission-1',
                dependencies: ['dep-agent-id'],
            };

            const res = await request(mockApp).post('/createAgent').send(mockReqBody);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'Agent created but waiting for dependencies.', agentId: 'mock-uuid' });
            expect(mockAgentSetManager.assignAgentToSet).not.toHaveBeenCalled();
        });
    });

    describe('POST /pauseAgents', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/pauseAgents')[1];
        });

        it('should pause agents successfully', async () => {
            const res = await request(mockApp).post('/pauseAgents').send({ missionId: 'mission-1' });
            expect(mockAgentSetManager.pauseAgents).toHaveBeenCalledWith('mission-1');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'Agent paused successfully.' });
        });

        it('should return 500 for internal errors', async () => {
            mockAgentSetManager.pauseAgents.mockRejectedValueOnce(new Error('Pause error'));
            const res = await request(mockApp).post('/pauseAgents').send({});
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to pause agent' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error pausing agent'), expect.any(Error));
        });
    });

    describe('POST /abortAgents', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/abortAgents')[1];
        });

        it('should abort agents successfully', async () => {
            const res = await request(mockApp).post('/abortAgents').send({ missionId: 'mission-1' });
            expect(mockAgentSetManager.abortAgents).toHaveBeenCalledWith('mission-1');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'Agent aborted successfully.' });
        });

        it('should return 500 for internal errors', async () => {
            mockAgentSetManager.abortAgents.mockRejectedValueOnce(new Error('Abort error'));
            const res = await request(mockApp).post('/abortAgents').send({});
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to abort agent' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error aborting agent'), expect.any(Error));
        });
    });

    describe('POST /resumeAgents', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/resumeAgents')[1];
        });

        it('should resume agents successfully', async () => {
            const res = await request(mockApp).post('/resumeAgents').send({ missionId: 'mission-1' });
            expect(mockAgentSetManager.resumeAgents).toHaveBeenCalledWith('mission-1');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'Agent resumed successfully.' });
        });

        it('should return 500 for internal errors', async () => {
            mockAgentSetManager.resumeAgents.mockRejectedValueOnce(new Error('Resume error'));
            const res = await request(mockApp).post('/resumeAgents').send({});
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to resume agent' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error resuming agent'), expect.any(Error));
        });
    });

    describe('GET /getAgentStatistics/:missionId', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.get.mock.calls.find(call => call[0] === '/getAgentStatistics/:missionId')[1];
        });

        it('should return agent statistics successfully', async () => {
            const mockStats = { totalAgentsCount: 2, agentSetsCount: 1, agentsByStatus: new Map([['RUNNING', [{ id: 'a1' } as any]]) };
            mockAgentSetManager.getAgentStatistics.mockResolvedValueOnce(mockStats);

            const res = await request(mockApp).get('/getAgentStatistics/mission-1');

            expect(mockAgentSetManager.getAgentStatistics).toHaveBeenCalledWith('mission-1');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(expect.objectContaining({
                agentStatisticsByType: { totalAgents: 2, agentCountByStatus: { RUNNING: 1 }, agentSetCount: 1 },
            }));
        });

        it('should return 400 if missionId is missing', async () => {
            const res = await request(mockApp).get('/getAgentStatistics/');
            expect(res.statusCode).toBe(400);
            expect(res.text).toBe('Missing missionId parameter');
        });

        it('should return 500 for internal errors', async () => {
            mockAgentSetManager.getAgentStatistics.mockRejectedValueOnce(new Error('Stats error'));
            const res = await request(mockApp).get('/getAgentStatistics/mission-1');
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to fetch agent statistics' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching agent statistics'), expect.any(Error));
        });
    });

    describe('POST /checkBlockedAgents', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/checkBlockedAgents')[1];
        });

        it('should check and resume blocked agents successfully', async () => {
            mockDependencyManager.getDependencies.mockResolvedValueOnce(['blocked-agent-1']);
            jest.spyOn(trafficManager as any, 'getAgentStatus').mockResolvedValueOnce(AgentStatus.COMPLETED); // Dependency satisfied

            const res = await request(mockApp).post('/checkBlockedAgents').send({ completedAgentId: 'completed-agent' });

            expect(mockDependencyManager.getDependencies).toHaveBeenCalledWith('completed-agent');
            expect(trafficManager['getAgentStatus']).toHaveBeenCalledWith('blocked-agent-1');
            expect(mockAgentSetManager.resumeAgent).toHaveBeenCalledWith('blocked-agent-1');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'Blocked agents checked and resumed if possible' });
        });

        it('should return 400 if completedAgentId is missing', async () => {
            const res = await request(mockApp).post('/checkBlockedAgents').send({});
            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ error: 'completedAgentId is required' });
        });

        it('should return 500 for internal errors', async () => {
            mockDependencyManager.getDependencies.mockRejectedValueOnce(new Error('Dep error'));
            const res = await request(mockApp).post('/checkBlockedAgents').send({ completedAgentId: 'agent-1' });
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to check blocked agents' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error checking blocked agents'), expect.any(Error));
        });
    });

    describe('GET /dependentAgents/:agentId', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.get.mock.calls.find(call => call[0] === '/dependentAgents/:agentId')[1];
        });

        it('should return dependent agents successfully', async () => {
            mockDependencyManager.getAllDependencies.mockResolvedValueOnce({
                'agent-b': { dependencies: ['agent-a'] },
                'agent-c': { dependencies: ['agent-a', 'agent-b'] },
            });

            const res = await request(mockApp).get('/dependentAgents/agent-a');

            expect(mockDependencyManager.getAllDependencies).toHaveBeenCalledTimes(1);
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(['agent-b', 'agent-c']);
        });

        it('should return empty array if no dependent agents', async () => {
            mockDependencyManager.getAllDependencies.mockResolvedValueOnce({});
            const res = await request(mockApp).get('/dependentAgents/agent-a');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual([]);
        });

        it('should return 500 for internal errors', async () => {
            mockDependencyManager.getAllDependencies.mockRejectedValueOnce(new Error('Dep error'));
            const res = await request(mockApp).get('/dependentAgents/agent-a');
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to get dependent agents' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting dependent agents'), expect.any(Error));
        });
    });

    describe('POST /distributeUserMessage', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/distributeUserMessage')[1];
        });

        it('should distribute user message successfully', async () => {
            const mockMessage = { missionId: 'm1', message: 'hello' };
            const res = await request(mockApp).post('/distributeUserMessage').send(mockMessage);

            expect(mockAgentSetManager.distributeUserMessage).toHaveBeenCalledWith(expect.any(Object)); // req object
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'User message distributed successfully' });
        });

        it('should return 500 for internal errors', async () => {
            mockAgentSetManager.distributeUserMessage.mockRejectedValueOnce(new Error('Distribute error'));
            const res = await request(mockApp).post('/distributeUserMessage').send({});
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to distribute user message' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error distributing user message'), expect.any(Error));
        });
    });

    describe('GET /getAgentLocation/:agentId', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.get.mock.calls.find(call => call[0] === '/getAgentLocation/:agentId')[1];
        });

        it('should return agent location successfully', async () => {
            mockAgentSetManager.getAgentSetUrlForAgent.mockResolvedValueOnce('http://agentset:8000');
            const res = await request(mockApp).get('/getAgentLocation/agent-1');

            expect(mockAgentSetManager.getAgentSetUrlForAgent).toHaveBeenCalledWith('agent-1');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ agentId: 'agent-1', agentSetUrl: 'http://agentset:8000' });
        });

        it('should return 404 if agent not found', async () => {
            mockAgentSetManager.getAgentSetUrlForAgent.mockResolvedValueOnce(undefined);
            const res = await request(mockApp).get('/getAgentLocation/agent-1');
            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: 'Agent agent-1 not found' });
        });

        it('should return 500 for internal errors', async () => {
            mockAgentSetManager.getAgentSetUrlForAgent.mockRejectedValueOnce(new Error('Location error'));
            const res = await request(mockApp).get('/getAgentLocation/agent-1');
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to get agent location' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting agent location'), expect.any(Error));
        });
    });

    describe('POST /updateAgentLocation', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/updateAgentLocation')[1];
        });

        it('should update agent location successfully', async () => {
            const res = await request(mockApp).post('/updateAgentLocation').send({ agentId: 'agent-1', agentSetUrl: 'http://new-agentset:8000' });

            expect(mockAgentSetManager.updateAgentLocation).toHaveBeenCalledWith('agent-1', 'http://new-agentset:8000');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'Agent agent-1 location updated to http://new-agentset:8000' });
        });

        it('should return 400 if agentId or agentSetUrl is missing', async () => {
            const res = await request(mockApp).post('/updateAgentLocation').send({});
            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ error: 'agentId and agentSetUrl are required' });
        });

        it('should return 500 for internal errors', async () => {
            mockAgentSetManager.updateAgentLocation.mockRejectedValueOnce(new Error('Update error'));
            const res = await request(mockApp).post('/updateAgentLocation').send({ agentId: 'agent-1', agentSetUrl: 'url' });
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to update agent location' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error updating agent location'), expect.any(Error));
        });
    });

    describe('POST /agentStatisticsUpdate', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/agentStatisticsUpdate')[1];
        });

        it('should update agent statistics and forward to MissionControl', async () => {
            const mockStats = { agentId: 'agent-1', status: AgentStatus.RUNNING, statistics: { cpu: 0.5 }, missionId: 'm1' };
            const res = await request(mockApp).post('/agentStatisticsUpdate').send(mockStats);

            expect(trafficManager['agentStatusMap'].get('agent-1')).toBe(AgentStatus.RUNNING);
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/agentStatisticsUpdate'), expect.objectContaining({
                agentId: 'agent-1',
                missionId: 'm1',
                statistics: { cpu: 0.5 },
            }));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'Agent statistics updated successfully.' });
        });

        it('should handle errors forwarding to MissionControl', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('MC error'));
            const mockStats = { agentId: 'agent-1', status: AgentStatus.RUNNING, statistics: { cpu: 0.5 }, missionId: 'm1' };
            const res = await request(mockApp).post('/agentStatisticsUpdate').send(mockStats);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to forward statistics to MissionControl'), expect.any(Error));
            expect(res.statusCode).toBe(200); // Still 200 even if forwarding fails
        });

        it('should return 500 for internal errors', async () => {
            jest.spyOn(trafficManager as any, 'agentStatusMap', 'set').mockImplementationOnce(() => { throw new Error('Map error'); });
            const res = await request(mockApp).post('/agentStatisticsUpdate').send({});
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to update agent statistics' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error updating agent statistics'), expect.any(Error));
        });
    });

    describe('GET /mission/:missionId/roster', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.get.mock.calls.find(call => call[0] === '/mission/:missionId/roster')[1];
        });

        it('should return mission roster successfully', async () => {
            mockAgentSetManager.getAgentsByMission.mockResolvedValueOnce(['agent-1', 'agent-2']);
            const res = await request(mockApp).get('/mission/m1/roster');

            expect(mockAgentSetManager.getAgentsByMission).toHaveBeenCalledWith('m1');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(['agent-1', 'agent-2']);
        });

        it('should return 400 if missionId is missing', async () => {
            const res = await request(mockApp).get('/mission//roster'); // Missing missionId
            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ error: 'missionId is required' });
        });

        it('should return 500 for internal errors', async () => {
            mockAgentSetManager.getAgentsByMission.mockRejectedValueOnce(new Error('Roster error'));
            const res = await request(mockApp).get('/mission/m1/roster');
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to get mission roster' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting mission roster'), expect.any(Error));
        });
    });

    describe('updateAgentStatus', () => {
        const mockMessage: Message = { type: MessageType.AGENT_UPDATE, sender: 'agent-1', content: { status: AgentStatus.COMPLETED, missionId: 'm1', statistics: {} } };

        it('should update agent status to COMPLETED and handle completion', async () => {
            jest.spyOn(trafficManager as any, 'handleAgentCompletion').mockResolvedValue(undefined);
            await (trafficManager as any).updateAgentStatus(mockMessage);

            expect(trafficManager['agentStatusMap'].get('agent-1')).toBe(AgentStatus.COMPLETED);
            expect(trafficManager['handleAgentCompletion']).toHaveBeenCalledWith('agent-1');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Updating status for agent agent-1 to COMPLETED'));
        });

        it('should update agent status to ERROR and handle error', async () => {
            const errorMessage = { ...mockMessage, content: { status: AgentStatus.ERROR, missionId: 'm1', statistics: {} } };
            jest.spyOn(trafficManager as any, 'handleAgentError').mockResolvedValue(undefined);
            await (trafficManager as any).updateAgentStatus(errorMessage);

            expect(trafficManager['agentStatusMap'].get('agent-1')).toBe(AgentStatus.ERROR);
            expect(trafficManager['handleAgentError']).toHaveBeenCalledWith('agent-1');
        });

        it('should update agent status to PAUSED and handle pause', async () => {
            const pauseMessage = { ...mockMessage, content: { status: AgentStatus.PAUSED, missionId: 'm1', statistics: {} } };
            jest.spyOn(trafficManager as any, 'handleAgentPaused').mockResolvedValue(undefined);
            await (trafficManager as any).updateAgentStatus(pauseMessage);

            expect(trafficManager['agentStatusMap'].get('agent-1')).toBe(AgentStatus.PAUSED);
            expect(trafficManager['handleAgentPaused']).toHaveBeenCalledWith('agent-1');
        });

        it('should forward statistics to MissionControl', async () => {
            await (trafficManager as any).updateAgentStatus(mockMessage);
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/agentStatisticsUpdate'), expect.any(Object));
        });

        it('should check and resume dependent agents', async () => {
            jest.spyOn(trafficManager as any, 'checkDependentAgents').mockResolvedValue(undefined);
            await (trafficManager as any).updateAgentStatus(mockMessage);
            expect(trafficManager['checkDependentAgents']).toHaveBeenCalledWith('agent-1');
        });

        it('should remove agent from AgentSetManager if completed or aborted', async () => {
            const completedMessage = { ...mockMessage, content: { status: AgentStatus.COMPLETED, missionId: 'm1', statistics: {} } };
            await (trafficManager as any).updateAgentStatus(completedMessage);
            expect(mockAgentSetManager.removeAgentFromSet).toHaveBeenCalledWith('agent-1');

            const abortedMessage = { ...mockMessage, content: { status: AgentStatus.ABORTED, missionId: 'm1', statistics: {} } };
            await (trafficManager as any).updateAgentStatus(abortedMessage);
            expect(mockAgentSetManager.removeAgentFromSet).toHaveBeenCalledWith('agent-1');
        });

        it('should return current status for CHECK message', async () => {
            jest.spyOn(trafficManager as any, 'getAgentStatus').mockResolvedValueOnce(AgentStatus.RUNNING);
            const checkMessage = { ...mockMessage, content: { status: 'CHECK' } };
            const result = await (trafficManager as any).updateAgentStatus(checkMessage);
            expect(result).toEqual({ status: AgentStatus.RUNNING });
        });

        it('should handle errors', async () => {
            jest.spyOn(trafficManager as any, 'getAgentStatus').mockRejectedValueOnce(new Error('Status error'));
            const result = await (trafficManager as any).updateAgentStatus(mockMessage);
            expect(result).toEqual({ error: 'Failed to update agent status' });
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error updating status for agent'), expect.any(Error));
        });
    });

    describe('handleAgentCompletion', () => {
        const MOCK_AGENT_ID = 'agent-complete';

        beforeEach(() => {
            jest.spyOn(trafficManager as any, 'fetchAgentOutput').mockResolvedValueOnce({ output: 'final result' });
            jest.spyOn(trafficManager as any, 'updateDependentAgents').mockResolvedValueOnce(undefined);
            jest.spyOn(trafficManager as any, 'cleanupAgentResources').mockResolvedValueOnce(undefined);
        });

        it('should handle agent completion successfully', async () => {
            await (trafficManager as any).handleAgentCompletion(MOCK_AGENT_ID);

            expect(trafficManager['fetchAgentOutput']).toHaveBeenCalledWith(MOCK_AGENT_ID);
            expect(trafficManager['updateDependentAgents']).toHaveBeenCalledWith(MOCK_AGENT_ID);
            expect(trafficManager['cleanupAgentResources']).toHaveBeenCalledWith(MOCK_AGENT_ID);
            expect(trafficManager.logAndSay).not.toHaveBeenCalled();
        });

        it('should log and say if error occurs', async () => {
            trafficManager['fetchAgentOutput'].mockRejectedValueOnce(new Error('Fetch error'));
            await (trafficManager as any).handleAgentCompletion(MOCK_AGENT_ID);
            expect(trafficManager.logAndSay).toHaveBeenCalledWith(expect.stringContaining('An error occurred while processing the completion of agent'));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('fetchAgentOutput', () => {
        const MOCK_AGENT_ID = 'agent-output';

        it('should fetch agent output successfully', async () => {
            mockAgentSetManager.getAgentSetUrlForAgent.mockResolvedValueOnce('http://agentset:8000');
            mockAuthenticatedApiGet.mockResolvedValueOnce({ status: 200, data: { output: 'agent output data' } });

            const output = await (trafficManager as any).fetchAgentOutput(MOCK_AGENT_ID);

            expect(mockAgentSetManager.getAgentSetUrlForAgent).toHaveBeenCalledWith(MOCK_AGENT_ID);
            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith('http://agentset:8000/agent/agent-output/output');
            expect(output).toBe('agent output data');
        });

        it('should return empty object if no AgentSet URL found', async () => {
            mockAgentSetManager.getAgentSetUrlForAgent.mockResolvedValueOnce(undefined);
            const output = await (trafficManager as any).fetchAgentOutput(MOCK_AGENT_ID);
            expect(output).toEqual({});
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('No AgentSet found for agent'));
        });

        it('should return empty object if fetch fails', async () => {
            mockAuthenticatedApiGet.mockRejectedValueOnce(new Error('Fetch error'));
            const output = await (trafficManager as any).fetchAgentOutput(MOCK_AGENT_ID);
            expect(output).toEqual({});
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching output for agent'), expect.any(Error));
        });
    });

    describe('updateDependentAgents', () => {
        const MOCK_COMPLETED_AGENT_ID = 'completed-agent';

        it('should resume dependent agents if they can proceed', async () => {
            mockDependencyManager.getDependencies.mockResolvedValueOnce(['dep-agent-1', 'dep-agent-2']);
            jest.spyOn(trafficManager as any, 'checkDependenciesRecursive')
                .mockResolvedValueOnce(true) // dep-agent-1 can proceed
                .mockResolvedValueOnce(false); // dep-agent-2 cannot proceed

            await (trafficManager as any).updateDependentAgents(MOCK_COMPLETED_AGENT_ID);

            expect(mockDependencyManager.getDependencies).toHaveBeenCalledWith(MOCK_COMPLETED_AGENT_ID);
            expect(trafficManager['checkDependenciesRecursive']).toHaveBeenCalledWith('dep-agent-1');
            expect(trafficManager['checkDependenciesRecursive']).toHaveBeenCalledWith('dep-agent-2');
            expect(mockAgentSetManager.resumeAgent).toHaveBeenCalledWith('dep-agent-1');
            expect(mockAgentSetManager.resumeAgent).not.toHaveBeenCalledWith('dep-agent-2');
            expect(trafficManager.logAndSay).toHaveBeenCalledWith(expect.stringContaining('Dependent agent dep-agent-1 has been resumed'));
        });

        it('should do nothing if no dependent agents', async () => {
            mockDependencyManager.getDependencies.mockResolvedValueOnce([]);
            await (trafficManager as any).updateDependentAgents(MOCK_COMPLETED_AGENT_ID);
            expect(trafficManager['checkDependenciesRecursive']).not.toHaveBeenCalled();
            expect(mockAgentSetManager.resumeAgent).not.toHaveBeenCalled();
        });
    });

    describe('cleanupAgentResources', () => {
        it('should log cleanup message', async () => {
            await (trafficManager as any).cleanupAgentResources('agent-cleanup');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cleaning up resources for agent agent-cleanup'));
        });
    });

    describe('handleAgentError', () => {
        it('should log and say agent error message', async () => {
            await (trafficManager as any).handleAgentError('agent-error');
            expect(trafficManager.logAndSay).toHaveBeenCalledWith(expect.stringContaining('Agent agent-error encountered an error'));
        });
    });

    describe('handleAgentPaused', () => {
        it('should log agent paused message', async () => {
            await (trafficManager as any).handleAgentPaused('agent-paused');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Agent agent-paused has been paused'));
        });
    });

    describe('getAgentStatus', () => {
        it('should return status from map if present', async () => {
            trafficManager['agentStatusMap'].set('agent-status', AgentStatus.RUNNING);
            const status = await (trafficManager as any).getAgentStatus('agent-status');
            expect(status).toBe(AgentStatus.RUNNING);
        });

        it('should return INITIALIZING if agent not found in map', async () => {
            const status = await (trafficManager as any).getAgentStatus('non-existent-agent');
            expect(status).toBe(AgentStatus.INITIALIZING);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Agent non-existent-agent not found. Returning default status.'));
        });

        it('should handle errors and return UNKNOWN', async () => {
            jest.spyOn(trafficManager as any, 'agentStatusMap', 'has').mockImplementationOnce(() => { throw new Error('Map error'); });
            const status = await (trafficManager as any).getAgentStatus('agent-error');
            expect(status).toBe(AgentStatus.UNKNOWN);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error retrieving status for agent'), expect.any(Error));
        });
    });

    describe('processMessage', () => {
        it('should call super.handleBaseMessage', async () => {
            const mockMessage = { type: MessageType.REQUEST, content: 'test' };
            const superHandleBaseMessageSpy = jest.spyOn(BaseEntity.prototype, 'handleBaseMessage').mockResolvedValue(undefined);
            await (trafficManager as any).processMessage(mockMessage);
            expect(superHandleBaseMessageSpy).toHaveBeenCalledWith(mockMessage);
        });

        it('should forward message to agent if forAgent is present', async () => {
            const mockMessage = { type: MessageType.REQUEST, content: 'test', forAgent: 'target-agent' };
            jest.spyOn(trafficManager as any, 'forwardMessageToAgent').mockResolvedValue(undefined);
            const result = await (trafficManager as any).processMessage(mockMessage);
            expect(trafficManager['forwardMessageToAgent']).toHaveBeenCalledWith(mockMessage);
            expect(result).toEqual({ status: 'Message forwarded to agent' });
        });

        it('should update agent status for AGENT_UPDATE message', async () => {
            const mockMessage = { type: MessageType.AGENT_UPDATE, sender: 'agent-1', content: { status: AgentStatus.COMPLETED } };
            jest.spyOn(trafficManager as any, 'updateAgentStatus').mockResolvedValue({ message: 'updated' });
            const result = await (trafficManager as any).processMessage(mockMessage);
            expect(trafficManager['updateAgentStatus']).toHaveBeenCalledWith(mockMessage);
            expect(result).toEqual({ message: 'updated' });
        });

        it('should return default status for other messages', async () => {
            const mockMessage = { type: MessageType.STATUS_UPDATE, content: 'test' };
            const result = await (trafficManager as any).processMessage(mockMessage);
            expect(result).toEqual({ status: 'Message processed by TrafficManager' });
        });

        it('should handle errors during message processing', async () => {
            jest.spyOn(BaseEntity.prototype, 'handleBaseMessage').mockRejectedValueOnce(new Error('BaseEntity error'));
            const result = await (trafficManager as any).processMessage({});
            expect(result).toEqual({ error: 'Failed to process message' });
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error processing message'), expect.any(Error));
        });
    });

    describe('forwardMessageToAgent', () => {
        const MOCK_MESSAGE = { forAgent: 'agent-target', content: 'data' };

        it('should forward message to agent successfully', async () => {
            mockAgentSetManager.getAgentSetUrlForAgent.mockResolvedValueOnce('http://agentset:8000');
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { success: true } });

            const result = await (trafficManager as any).forwardMessageToAgent(MOCK_MESSAGE);

            expect(mockAgentSetManager.getAgentSetUrlForAgent).toHaveBeenCalledWith('agent-target');
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith('http://agentset:8000/message', expect.objectContaining({ ...MOCK_MESSAGE, forAgent: 'agent-target' }));
            expect(result).toEqual({ success: true });
        });

        it('should log error if no AgentSet URL found', async () => {
            mockAgentSetManager.getAgentSetUrlForAgent.mockResolvedValueOnce(undefined);
            await (trafficManager as any).forwardMessageToAgent(MOCK_MESSAGE);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('No AgentSet found for agent'));
        });

        it('should handle errors during forwarding', async () => {
            mockAgentSetManager.getAgentSetUrlForAgent.mockRejectedValueOnce(new Error('URL error'));
            await (trafficManager as any).forwardMessageToAgent(MOCK_MESSAGE);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error forwarding message to agent'), expect.any(Error));
        });
    });

    describe('ensureProtocol', () => {
        it('should add http:// if no protocol', () => {
            expect((trafficManager as any).ensureProtocol('example.com')).toBe('http://example.com');
        });

        it('should not add protocol if already present', () => {
            expect((trafficManager as any).ensureProtocol('https://example.com')).toBe('https://example.com');
            expect((trafficManager as any).ensureProtocol('http://example.com')).toBe('http://example.com');
        });
    });

    describe('startServer', () => {
        it('should start the Express app listening on the configured port', () => {
            (trafficManager as any).startServer();
            expect(mockApp.listen).toHaveBeenCalledWith('5080', expect.any(Function));
            expect(consoleLogSpy).toHaveBeenCalledWith('TrafficManager running on port 5080');
        });
    });

    describe('getAgentStatus', () => {
        it('should return status from map if present', async () => {
            trafficManager['agentStatusMap'].set('agent-status', AgentStatus.RUNNING);
            const status = await (trafficManager as any).getAgentStatus('agent-status');
            expect(status).toBe(AgentStatus.RUNNING);
        });

        it('should return INITIALIZING if agent not found in map', async () => {
            const status = await (trafficManager as any).getAgentStatus('non-existent-agent');
            expect(status).toBe(AgentStatus.INITIALIZING);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Agent non-existent-agent not found. Returning default status.'));
        });

        it('should handle errors and return UNKNOWN', async () => {
            jest.spyOn(trafficManager as any, 'agentStatusMap', 'has').mockImplementationOnce(() => { throw new Error('Map error'); });
            const status = await (trafficManager as any).getAgentStatus('agent-error');
            expect(status).toBe(AgentStatus.UNKNOWN);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error retrieving status for agent'), expect.any(Error));
        });
    });

    describe('checkDependenciesRecursive', () => {
        it('should return true if no dependencies', async () => {
            mockDependencyManager.getDependencies.mockResolvedValueOnce([]);
            const result = await (trafficManager as any).checkDependenciesRecursive('agent-no-deps');
            expect(result).toBe(true);
        });

        it('should return true if all dependencies are completed', async () => {
            mockDependencyManager.getDependencies.mockResolvedValueOnce(['dep1', 'dep2']);
            jest.spyOn(trafficManager as any, 'getAgentStatus')
                .mockResolvedValueOnce(AgentStatus.COMPLETED)
                .mockResolvedValueOnce(AgentStatus.COMPLETED);

            const result = await (trafficManager as any).checkDependenciesRecursive('agent-with-deps');
            expect(result).toBe(true);
        });

        it('should return false if any dependency is not completed', async () => {
            mockDependencyManager.getDependencies.mockResolvedValueOnce(['dep1', 'dep2']);
            jest.spyOn(trafficManager as any, 'getAgentStatus')
                .mockResolvedValueOnce(AgentStatus.COMPLETED)
                .mockResolvedValueOnce(AgentStatus.RUNNING); // dep2 not completed

            const result = await (trafficManager as any).checkDependenciesRecursive('agent-with-deps');
            expect(result).toBe(false);
        });

        it('should handle circular dependencies gracefully (return false)', async () => {
            // agent-a depends on agent-b, agent-b depends on agent-a
            mockDependencyManager.getDependencies.mockImplementation((agentId: string) => {
                if (agentId === 'agent-a') return Promise.resolve(['agent-b']);
                if (agentId === 'agent-b') return Promise.resolve(['agent-a']);
                return Promise.resolve([]);
            });
            jest.spyOn(trafficManager as any, 'getAgentStatus').mockResolvedValue(AgentStatus.RUNNING); // Always running

            const result = await (trafficManager as any).checkDependenciesRecursive('agent-a');
            expect(result).toBe(false);
        });

        it('should handle errors and return false', async () => {
            mockDependencyManager.getDependencies.mockRejectedValueOnce(new Error('Dep error'));
            const result = await (trafficManager as any).checkDependenciesRecursive('agent-error');
            expect(result).toBe(false);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error retrieving status for agent'), expect.any(Error));
        });
    });

    describe('removeEmptySets (periodic cleanup)', () => {
        it('should call agentSetManager.removeEmptySets periodically', () => {
            // The setInterval is set up in the constructor
            jest.advanceTimersByTime(60000); // Advance 60 seconds
            expect(mockAgentSetManager.removeEmptySets).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(60000); // Advance another 60 seconds
            expect(mockAgentSetManager.removeEmptySets).toHaveBeenCalledTimes(2);
        });

        it('should handle errors during removeEmptySets', () => {
            mockAgentSetManager.removeEmptySets.mockRejectedValueOnce(new Error('Cleanup error'));
            jest.advanceTimersByTime(60000);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to remove empty agent sets'), expect.any(Error));
        });
    });
});
