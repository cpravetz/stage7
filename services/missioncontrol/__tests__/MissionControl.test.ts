import request from 'supertest';
import express from 'express';
import { MissionControl } from '../src/MissionControl';
import { Mission, Status, MessageType, InputValue, MapSerializer, AgentStatistics, MissionStatistics } from '@cktmcs/shared';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { BaseEntity } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { rateLimit } from 'express-rate-limit';

// Mock external dependencies
jest.mock('express');
jest.mock('uuid');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'),
    BaseEntity: jest.fn().mockImplementation(() => ({
        id: 'mock-missioncontrol-id',
        componentType: 'MissionControl',
        url: 'http://mock-missioncontrol:5030',
        port: '5030',
        postOfficeUrl: 'http://mock-postoffice:5020',
        authenticatedApi: {
            post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
            get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
        },
        verifyToken: jest.fn((req, res, next) => next()), // Mock verifyToken to just call next
        initializeMessageQueue: jest.fn().mockResolvedValue(undefined),
        initializeServiceDiscovery: jest.fn().mockResolvedValue(undefined),
        registerWithPostOffice: jest.fn().mockResolvedValue(undefined),
        logAndSay: jest.fn().mockResolvedValue(undefined),
        getServiceUrls: jest.fn().mockResolvedValue({
            capabilitiesManagerUrl: 'capabilitiesmanager:5060',
            brainUrl: 'brain:5070',
            librarianUrl: 'librarian:5040',
            missionControlUrl: 'missioncontrol:5030',
            engineerUrl: 'engineer:5050',
        }),
    })),
}));
jest.mock('@cktmcs/errorhandler');
jest.mock('express-rate-limit');

// Cast mocked functions
const mockExpress = express as jest.MockedFunction<typeof express>;
const mockUuidv4 = uuidv4 as jest.Mock;
const mockUuidValidate = uuidValidate as jest.Mock;
const mockAnalyzeError = analyzeError as jest.Mock;
const mockRateLimit = rateLimit as jest.MockedFunction<typeof rateLimit>;

