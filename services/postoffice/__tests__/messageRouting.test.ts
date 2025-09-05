import { MessageRouter } from '../src/messageRouting';
import { Message, MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { WebSocketHandler } from '../src/webSocketHandler';

// Mock external dependencies
jest.mock('@cktmcs/errorhandler');
jest.mock('../src/webSocketHandler');

describe('MessageRouter', () => {
    let router: MessageRouter;
    let mockComponents: Map<string, any>;
    let mockMessageQueue: Map<string, Message[]>;
    let mockMissionClients: Map<string, Set<string>>;
    let mockMqClient: any;
    let mockAuthenticatedApi: any;
    let mockWebSocketHandler: jest.Mocked<WebSocketHandler>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_ID = 'mock-postoffice-id';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockComponents = new Map();
        mockMessageQueue = new Map();
        mockMissionClients = new Map();

        mockMqClient = {
            isConnected: jest.fn().mockReturnValue(true), // Connected by default
            publishMessage: jest.fn().mockResolvedValue(true),
            sendRpcRequest: jest.fn().mockResolvedValue({ response: 'rpc-response' }),
        };

        mockAuthenticatedApi = {
            post: jest.fn().mockResolvedValue({ status: 200 }),
        };

        mockWebSocketHandler = {
            sendToClient: jest.fn(),
            broadcastToClients: jest.fn(),
        } as any;

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        router = new MessageRouter(
            mockComponents,
            mockMessageQueue,
            mockMissionClients,
            mockMqClient,
            mockAuthenticatedApi,
            MOCK_ID,
            mockWebSocketHandler
        );
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('routeMessage', () => {
        it('should handle STATISTICS message by calling handleStatisticsMessage', async () => {
            const message: Message = { type: MessageType.STATISTICS, recipient: 'user', content: { missionId: 'm1' } };
            jest.spyOn(router as any, 'handleStatisticsMessage').mockResolvedValue(undefined);

            await router.routeMessage(message);

            expect(router['handleStatisticsMessage']).toHaveBeenCalledWith(message, undefined);
            expect(mockWebSocketHandler.sendToClient).not.toHaveBeenCalled();
            expect(mockWebSocketHandler.broadcastToClients).not.toHaveBeenCalled();
            expect(mockMqClient.publishMessage).not.toHaveBeenCalled();
        });

        it('should send message to specific client if clientId is present', async () => {
            const message: Message = { type: MessageType.USER_MESSAGE, recipient: 'user', content: 'hello', clientId: 'client1' };
            await router.routeMessage(message);
            expect(mockWebSocketHandler.sendToClient).toHaveBeenCalledWith('client1', message);
        });

        it('should broadcast message to all clients if recipient is user and no clientId', async () => {
            const message: Message = { type: MessageType.USER_MESSAGE, recipient: 'user', content: 'hello' };
            await router.routeMessage(message);
            expect(mockWebSocketHandler.broadcastToClients).toHaveBeenCalledWith(message);
        });

        it('should handle service message by calling handleServiceMessage', async () => {
            const message: Message = { type: MessageType.REQUEST, recipient: 'Agent', content: 'request' };
            jest.spyOn(router as any, 'handleServiceMessage').mockResolvedValue(undefined);

            await router.routeMessage(message);

            expect(router['handleServiceMessage']).toHaveBeenCalledWith(message, 'Agent', undefined);
        });

        it('should log error if no recipient specified', async () => {
            const message: Message = { type: MessageType.REQUEST, content: 'request' }; // No recipient
            await router.routeMessage(message);
            expect(consoleErrorSpy).toHaveBeenCalledWith('No recipient specified for message:', message);
        });
    });

    describe('handleStatisticsMessage', () => {
        it('should send to specific client if clientId is provided', async () => {
            const message: Message = { type: MessageType.STATISTICS, recipient: 'user', content: {}, clientId: 'client1' };
            await (router as any).handleStatisticsMessage(message, 'client1');
            expect(mockWebSocketHandler.sendToClient).toHaveBeenCalledWith('client1', message);
        });

        it('should send to all clients for a mission if missionId is present', async () => {
            const message: Message = { type: MessageType.STATISTICS, recipient: 'user', content: { missionId: 'm1' } };
            mockMissionClients.set('m1', new Set(['clientA', 'clientB']));

            await (router as any).handleStatisticsMessage(message);

            expect(mockWebSocketHandler.sendToClient).toHaveBeenCalledWith('clientA', message);
            expect(mockWebSocketHandler.sendToClient).toHaveBeenCalledWith('clientB', message);
            expect(mockWebSocketHandler.sendToClient).toHaveBeenCalledTimes(2);
        });

        it('should broadcast if no specific client or mission clients found', async () => {
            const message: Message = { type: MessageType.STATISTICS, recipient: 'user', content: {} };
            await (router as any).handleStatisticsMessage(message);
            expect(mockWebSocketHandler.broadcastToClients).toHaveBeenCalledWith(message);
        });
    });

    describe('handleUserMessage', () => {
        it('should send to specific client if clientId is provided', async () => {
            const message: Message = { type: MessageType.USER_MESSAGE, recipient: 'user', content: 'hello', clientId: 'client1' };
            await (router as any).handleUserMessage(message, 'client1');
            expect(mockWebSocketHandler.sendToClient).toHaveBeenCalledWith('client1', message);
        });

        it('should route 'say' message from agent to mission clients', async () => {
            const message: Message = { type: 'say' as MessageType, sender: 'agent1:some-id', recipient: 'user', content: 'agent says hi' };
            mockMissionClients.set('m1', new Set(['clientA', 'clientB']));
            // Mock the internal missionClients map to contain the mission for the agent
            (router as any).missionClients = new Map([['m1', new Set(['clientA', 'clientB'])]]);
            // Mock the components map to contain the agent and its missionId
            (router as any).components = new Map([['agent1', { missionId: 'm1' }]]);

            await (router as any).handleUserMessage(message);

            expect(mockWebSocketHandler.sendToClient).toHaveBeenCalledWith('clientA', message);
            expect(mockWebSocketHandler.sendToClient).toHaveBeenCalledWith('clientB', message);
            expect(mockWebSocketHandler.sendToClient).toHaveBeenCalledTimes(2);
        });

        it('should broadcast if no specific client or mission clients found for 'say' message', async () => {
            const message: Message = { type: 'say' as MessageType, sender: 'agent1:some-id', recipient: 'user', content: 'agent says hi' };
            await (router as any).handleUserMessage(message);
            expect(mockWebSocketHandler.broadcastToClients).toHaveBeenCalledWith(message);
        });

        it('should broadcast if no specific client and not a 'say' message', async () => {
            const message: Message = { type: MessageType.USER_MESSAGE, recipient: 'user', content: 'hello' };
            await (router as any).handleUserMessage(message);
            expect(mockWebSocketHandler.broadcastToClients).toHaveBeenCalledWith(message);
        });
    });

    describe('handleServiceMessage', () => {
        const mockServiceMessage: Message = { type: MessageType.REQUEST, recipient: 'Agent', content: 'request' };

        it('should publish to RabbitMQ for async messages if connected', async () => {
            await (router as any).handleServiceMessage(mockServiceMessage, 'Agent');
            expect(mockMqClient.publishMessage).toHaveBeenCalledWith('stage7', 'message.Agent', mockServiceMessage);
        });

        it('should use RPC for sync messages if connected', async () => {
            const syncMessage: Message = { ...mockServiceMessage, requiresSync: true };
            await (router as any).handleServiceMessage(syncMessage, 'Agent', 'client1');
            expect(mockMqClient.sendRpcRequest).toHaveBeenCalledWith('stage7', 'message.Agent', expect.objectContaining({ requiresSync: true }), 30000);
            expect(mockWebSocketHandler.sendToClient).toHaveBeenCalledWith('client1', { response: 'rpc-response' });
        });

        it('should add message to HTTP queue if RabbitMQ not connected', async () => {
            mockMqClient.isConnected.mockReturnValue(false);
            await (router as any).handleServiceMessage(mockServiceMessage, 'Agent');
            expect(mockMessageQueue.get('Agent')).toEqual([mockServiceMessage]);
            expect(console.warn).toHaveBeenCalledWith('RabbitMQ not connected, falling back to HTTP-based queue');
        });

        it('should handle errors during RabbitMQ publish', async () => {
            mockMqClient.publishMessage.mockRejectedValueOnce(new Error('MQ publish error'));
            await (router as any).handleServiceMessage(mockServiceMessage, 'Agent');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to publish message to RabbitMQ'), expect.any(Error));
            // Should fall back to HTTP queue
            expect(mockMessageQueue.get('Agent')).toEqual([mockServiceMessage]);
        });
    });

    describe('processMessageQueue', () => {
        it('should process messages from HTTP queue if RabbitMQ is disconnected', async () => {
            mockMqClient.isConnected.mockReturnValue(false);
            mockMessageQueue.set('Agent', [{ type: MessageType.REQUEST, recipient: 'Agent', content: 'req1' }]);
            mockMessageQueue.set('user', [{ type: MessageType.USER_MESSAGE, recipient: 'user', content: 'user msg' }]);

            await router.processMessageQueue();

            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(expect.stringContaining('http://undefined/message'), { type: MessageType.REQUEST, recipient: 'Agent', content: 'req1' });
            expect(mockWebSocketHandler.broadcastToClients).toHaveBeenCalledWith({ type: MessageType.USER_MESSAGE, recipient: 'user', content: 'user msg' });
            expect(mockMessageQueue.get('Agent')).toEqual([]); // Message should be processed
            expect(mockMessageQueue.get('user')).toEqual([]); // Message should be processed
        });

        it('should put message back in queue if HTTP delivery fails', async () => {
            mockMqClient.isConnected.mockReturnValue(false);
            mockMessageQueue.set('Agent', [{ type: MessageType.REQUEST, recipient: 'Agent', content: 'req1' }]);
            mockAuthenticatedApi.post.mockRejectedValueOnce(new Error('HTTP delivery failed'));

            await router.processMessageQueue();

            expect(mockMessageQueue.get('Agent')).toEqual([{ type: MessageType.REQUEST, recipient: 'Agent', content: 'req1' }]); // Message put back
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to deliver message to Agent'), expect.any(Error));
        });

        it('should not process HTTP queue if RabbitMQ is connected', async () => {
            mockMqClient.isConnected.mockReturnValue(true);
            mockMessageQueue.set('Agent', [{ type: MessageType.REQUEST, recipient: 'Agent', content: 'req1' }]);

            await router.processMessageQueue();

            expect(mockAuthenticatedApi.post).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('RabbitMQ is connected but there are still 1 messages in the HTTP queue.'));
        });
    });

    describe('handleQueueMessage', () => {
        it('should route valid queue message', async () => {
            const message: Message = { type: MessageType.REQUEST, recipient: 'Agent', content: 'request' };
            jest.spyOn(router, 'routeMessage').mockResolvedValue(undefined);

            await router.handleQueueMessage(message);

            expect(router.routeMessage).toHaveBeenCalledWith(message);
            expect(consoleLogSpy).toHaveBeenCalledWith('Received message from RabbitMQ queue:', MessageType.REQUEST);
        });

        it('should log error for invalid message format', async () => {
            const invalidMessage: any = { recipient: 'Agent' }; // Missing type
            await router.handleQueueMessage(invalidMessage);
            expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid message format received from queue:', invalidMessage);
            expect(router.routeMessage).not.toHaveBeenCalled();
        });

        it('should log error if routing fails', async () => {
            const message: Message = { type: MessageType.REQUEST, recipient: 'Agent', content: 'request' };
            jest.spyOn(router, 'routeMessage').mockRejectedValueOnce(new Error('Routing error'));

            await router.handleQueueMessage(message);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error handling queue message:'), expect.any(Error));
        });
    });
});
