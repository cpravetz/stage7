import { WebSocketHandler } from '../src/webSocketHandler';
import WebSocket from 'ws';
import http from 'http';
import { Message, MessageType } from '@cktmcs/shared';

// Mock external dependencies
jest.mock('ws');
jest.mock('http');

describe('WebSocketHandler', () => {
    let handler: WebSocketHandler;
    let mockClients: Map<string, WebSocket.WebSocket>;
    let mockClientMessageQueue: Map<string, Message[]>;
    let mockClientMissions: Map<string, string>;
    let mockMissionClients: Map<string, Set<string>>;
    let mockAuthenticatedApi: any;
    let mockGetComponentUrl: jest.Mock;
    let mockHandleWebSocketMessageCallback: jest.Mock;
    let mockWss: jest.Mocked<WebSocket.Server>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockClients = new Map();
        mockClientMessageQueue = new Map();
        mockClientMissions = new Map();
        mockMissionClients = new Map();

        mockAuthenticatedApi = {
            post: jest.fn().mockResolvedValue({}),
        };
        mockGetComponentUrl = jest.fn().mockImplementation((type: string) => {
            if (type === 'MissionControl') return 'mock-missioncontrol:5030';
            return undefined;
        });
        mockHandleWebSocketMessageCallback = jest.fn();

        // Mock WebSocket.Server
        mockWss = {
            on: jest.fn(),
            clients: new Set(),
        } as any;

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        handler = new WebSocketHandler(
            mockClients,
            mockClientMessageQueue,
            mockClientMissions,
            mockMissionClients,
            mockAuthenticatedApi,
            mockGetComponentUrl,
            mockHandleWebSocketMessageCallback
        );
        handler.setupWebSocket(mockWss);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('setupWebSocket', () => {
        let mockWsInstance: jest.Mocked<WebSocket>;
        let mockReq: jest.Mocked<http.IncomingMessage>;
        let connectionHandler: (ws: WebSocket, req: http.IncomingMessage) => void;

        beforeEach(() => {
            // Extract the connection handler from wss.on calls
            connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];

            mockWsInstance = {
                on: jest.fn(),
                send: jest.fn(),
                close: jest.fn(),
                readyState: WebSocket.OPEN, // Simulate open connection
            } as any;

            mockReq = {
                url: '/ws?clientId=test-client&token=abc',
                headers: { host: 'localhost' },
            } as any;
        });

        it('should handle new WebSocket connection successfully', () => {
            connectionHandler(mockWsInstance, mockReq);

            expect(mockClients.get('test-client')).toBe(mockWsInstance);
            expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'CONNECTION_CONFIRMED', clientId: 'test-client' }));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Client test-client connected successfully'));
        });

        it('should remove browser- prefix from clientId', () => {
            mockReq.url = '/ws?clientId=browser-test-client&token=abc';
            connectionHandler(mockWsInstance, mockReq);
            expect(mockClients.get('test-client')).toBe(mockWsInstance);
        });

        it('should close connection if client ID is missing', () => {
            mockReq.url = '/ws?token=abc';
            connectionHandler(mockWsInstance, mockReq);
            expect(mockWsInstance.close).toHaveBeenCalledWith(1008, 'Client ID missing');
            expect(consoleLogSpy).toHaveBeenCalledWith('Client ID missing');
        });

        it('should associate client with mission if missionId is present', () => {
            mockClientMissions.set('test-client', 'mission-123');
            connectionHandler(mockWsInstance, mockReq);
            expect(mockMissionClients.get('mission-123')?.has('test-client')).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Client test-client is associated with mission mission-123'));
        });

        it('should send queued messages to new client', () => {
            const queuedMessage = { type: MessageType.STATUS_UPDATE, content: 'update' };
            mockClientMessageQueue.set('test-client', [queuedMessage]);

            connectionHandler(mockWsInstance, mockReq);

            expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify(queuedMessage));
            expect(mockClientMessageQueue.get('test-client')?.length).toBe(0);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sending 1 queued messages to client'));
        });

        it('should handle incoming WebSocket messages', () => {
            connectionHandler(mockWsInstance, mockReq);
            const messageHandler = mockWsInstance.on.mock.calls.find(call => call[0] === 'message')[1];
            const incomingMessage = { type: MessageType.USER_MESSAGE, content: 'hello from client' };
            messageHandler(JSON.stringify(incomingMessage));

            expect(mockHandleWebSocketMessageCallback).toHaveBeenCalledWith(expect.objectContaining(incomingMessage), 'abc');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Received WebSocket message from client'));
        });

        it('should handle CLIENT_CONNECT message and associate client with mission', () => {
            connectionHandler(mockWsInstance, mockReq);
            const messageHandler = mockWsInstance.on.mock.calls.find(call => call[0] === 'message')[1];
            const clientConnectMessage = { type: MessageType.CLIENT_CONNECT, clientId: 'test-client' };
            mockClientMissions.set('test-client', 'mission-456'); // Simulate mission already associated

            messageHandler(JSON.stringify(clientConnectMessage));

            expect(mockMissionClients.get('mission-456')?.has('test-client')).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Client test-client confirmed connection'));
        });

        it('should pause mission on WebSocket disconnect', async () => {
            mockClientMissions.set('test-client', 'mission-disconnect');
            connectionHandler(mockWsInstance, mockReq);

            const closeHandler = mockWsInstance.on.mock.calls.find(call => call[0] === 'close')[1];
            await closeHandler();

            expect(mockClients.has('test-client')).toBe(false);
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(expect.stringContaining('mock-missioncontrol:5030/message'), expect.objectContaining({
                type: MessageType.PAUSE,
                content: { missionId: 'mission-disconnect', reason: 'Client disconnected' }
            }));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Client test-client disconnected'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully paused mission'));
        });

        it('should handle errors during WebSocket message parsing', () => {
            connectionHandler(mockWsInstance, mockReq);
            const messageHandler = mockWsInstance.on.mock.calls.find(call => call[0] === 'message')[1];
            messageHandler('invalid json');

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error parsing WebSocket message'), expect.any(Error));
        });

        it('should handle errors during mission pause on disconnect', async () => {
            mockClientMissions.set('test-client', 'mission-disconnect');
            mockAuthenticatedApi.post.mockRejectedValueOnce(new Error('Pause failed'));
            connectionHandler(mockWsInstance, mockReq);

            const closeHandler = mockWsInstance.on.mock.calls.find(call => call[0] === 'close')[1];
            await closeHandler();

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to pause mission'), expect.any(Error));
        });
    });

    describe('sendToClient', () => {
        let mockWsInstance: jest.Mocked<WebSocket>;

        beforeEach(() => {
            mockWsInstance = {
                send: jest.fn(),
                readyState: WebSocket.OPEN,
            } as any;
            mockClients.set('target-client', mockWsInstance);
        });

        it('should send message to connected client', () => {
            const message = { type: MessageType.STATUS_UPDATE, content: 'status' };
            handler.sendToClient('target-client', message);
            expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify(message));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Message sent to client target-client'));
        });

        it('should queue message if client not found', () => {
            const message = { type: MessageType.STATUS_UPDATE, content: 'status' };
            handler.sendToClient('non-existent-client', message);
            expect(mockClientMessageQueue.get('non-existent-client')).toEqual([message]);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Client non-existent-client not found or not ready'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Message queued for client non-existent-client'));
        });

        it('should queue message if client not ready', () => {
            mockWsInstance.readyState = WebSocket.CONNECTING; // Simulate not ready
            const message = { type: MessageType.STATUS_UPDATE, content: 'status' };
            handler.sendToClient('target-client', message);
            expect(mockClientMessageQueue.get('target-client')).toEqual([message]);
        });

        it('should handle errors during message sending', () => {
            mockWsInstance.send.mockImplementationOnce(() => { throw new Error('Send error'); });
            const message = { type: MessageType.STATUS_UPDATE, content: 'status' };
            handler.sendToClient('target-client', message);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error sending message to client'), expect.any(Error));
        });
    });

    describe('broadcastToMissionClients', () => {
        const missionId = 'mission-broadcast';
        const message = { type: MessageType.USER_MESSAGE, content: 'broadcast to mission' };

        beforeEach(() => {
            mockMissionClients.set(missionId, new Set(['client1', 'client2']));
            mockClients.set('client1', { send: jest.fn(), readyState: WebSocket.OPEN } as any);
            mockClients.set('client2', { send: jest.fn(), readyState: WebSocket.OPEN } as any);
            jest.spyOn(handler, 'sendToClient'); // Spy on sendToClient to check calls
        });

        it('should broadcast message to all clients in a mission', () => {
            handler.broadcastToMissionClients(missionId, message);
            expect(handler.sendToClient).toHaveBeenCalledWith('client1', message);
            expect(handler.sendToClient).toHaveBeenCalledWith('client2', message);
            expect(handler.sendToClient).toHaveBeenCalledTimes(2);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Broadcasting message of type USER_MESSAGE to clients of mission mission-broadcast'));
        });

        it('should log if no clients found for mission', () => {
            mockMissionClients.clear();
            handler.broadcastToMissionClients(missionId, message);
            expect(handler.sendToClient).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No clients found for mission mission-broadcast to broadcast message.'));
        });
    });

    describe('broadcastToClients', () => {
        const message = { type: MessageType.STATUS_UPDATE, content: 'global broadcast' };

        beforeEach(() => {
            mockClients.set('clientA', { send: jest.fn(), readyState: WebSocket.OPEN } as any);
            mockClients.set('clientB', { send: jest.fn(), readyState: WebSocket.CONNECTING } as any); // Not ready
            mockClients.set('clientC', { send: jest.fn(), readyState: WebSocket.OPEN } as any);
        });

        it('should broadcast message to all connected and ready clients', () => {
            handler.broadcastToClients(message);
            expect(mockClients.get('clientA')?.send).toHaveBeenCalledWith(JSON.stringify(message));
            expect(mockClients.get('clientB')?.send).not.toHaveBeenCalled(); // Not ready
            expect(mockClients.get('clientC')?.send).toHaveBeenCalledWith(JSON.stringify(message));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Broadcast complete: sent to 2 of 3 clients'));
        });

        it('should handle errors during broadcast to individual client', () => {
            mockClients.get('clientA')?.send.mockImplementationOnce(() => { throw new Error('Broadcast send error'); });
            handler.broadcastToClients(message);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error broadcasting message to client clientA'), expect.any(Error));
        });
    });
});
