import request from 'supertest';
import express from 'express';
import WebSocket from 'ws';
import http from 'http';
import { PostOffice } from '../src/PostOffice';
import { BaseEntity, MessageType, LLMConversationType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { MessageRouter } from '../src/messageRouting';
import { ServiceDiscoveryManager } from '../src/serviceDiscoveryManager';
import { WebSocketHandler } from '../src/webSocketHandler';
import { HealthCheckManager } from '../src/healthCheckManager';
import { FileUploadManager } from '../src/fileUploadManager';
import { PluginManager } from '../src/pluginManager';
import { FileUploadService } from '../src/fileUploadService';
import jwt from 'jsonwebtoken';

// Mock external dependencies
jest.mock('express');
jest.mock('ws');
jest.mock('http');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'),
    BaseEntity: jest.fn().mockImplementation(() => ({
        id: 'mock-postoffice-id',
        componentType: 'PostOffice',
        url: 'http://mock-postoffice:5020',
        port: '5020',
        postOfficeUrl: 'http://mock-postoffice:5020',
        authenticatedApi: {
            post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
            get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
        },
        verifyToken: jest.fn((req, res, next) => next()), // Mock verifyToken to just call next
        initializeMessageQueue: jest.fn().mockResolvedValue(undefined),
        initializeServiceDiscovery: jest.fn().mockResolvedValue(undefined),
        registerWithPostOffice: jest.fn().mockResolvedValue(undefined),
        getComponentUrl: jest.fn().mockImplementation((type: string) => {
            if (type === 'Librarian') return 'mock-librarian:5040';
            if (type === 'MissionControl') return 'mock-missioncontrol:5030';
            if (type === 'Brain') return 'mock-brain:5070';
            if (type === 'AgentSet') return 'mock-agentset:5100';
            return undefined;
        }),
    })),
}));
jest.mock('@cktmcs/errorhandler');
jest.mock('express-rate-limit');
jest.mock('cors');
jest.mock('body-parser');
jest.mock('./messageRouting');
jest.mock('./serviceDiscoveryManager');
jest.mock('./webSocketHandler');
jest.mock('./healthCheckManager');
jest.mock('./fileUploadManager');
jest.mock('./pluginManager');
jest.mock('./fileUploadService'); // Mocked for submitUserInput
jest.mock('jsonwebtoken');