describe('MissionControl Service', () => {
    let missionControl: MissionControl;
    let mockApp: jest.Mocked<express.Application>;
    let mockAuthenticatedApiPost: jest.Mock;
    let mockAuthenticatedApiGet: jest.Mock;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    // Mock the actual express app instance that MissionControl will use
    const realExpress = jest.requireActual('express');

    beforeAll(() => {
        // Mock rateLimit to return a simple middleware
        mockRateLimit.mockImplementation(() => (req, res, next) => next());
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

        // Instantiate MissionControl (this will call its constructor and initialize server)
        missionControl = new MissionControl();

        // Ensure the internal authenticatedApi is the mocked one for consistency
        (missionControl as any).authenticatedApi = BaseEntityMockInstance.authenticatedApi;
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('should initialize BaseEntity and set up server', () => {
        expect(BaseEntity).toHaveBeenCalledTimes(1);
        expect(BaseEntity).toHaveBeenCalledWith('MissionControl', 'MissionControl', process.env.HOST || 'missioncontrol', process.env.PORT || '5030');
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // rateLimit
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // express.json
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // verifyToken middleware
        expect(mockApp.post).toHaveBeenCalledWith('/message', expect.any(Function));
        expect(mockApp.post).toHaveBeenCalledWith('/agentStatisticsUpdate', expect.any(Function));
        expect(mockApp.post).toHaveBeenCalledWith('/userInputResponse', expect.any(Function));
        expect(mockApp.listen).toHaveBeenCalledWith(process.env.PORT || '5030', expect.any(Function));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('MissionControl is running on port'));
    });

    describe('POST /message', () => {
        it('should handle CREATE_MISSION message and create a mission', async () => {
            const mockMissionId = 'mock-mission-id-1';
            mockUuidv4.mockReturnValue(mockMissionId);

            const mockReq = { body: { type: MessageType.CREATE_MISSION, content: { goal: 'Test Goal', name: 'Test Mission' }, clientId: 'client1', userId: 'user1' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            // Mock internal methods called by createMission
            jest.spyOn(missionControl as any, 'clearActionPlanCache').mockResolvedValue(undefined);
            jest.spyOn(missionControl as any, 'saveMissionState').mockResolvedValue(undefined);
            jest.spyOn(missionControl as any, 'assignAgentToSet').mockResolvedValue('mock-agent-id'); // Mock the new internal method

            await (missionControl as any).handleMessage(mockReq, mockRes);

            expect(mockUuidv4).toHaveBeenCalledTimes(1);
            expect(missionControl.missions.get(mockMissionId)).toBeDefined();
            expect(missionControl.missions.get(mockMissionId)?.status).toBe(Status.RUNNING);
            expect(missionControl.assignAgentToSet).toHaveBeenCalledWith(expect.stringContaining('agent-'), 'ACCOMPLISH', expect.any(Map), mockMissionId, expect.any(String));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ missionId: mockMissionId, status: Status.RUNNING }));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Mission created successfully'));
        });

        it('should handle other message types by calling processMessage', async () => {
            const mockReq = { body: { type: MessageType.PAUSE, missionId: 'mission1' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            jest.spyOn(missionControl as any, 'processMessage').mockResolvedValueOnce({ status: 'processed' });

            await (missionControl as any).handleMessage(mockReq, mockRes);

            expect(missionControl.processMessage).toHaveBeenCalledWith(mockReq.body, undefined); // req.user is undefined in this mock
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ message: 'Message processed successfully', result: { status: 'processed' } });
        });

        it('should return 500 if mission creation fails', async () => {
            const mockReq = { body: { type: MessageType.CREATE_MISSION, content: { goal: 'Fail Goal' } } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            jest.spyOn(missionControl as any, 'createMission').mockRejectedValueOnce(new Error('Creation failed'));

            await (missionControl as any).handleMessage(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Error creating mission' }));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error creating mission'), expect.any(Error));
        });
    });

    describe('handleQueueMessage', () => {
        let mockMqClientPublish: jest.Mock;

        beforeEach(() => {
            // Mock mqClient.publishMessage
            (missionControl as any).mqClient = {
                isConnected: jest.fn().mockReturnValue(true),
                publishMessage: jest.fn().mockResolvedValue(true),
            };
            mockMqClientPublish = (missionControl as any).mqClient.publishMessage;
        });

        it('should process queue message and send reply if replyTo is present', async () => {
            const mockMessage = { type: MessageType.PAUSE, missionId: 'mission1', replyTo: 'reply-q', correlationId: 'corr-id' };

            jest.spyOn(missionControl as any, 'processMessage').mockResolvedValueOnce({ status: 'processed' });

            await (missionControl as any).handleQueueMessage(mockMessage);

            expect(missionControl.processMessage).toHaveBeenCalledWith(mockMessage, { id: 'system' });
            expect(mockMqClientPublish).toHaveBeenCalledWith(
                'stage7', 'reply-q', expect.objectContaining({ type: 'RESPONSE', correlationId: 'corr-id', content: { status: 'processed' } }), expect.any(Object)
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('MissionControl received queue message'));
        });

        it('should send error reply if processing queue message fails', async () => {
            const mockMessage = { type: MessageType.PAUSE, missionId: 'mission1', replyTo: 'reply-q', correlationId: 'corr-id' };

            jest.spyOn(missionControl as any, 'processMessage').mockRejectedValueOnce(new Error('Processing failed'));

            await (missionControl as any).handleQueueMessage(mockMessage);

            expect(mockMqClientPublish).toHaveBeenCalledWith(
                'stage7', 'reply-q', expect.objectContaining({ type: 'ERROR', correlationId: 'corr-id', content: { error: 'Processing failed', status: 'error' } }), expect.any(Object)
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error processing queue message'), expect.any(Error));
        });
    });

    describe('processMessage', () => {
        let mockCreateMission: jest.SpyInstance;
        let mockPauseMission: jest.SpyInstance;
        let mockResumeMission: jest.SpyInstance;
        let mockAbortMission: jest.SpyInstance;
        let mockSaveMission: jest.SpyInstance;
        let mockLoadMission: jest.SpyInstance;
        let mockHandleUserMessage: jest.SpyInstance;

        beforeEach(() => {
            mockCreateMission = jest.spyOn(missionControl as any, 'createMission').mockResolvedValue({});
            mockPauseMission = jest.spyOn(missionControl as any, 'pauseMission').mockResolvedValue(undefined);
            mockResumeMission = jest.spyOn(missionControl as any, 'resumeMission').mockResolvedValue(undefined);
            mockAbortMission = jest.spyOn(missionControl as any, 'abortMission').mockResolvedValue(undefined);
            mockSaveMission = jest.spyOn(missionControl as any, 'saveMission').mockResolvedValue(undefined);
            mockLoadMission = jest.spyOn(missionControl as any, 'loadMission').mockResolvedValue({});
            mockHandleUserMessage = jest.spyOn(missionControl as any, 'handleUserMessage').mockResolvedValue(undefined);
        });

        it('should process CREATE_MISSION message', async () => {
            const message = { type: MessageType.CREATE_MISSION, content: { goal: 'test' }, clientId: 'client1' };
            const result = await (missionControl as any).processMessage(message, { id: 'user1' });
            expect(mockCreateMission).toHaveBeenCalledWith(message.content, message.clientId, 'user1');
            expect(result).toEqual({ missionId: undefined, status: undefined }); // Mocks return empty object
        });

        it('should process PAUSE message', async () => {
            const message = { type: MessageType.PAUSE, missionId: 'mission1' };
            const result = await (missionControl as any).processMessage(message, {});
            expect(mockPauseMission).toHaveBeenCalledWith('mission1');
            expect(result).toEqual({ missionId: 'mission1', status: 'paused' });
        });

        it('should process RESUME message', async () => {
            const message = { type: MessageType.RESUME, missionId: 'mission1' };
            const result = await (missionControl as any).processMessage(message, {});
            expect(mockResumeMission).toHaveBeenCalledWith('mission1');
            expect(result).toEqual({ missionId: 'mission1', status: 'resumed' });
        });

        it('should process ABORT message', async () => {
            const message = { type: MessageType.ABORT, missionId: 'mission1' };
            const result = await (missionControl as any).processMessage(message, {});
            expect(mockAbortMission).toHaveBeenCalledWith('mission1');
            expect(result).toEqual({ missionId: 'mission1', status: 'aborted' });
        });

        it('should process SAVE message', async () => {
            const missionId = 'mission1';
            const missionName = 'My Mission';
            const mission: Mission = { id: missionId, name: missionName, userId: 'user1', goal: 'test', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };
            missionControl.missions.set(missionId, mission);

            const message = { type: MessageType.SAVE, missionId, missionName };
            const result = await (missionControl as any).processMessage(message, {});
            expect(mockSaveMission).toHaveBeenCalledWith(missionId, missionName);
            expect(result).toEqual({ missionId, status: 'saved', name: missionName });
        });

        it('should process LOAD message', async () => {
            const message = { type: MessageType.LOAD, missionId: 'mission1', clientId: 'client1' };
            const result = await (missionControl as any).processMessage(message, { id: 'user1' });
            expect(mockLoadMission).toHaveBeenCalledWith('mission1', 'client1', 'user1');
            expect(result).toEqual({ missionId: undefined, status: 'loaded', mission: {} });
        });

        it('should process USER_MESSAGE message', async () => {
            const message = { type: MessageType.USER_MESSAGE, content: { missionId: 'mission1', message: 'hello' }, clientId: 'client1' };
            const result = await (missionControl as any).processMessage(message, {});
            expect(mockHandleUserMessage).toHaveBeenCalledWith(message.content, message.clientId, message.content.missionId);
            expect(result).toEqual({ missionId: message.content.missionId, status: 'message_sent' });
        });

        it('should call super.handleBaseMessage for unknown types', async () => {
            const message = { type: 'UNKNOWN_TYPE' };
            const superHandleBaseMessageSpy = jest.spyOn(BaseEntity.prototype, 'handleBaseMessage').mockResolvedValue(undefined);
            const result = await (missionControl as any).processMessage(message, {});
            expect(superHandleBaseMessageSpy).toHaveBeenCalledWith(message);
            expect(result).toEqual({ status: 'no_action_taken' });
        });
    });

    describe('createMission', () => {
        const mockContent = { goal: 'New Goal', name: 'New Mission' };
        const mockClientId = 'client-new';
        const mockUserId = 'user-new';
        const mockMissionId = 'mock-mission-id-create';

        beforeEach(() => {
            mockUuidv4.mockReturnValue(mockMissionId);
            jest.spyOn(missionControl as any, 'clearActionPlanCache').mockResolvedValue(undefined);
            jest.spyOn(missionControl as any, 'saveMissionState').mockResolvedValue(undefined);
            jest.spyOn(missionControl as any, 'sendStatusUpdate').mockResolvedValue(undefined);
        });

        it('should create and initialize a new mission', async () => {
            const mission = await (missionControl as any).createMission(mockContent, mockClientId, mockUserId);

            expect(mission.id).toBe(mockMissionId);
            expect(mission.name).toBe(mockContent.name);
            expect(mission.goal).toBe(mockContent.goal);
            expect(mission.userId).toBe(mockUserId);
            expect(mission.status).toBe(Status.RUNNING);
            expect(missionControl.missions.get(mockMissionId)).toBe(mission);
            expect(missionControl.clientMissions.get(mockClientId)?.has(mockMissionId)).toBe(true);
            expect(missionControl.clearActionPlanCache).toHaveBeenCalledTimes(1);
            expect(jest.spyOn(missionControl as any, 'assignAgentToSet')).toHaveBeenCalledWith(expect.stringContaining('agent-'), 'ACCOMPLISH', expect.any(Map), mission.id, expect.any(String));
            expect(missionControl.saveMissionState).toHaveBeenCalledWith(mission);
            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(mission, 'Mission started');
        });

        it('should generate default name if not provided', async () => {
            const contentWithoutName = { goal: 'Goal without name' };
            const mockTimestamp = '2023-01-01T12:00:00.000Z';
            jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockTimestamp);

            const mission = await (missionControl as any).createMission(contentWithoutName, mockClientId, mockUserId);
            expect(mission.name).toBe(`Mission ${mockTimestamp.replace(/:/g, '-')}`);
        });

        it('should handle errors during mission creation', async () => {
            jest.spyOn(missionControl as any, 'assignAgentToSet').mockRejectedValueOnce(new Error('AgentSet error'));

            await expect((missionControl as any).createMission(mockContent, mockClientId, mockUserId)).rejects.toThrow('TrafficManager error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error creating/starting mission'), expect.any(Error));

            // Verify mission status is updated to ERROR if it was in INITIALIZING
            const failedMission = missionControl.missions.get(mockMissionId);
            expect(failedMission?.status).toBe(Status.ERROR);
            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(failedMission, expect.stringContaining('Error starting mission'));
        });
    });

    describe('pauseMission', () => {
        const mockMissionId = 'mission-pause';
        const mockMission: Mission = { id: mockMissionId, userId: 'user1', name: 'Test', goal: 'test', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };

        beforeEach(() => {
            missionControl.missions.set(mockMissionId, mockMission);
            jest.spyOn(missionControl as any, 'sendStatusUpdate').mockResolvedValue(undefined);
        });

        it('should pause a running mission', async () => {
            jest.spyOn(missionControl as any, 'pauseAgents').mockResolvedValue(undefined); // Mock the internal method
            await (missionControl as any).pauseMission(mockMissionId);
            expect(missionControl.missions.get(mockMissionId)?.status).toBe(Status.PAUSED);
            expect(missionControl.pauseAgents).toHaveBeenCalledWith(mockMissionId);
            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(mockMission, 'Mission paused');
        });

        it('should log error if mission not found', async () => {
            await (missionControl as any).pauseMission('non-existent');
            expect(consoleErrorSpy).toHaveBeenCalledWith('Mission to pause not found:', 'non-existent');
        });
    });

    describe('resumeMission', () => {
        const mockMissionId = 'mission-resume';
        const mockMission: Mission = { id: mockMissionId, userId: 'user1', name: 'Test', goal: 'test', status: Status.PAUSED, createdAt: new Date(), updatedAt: new Date() };

        beforeEach(() => {
            missionControl.missions.set(mockMissionId, mockMission);
            jest.spyOn(missionControl as any, 'sendStatusUpdate').mockResolvedValue(undefined);
        });

        it('should resume a paused mission', async () => {
            jest.spyOn(missionControl as any, 'resumeAgents').mockResolvedValue(undefined); // Mock the internal method
            await (missionControl as any).resumeMission(mockMissionId);
            expect(missionControl.missions.get(mockMissionId)?.status).toBe(Status.RUNNING);
            expect(missionControl.resumeAgents).toHaveBeenCalledWith(mockMissionId);
            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(mockMission, 'Mission resumed');
        });

        it('should log error if mission not found', async () => {
            await (missionControl as any).resumeMission('non-existent');
            expect(consoleErrorSpy).toHaveBeenCalledWith('Mission to resume not found:', 'non-existent');
        });
    });

    describe('abortMission', () => {
        const mockMissionId = 'mission-abort';
        const mockMission: Mission = { id: mockMissionId, userId: 'user1', name: 'Test', goal: 'test', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };

        beforeEach(() => {
            missionControl.missions.set(mockMissionId, mockMission);
            missionControl.addClientMission('client1', mockMissionId);
            jest.spyOn(missionControl as any, 'sendStatusUpdate').mockResolvedValue(undefined);
            jest.spyOn(missionControl as any, 'removeClientMission').mockResolvedValue(undefined);
        });

        it('should abort a mission', async () => {
            jest.spyOn(missionControl as any, 'abortAgents').mockResolvedValue(undefined); // Mock the internal method
            await (missionControl as any).abortMission(mockMissionId);
            expect(missionControl.missions.get(mockMissionId)).toBeUndefined();
            expect(missionControl.clientMissions.get('client1')?.has(mockMissionId)).toBe(false);
            expect(missionControl.abortAgents).toHaveBeenCalledWith(mockMissionId);
            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(mockMission, 'Mission aborted');
            expect(missionControl.removeClientMission).toHaveBeenCalledWith('client1', mockMissionId);
        });

        it('should log error if mission not found', async () => {
            await (missionControl as any).abortMission('non-existent');
            expect(consoleErrorSpy).toHaveBeenCalledWith('Mission to abort not found:', 'non-existent');
        });
    });

    describe('loadMission', () => {
        const mockMissionId = 'mission-load';
        const mockClientId = 'client-load';
        const mockUserId = 'user-load';
        const mockLoadedMission: Mission = { id: mockMissionId, userId: mockUserId, name: 'Loaded', goal: 'load', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };

        beforeEach(() => {
            jest.spyOn(missionControl as any, 'loadMissionState').mockResolvedValue(mockLoadedMission);
            jest.spyOn(missionControl as any, 'addClientMission').mockResolvedValue(undefined);
            jest.spyOn(missionControl as any, 'sendStatusUpdate').mockResolvedValue(undefined);
        });

        it('should load a mission successfully', async () => {
            jest.spyOn(missionControl as any, 'loadAgents').mockResolvedValue(undefined); // Mock the internal method

            const mission = await (missionControl as any).loadMission(mockMissionId, mockClientId, mockUserId);

            expect(missionControl.loadMissionState).toHaveBeenCalledWith(mockMissionId);
            expect(missionControl.missions.get(mockMissionId)).toBe(mockLoadedMission);
            expect(missionControl.loadAgents).toHaveBeenCalledWith(mockMissionId);
            expect(missionControl.addClientMission).toHaveBeenCalledWith(mockClientId, mockMissionId);
            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(mockLoadedMission, expect.stringContaining('Mission loaded'));
            expect(mission).toBe(mockLoadedMission);
        });

        it('should throw error if mission state not found', async () => {
            jest.spyOn(missionControl as any, 'loadMissionState').mockResolvedValueOnce(null);
            await expect((missionControl as any).loadMission(mockMissionId, mockClientId, mockUserId)).rejects.toThrow(expect.stringContaining('Mission not found'));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Mission not found'), mockMissionId);
        });

        it('should throw error if user not authorized', async () => {
            const unauthorizedUserId = 'unauthorized-user';
            await expect((missionControl as any).loadMission(mockMissionId, mockClientId, unauthorizedUserId)).rejects.toThrow(expect.stringContaining('Access denied'));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('User unauthorized'));
        });

        it('should handle errors during loading', async () => {
            jest.spyOn(missionControl as any, 'loadMissionState').mockRejectedValueOnce(new Error('Librarian error'));
            await expect((missionControl as any).loadMission(mockMissionId, mockClientId, mockUserId)).rejects.toThrow('Librarian error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading mission'), expect.any(Error));
        });
    });

    describe('saveMission', () => {
        const mockMissionId = 'mission-save';
        const mockMission: Mission = { id: mockMissionId, userId: 'user1', name: 'Original', goal: 'test', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };

        beforeEach(() => {
            missionControl.missions.set(mockMissionId, mockMission);
            jest.spyOn(missionControl as any, 'saveMissionState').mockResolvedValue(undefined);
            jest.spyOn(missionControl as any, 'sendStatusUpdate').mockResolvedValue(undefined);
        });

        it('should save mission state and agents', async () => {
            jest.spyOn(missionControl as any, 'saveAgents').mockResolvedValue(undefined); // Mock the internal method
            await (missionControl as any).saveMission(mockMissionId);
            expect(missionControl.saveMissionState).toHaveBeenCalledWith(mockMission);
            expect(missionControl.saveAgents).toHaveBeenCalledWith(mockMissionId);
            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(mockMission, expect.stringContaining('Mission saved'));
        });

        it('should update mission name if provided', async () => {
            await (missionControl as any).saveMission(mockMissionId, 'Updated Name');
            expect(mockMission.name).toBe('Updated Name');
            expect(missionControl.saveMissionState).toHaveBeenCalledWith(mockMission);
        });

        it('should log error if mission not found', async () => {
            await (missionControl as any).saveMission('non-existent');
            expect(consoleErrorSpy).toHaveBeenCalledWith('Mission not found:', 'non-existent');
        });

        it('should handle errors during saving', async () => {
            jest.spyOn(missionControl as any, 'saveMissionState').mockRejectedValueOnce(new Error('Librarian save error'));
            await (missionControl as any).saveMission(mockMissionId);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error saving mission'), expect.any(Error));
        });
    });

    describe('handleUserMessage', () => {
        const mockMissionId = 'mission-user-message';
        const mockClientId = 'client-user-message';
        const mockMessageContent = 'Hello agent';
        const mockMission: Mission = { id: mockMissionId, userId: 'user1', name: 'Test', goal: 'test', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };

        beforeEach(() => {
            missionControl.missions.set(mockMissionId, mockMission);
            jest.spyOn(missionControl as any, 'sendStatusUpdate').mockResolvedValue(undefined);
        });

        it('should send user message to AgentSetManager', async () => {
            jest.spyOn(missionControl as any, 'distributeUserMessage').mockResolvedValue(undefined); // Mock the internal method

            await (missionControl as any).handleUserMessage({ missionId: mockMissionId, message: mockMessageContent }, mockClientId, mockMissionId);

            expect(missionControl.distributeUserMessage).toHaveBeenCalledWith(expect.objectContaining({
                body: {
                    type: MessageType.USER_MESSAGE,
                    sender: 'user',
                    recipient: 'agents',
                    content: { missionId: mockMissionId, message: mockMessageContent },
                    clientId: mockClientId,
                }
            }));
            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(mockMission, 'User message received and sent to agents');
        });

        it('should log error if mission not found', async () => {
            await (missionControl as any).handleUserMessage({ missionId: 'non-existent', message: 'test' }, mockClientId, 'non-existent');
            expect(consoleErrorSpy).toHaveBeenCalledWith('Mission not found:', 'non-existent');
        });

        it('should handle errors during message distribution', async () => {
            jest.spyOn(missionControl as any, 'distributeUserMessage').mockRejectedValueOnce(new Error('Distribution error'));
            await (missionControl as any).handleUserMessage({ missionId: mockMissionId, message: mockMessageContent }, mockClientId, mockMissionId);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error handling user message'), expect.any(Error));
        });
    });

    describe('clearActionPlanCache', () => {
        it('should delete actionPlans collection from Librarian', async () => {
            await (missionControl as any).clearActionPlanCache();
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/deleteCollection'), expect.objectContaining({ params: { collection: 'actionPlans' } }));
            expect(consoleLogSpy).toHaveBeenCalledWith('Action plan cache cleared successfully');
        });

        it('should log error if clearing cache fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('Librarian error'));
            await (missionControl as any).clearActionPlanCache();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error clearing action plan cache'), expect.any(Error));
        });
    });

    describe('saveMissionState', () => {
        const mockMission: Mission = { id: 'mission-save-state', userId: 'user1', name: 'Test', goal: 'test', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };

        it('should save mission state to Librarian', async () => {
            await (missionControl as any).saveMissionState(mockMission);
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/storeData'), expect.objectContaining({
                id: mockMission.id,
                userId: mockMission.userId,
                data: mockMission,
                collection: 'missions',
                storageType: 'mongo',
            }));
        });

        it('should handle errors during saving mission state', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('Librarian error'));
            await (missionControl as any).saveMissionState(mockMission);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error saving mission state'), expect.any(Error));
        });
    });

    describe('loadMissionState', () => {
        const mockMissionId = 'mission-load-state';
        const mockLoadedMission: Mission = { id: mockMissionId, userId: 'user1', name: 'Loaded', goal: 'load', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };

        it('should load mission state from Librarian', async () => {
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { data: mockLoadedMission } });
            const mission = await (missionControl as any).loadMissionState(mockMissionId);
            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining(`/loadData/${mockMissionId}`), expect.any(Object));
            expect(mission).toEqual(mockLoadedMission);
        });

        it('should return null if mission state not found', async () => {
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { data: null } });
            const mission = await (missionControl as any).loadMissionState(mockMissionId);
            expect(mission).toBeNull();
        });

        it('should handle errors during loading mission state', async () => {
            mockAuthenticatedApiGet.mockRejectedValueOnce(new Error('Librarian error'));
            const mission = await (missionControl as any).loadMissionState(mockMissionId);
            expect(mission).toBeNull();
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading mission state'), expect.any(Error));
        });
    });

    describe('sendStatusUpdate', () => {
        const mockMission: Mission = { id: 'mission-status', userId: 'user1', name: 'Test', goal: 'test', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };
        const mockClientId = 'client-status';

        beforeEach(() => {
            missionControl.addClientMission(mockClientId, mockMission.id);
        });

        it('should send status update to client via PostOffice', async () => {
            await (missionControl as any).sendStatusUpdate(mockMission, 'Mission updated');
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/message'), expect.objectContaining({
                type: MessageType.STATUS_UPDATE,
                sender: missionControl.id,
                recipient: 'user',
                clientId: mockClientId,
                data: expect.objectContaining({ id: mockMission.id, status: mockMission.status, message: 'Mission updated' })
            }));
        });

        it('should handle errors during sending status update', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('PostOffice error'));
            await (missionControl as any).sendStatusUpdate(mockMission, 'Mission updated');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error sending status update to client'), expect.any(Error));
        });
    });

    describe('handleAgentStatisticsUpdate', () => {
        const mockMissionId = 'mission-stats';
        const mockAgentId = 'agent-stats';
        const mockStatistics = { cpu: 0.5, memory: 100 };
        const mockReq = { body: { agentId: mockAgentId, missionId: mockMissionId, statistics: mockStatistics, timestamp: new Date().toISOString() } } as express.Request;
        const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

        const mockMission: Mission = { id: mockMissionId, userId: 'user1', name: 'Test', goal: 'test', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };

        beforeEach(() => {
            mockUuidValidate.mockReturnValue(true);
            missionControl.missions.set(mockMissionId, mockMission);
            missionControl.addClientMission('client1', mockMissionId);

            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { llmCalls: 10, activeLLMCalls: 2 } }); // Brain LLM calls
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { newPlugins: ['plugin1'] } }); // Engineer stats
            jest.spyOn(missionControl as any, 'getAgentStatistics').mockResolvedValue({ agentStatisticsByType: { agentCountByStatus: { RUNNING: 1 } }, agentsByStatus: new Map([['RUNNING', [{ id: 'agent1', steps: [] }]]]) }); // MissionControl stats

        it('should process agent statistics update and send to client', async () => {
            await (missionControl as any).handleAgentStatisticsUpdate(mockReq, mockRes);

            expect(mockUuidValidate).toHaveBeenCalledWith(mockMissionId);
            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining('/getLLMCalls'));
            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining('/statistics'));
            expect(missionControl.getAgentStatistics).toHaveBeenCalledWith(mockMissionId);
                type: MessageType.STATISTICS,
                clientId: 'client1',
                content: expect.objectContaining({
                    llmCalls: 10,
                    agentCountByStatus: { RUNNING: 1 },
                })
            }));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Received statistics update for agent'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Statistics update sent to client'));
        });

        it('should return 400 for invalid missionId format', async () => {
            mockUuidValidate.mockReturnValueOnce(false);
            await (missionControl as any).handleAgentStatisticsUpdate(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Invalid missionId format' });
        });

        it('should handle errors during statistics fetching/sending', async () => {
            mockAuthenticatedApiGet.mockRejectedValueOnce(new Error('Brain error'));
            await (missionControl as any).handleAgentStatisticsUpdate(mockReq, mockRes);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching and pushing agent statistics'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
        });

        it('should initiate reflection if mission is completed/errored and no running agents', async () => {
            const completedMission: Mission = { ...mockMission, status: Status.COMPLETED };
            missionControl.missions.set(mockMissionId, completedMission);
            jest.spyOn(missionControl as any, 'reflectOnMission').mockResolvedValue(undefined);

            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { llmCalls: 10 } }); // Brain LLM calls
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { newPlugins: ['plugin1'] } }); // Engineer stats
            jest.spyOn(missionControl as any, 'getAgentStatistics').mockResolvedValue({ agentStatisticsByType: { agentCountByStatus: { RUNNING: 0 } }, agentsByStatus: new Map() }); // MissionControl stats - no running agents

            await (missionControl as any).handleAgentStatisticsUpdate(mockReq, mockRes);

            expect(missionControl.reflectOnMission).toHaveBeenCalledWith(completedMission);
            expect(completedMission.status).toBe(Status.REFLECTING);
        });
    });

    describe('reflectOnMission', () => {
        const mockMissionId = 'mission-reflect';
        const mockMission: Mission = { id: mockMissionId, userId: 'user1', name: 'Test', goal: 'test', status: Status.COMPLETED, createdAt: new Date(), updatedAt: new Date() };

        beforeEach(() => {
            jest.spyOn(missionControl as any, 'getServiceUrls').mockResolvedValue({
                capabilitiesManagerUrl: 'cap:5060',
                brainUrl: 'brain:5070',
                librarianUrl: 'librarian:5040',
                missionControlUrl: 'missioncontrol:5030',
                engineerUrl: 'engineer:5050',
            });
            jest.spyOn(missionControl as any, 'sendStatusUpdate').mockResolvedValue(undefined);
        });

        it('should reflect on mission and process new plan', async () => {
            jest.spyOn(missionControl as any, 'getAgentStatistics').mockResolvedValue({ agentsByStatus: new Map([['RUNNING', [{ id: 'agent1', steps: [{ id: 'step1', verb: 'STEP_VERB', status: 'completed', result: { data: 'step result' } }] }]]]) }); // MissionControl stats
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { result: [{ name: 'plan', result: [{ stepNo: 1, actionVerb: 'NEW_STEP' }] }] } }); // REFLECT plugin response

            await (missionControl as any).reflectOnMission(mockMission);

            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining('/getAgentStatistics/'));
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/executeAction'), expect.objectContaining({
                actionVerb: 'REFLECT',
                inputValues: expect.any(String), // Serialized Map
            }));
            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(mockMission, expect.stringContaining('Reflection complete. New plan generated.'));
            expect(mockMission.status).toBe(Status.RUNNING); // Status updated to RUNNING
        });

        it('should reflect on mission and process answer', async () => {
            jest.spyOn(missionControl as any, 'getAgentStatistics').mockResolvedValue({ agentsByStatus: new Map() }); // MissionControl stats
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { result: [{ name: 'answer', result: 'Mission accomplished!' }] } }); // REFLECT plugin response

            await (missionControl as any).reflectOnMission(mockMission);

            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(mockMission, expect.stringContaining('Reflection complete: Mission accomplished!'));
            expect(mockMission.status).toBe(Status.COMPLETED);
        });

        it('should handle errors during reflection', async () => {
            jest.spyOn(missionControl as any, 'getAgentStatistics').mockRejectedValueOnce(new Error('MissionControl error'));

            await (missionControl as any).reflectOnMission(mockMission);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error during reflection'), expect.any(Error));
            expect(mockMission.status).toBe(Status.ERROR);
            expect(missionControl.sendStatusUpdate).toHaveBeenCalledWith(mockMission, 'Reflection process failed.');
        });
    });

    describe('getAndPushAgentStatistics', () => {
        const mockMissionId = 'mission-periodic-stats';
        const mockClientId = 'client-periodic-stats';
        const mockMission: Mission = { id: mockMissionId, userId: 'user1', name: 'Test', goal: 'test', status: Status.RUNNING, createdAt: new Date(), updatedAt: new Date() };

        beforeEach(() => {
            missionControl.missions.set(mockMissionId, mockMission);
            missionControl.addClientMission(mockClientId, mockMissionId);
            jest.spyOn(missionControl as any, 'sendStatusUpdate').mockResolvedValue(undefined);
            jest.spyOn(missionControl as any, 'reflectOnMission').mockResolvedValue(undefined);

            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { llmCalls: 5 } }); // Brain LLM calls
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { newPlugins: [] } }); // Engineer stats
            jest.spyOn(missionControl as any, 'getAgentStatistics').mockResolvedValue({ agentStatisticsByType: { agentCountByStatus: { RUNNING: 1 } }, agentsByStatus: new Map([['RUNNING', [{ id: 'agent1', steps: [] }]]]) }); // MissionControl stats
        });

        it('should fetch and push agent statistics periodically', async () => {
            await (missionControl as any).getAndPushAgentStatistics();

            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining('/getLLMCalls'));
            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining('/statistics'));
            expect(missionControl.getAgentStatistics).toHaveBeenCalledWith(mockMissionId);
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/message'), expect.objectContaining({
                type: MessageType.STATISTICS,
                clientId: mockClientId,
                content: expect.objectContaining({
                    llmCalls: 5,
                    agentCountByStatus: { RUNNING: 1 },
                })
            }));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Fetching agent statistics...'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Statistics update sent to PostOffice for client'));
        });

        it('should not push statistics if no client missions', async () => {
            (missionControl as any).clientMissions.clear();
            await (missionControl as any).getAndPushAgentStatistics();
            expect(mockAuthenticatedApiPost).not.toHaveBeenCalledWith(expect.stringContaining('/message'), expect.any(Object));
            expect(consoleLogSpy).toHaveBeenCalledWith('No client missions found, skipping statistics update');
        });

        it('should handle errors during fetching/pushing statistics', async () => {
            mockAuthenticatedApiGet.mockRejectedValueOnce(new Error('Brain error'));
            await (missionControl as any).getAndPushAgentStatistics();
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching and pushing agent statistics'), expect.any(Error));
        });

        it('should reconstruct malformed agent steps', async () => {
            const malformedAgentStats = new Map([['RUNNING', [{ id: 'agent1', steps: { '0': { id: 's1' } } }]]]); // Steps as object
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { llmCalls: 5 } });
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { newPlugins: [] } });
            jest.spyOn(missionControl as any, 'getAgentStatistics').mockResolvedValue({ agentStatisticsByType: { agentCountByStatus: { RUNNING: 1 } }, agentsByStatus: malformedAgentStats });

            await (missionControl as any).getAndPushAgentStatistics();

            const sentContent = mockAuthenticatedApiPost.mock.calls[0][1].content;
            const agentStats = MapSerializer.transformFromSerialization(sentContent.agentStatistics);
            const agent1 = agentStats.get('RUNNING')[0];
            expect(agent1.steps).toEqual([{ id: 's1' }]);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Reconstructing steps for agent'));
        });
    });

    describe('handleUserInputResponse', () => {
        const mockRequestId = 'user-input-req';
        const mockMissionId = 'mission-user-input';
        const mockStepId = 'step-user-input';
        const mockAgentId = 'agent-user-input';
        const mockResponse = 'user response text';

        beforeEach(() => {
            (missionControl as any).pendingUserInputs.set(mockRequestId, { missionId: mockMissionId, stepId: mockStepId, agentId: mockAgentId });
            jest.spyOn(missionControl as any, 'resumeStepWithUserInput').mockResolvedValue(undefined);
        });

        it('should process user input response and resume step', async () => {
            const mockReq = { body: { requestId: mockRequestId, response: mockResponse } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (missionControl as any).handleUserInputResponse(mockReq, mockRes);

            expect(missionControl.resumeStepWithUserInput).toHaveBeenCalledWith(mockMissionId, mockStepId, mockAgentId, mockResponse);
            expect((missionControl as any).pendingUserInputs.has(mockRequestId)).toBe(false);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ message: 'User input processed' });
        });

        it('should return 404 if no pending user input for requestId', async () => {
            (missionControl as any).pendingUserInputs.clear(); // Clear pending inputs
            const mockReq = { body: { requestId: 'non-existent', response: 'test' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (missionControl as any).handleUserInputResponse(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'No pending user input for this requestId' });
        });

        it('should handle errors during processing user input response', async () => {
            jest.spyOn(missionControl as any, 'resumeStepWithUserInput').mockRejectedValueOnce(new Error('Resume failed'));
            const mockReq = { body: { requestId: mockRequestId, response: mockResponse } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (missionControl as any).handleUserInputResponse(mockReq, mockRes);

            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error in handleUserInputResponse'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
        });
    });

    describe('resumeStepWithUserInput', () => {
        const mockMissionId = 'm1';
        const mockStepId = 's1';
        const mockAgentId = 'a1';
        const mockUserInput = { choice: 'option A' };

        it('should send USER_INPUT_RESPONSE to AgentSet', async () => {
            jest.spyOn(missionControl as any, 'sendMessageToAgent').mockResolvedValue(undefined); // Mock the internal method

            await (missionControl as any).resumeStepWithUserInput(mockMissionId, mockStepId, mockAgentId, mockUserInput);

            expect(missionControl.sendMessageToAgent).toHaveBeenCalledWith(mockAgentId, expect.objectContaining({
                type: MessageType.USER_INPUT_RESPONSE,
                sender: missionControl.id,
                recipient: mockAgentId,
                content: {
                    missionId: mockMissionId,
                    stepId: mockStepId,
                    agentId: mockAgentId,
                    response: mockUserInput,
                },
            }));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sent USER_INPUT_RESPONSE to AgentSet'));
        });

        it('should handle errors during sending message', async () => {
            jest.spyOn(missionControl as any, 'sendMessageToAgent').mockRejectedValueOnce(new Error('AgentSet error'));
            await (missionControl as any).resumeStepWithUserInput(mockMissionId, mockStepId, mockAgentId, mockUserInput);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error resuming step'), expect.any(Error));
        });
    });

    describe('addClientMission', () => {
        it('should add a mission to a client', () => {
            (missionControl as any).clientMissions.clear();
            (missionControl as any).addClientMission('client1', 'mission1');
            expect((missionControl as any).clientMissions.get('client1')?.has('mission1')).toBe(true);
        });

        it('should add multiple missions to a client', () => {
            (missionControl as any).clientMissions.clear();
            (missionControl as any).addClientMission('client1', 'mission1');
            (missionControl as any).addClientMission('client1', 'mission2');
            expect((missionControl as any).clientMissions.get('client1')?.has('mission1')).toBe(true);
            expect((missionControl as any).clientMissions.get('client1')?.has('mission2')).toBe(true);
        });
    });

    describe('removeClientMission', () => {
        it('should remove a mission from a client', () => {
            (missionControl as any).clientMissions.set('client1', new Set(['mission1', 'mission2']));
            (missionControl as any).removeClientMission('client1', 'mission1');
            expect((missionControl as any).clientMissions.get('client1')?.has('mission1')).toBe(false);
            expect((missionControl as any).clientMissions.get('client1')?.has('mission2')).toBe(true);
        });

        it('should remove client entry if no missions left', () => {
            (missionControl as any).clientMissions.set('client1', new Set(['mission1']));
            (missionControl as any).removeClientMission('client1', 'mission1');
            expect((missionControl as any).clientMissions.has('client1')).toBe(false);
        });

        it('should do nothing if client or mission not found', () => {
            (missionControl as any).clientMissions.set('client1', new Set(['mission1']));
            (missionControl as any).removeClientMission('client2', 'mission1');
            expect((missionControl as any).clientMissions.has('client1')).toBe(true);
            (missionControl as any).removeClientMission('client1', 'mission3');
            expect((missionControl as any).clientMissions.get('client1')?.has('mission1')).toBe(true);
        });
    });
});
