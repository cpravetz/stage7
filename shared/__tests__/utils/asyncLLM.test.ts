import { AsyncLLM } from '../src/utils/asyncLLM';
import { MessageQueueClient } from '../src/messaging/queueClient';
import { Channel, ConsumeMessage } from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { MessageType } from '../src/types/Message';

// Mock external dependencies
jest.mock('../src/messaging/queueClient');
jest.mock('uuid');

// Cast mocked functions/classes
const MockedMessageQueueClient = MessageQueueClient as jest.MockedClass<typeof MessageQueueClient>;
const mockUuidv4 = uuidv4 as jest.Mock;

describe('AsyncLLM', () => {
    let asyncLLM: AsyncLLM;
    let mockMqClientInstance: jest.Mocked<MessageQueueClient>;
    let mockChannelWrapper: jest.Mocked<ChannelWrapper>;
    let mockChannel: jest.Mocked<Channel>;

    const MOCK_RABBITMQ_URL = 'amqp://mock-rabbitmq';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock Channel
        mockChannel = {
            assertQueue: jest.fn().mockResolvedValue({ queue: 'mock-response-queue' }),
            consume: jest.fn(),
            ack: jest.fn(),
            reject: jest.fn(),
            assertExchange: jest.fn().mockResolvedValue(undefined),
            bindQueue: jest.fn().mockResolvedValue(undefined),
            publish: jest.fn().mockReturnValue(true),
        } as any;

        // Mock ChannelWrapper
        mockChannelWrapper = {
            waitForConnect: jest.fn().mockResolvedValue(undefined),
            addSetup: jest.fn((setupFn) => setupFn(mockChannel)),
        } as any;

        // Mock MessageQueueClient instance
        mockMqClientInstance = {
            connect: jest.fn().mockResolvedValue(undefined),
            getChannel: jest.fn().mockReturnValue(mockChannelWrapper),
            close: jest.fn().mockResolvedValue(undefined),
        } as any;
        MockedMessageQueueClient.mockImplementation(() => mockMqClientInstance);

        // Mock uuidv4
        mockUuidv4.mockReturnValue('mock-request-id');

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        asyncLLM = new AsyncLLM(MOCK_RABBITMQ_URL);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize MessageQueueClient and call initialize', () => {
            expect(MockedMessageQueueClient).toHaveBeenCalledWith(MOCK_RABBITMQ_URL);
            expect(mockMqClientInstance.connect).toHaveBeenCalledTimes(1);
            expect((asyncLLM as any).responseQueueName).toBe(`llm-responses-mock-request-id`);
        });
    });

    describe('initialize', () => {
        it('should connect to RabbitMQ and set up consumer', async () => {
            // Constructor already calls initialize, so we just need to let it finish
            await (asyncLLM as any).initPromise;

            expect(mockMqClientInstance.connect).toHaveBeenCalledTimes(1);
            expect(mockMqClientInstance.getChannel).toHaveBeenCalledTimes(1);
            expect(mockChannelWrapper.addSetup).toHaveBeenCalledTimes(1);
            expect(mockChannel.assertQueue).toHaveBeenCalledWith(expect.stringContaining('llm-responses-'), { durable: false, autoDelete: true });
            expect(mockChannel.consume).toHaveBeenCalledWith(expect.stringContaining('llm-responses-'), expect.any(Function));
            expect(mockChannel.assertExchange).toHaveBeenCalledWith('stage7', 'topic', { durable: true });
            expect(mockChannel.bindQueue).toHaveBeenCalledWith(expect.stringContaining('llm-responses-'), 'stage7', expect.stringContaining('message.llm-responses-'));
            expect((asyncLLM as any).initialized).toBe(true);
            expect(console.log).toHaveBeenCalledWith('AsyncLLM initialized and connected to message queue');
        });

        it('should handle initialization errors', async () => {
            mockMqClientInstance.connect.mockRejectedValueOnce(new Error('MQ connection failed'));
            const newAsyncLLM = new AsyncLLM(MOCK_RABBITMQ_URL);
            await expect((newAsyncLLM as any).initPromise).rejects.toThrow('MQ connection failed');
            expect((newAsyncLLM as any).initialized).toBe(false);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize AsyncLLM'), expect.any(Error));
        });
    });

    describe('chat', () => {
        const mockExchanges = [{ role: 'user', content: 'Hello' }];

        beforeEach(async () => {
            // Ensure initialization is complete before chat tests
            await (asyncLLM as any).initPromise;
            mockUuidv4.mockReturnValue('chat-request-id'); // New UUID for chat request
        });

        it('should send a chat request and resolve with response', async () => {
            const chatPromise = asyncLLM.chat(mockExchanges);

            // Simulate response arriving
            const consumeCallback = mockChannel.consume.mock.calls[0][1];
            const mockResponseContent = { requestId: 'chat-request-id', response: 'LLM Reply', mimeType: 'text/plain' };
            consumeCallback({ content: Buffer.from(JSON.stringify({ type: MessageType.CHAT_RESPONSE, content: mockResponseContent })) } as ConsumeMessage);

            const result = await chatPromise;

            expect(mockChannel.publish).toHaveBeenCalledWith(
                'stage7', 'message.Brain', expect.any(Buffer), { persistent: true }
            );
            expect(JSON.parse(mockChannel.publish.mock.calls[0][2].toString())).toEqual(expect.objectContaining({
                type: MessageType.CHAT_REQUEST,
                sender: expect.stringContaining('llm-responses-'),
                recipient: 'Brain',
                content: { requestId: 'chat-request-id', exchanges: mockExchanges, optimization: 'accuracy', optionals: {} }
            }));
            expect(result).toEqual({ response: 'LLM Reply', mimeType: 'text/plain' });
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Sent async LLM chat request'));
        });

        it('should reject if chat request times out', async () => {
            const chatPromise = asyncLLM.chat(mockExchanges, 'accuracy', {}, 100);

            jest.advanceTimersByTime(100);

            await expect(chatPromise).rejects.toThrow('LLM request timed out after 100ms');
        });

        it('should reject if chat request sending fails', async () => {
            mockChannel.publish.mockImplementationOnce(() => { throw new Error('Publish failed'); });
            await expect(asyncLLM.chat(mockExchanges)).rejects.toThrow('Publish failed');
        });

        it('should reject if response contains an error', async () => {
            const chatPromise = asyncLLM.chat(mockExchanges);

            const consumeCallback = mockChannel.consume.mock.calls[0][1];
            const mockErrorContent = { requestId: 'chat-request-id', error: 'LLM Error' };
            consumeCallback({ content: Buffer.from(JSON.stringify({ type: MessageType.CHAT_RESPONSE, content: mockErrorContent })) } as ConsumeMessage);

            await expect(chatPromise).rejects.toThrow('LLM Error');
        });

        it('should not process non-chat response messages', async () => {
            const chatPromise = asyncLLM.chat(mockExchanges);

            const consumeCallback = mockChannel.consume.mock.calls[0][1];
            const mockNonChatContent = { requestId: 'chat-request-id', response: 'Not a chat response' };
            consumeCallback({ content: Buffer.from(JSON.stringify({ type: MessageType.REQUEST, content: mockNonChatContent })) } as ConsumeMessage);

            jest.advanceTimersByTime(60000); // Advance past timeout

            await expect(chatPromise).rejects.toThrow('LLM request timed out'); // Should still timeout as non-chat message is ignored
            expect(console.log).toHaveBeenCalledWith('Received non-chat response message:', expect.any(Object));
        });
    });

    describe('close', () => {
        it('should close the message queue client', async () => {
            await (asyncLLM as any).initPromise;
            await asyncLLM.close();
            expect(mockMqClientInstance.close).toHaveBeenCalledTimes(1);
            expect((asyncLLM as any).initialized).toBe(false);
        });

        it('should not throw error if mqClient is null', async () => {
            (asyncLLM as any).mqClient = null;
            await expect(asyncLLM.close()).resolves.toBeUndefined();
        });
    });
});
