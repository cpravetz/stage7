import { MessageQueueClient } from '../src/messaging/queueClient';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper, Channel } from 'amqp-connection-manager';
import { ConsumeMessage } from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

// Mock external dependencies
jest.mock('amqp-connection-manager');
jest.mock('uuid');

// Cast mocked functions/classes
const mockAmqpConnect = amqp.connect as jest.MockedFunction<typeof amqp.connect>;
const mockUuidv4 = uuidv4 as jest.Mock;

describe('MessageQueueClient', () => {
    let client: MessageQueueClient;
    let mockConnection: jest.Mocked<amqp.AmqpConnectionManager>;
    let mockChannelWrapper: jest.Mocked<ChannelWrapper>;
    let mockChannel: jest.Mocked<Channel>;

    const MOCK_RABBITMQ_URL = 'amqp://mock-user:mock-pass@mock-rabbitmq:5672';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock Channel
        mockChannel = {
            assertExchange: jest.fn().mockResolvedValue(undefined),
            assertQueue: jest.fn().mockResolvedValue({ queue: 'mock-queue' }),
            sendToQueue: jest.fn().mockReturnValue(true),
            consume: jest.fn(),
            ack: jest.fn(),
            reject: jest.fn(),
            publish: jest.fn().mockReturnValue(true),
            deleteQueue: jest.fn().mockResolvedValue(undefined),
            bindQueue: jest.fn().mockResolvedValue(undefined),
            prefetch: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock ChannelWrapper
        mockChannelWrapper = {
            waitForConnect: jest.fn().mockResolvedValue(undefined),
            addSetup: jest.fn((setupFn) => setupFn(mockChannel)),
            publish: jest.fn().mockReturnValue(true),
            sendToQueue: jest.fn().mockReturnValue(true),
            close: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock AmqpConnectionManager
        mockConnection = {
            on: jest.fn(),
            createChannel: jest.fn().mockReturnValue(mockChannelWrapper),
            close: jest.fn().mockResolvedValue(undefined),
        } as any;
        mockAmqpConnect.mockReturnValue(mockConnection);

        // Mock uuidv4
        mockUuidv4.mockReturnValue('mock-uuid');

        // Set process.env
        process.env.RABBITMQ_URL = MOCK_RABBITMQ_URL;

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        client = new MessageQueueClient();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided URL', () => {
            const customUrl = 'amqp://custom';
            const customClient = new MessageQueueClient(customUrl);
            expect((customClient as any).url).toBe(customUrl);
        });

        it('should use RABBITMQ_URL from process.env if available', () => {
            expect((client as any).url).toBe(MOCK_RABBITMQ_URL);
        });

        it('should use default URL if no env var or provided', () => {
            delete process.env.RABBITMQ_URL;
            const defaultClient = new MessageQueueClient();
            expect((defaultClient as any).url).toBe('amqp://stage7:stage7password@rabbitmq:5672');
        });
    });

    describe('connect', () => {
        it('should connect to RabbitMQ and set up channel', async () => {
            await client.connect();

            expect(mockAmqpConnect).toHaveBeenCalledWith([MOCK_RABBITMQ_URL], expect.any(Object));
            expect(mockConnection.on).toHaveBeenCalledWith('connect', expect.any(Function));
            expect(mockConnection.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
            expect(mockConnection.createChannel).toHaveBeenCalledTimes(1);
            expect(mockChannelWrapper.waitForConnect).toHaveBeenCalledTimes(1);
            expect(mockChannel.assertExchange).toHaveBeenCalledWith('stage7', 'topic', { durable: true });
            expect((client as any).connection).toBe(mockConnection);
            expect((client as any).channelWrapper).toBe(mockChannelWrapper);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Connected to RabbitMQ'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('RabbitMQ channel ready'));
        });

        it('should not connect if already connecting', async () => {
            const connectPromise = client.connect();
            await client.connect(); // Call again while connecting
            await connectPromise;

            expect(mockAmqpConnect).toHaveBeenCalledTimes(1);
        });

        it('should not connect if already connected', async () => {
            await client.connect();
            mockAmqpConnect.mockClear();
            await client.connect();
            expect(mockAmqpConnect).not.toHaveBeenCalled();
        });

        it('should log error if connection fails', async () => {
            mockAmqpConnect.mockImplementationOnce(() => { throw new Error('Connection refused'); });
            await expect(client.connect()).rejects.toThrow('Connection refused');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to connect to RabbitMQ'), expect.any(Error));
            expect((client as any).connection).toBeNull();
            expect((client as any).channelWrapper).toBeNull();
        });
    });

    describe('getChannel', () => {
        it('should return the channel wrapper', async () => {
            await client.connect();
            expect(client.getChannel()).toBe(mockChannelWrapper);
        });

        it('should return null if not connected', () => {
            expect(client.getChannel()).toBeNull();
        });
    });

    describe('isConnected', () => {
        it('should return true if connected', async () => {
            await client.connect();
            expect(client.isConnected()).toBe(true);
        });

        it('should return false if not connected', () => {
            expect(client.isConnected()).toBe(false);
        });
    });

    describe('testConnection', () => {
        it('should return true if connection test passes', async () => {
            await client.connect();
            const result = await client.testConnection();
            expect(result).toBe(true);
            expect(mockChannelWrapper.addSetup).toHaveBeenCalledTimes(2); // Initial setup + test setup
            expect(mockChannel.assertQueue).toHaveBeenCalledWith(expect.stringContaining('test-'), { exclusive: true, autoDelete: true });
            expect(mockChannel.sendToQueue).toHaveBeenCalledWith(expect.stringContaining('test-'), expect.any(Buffer));
            expect(mockChannel.consume).toHaveBeenCalledWith(expect.stringContaining('test-'), expect.any(Function), { noAck: false });
            expect(mockChannel.ack).toHaveBeenCalledTimes(1);
            expect(mockChannel.deleteQueue).toHaveBeenCalledTimes(1);
        });

        it('should return false if not connected', async () => {
            const result = await client.testConnection();
            expect(result).toBe(false);
        });

        it('should return false if publish fails', async () => {
            await client.connect();
            mockChannel.sendToQueue.mockReturnValueOnce(false); // Simulate publish failure
            const result = await client.testConnection();
            expect(result).toBe(false);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Connection test failed'), expect.any(Error));
        });

        it('should return false if message consumption times out', async () => {
            await client.connect();
            mockChannel.consume.mockImplementationOnce(() => {
                // Don't call the callback to simulate timeout
                return Promise.resolve({ consumerTag: 'mock-tag' });
            });
            const promise = client.testConnection();
            jest.advanceTimersByTime(5000); // Advance past timeout
            const result = await promise;
            expect(result).toBe(false);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Connection test failed'), expect.any(Error));
        });
    });

    describe('publishMessage', () => {
        it('should publish a message successfully', async () => {
            await client.connect();
            const message = { key: 'value' };
            await client.publishMessage('exchange', 'routing.key', message);
            expect(mockChannelWrapper.publish).toHaveBeenCalledWith('exchange', 'routing.key', Buffer.from(JSON.stringify(message)), { persistent: true });
        });

        it('should throw error if not connected', async () => {
            const message = { key: 'value' };
            await expect(client.publishMessage('exchange', 'routing.key', message)).rejects.toThrow('Not connected to RabbitMQ');
        });

        it('should throw error if publish fails', async () => {
            await client.connect();
            mockChannelWrapper.publish.mockImplementationOnce(() => { throw new Error('Publish error'); });
            const message = { key: 'value' };
            await expect(client.publishMessage('exchange', 'routing.key', message)).rejects.toThrow('Publish error');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to publish message'), expect.any(Error));
        });
    });

    describe('sendRpcRequest', () => {
        it('should send RPC request and resolve with response', async () => {
            await client.connect();
            const message = { request: 'data' };
            const rpcResponse = { response: 'data' };

            // Simulate message consumption
            mockChannel.consume.mockImplementationOnce((queue, cb) => {
                setTimeout(() => {
                    cb({ content: Buffer.from(JSON.stringify(rpcResponse)), properties: { correlationId: 'mock-uuid' } });
                }, 100);
                return Promise.resolve({ consumerTag: 'mock-consumer-tag' });
            });

            const promise = client.sendRpcRequest('exchange', 'rpc.key', message);
            jest.advanceTimersByTime(100);
            const result = await promise;

            expect(mockChannelWrapper.addSetup).toHaveBeenCalledTimes(2); // Initial setup + RPC setup
            expect(mockChannel.assertQueue).toHaveBeenCalledWith('rpc-reply-mock-uuid', { exclusive: true, autoDelete: true });
            expect(mockChannel.consume).toHaveBeenCalledWith('rpc-reply-mock-uuid', expect.any(Function), { noAck: false });
            expect(mockChannel.publish).toHaveBeenCalledWith('exchange', 'rpc.key', Buffer.from(JSON.stringify(message)), expect.objectContaining({ correlationId: 'mock-uuid', replyTo: 'rpc-reply-mock-uuid' }));
            expect(result).toEqual(rpcResponse);
            expect(mockChannel.ack).toHaveBeenCalledTimes(1);
            expect(mockChannel.cancel).toHaveBeenCalledWith('mock-consumer-tag');
        });

        it('should throw error if not connected', async () => {
            const message = { request: 'data' };
            await expect(client.sendRpcRequest('exchange', 'rpc.key', message)).rejects.toThrow('Not connected to RabbitMQ');
        });

        it('should timeout RPC request', async () => {
            await client.connect();
            mockChannel.consume.mockImplementationOnce(() => {
                return Promise.resolve({ consumerTag: 'mock-consumer-tag' });
            });

            const promise = client.sendRpcRequest('exchange', 'rpc.key', { request: 'data' }, 100);
            jest.advanceTimersByTime(100);

            await expect(promise).rejects.toThrow('RPC request timed out after 100ms');
            expect(mockChannel.cancel).toHaveBeenCalledWith('mock-consumer-tag');
            expect(mockChannel.deleteQueue).toHaveBeenCalledWith('rpc-reply-mock-uuid');
        });

        it('should reject if addSetup fails', async () => {
            await client.connect();
            mockChannelWrapper.addSetup.mockImplementationOnce(() => { throw new Error('Setup error'); });
            await expect(client.sendRpcRequest('exchange', 'rpc.key', { request: 'data' })).rejects.toThrow('Setup error');
        });
    });

    describe('close', () => {
        it('should close connection and channel wrapper', async () => {
            await client.connect();
            await client.close();
            expect(mockChannelWrapper.close).toHaveBeenCalledTimes(1);
            expect(mockConnection.close).toHaveBeenCalledTimes(1);
            expect((client as any).channelWrapper).toBeNull();
            expect((client as any).connection).toBeNull();
            expect(console.log).toHaveBeenCalledWith('Closed RabbitMQ connection');
        });

        it('should handle errors during close', async () => {
            await client.connect();
            mockConnection.close.mockRejectedValueOnce(new Error('Close error'));
            await expect(client.close()).rejects.toThrow('Close error');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error closing RabbitMQ connection'), expect.any(Error));
        });
    });
});