// Cast mocked classes/functions
const mockExpress = express as jest.MockedFunction<typeof express>;
const mockWebSocketServer = WebSocket.Server as jest.MockedClass<typeof WebSocket.Server>;
const mockHttp = http as jest.Mocked<typeof http>;
const mockAnalyzeError = analyzeError as jest.Mock;
const mockMessageRouter = MessageRouter as jest.MockedClass<typeof MessageRouter>;
const mockServiceDiscoveryManager = ServiceDiscoveryManager as jest.MockedClass<typeof ServiceDiscoveryManager>;
const mockWebSocketHandler = WebSocketHandler as jest.MockedClass<typeof WebSocketHandler>;
const mockHealthCheckManager = HealthCheckManager as jest.MockedClass<typeof HealthCheckManager>;
const mockFileUploadManager = FileUploadManager as jest.MockedClass<typeof FileUploadManager>;
const mockPluginManager = PluginManager as jest.MockedClass<typeof PluginManager>;
const mockFileUploadService = FileUploadService as jest.MockedClass<typeof FileUploadService>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('PostOffice Service', () => {
    let postOffice: PostOffice;
    let mockApp: jest.Mocked<express.Application>;
    let mockServer: jest.Mocked<http.Server>;
    let mockWss: jest.Mocked<WebSocket.Server>;
    let mockAuthenticatedApiPost: jest.Mock;
    let mockAuthenticatedApiGet: jest.Mock;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    // Mock instances of manager classes
    let mockMessageRouterInstance: jest.Mocked<MessageRouter>;
    let mockServiceDiscoveryManagerInstance: jest.Mocked<ServiceDiscoveryManager>;
    let mockWebSocketHandlerInstance: jest.Mocked<WebSocketHandler>;
    let mockHealthCheckManagerInstance: jest.Mocked<HealthCheckManager>;
    let mockFileUploadManagerInstance: jest.Mocked<FileUploadManager>;
    let mockPluginManagerInstance: jest.Mocked<PluginManager>;
    let mockFileUploadServiceInstance: jest.Mocked<FileUploadService>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock Express app and server
        mockApp = {
            use: jest.fn(),
            get: jest.fn(),
            post: jest.fn(),
            options: jest.fn(),
            listen: jest.fn(),
        } as unknown as jest.Mocked<express.Application>;
        mockExpress.mockReturnValue(mockApp);

        mockServer = {
            listen: jest.fn((port, host, cb) => cb()),
            on: jest.fn(),
        } as unknown as jest.Mocked<http.Server>;
        mockHttp.createServer.mockReturnValue(mockServer);

        // Mock WebSocket.Server
        mockWss = {
            on: jest.fn(),
            clients: new Set(), // Simulate connected clients
        } as any;
        mockWebSocketServer.mockImplementation(() => mockWss);

        // Get the mocked authenticatedApi from the BaseEntity mock
        const BaseEntityMockInstance = new (BaseEntity as jest.Mock)();
        mockAuthenticatedApiPost = BaseEntityMockInstance.authenticatedApi.post;
        mockAuthenticatedApiGet = BaseEntityMockInstance.authenticatedApi.get;

        // Mock manager instances
        mockMessageRouterInstance = {
            routeMessage: jest.fn().mockResolvedValue(undefined),
            handleQueueMessage: jest.fn().mockResolvedValue(undefined),
            processMessageQueue: jest.fn(),
        } as any;
        mockMessageRouter.mockImplementation(() => mockMessageRouterInstance);

        mockServiceDiscoveryManagerInstance = {
            registerComponent: jest.fn().mockResolvedValue(undefined),
            discoverService: jest.fn().mockResolvedValue(undefined),
            getServices: jest.fn().mockReturnValue({}),
            getComponentUrl: jest.fn().mockImplementation((type: string) => {
                if (type === 'Librarian') return 'mock-librarian:5040';
                if (type === 'MissionControl') return 'mock-missioncontrol:5030';
                if (type === 'Brain') return 'mock-brain:5070';
                if (type === 'AgentSet') return 'mock-agentset:5100';
                return undefined;
            }),
        } as any;
        mockServiceDiscoveryManager.mockImplementation(() => mockServiceDiscoveryManagerInstance);

        mockWebSocketHandlerInstance = {
            setupWebSocket: jest.fn(),
            broadcastToClients: jest.fn(),
            handleWebSocketMessage: jest.fn(),
        } as any;
        mockWebSocketHandler.mockImplementation(() => mockWebSocketHandlerInstance);

        mockHealthCheckManagerInstance = {
            setupHealthCheck: jest.fn(),
        } as any;
        mockHealthCheckManager.mockImplementation(() => mockHealthCheckManagerInstance);

        mockFileUploadManagerInstance = {
            getUploadMiddleware: jest.fn().mockReturnValue((req: any, res: any, next: any) => next()),
            setupRoutes: jest.fn(),
            fileUploadServiceInstance: {
                uploadFile: jest.fn().mockResolvedValue({ id: 'file-id', originalName: 'test.txt', mimeType: 'text/plain', size: 100, storagePath: '/tmp/file.txt', uploadedBy: 'user', uploadedAt: new Date() }),
                convertToMissionFile: jest.fn().mockImplementation((file) => file),
            } as any,
        } as any;
        mockFileUploadManager.mockImplementation(() => mockFileUploadManagerInstance);
        mockFileUploadService.mockImplementation(() => mockFileUploadManagerInstance.fileUploadServiceInstance);

        mockPluginManagerInstance = {
            setupRoutes: jest.fn(),
        } as any;
        mockPluginManager.mockImplementation(() => mockPluginManagerInstance);

        // Suppress console logs
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Instantiate PostOffice
        postOffice = new PostOffice();

        // Ensure the internal authenticatedApi is the mocked one for consistency
        (postOffice as any).authenticatedApi = BaseEntityMockInstance.authenticatedApi;
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('should initialize BaseEntity and set up managers and server', () => {
        expect(BaseEntity).toHaveBeenCalledTimes(1);
        expect(BaseEntity).toHaveBeenCalledWith(expect.any(String), 'PostOffice', expect.any(String), expect.any(String), true); // Skip registration

        expect(mockServiceDiscoveryManager).toHaveBeenCalledTimes(1);
        expect(mockWebSocketHandler).toHaveBeenCalledTimes(1);
        expect(mockHealthCheckManager).toHaveBeenCalledTimes(1);
        expect(mockFileUploadManager).toHaveBeenCalledTimes(1);
        expect(mockPluginManager).toHaveBeenCalledTimes(1);
        expect(mockMessageRouter).toHaveBeenCalledTimes(1);

        expect(mockApp.use).toHaveBeenCalled(); // Middleware
        expect(mockApp.listen).not.toHaveBeenCalled(); // Server listen is on http.createServer().listen
        expect(mockServer.listen).toHaveBeenCalledWith(expect.any(Number), '0.0.0.0', expect.any(Function));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('PostOffice listening'));

        expect(mockHealthCheckManagerInstance.setupHealthCheck).toHaveBeenCalledTimes(1);
        expect(mockFileUploadManagerInstance.setupRoutes).toHaveBeenCalledTimes(1);
        expect(mockPluginManagerInstance.setupRoutes).toHaveBeenCalledTimes(1);

        expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 100); // Message processing interval
    });

    describe('Routes', () => {
        let agent: request.SuperAgentTest;

        beforeEach(() => {
            // Create a supertest agent for testing routes
            agent = request.agent(mockApp);
        });

        it('GET / should return PostOffice running message', async () => {
            const res = await agent.get('/');
            expect(res.statusCode).toBe(200);
            expect(res.text).toBe('PostOffice service is running');
        });

        it('POST /registerComponent should register component successfully', async () => {
            const componentData = { id: 'comp1', type: 'Agent', url: 'http://agent1:8080' };
            const res = await agent.post('/registerComponent').send(componentData);

            expect(mockServiceDiscoveryManagerInstance.registerComponent).toHaveBeenCalledWith(componentData.id, componentData.type, componentData.url);
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ status: 'Component registered successfully' });
        });

        it('POST /message should route message successfully', async () => {
            const message = { type: MessageType.REQUEST, recipient: 'Agent', content: 'hello' };
            const res = await agent.post('/message').send(message);

            expect(mockMessageRouterInstance.routeMessage).toHaveBeenCalledWith(message);
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ status: 'Message queued for processing' });
        });

        it('POST /sendMessage should handle incoming message and send to component', async () => {
            const message = { type: MessageType.REQUEST, recipient: 'Agent', content: 'hello' };
            mockServiceDiscoveryManagerInstance.discoverService.mockResolvedValueOnce('http://mock-agent:8080');

            const res = await agent.post('/sendMessage').send(message);

            expect(mockServiceDiscoveryManagerInstance.discoverService).toHaveBeenCalledWith(message.recipient);
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith('http://mock-agent:8080/message', message, expect.any(String)); // Token is passed
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ status: 'Message sent' });
        });

        it('GET /requestComponent should return component by id', async () => {
            mockServiceDiscoveryManagerInstance.getServices.mockReturnValueOnce({ comp1: { id: 'comp1', type: 'Agent', url: 'http://agent1' } });
            mockServiceDiscoveryManagerInstance.getComponentUrl.mockReturnValueOnce('http://agent1');

            const res = await agent.get('/requestComponent?id=comp1');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ component: { id: 'comp1', type: 'Agent', url: 'http://agent1' } });
        });

        it('GET /getServices should return registered services', async () => {
            mockServiceDiscoveryManagerInstance.getServices.mockReturnValueOnce({ Agent: 'http://agent:8080' });
            const res = await agent.get('/getServices');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ Agent: 'http://agent:8080' });
        });

        it('POST /submitUserInput should handle text input', async () => {
            const requestId = 'req-123';
            const responseText = 'user text input';
            (postOffice as any).userInputRequests.set(requestId, jest.fn());
            (postOffice as any).userInputRequestMetadata.set(requestId, { answerType: 'text', question: 'What is your name?' });

            const res = await agent.post('/submitUserInput').send({ requestId, response: responseText });

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'User input received' });
            expect((postOffice as any).userInputRequests.get(requestId)).toHaveBeenCalledWith(responseText);
            expect((postOffice as any).userInputRequests.has(requestId)).toBe(false);
        });

        it('POST /submitUserInput should handle file input', async () => {
            const requestId = 'req-file';
            const fileBuffer = Buffer.from('file content');
            const originalname = 'test.txt';
            const mimetype = 'text/plain';

            (postOffice as any).userInputRequests.set(requestId, jest.fn());
            (postOffice as any).userInputRequestMetadata.set(requestId, { answerType: 'file', question: 'Upload file' });

            // Mock Multer file structure
            const mockFile = { buffer: fileBuffer, originalname, mimetype } as Express.Multer.File;
            // Mock the middleware to attach files to req.files
            mockFileUploadManagerInstance.getUploadMiddleware.mockImplementationOnce(() => (req: any, res: any, next: any) => {
                req.files = [mockFile];
                next();
            });

            const res = await agent.post('/submitUserInput').attach('file', fileBuffer, originalname);

            expect(mockFileUploadManagerInstance.fileUploadServiceInstance.uploadFile).toHaveBeenCalledWith(
                fileBuffer, originalname, mimetype, 'user', expect.any(Object)
            );
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/storeData'), expect.objectContaining({
                id: 'file-id',
                collection: 'files',
            }));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ message: 'User input received' });
            expect((postOffice as any).userInputRequests.get(requestId)).toHaveBeenCalledWith('file-id');
        });

        it('POST /sendUserInputRequest should send user input request to clients', async () => {
            const requestData = { question: 'Enter value', answerType: 'text' };
            const res = await agent.post('/sendUserInputRequest').send(requestData);

            expect(mockWebSocketHandlerInstance.broadcastToClients).toHaveBeenCalledWith(expect.objectContaining({
                type: 'USER_INPUT_REQUEST',
                request_id: expect.any(String),
                question: requestData.question,
            }));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ request_id: expect.any(String) });
        });

        it('POST /createMission should forward request to MissionControl', async () => {
            const missionData = { goal: 'New Mission Goal', clientId: 'client1' };
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { result: { missionId: 'new-mission-id' } } });

            const res = await agent.post('/createMission').send(missionData);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/message'), expect.objectContaining({
                type: MessageType.CREATE_MISSION,
                recipient: 'MissionControl',
                content: { goal: missionData.goal },
            }), expect.any(Object));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ result: { missionId: 'new-mission-id' } });
            expect((postOffice as any).clientMissions.get(missionData.clientId)).toBe('new-mission-id');
            expect((postOffice as any).missionClients.get('new-mission-id')?.has(missionData.clientId)).toBe(true);
        });

        it('POST /loadMission should forward request to MissionControl', async () => {
            const loadData = { missionId: 'load-mission-id', clientId: 'client1' };
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { mission: { id: 'load-mission-id' } } });

            const res = await agent.post('/loadMission').send(loadData);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/loadMission'), expect.objectContaining({
                missionId: loadData.missionId,
                clientId: loadData.clientId,
            }));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ mission: { id: 'load-mission-id' } });
            expect((postOffice as any).clientMissions.get(loadData.clientId)).toBe('load-mission-id');
            expect((postOffice as any).missionClients.get('load-mission-id')?.has(loadData.clientId)).toBe(true);
        });

        it('GET /librarian/retrieve/:id should retrieve work product', async () => {
            const workProductId = 'wp-123';
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { data: { id: workProductId, content: 'work product data' } } });

            const res = await agent.get(`/librarian/retrieve/${workProductId}`);

            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining(`/loadWorkProduct/${workProductId}`), expect.any(Object));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ data: { id: workProductId, content: 'work product data' } });
        });

        it('GET /getSavedMissions should retrieve saved missions', async () => {
            const mockMissions = [{ id: 'm1', name: 'Mission 1' }];
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: mockMissions });
            mockJwt.verify.mockReturnValueOnce({ userId: 'user1' });

            const res = await agent.get('/getSavedMissions').set('Authorization', 'Bearer mock-token');

            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining('/getSavedMissions'), expect.objectContaining({ params: { userId: 'user1' } }));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(mockMissions);
        });

        it('GET /step/:stepId should retrieve step details', async () => {
            const stepId = 'step-1';
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { id: stepId, status: 'completed' } });

            const res = await agent.get(`/step/${stepId}`);

            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining(`/agent/step/${stepId}`), expect.any(Object));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ id: stepId, status: 'completed' });
        });

        it('GET /brain/performance should retrieve model performance', async () => {
            const performanceData = [{ model: 'gpt-3', score: 0.9 }];
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [{ _id: 'model-performance-data', performanceData }] } });

            const res = await agent.get('/brain/performance');

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/queryData'), expect.objectContaining({ collection: 'mcsdata', query: { _id: 'model-performance-data' } }));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ success: true, performanceData });
        });

        it('GET /brain/performance/rankings should retrieve model rankings', async () => {
            const rankingsData = [{ model: 'gpt-3', rank: 1 }];
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [{ _id: 'model-performance-data', rankings: { TextToText: { overall: rankingsData } } }] } });

            const res = await agent.get('/brain/performance/rankings?conversationType=TextToText&metric=overall');

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/queryData'), expect.any(Object));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ success: true, rankings: rankingsData });
        });

        it('POST /brain/evaluations should submit model evaluation', async () => {
            const evaluationData = { modelName: 'gpt-3', conversationType: LLMConversationType.TextToText, scores: { accuracy: 0.8 } };
            const res = await agent.post('/brain/evaluations').send(evaluationData);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/evaluations'), evaluationData);
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ success: true });
        });

        it('USE /securityManager/* should route security requests', async () => {
            const securityReqBody = { action: 'login' };
            mockAuthenticatedApiPost.mockResolvedValueOnce({ status: 200, data: { token: 'abc' } });

            const res = await agent.post('/securityManager/auth/login').send(securityReqBody);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), securityReqBody, expect.any(Object));
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ token: 'abc' });
        });
    });

    describe('WebSocket Handling', () => {
        let mockWsInstance: jest.Mocked<WebSocket>;
        let mockWsOnConnectionCallback: (ws: WebSocket, req: http.IncomingMessage) => void;

        beforeEach(() => {
            // Capture the 'connection' event handler from wss
            mockWsOnConnectionCallback = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];

            // Mock a WebSocket instance
            mockWsInstance = {
                on: jest.fn(),
                send: jest.fn(),
                close: jest.fn(),
            } as any;
        });

        it('should handle new WebSocket connection', async () => {
            const mockReq = { url: '/ws?clientId=test-client&token=abc', headers: { host: 'localhost' } } as unknown as http.IncomingMessage;
            mockWsOnConnectionCallback(mockWsInstance, mockReq);

            expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'CONNECTION_CONFIRMED', clientId: 'test-client' }));
            expect((postOffice as any).clients.get('test-client')).toBe(mockWsInstance);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Client test-client connected successfully'));
        });

        it('should close connection if client ID is missing', async () => {
            const mockReq = { url: '/ws?token=abc', headers: { host: 'localhost' } } as unknown as http.IncomingMessage;
            mockWsOnConnectionCallback(mockWsInstance, mockReq);

            expect(mockWsInstance.close).toHaveBeenCalledWith(1008, 'Client ID missing');
            expect(consoleLogSpy).toHaveBeenCalledWith('Client ID missing');
        });

        it('should associate client with mission if missionId is present', async () => {
            (postOffice as any).clientMissions.set('test-client', 'mission-123');
            const mockReq = { url: '/ws?clientId=test-client&token=abc', headers: { host: 'localhost' } } as unknown as http.IncomingMessage;
            mockWsOnConnectionCallback(mockWsInstance, mockReq);

            expect((postOffice as any).missionClients.get('mission-123')?.has('test-client')).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Client test-client is associated with mission mission-123'));
        });

        it('should send queued messages to new client', async () => {
            const clientId = 'test-client';
            const queuedMessage = { type: MessageType.STATUS_UPDATE, content: 'update' };
            (postOffice as any).clientMessageQueue.set(clientId, [queuedMessage]);

            const mockReq = { url: `/ws?clientId=${clientId}&token=abc`, headers: { host: 'localhost' } } as unknown as http.IncomingMessage;
            mockWsOnConnectionCallback(mockWsInstance, mockReq);

            expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify(queuedMessage));
            expect((postOffice as any).clientMessageQueue.get(clientId)?.length).toBe(0);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sending 1 queued messages to client'));
        });

        it('should handle incoming WebSocket messages', async () => {
            const clientId = 'test-client';
            const mockReq = { url: `/ws?clientId=${clientId}&token=abc`, headers: { host: 'localhost' } } as unknown as http.IncomingMessage;
            mockWsOnConnectionCallback(mockWsInstance, mockReq);

            const messageHandler = mockWsInstance.on.mock.calls.find(call => call[0] === 'message')[1];
            const incomingMessage = { type: MessageType.USER_MESSAGE, content: 'hello from client' };
            await messageHandler(JSON.stringify(incomingMessage));

            expect(mockWebSocketHandlerInstance.handleWebSocketMessage).toHaveBeenCalledWith(expect.objectContaining(incomingMessage), expect.any(String));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Received WebSocket message from client'));
        });

        it('should pause mission on WebSocket disconnect', async () => {
            const clientId = 'test-client';
            const missionId = 'mission-disconnect';
            (postOffice as any).clientMissions.set(clientId, missionId);
            (postOffice as any).missions.set(missionId, { id: missionId, status: Status.RUNNING } as any);

            const mockReq = { url: `/ws?clientId=${clientId}&token=abc`, headers: { host: 'localhost' } } as unknown as http.IncomingMessage;
            mockWsOnConnectionCallback(mockWsInstance, mockReq);

            const closeHandler = mockWsInstance.on.mock.calls.find(call => call[0] === 'close')[1];
            await closeHandler();

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/message'), expect.objectContaining({
                type: MessageType.PAUSE,
                content: { missionId: missionId, reason: 'Client disconnected' }
            }));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Client test-client disconnected'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully paused mission'));
        });
    });

    describe('handleQueueMessage', () => {
        it('should delegate to messageRouter.handleQueueMessage', async () => {
            const mockMessage = { type: MessageType.REQUEST, content: 'test' };
            await (postOffice as any).handleQueueMessage(mockMessage);
            expect(mockMessageRouterInstance.handleQueueMessage).toHaveBeenCalledWith(mockMessage);
        });
    });

    describe('submitUserInput', () => {
        const mockRequestId = 'req-submit';
        const mockResponseText = 'user text';
        const mockQuestion = 'What is it?';

        beforeEach(() => {
            (postOffice as any).userInputRequests.set(mockRequestId, jest.fn());
            (postOffice as any).userInputRequestMetadata.set(mockRequestId, { answerType: 'text', question: mockQuestion });
        });

        it('should process text input successfully', async () => {
            const mockReq = { body: { requestId: mockRequestId, response: mockResponseText } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (postOffice as any).submitUserInput(mockReq, mockRes);

            expect((postOffice as any).userInputRequests.get(mockRequestId)).toHaveBeenCalledWith(mockResponseText);
            expect((postOffice as any).userInputRequests.has(mockRequestId)).toBe(false);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ message: 'User input received' });
        });

        it('should handle file input successfully', async () => {
            const fileBuffer = Buffer.from('file content');
            const originalname = 'test.txt';
            const mimetype = 'text/plain';

            (postOffice as any).userInputRequestMetadata.set(mockRequestId, { answerType: 'file', question: mockQuestion });
            const mockReq = { body: { requestId: mockRequestId }, files: [{ buffer: fileBuffer, originalname, mimetype }] } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (postOffice as any).submitUserInput(mockReq, mockRes);

            expect(mockFileUploadManagerInstance.fileUploadServiceInstance.uploadFile).toHaveBeenCalledWith(
                fileBuffer, originalname, mimetype, 'user', expect.objectContaining({ description: expect.stringContaining(mockQuestion) })
            );
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/storeData'), expect.objectContaining({
                id: 'file-id',
                collection: 'files',
            }));
            expect((postOffice as any).userInputRequests.get(mockRequestId)).toHaveBeenCalledWith('file-id');
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should return 400 if file input request but no files provided', async () => {
            (postOffice as any).userInputRequestMetadata.set(mockRequestId, { answerType: 'file', question: mockQuestion });
            const mockReq = { body: { requestId: mockRequestId }, files: [] } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (postOffice as any).submitUserInput(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'No files provided for file input request' });
        });

        it('should return 404 if user input request not found', async () => {
            (postOffice as any).userInputRequests.clear();
            const mockReq = { body: { requestId: 'non-existent', response: 'test' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (postOffice as any).submitUserInput(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'User input request not found' });
        });

        it('should return 500 if file upload fails', async () => {
            (postOffice as any).userInputRequestMetadata.set(mockRequestId, { answerType: 'file', question: mockQuestion });
            const mockReq = { body: { requestId: mockRequestId }, files: [{ buffer: Buffer.from('a'), originalname: 'a.txt', mimetype: 'text/plain' }] } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockFileUploadManagerInstance.fileUploadServiceInstance.uploadFile.mockRejectedValueOnce(new Error('Upload failed'));

            await (postOffice as any).submitUserInput(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Failed to upload file' });
        });
    });

    describe('sendUserInputRequest', () => {
        const requestData = { question: 'How are you?', answerType: 'text', choices: ['Good', 'Bad'] };

        it('should send user input request to clients', async () => {
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { body: requestData } as express.Request;

            await (postOffice as any).sendUserInputRequest(req, res);

            expect(mockWebSocketHandlerInstance.broadcastToClients).toHaveBeenCalledWith(expect.objectContaining({
                type: 'USER_INPUT_REQUEST',
                request_id: expect.any(String),
                question: requestData.question,
                answerType: requestData.answerType,
                choices: requestData.choices,
            }));
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ request_id: expect.any(String) });
            expect((postOffice as any).userInputRequests.has(expect.any(String))).toBe(true);
            expect((postOffice as any).userInputRequestMetadata.has(expect.any(String))).toBe(true);
        });

        it('should handle errors', async () => {
            mockWebSocketHandlerInstance.broadcastToClients.mockImplementationOnce(() => { throw new Error('Broadcast failed'); });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { body: requestData } as express.Request;

            await (postOffice as any).sendUserInputRequest(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Failed to send user input request' });
        });
    });

    describe('createMission', () => {
        const missionData = { goal: 'New Mission Goal', clientId: 'client1' };

        it('should forward request to MissionControl and associate client', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { result: { missionId: 'new-mission-id' } } });
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
            const req = { body: missionData, headers: { authorization: 'Bearer token' } } as express.Request;

            await (postOffice as any).createMission(req, res);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/message'), expect.objectContaining({
                type: MessageType.CREATE_MISSION,
                recipient: 'MissionControl',
                content: { goal: missionData.goal },
                clientId: missionData.clientId,
                userId: 'system',
            }), expect.objectContaining({ headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' } }));
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith({ result: { missionId: 'new-mission-id' } });
            expect((postOffice as any).clientMissions.get(missionData.clientId)).toBe('new-mission-id');
            expect((postOffice as any).missionClients.get('new-mission-id')?.has(missionData.clientId)).toBe(true);
        });

        it('should return 404 if MissionControl URL not found', async () => {
            (BaseEntity as jest.Mock).mock.results[0].value.getComponentUrl.mockReturnValueOnce(undefined);
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
            const req = { body: missionData, headers: {} } as express.Request;

            await (postOffice as any).createMission(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.send).toHaveBeenCalledWith('Failed to create mission');
        });

        it('should handle errors', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('MissionControl error'));
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { body: missionData, headers: {} } as express.Request;

            await (postOffice as any).createMission(req, res);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error creating mission'), expect.any(Error));
            expect(res.status).toHaveBeenCalledWith(504);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('Could not create mission') });
        });
    });

    describe('loadMission', () => {
        const loadData = { missionId: 'load-mission-id', clientId: 'client1' };

        it('should forward request to MissionControl and associate client', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { mission: { id: 'load-mission-id' } } });
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
            const req = { body: loadData } as express.Request;

            await (postOffice as any).loadMission(req, res);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/loadMission'), expect.objectContaining({
                missionId: loadData.missionId,
                clientId: loadData.clientId,
                userId: 'system',
            }));
            expect(res.statusCode).toBe(200);
            expect(res.send).toHaveBeenCalledWith({ mission: { id: 'load-mission-id' } });
            expect((postOffice as any).clientMissions.get(loadData.clientId)).toBe('load-mission-id');
            expect((postOffice as any).missionClients.get('load-mission-id')?.has(loadData.clientId)).toBe(true);
        });

        it('should handle errors', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('MissionControl error'));
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
            const req = { body: loadData } as express.Request;

            await (postOffice as any).loadMission(req, res);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading mission'), expect.any(Error));
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith({ error: 'Failed to load mission' });
        });
    });

    describe('retrieveWorkProduct', () => {
        const workProductId = 'wp-123';

        it('should retrieve work product from Librarian', async () => {
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { data: { id: workProductId, content: 'work product data' } } });
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
            const req = { params: { id: workProductId } } as unknown as express.Request;

            await (postOffice as any).retrieveWorkProduct(req, res);

            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining(`/loadWorkProduct/${workProductId}`), expect.any(Object));
            expect(res.statusCode).toBe(200);
            expect(res.send).toHaveBeenCalledWith({ data: { id: workProductId, content: 'work product data' } });
        });

        it('should return 404 if Librarian URL not found', async () => {
            (BaseEntity as jest.Mock).mock.results[0].value.getComponentUrl.mockImplementationOnce((type: string) => {
                if (type === 'Librarian') return undefined;
                return undefined;
            });
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
            const req = { params: { id: workProductId } } as unknown as express.Request;

            await (postOffice as any).retrieveWorkProduct(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.send).toHaveBeenCalledWith({ error: 'Librarian not registered' });
        });

        it('should handle errors', async () => {
            mockAuthenticatedApiGet.mockRejectedValueOnce(new Error('Librarian error'));
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
            const req = { params: { id: workProductId } } as unknown as express.Request;

            await (postOffice as any).retrieveWorkProduct(req, res);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error retrieving work product'), expect.any(Error));
            expect(res.statusCode).toBe(500);
            expect(res.send).toHaveBeenCalledWith({ error: expect.stringContaining('Failed to retrieve work product') });
        });
    });

    describe('getSavedMissions', () => {
        const mockMissions = [{ id: 'm1', name: 'Mission 1' }];

        it('should retrieve saved missions from Librarian', async () => {
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: mockMissions });
            mockJwt.verify.mockReturnValueOnce({ userId: 'user1' });

            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
            const req = { headers: { authorization: 'Bearer mock-token' } } as express.Request;

            await (postOffice as any).getSavedMissions(req, res);

            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining('/getSavedMissions'), expect.objectContaining({ params: { userId: 'user1' } }));
            expect(res.statusCode).toBe(200);
            expect(res.send).toHaveBeenCalledWith(mockMissions);
        });

        it('should return empty array if Librarian URL not found', async () => {
            (BaseEntity as jest.Mock).mock.results[0].value.getComponentUrl.mockImplementationOnce((type: string) => {
                if (type === 'Librarian') return undefined;
                return undefined;
            });
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
            const req = { headers: {} } as express.Request;

            await (postOffice as any).getSavedMissions(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.send).toHaveBeenCalledWith([]);
        });

        it('should handle errors', async () => {
            mockAuthenticatedApiGet.mockRejectedValueOnce(new Error('Librarian error'));
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
            const req = { headers: {} } as express.Request;

            await (postOffice as any).getSavedMissions(req, res);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting saved missions'), expect.any(Error));
            expect(res.statusCode).toBe(500);
            expect(res.send).toHaveBeenCalledWith({ error: 'Failed to get saved missions' });
        });
    });

    describe('getStepDetails', () => {
        const stepId = 'step-123';

        it('should retrieve step details from AgentSet', async () => {
            mockAuthenticatedApiGet.mockResolvedValueOnce({ data: { id: stepId, status: 'completed' } });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { query: { stepId: stepId } } as express.Request;

            await (postOffice as any).getStepDetails(req, res);

            expect(mockAuthenticatedApiGet).toHaveBeenCalledWith(expect.stringContaining(`/agent/step/${stepId}`), expect.any(Object));
            expect(res.statusCode).toBe(200);
            expect(res.json).toHaveBeenCalledWith({ id: stepId, status: 'completed' });
        });

        it('should return 400 if stepId is missing', async () => {
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { query: {} } as express.Request;

            await (postOffice as any).getStepDetails(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'stepId is required' });
        });

        it('should return 503 if AgentSet URL not found', async () => {
            (BaseEntity as jest.Mock).mock.results[0].value.getComponentUrl.mockImplementationOnce((type: string) => {
                if (type === 'AgentSet') return undefined;
                return undefined;
            });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { query: { stepId: stepId } } as express.Request;

            await (postOffice as any).getStepDetails(req, res);

            expect(res.statusCode).toBe(503);
            expect(res.json).toHaveBeenCalledWith({ error: 'AgentSet service not available' });
        });

        it('should handle errors', async () => {
            mockAuthenticatedApiGet.mockRejectedValueOnce(new Error('AgentSet error'));
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { query: { stepId: stepId } } as express.Request;

            await (postOffice as any).getStepDetails(req, res);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error retrieving step details'), expect.any(Error));
            expect(res.statusCode).toBe(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Failed to retrieve step details' });
        });
    });

    describe('getModelPerformance', () => {
        const performanceData = [{ model: 'gpt-3', score: 0.9 }];

        it('should retrieve model performance data', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [{ _id: 'model-performance-data', performanceData }] } });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() } as unknown as express.Response;
            const req = {} as express.Request;

            await (postOffice as any).getModelPerformance(req, res);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/queryData'), expect.objectContaining({ collection: 'mcsdata', query: { _id: 'model-performance-data' } }));
            expect(res.statusCode).toBe(200);
            expect(res.json).toHaveBeenCalledWith({ success: true, performanceData });
            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
        });

        it('should return empty array if no data found', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [] } });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() } as unknown as express.Response;
            const req = {} as express.Request;

            await (postOffice as any).getModelPerformance(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.json).toHaveBeenCalledWith({ success: true, performanceData: [] });
        });

        it('should return 404 if Librarian URL not found', async () => {
            (BaseEntity as jest.Mock).mock.results[0].value.getComponentUrl.mockImplementationOnce((type: string) => {
                if (type === 'Librarian') return undefined;
                return undefined;
            });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = {} as express.Request;

            await (postOffice as any).getModelPerformance(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.json).toHaveBeenCalledWith({ error: 'Librarian service not available' });
        });

        it('should handle errors', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('Librarian error'));
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = {} as express.Request;

            await (postOffice as any).getModelPerformance(req, res);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting model performance data'), expect.any(Error));
            expect(res.statusCode).toBe(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get model performance data' });
        });
    });

    describe('getModelRankings', () => {
        const rankingsData = [{ model: 'gpt-3', rank: 1 }];

        it('should retrieve model rankings', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [{ _id: 'model-performance-data', rankings: { TextToText: { overall: rankingsData } } }] } });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() } as unknown as express.Response;
            const req = { query: { conversationType: 'TextToText', metric: 'overall' } } as express.Request;

            await (postOffice as any).getModelRankings(req, res);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/queryData'), expect.any(Object));
            expect(res.statusCode).toBe(200);
            expect(res.json).toHaveBeenCalledWith({ success: true, rankings: rankingsData });
            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
        });

        it('should return empty array if no data found', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [] } });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { query: {} } as express.Request;

            await (postOffice as any).getModelRankings(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.json).toHaveBeenCalledWith({ success: true, rankings: [] });
        });

        it('should return empty array if rankings for type/metric not found', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [{ _id: 'model-performance-data', rankings: { TextToText: {} } }] } });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { query: { conversationType: 'TextToText', metric: 'nonexistent' } } as express.Request;

            await (postOffice as any).getModelRankings(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.json).toHaveBeenCalledWith({ success: true, rankings: [] });
        });

        it('should return 404 if Librarian URL not found', async () => {
            (BaseEntity as jest.Mock).mock.results[0].value.getComponentUrl.mockImplementationOnce((type: string) => {
                if (type === 'Librarian') return undefined;
                return undefined;
            });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { query: {} } as express.Request;

            await (postOffice as any).getModelRankings(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.json).toHaveBeenCalledWith({ error: 'Librarian service not available' });
        });

        it('should handle errors', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('Librarian error'));
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { query: {} } as express.Request;

            await (postOffice as any).getModelRankings(req, res);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting model rankings'), expect.any(Error));
            expect(res.statusCode).toBe(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get model rankings' });
        });
    });

    describe('submitModelEvaluation', () => {
        const evaluationData = { modelName: 'gpt-3', conversationType: LLMConversationType.TextToText, scores: { accuracy: 0.8 } };

        it('should submit model evaluation to Brain', async () => {
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { body: evaluationData } as express.Request;

            await (postOffice as any).submitModelEvaluation(req, res);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('/evaluations'), evaluationData);
            expect(res.statusCode).toBe(200);
            expect(res.json).toHaveBeenCalledWith({ success: true });
        });

        it('should return 404 if Brain URL not found', async () => {
            (BaseEntity as jest.Mock).mock.results[0].value.getComponentUrl.mockImplementationOnce((type: string) => {
                if (type === 'Brain') return undefined;
                return undefined;
            });
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { body: evaluationData } as express.Request;

            await (postOffice as any).submitModelEvaluation(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.json).toHaveBeenCalledWith({ error: 'Brain service not available' });
        });

        it('should handle errors', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('Brain error'));
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { body: evaluationData } as express.Request;

            await (postOffice as any).submitModelEvaluation(req, res);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error submitting model evaluation'), expect.any(Error));
            expect(res.statusCode).toBe(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Failed to submit model evaluation' });
        });
    });

    describe('routeSecurityRequest', () => {
        const securityReqBody = { action: 'login' };

        it('should forward request to SecurityManager', async () => {
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { originalUrl: '/securityManager/auth/login', method: 'POST', body: securityReqBody, query: {} } as express.Request;
            const next = jest.fn();

            mockAuthenticatedApiPost.mockResolvedValueOnce({ status: 200, data: { token: 'abc' } });

            await (postOffice as any).routeSecurityRequest(req, res, next);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(expect.stringContaining('mock-securitymanager:5010/auth/login'), securityReqBody, expect.any(Object));
            expect(res.statusCode).toBe(200);
            expect(res.json).toHaveBeenCalledWith({ token: 'abc' });
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 505 if SecurityManager URL not found', async () => {
            (postOffice as any).securityManagerUrl = undefined; // Simulate missing URL
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { originalUrl: '/securityManager/auth/login', method: 'POST', body: securityReqBody, query: {} } as express.Request;
            const next = jest.fn();

            await (postOffice as any).routeSecurityRequest(req, res, next);

            expect(res.statusCode).toBe(505);
            expect(res.json).toHaveBeenCalledWith({ error: 'SecurityManager not registered yet' });
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('should handle errors', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('SecurityManager error'));
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;
            const req = { originalUrl: '/securityManager/auth/login', method: 'POST', body: securityReqBody, query: {} } as express.Request;
            const next = jest.fn();

            await (postOffice as any).routeSecurityRequest(req, res, next);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error forwarding request to SecurityManager'), expect.any(Error));
            expect(res.statusCode).toBe(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
        });
    });
});
