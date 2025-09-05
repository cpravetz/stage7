import { BaseEntity } from '../src/BaseEntity';
import { MessageQueueClient } from '../src/messaging/queueClient';
import { ServiceDiscovery } from '../src/discovery/serviceDiscovery';
import { ServiceTokenManager } from '../src/security/ServiceTokenManager';
import { AuthenticatedApiClient } from '../src/AuthenticatedApiClient';
import { createAuthenticatedAxios } from '../src/http/createAuthenticatedAxios';
import { MessageType } from '../src/types/Message';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';

// Mock external dependencies
jest.mock('../src/messaging/queueClient');
jest.mock('../src/discovery/serviceDiscovery');
jest.mock('../src/security/ServiceTokenManager');
jest.mock('../src/AuthenticatedApiClient');
jest.mock('../src/http/createAuthenticatedAxios');
jest.mock('axios');
jest.mock('uuid');

// Cast mocked classes/functions
const MockedMessageQueueClient = MessageQueueClient as jest.MockedClass<typeof MessageQueueClient>;
const MockedServiceDiscovery = ServiceDiscovery as jest.MockedClass<typeof ServiceDiscovery>;
const MockedServiceTokenManager = ServiceTokenManager as jest.MockedClass<typeof ServiceTokenManager>;
const MockedAuthenticatedApiClient = AuthenticatedApiClient as jest.MockedClass<typeof AuthenticatedApiClient>;
const mockCreateAuthenticatedAxios = createAuthenticatedAxios as jest.Mock;
const mockAxios = axios as jest.MockedFunction<typeof axios>;
const mockUuidv4 = uuidv4 as jest.Mock;

describe('BaseEntity', () => {
    let entity: BaseEntity;
    let mockMqClientInstance: jest.Mocked<MessageQueueClient>;
    let mockServiceDiscoveryInstance: jest.Mocked<ServiceDiscovery>;
    let mockAuthenticatedApiClientInstance: jest.Mocked<AuthenticatedApiClient>;
    let mockAxiosInstanceForAuthenticatedClient: any;

    const MOCK_ID = 'test-id';
    const MOCK_COMPONENT_TYPE = 'TestComponent';
    const MOCK_URL_BASE = 'http://localhost';
    const MOCK_PORT = '8080';
    const MOCK_POSTOFFICE_URL = 'http://mock-postoffice:5020';
    const MOCK_SECURITYMANAGER_URL = 'http://mock-securitymanager:5010';
    const MOCK_CLIENT_SECRET = 'mock-secret';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For setTimeout/setInterval

        // Mock MessageQueueClient instance
        mockMqClientInstance = {
            connect: jest.fn().mockResolvedValue(undefined),
            isConnected: jest.fn().mockReturnValue(true),
            testConnection: jest.fn().mockResolvedValue(true),
            getChannel: jest.fn(),
            close: jest.fn().mockResolvedValue(undefined),
        } as any;
        MockedMessageQueueClient.mockImplementation(() => mockMqClientInstance);

        // Mock ServiceDiscovery instance
        mockServiceDiscoveryInstance = {
            registerService: jest.fn().mockResolvedValue(undefined),
            deregisterService: jest.fn().mockResolvedValue(undefined),
            discoverService: jest.fn().mockResolvedValue(undefined),
            isRegistered: jest.fn().mockReturnValue(true),
        } as any;
        MockedServiceDiscovery.mockImplementation(() => mockServiceDiscoveryInstance);

        // Mock ServiceTokenManager instance
        MockedServiceTokenManager.getInstance.mockReturnValue({
            verifyToken: jest.fn().mockResolvedValue({}),
            extractTokenFromHeader: jest.fn(),
            getToken: jest.fn().mockResolvedValue('mock-jwt-token'),
        } as any);

        // Mock AuthenticatedApiClient instance
        mockAxiosInstanceForAuthenticatedClient = {
            get: jest.fn().mockResolvedValue({}),
            post: jest.fn().mockResolvedValue({}),
            put: jest.fn().mockResolvedValue({}),
            delete: jest.fn().mockResolvedValue({}),
        };
        MockedAuthenticatedApiClient.mockImplementation(() => ({
            get: mockAxiosInstanceForAuthenticatedClient.get,
            post: mockAxiosInstanceForAuthenticatedClient.post,
            put: mockAxiosInstanceForAuthenticatedClient.put,
            delete: mockAxiosInstanceForAuthenticatedClient.delete,
        } as any));

        // Mock createAuthenticatedAxios (used by getAuthenticatedAxios protected method)
        mockCreateAuthenticatedAxios.mockReturnValue(mockAxiosInstanceForAuthenticatedClient);

        // Mock axios for direct calls (e.g., isPostOfficeReady)
        mockAxios.get.mockResolvedValue({ status: 200 });

        // Mock uuidv4
        mockUuidv4.mockReturnValue('mock-uuid');

        // Set process.env variables
        process.env.POSTOFFICE_URL = MOCK_POSTOFFICE_URL;
        process.env.SECURITYMANAGER_URL = MOCK_SECURITYMANAGER_URL;
        process.env.CLIENT_SECRET = MOCK_CLIENT_SECRET;
        process.env.RABBITMQ_URL = 'amqp://user:pass@host:5672';
        process.env.CONSUL_URL = 'consul:8500';

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        entity = new BaseEntity(MOCK_ID, MOCK_COMPONENT_TYPE, MOCK_URL_BASE, MOCK_PORT);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize properties correctly', () => {
            expect(entity.id).toBe(MOCK_ID);
            expect(entity.componentType).toBe(MOCK_COMPONENT_TYPE);
            expect(entity.url).toBe(`${MOCK_URL_BASE}:${MOCK_PORT}`);
            expect(entity.postOfficeUrl).toBe(MOCK_POSTOFFICE_URL);
            expect(entity.authenticatedApi).toBeDefined();
            expect(MockedAuthenticatedApiClient).toHaveBeenCalledTimes(1);
            expect(MockedMessageQueueClient).toHaveBeenCalledTimes(1);
            expect(MockedServiceDiscovery).toHaveBeenCalledTimes(1);
        });

        it('should skip PostOffice registration if skipPostOfficeRegistration is true', () => {
            const entityWithSkip = new BaseEntity(MOCK_ID, MOCK_COMPONENT_TYPE, MOCK_URL_BASE, MOCK_PORT, true);
            expect(entityWithSkip.registeredWithPostOffice).toBe(true);
            expect(mockAuthenticatedApiClientInstance.post).not.toHaveBeenCalled(); // registerWithPostOffice uses this
        });
    });

    describe('initializeMessageQueue', () => {
        it('should connect to RabbitMQ and set up queues/bindings', async () => {
            const mockChannel = { addSetup: jest.fn() } as any;
            mockMqClientInstance.getChannel.mockReturnValue(mockChannel);

            // Manually trigger the connection process as it's async in constructor
            const newEntity = new BaseEntity(MOCK_ID, MOCK_COMPONENT_TYPE, MOCK_URL_BASE, MOCK_PORT);
            jest.runAllTimers(); // Advance timers for retries
            await Promise.resolve(); // Allow promises to resolve

            expect(mockMqClientInstance.connect).toHaveBeenCalledTimes(1);
            expect(mockMqClientInstance.testConnection).toHaveBeenCalledTimes(1);
            expect(mockMqClientInstance.getChannel).toHaveBeenCalledTimes(1);
            expect(mockChannel.addSetup).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Successfully connected to RabbitMQ'));
        });

        it('should retry connection on failure', async () => {
            mockMqClientInstance.connect.mockRejectedValueOnce(new Error('Connection failed'));
            mockMqClientInstance.connect.mockResolvedValueOnce(undefined); // Succeed on second try

            const newEntity = new BaseEntity(MOCK_ID, MOCK_COMPONENT_TYPE, MOCK_URL_BASE, MOCK_PORT);
            jest.runAllTimers(); // Advance timers for retries
            await Promise.resolve();

            expect(mockMqClientInstance.connect).toHaveBeenCalledTimes(2);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize message queue'), expect.any(String));
        });

        it('should set up background reconnection if initial connection fails after retries', async () => {
            mockMqClientInstance.connect.mockRejectedValue(new Error('Persistent connection failed'));

            const newEntity = new BaseEntity(MOCK_ID, MOCK_COMPONENT_TYPE, MOCK_URL_BASE, MOCK_PORT);
            jest.runAllTimers(); // Exhaust initial retries
            await Promise.resolve();

            expect(console.log).toHaveBeenCalledWith('Setting up background reconnection task for RabbitMQ');

            // Simulate interval tick
            jest.advanceTimersByTime(30000); // 30 seconds
            await Promise.resolve();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Attempting to reconnect to RabbitMQ in background'));
            expect(mockMqClientInstance.connect).toHaveBeenCalledTimes(1 + 20 + 1); // Initial + retries + 1 background attempt
        });
    });

    describe('cleanup', () => {
        it('should deregister from service discovery and close MQ connection', async () => {
            await entity.cleanup();
            expect(mockServiceDiscoveryInstance.deregisterService).toHaveBeenCalledWith(MOCK_ID);
            expect(mockMqClientInstance.close).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('deregistered from Consul'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('disconnected from RabbitMQ'));
        });

        it('should handle errors during cleanup', async () => {
            mockServiceDiscoveryInstance.deregisterService.mockRejectedValueOnce(new Error('Deregister failed'));
            await entity.cleanup();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error during cleanup'), expect.any(String));
        });
    });

    describe('initializeServiceDiscovery', () => {
        it('should register service with Consul', async () => {
            // Manually trigger the registration process as it's async in constructor
            const newEntity = new BaseEntity(MOCK_ID, MOCK_COMPONENT_TYPE, MOCK_URL_BASE, MOCK_PORT);
            jest.runAllTimers(); // Advance timers for retries
            await Promise.resolve();

            expect(MockedServiceDiscovery).toHaveBeenCalledWith(process.env.CONSUL_URL);
            expect(mockServiceDiscoveryInstance.registerService).toHaveBeenCalledWith(
                MOCK_ID,
                MOCK_COMPONENT_TYPE,
                `${MOCK_URL_BASE}:${MOCK_PORT}`,
                [MOCK_COMPONENT_TYPE.toLowerCase()],
                parseInt(MOCK_PORT, 10)
            );
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Successfully registered TestComponent with Consul'));
        });

        it('should retry registration on failure', async () => {
            mockServiceDiscoveryInstance.registerService.mockRejectedValueOnce(new Error('Registration failed'));
            mockServiceDiscoveryInstance.registerService.mockResolvedValueOnce(undefined); // Succeed on second try

            const newEntity = new BaseEntity(MOCK_ID, MOCK_COMPONENT_TYPE, MOCK_URL_BASE, MOCK_PORT);
            jest.runAllTimers();
            await Promise.resolve();

            expect(mockServiceDiscoveryInstance.registerService).toHaveBeenCalledTimes(2);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to register with Consul'), expect.any(String));
        });

        it('should set up background registration if initial registration fails after retries', async () => {
            mockServiceDiscoveryInstance.registerService.mockRejectedValue(new Error('Persistent registration failed'));

            const newEntity = new BaseEntity(MOCK_ID, MOCK_COMPONENT_TYPE, MOCK_URL_BASE, MOCK_PORT);
            jest.runAllTimers(); // Exhaust initial retries
            await Promise.resolve();

            expect(console.log).toHaveBeenCalledWith('Setting up background registration task for Consul');

            // Simulate interval tick
            jest.advanceTimersByTime(60000); // 60 seconds
            await Promise.resolve();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Attempting to register with Consul in background'));
            expect(mockServiceDiscoveryInstance.registerService).toHaveBeenCalledTimes(1 + 10 + 1); // Initial + retries + 1 background attempt
        });
    });

    describe('handleQueueMessage', () => {
        let mockChannel: any;

        beforeEach(() => {
            mockChannel = {
                ack: jest.fn(),
                reject: jest.fn(),
                addSetup: jest.fn((cb) => cb({ publish: jest.fn() } as any)),
            };
            mockMqClientInstance.getChannel.mockReturnValue(mockChannel);
            jest.spyOn(entity, 'handleBaseMessage').mockResolvedValue(undefined);
            jest.spyOn(entity, 'handleSyncMessage').mockResolvedValue({ response: 'ack' });
        });

        it('should process message and acknowledge', async () => {
            const mockMessage = { content: JSON.stringify({ type: 'test' }) };
            await (entity as any).handleQueueMessage({ content: Buffer.from(mockMessage.content) });

            expect(entity.handleBaseMessage).toHaveBeenCalledWith({ type: 'test' });
            expect(mockChannel.ack).toHaveBeenCalledTimes(1);
            expect(mockChannel.reject).not.toHaveBeenCalled();
        });

        it('should reject and not requeue on JSON parsing error', async () => {
            const mockMessage = { content: Buffer.from('invalid json') };
            await (entity as any).handleQueueMessage(mockMessage);

            expect(entity.handleBaseMessage).not.toHaveBeenCalled();
            expect(mockChannel.reject).toHaveBeenCalledWith(expect.any(Object), false);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error processing message from queue'), expect.any(SyntaxError));
        });

        it('should reject and requeue on other processing errors', async () => {
            jest.spyOn(entity, 'handleBaseMessage').mockRejectedValueOnce(new Error('Processing error'));
            const mockMessage = { content: Buffer.from(JSON.stringify({ type: 'test' })) };
            await (entity as any).handleQueueMessage(mockMessage);

            expect(mockChannel.reject).toHaveBeenCalledWith(expect.any(Object), true);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error processing message from queue'), expect.any(Error));
        });

        it('should handle synchronous messages and send response', async () => {
            const mockMessage = { content: Buffer.from(JSON.stringify({ type: 'sync', requiresSync: true })), replyTo: 'reply-q', correlationId: 'corr-id' };
            const mockPublish = jest.fn();
            mockChannel.addSetup.mockImplementationOnce((cb) => cb({ publish: mockPublish } as any));

            await (entity as any).handleQueueMessage(mockMessage);

            expect(entity.handleSyncMessage).toHaveBeenCalledWith({ type: 'sync', requiresSync: true });
            expect(mockPublish).toHaveBeenCalledWith('', 'reply-q', expect.any(Buffer), { correlationId: 'corr-id' });
            expect(mockChannel.ack).toHaveBeenCalledTimes(1);
        });
    });

    describe('handleSyncMessage', () => {
        it('should return an acknowledgment by default', async () => {
            const message = { type: MessageType.REQUEST, sender: 'other', recipient: MOCK_ID };
            const response = await (entity as any).handleSyncMessage(message);
            expect(response).toEqual(expect.objectContaining({
                type: 'response',
                content: { acknowledged: true },
                sender: MOCK_ID,
                recipient: message.sender,
                timestamp: expect.any(String),
            }));
        });
    });

    describe('isPostOfficeReady', () => {
        it('should return true if PostOffice is ready (200 status)', async () => {
            mockAxios.get.mockResolvedValueOnce({ status: 200 });
            const ready = await (entity as any).isPostOfficeReady();
            expect(ready).toBe(true);
            expect(mockAxios.get).toHaveBeenCalledWith(`${MOCK_POSTOFFICE_URL}/ready`, expect.any(Object));
        });

        it('should return true if PostOffice redirects (307 status)', async () => {
            mockAxios.get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 307 } });
            const ready = await (entity as any).isPostOfficeReady();
            expect(ready).toBe(true);
        });

        it('should return false if PostOffice is not ready (other status)', async () => {
            mockAxios.get.mockResolvedValueOnce({ status: 500 });
            const ready = await (entity as any).isPostOfficeReady();
            expect(ready).toBe(false);
        });

        it('should return false if PostOffice call fails', async () => {
            mockAxios.get.mockRejectedValueOnce(new Error('Network error'));
            const ready = await (entity as any).isPostOfficeReady();
            expect(ready).toBe(false);
        });
    });

    describe('registerWithPostOffice', () => {
        it('should register successfully', async () => {
            jest.spyOn(entity as any, 'isPostOfficeReady').mockResolvedValue(true);
            mockAxiosInstanceForAuthenticatedClient.post.mockResolvedValueOnce({ status: 200 });

            await (entity as any).registerWithPostOffice();

            expect(mockAxiosInstanceForAuthenticatedClient.post).toHaveBeenCalledWith(
                `${MOCK_POSTOFFICE_URL}/registerComponent`,
                { id: MOCK_ID, type: MOCK_COMPONENT_TYPE, url: `${MOCK_URL_BASE}:${MOCK_PORT}` }
            );
            expect(entity.registeredWithPostOffice).toBe(true);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('registered successfully with PostOffice'));
        });

        it('should retry if PostOffice is not ready', async () => {
            jest.spyOn(entity as any, 'isPostOfficeReady')
                .mockResolvedValueOnce(false) // Not ready first time
                .mockResolvedValueOnce(true); // Ready second time
            mockAxiosInstanceForAuthenticatedClient.post.mockResolvedValueOnce({ status: 200 });

            await (entity as any).registerWithPostOffice(2, 10);
            jest.advanceTimersByTime(10); // First retry
            jest.advanceTimersByTime(15); // Second retry
            await Promise.resolve();

            expect(mockAxiosInstanceForAuthenticatedClient.post).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('PostOffice not ready'));
        });

        it('should log error and stop retrying after max retries', async () => {
            jest.spyOn(entity as any, 'isPostOfficeReady').mockResolvedValue(false);

            await (entity as any).registerWithPostOffice(2, 10);
            jest.runAllTimers();
            await Promise.resolve();

            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Maximum retries (2) reached for registering with PostOffice'));
            expect(mockAxiosInstanceForAuthenticatedClient.post).not.toHaveBeenCalled();
        });
    });

    describe('sendViaRabbitMQ', () => {
        let mockChannel: any;

        beforeEach(() => {
            mockChannel = { addSetup: jest.fn() } as any;
            mockMqClientInstance.getChannel.mockReturnValue(mockChannel);
            mockChannel.addSetup.mockImplementation((cb) => cb({ publish: jest.fn(), assertQueue: jest.fn().mockResolvedValue({ queue: 'reply-q' }), consume: jest.fn(), cancel: jest.fn() } as any));
        });

        it('should publish async message', async () => {
            const message = { recipient: 'target', requiresSync: false };
            await (entity as any).sendViaRabbitMQ(message);

            expect(mockChannel.addSetup).toHaveBeenCalledTimes(1);
            expect(mockChannel.addSetup.mock.calls[0][0].mock.results[0].value.publish).toHaveBeenCalledWith(
                'stage7', 'message.target', expect.any(Buffer), { persistent: true }
            );
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Published async message'));
        });

        it('should handle RPC for sync messages', async () => {
            const message = { recipient: 'target', requiresSync: true };
            const mockPublish = jest.fn();
            const mockConsume = jest.fn();
            mockChannel.addSetup.mockImplementationOnce((cb) => cb({ 
                publish: mockPublish, 
                assertQueue: jest.fn().mockResolvedValue({ queue: 'reply-q' }), 
                consume: mockConsume, 
                cancel: jest.fn() 
            } as any));

            const promise = (entity as any).sendViaRabbitMQ(message);

            // Simulate response arriving
            const consumeCallback = mockConsume.mock.calls[0][1];
            consumeCallback({ content: Buffer.from(JSON.stringify({ status: 'ok' })), properties: { correlationId: 'mock-uuid' } });

            const result = await promise;

            expect(mockPublish).toHaveBeenCalledWith(
                'stage7', 'message.target', expect.any(Buffer), expect.objectContaining({ correlationId: 'mock-uuid', replyTo: 'rpc-reply-mock-uuid' })
            );
            expect(result).toEqual({ status: 'ok' });
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Received RPC response'));
        });

        it('should timeout RPC requests', async () => {
            const message = { recipient: 'target', requiresSync: true };
            const promise = (entity as any).sendViaRabbitMQ(message);

            jest.advanceTimersByTime(30000); // Advance past timeout

            await expect(promise).rejects.toThrow('RPC request timed out after 30000ms');
        });

        it('should log warning if MQ not connected', async () => {
            mockMqClientInstance.isConnected.mockReturnValueOnce(false);
            const message = { recipient: 'target', requiresSync: false };
            await (entity as any).sendViaRabbitMQ(message);
            expect(console.warn).toHaveBeenCalledWith('RabbitMQ not connected, falling back to HTTP-based communication');
        });
    });

    describe('sendMessage', () => {
        const messageType = 'test-type';
        const recipient = 'test-recipient';
        const content = { data: 'test' };

        it('should send message via HTTP fallback', async () => {
            mockAxiosInstanceForAuthenticatedClient.post.mockResolvedValueOnce({ status: 200, data: { success: true } });
            const result = await entity.sendMessage(messageType, recipient, content);

            expect(mockAxiosInstanceForAuthenticatedClient.post).toHaveBeenCalledWith(
                `${MOCK_POSTOFFICE_URL}/message`,
                expect.objectContaining({
                    type: messageType,
                    recipient,
                    content,
                    sender: MOCK_ID,
                })
            );
            expect(result).toEqual({ success: true });
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Successfully sent message to test-recipient via HTTP'));
        });

        it('should throw error if HTTP send fails', async () => {
            mockAxiosInstanceForAuthenticatedClient.post.mockRejectedValueOnce(new Error('HTTP error'));
            await expect(entity.sendMessage(messageType, recipient, content)).rejects.toThrow('HTTP error');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to send message via direct HTTP'), expect.any(Error));
        });
    });

    describe('say', () => {
        it('should send a formatted message to user', async () => {
            jest.spyOn(entity, 'sendMessage').mockResolvedValue(undefined);
            await entity.say('Hello World');
            expect(entity.sendMessage).toHaveBeenCalledWith('say', 'user', 'Hello World', false);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('saying: Hello World'));
        });

        it('should format agent result JSON', async () => {
            jest.spyOn(entity, 'sendMessage').mockResolvedValue(undefined);
            const agentResult = `Result {"data":{"data":[{"resultDescription":"Task done","result":"Final output"}]}}`;
            await entity.say(agentResult);
            expect(entity.sendMessage).toHaveBeenCalledWith('say', 'user', 'I\'ve completed my task: Task done\n\nFinal output', false);
        });

        it('should remove UUIDs from content', async () => {
            jest.spyOn(entity, 'sendMessage').mockResolvedValue(undefined);
            const contentWithUuid = `12345678-1234-1234-1234-1234567890ab: This is a message.`;
            await entity.say(contentWithUuid);
            expect(entity.sendMessage).toHaveBeenCalledWith('say', 'user', 'This is a message.', false);
        });
    });

    describe('getServiceUrl', () => {
        it('should prioritize environment variables', async () => {
            process.env.BRAIN_URL = 'http://env-brain:1234';
            const url = await entity.getServiceUrl('Brain');
            expect(url).toBe('http://env-brain:1234');
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Service Brain found via environment variable BRAIN_URL'));
        });

        it('should use service discovery if env var not found', async () => {
            delete process.env.BRAIN_URL;
            mockServiceDiscoveryInstance.discoverService.mockResolvedValueOnce('http://discovered-brain:5678');
            const url = await entity.getServiceUrl('Brain');
            expect(url).toBe('http://discovered-brain:5678');
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Service Brain discovered via service discovery'));
        });

        it('should use PostOffice if service discovery fails', async () => {
            delete process.env.BRAIN_URL;
            mockServiceDiscoveryInstance.discoverService.mockRejectedValueOnce(new Error('Discovery failed'));
            mockAxiosInstanceForAuthenticatedClient.get.mockResolvedValueOnce({ data: { brainUrl: 'http://postoffice-brain:9012' } });

            const url = await entity.getServiceUrl('Brain');
            expect(url).toBe('http://postoffice-brain:9012');
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Service Brain found via PostOffice'));
        });

        it('should use default Docker URL if all else fails', async () => {
            delete process.env.BRAIN_URL;
            mockServiceDiscoveryInstance.discoverService.mockRejectedValueOnce(new Error('Discovery failed'));
            mockAxiosInstanceForAuthenticatedClient.get.mockRejectedValueOnce(new Error('PostOffice failed'));

            const url = await entity.getServiceUrl('Brain');
            expect(url).toBe('brain:5070');
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Using default URL for service Brain'));
        });

        it('should return null if all methods fail and no default', async () => {
            delete process.env.BRAIN_URL;
            mockServiceDiscoveryInstance.discoverService.mockRejectedValueOnce(new Error('Discovery failed'));
            mockAxiosInstanceForAuthenticatedClient.get.mockRejectedValueOnce(new Error('PostOffice failed'));
            jest.spyOn(entity as any, 'getDefaultPortForService').mockReturnValueOnce(undefined); // No default port

            const url = await entity.getServiceUrl('NonExistentService');
            expect(url).toBeNull();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error getting URL for service NonExistentService'), expect.any(Error));
        });
    });

    describe('getServiceUrls', () => {
        it('should return URLs for all common services', async () => {
            jest.spyOn(entity, 'getServiceUrl')
                .mockResolvedValueOnce('cap:1')
                .mockResolvedValueOnce('brain:2')
                .mockResolvedValueOnce('traffic:3')
                .mockResolvedValueOnce('librarian:4')
                .mockResolvedValueOnce('mission:5')
                .mockResolvedValueOnce('engineer:6');

            const urls = await entity.getServiceUrls();
            expect(urls).toEqual({
                capabilitiesManagerUrl: 'cap:1',
                brainUrl: 'brain:2',
                trafficManagerUrl: 'traffic:3',
                librarianUrl: 'librarian:4',
                missionControlUrl: 'mission:5',
                engineerUrl: 'engineer:6',
            });
        });

        it('should use default URLs if getServiceUrl returns null', async () => {
            jest.spyOn(entity, 'getServiceUrl').mockResolvedValue(null);

            const urls = await entity.getServiceUrls();
            expect(urls).toEqual({
                capabilitiesManagerUrl: 'capabilitiesmanager:5060',
                brainUrl: 'brain:5070',
                trafficManagerUrl: 'trafficmanager:5080',
                librarianUrl: 'librarian:5040',
                missionControlUrl: 'missioncontrol:5030',
                engineerUrl: 'engineer:5050',
            });
        });
    });

    describe('handleBaseMessage', () => {
        it('should log message receipt', async () => {
            const message = { type: MessageType.REQUEST, sender: 'other', content: { data: 'test' } };
            await entity.handleBaseMessage(message);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('TestComponent handling message of type REQUEST from other'));
        });

        it('should call onAnswer for ANSWER messages', async () => {
            const onAnswerSpy = jest.fn();
            entity.onAnswer = onAnswerSpy;
            const message = { type: MessageType.ANSWER, answer: 'my answer' };
            await entity.handleBaseMessage(message);
            expect(onAnswerSpy).toHaveBeenCalledWith('my answer');
        });

        it('should log for unhandled message types', async () => {
            const message = { type: 'UNKNOWN_TYPE', sender: 'other' };
            await entity.handleBaseMessage(message);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('TestComponent received unhandled message type: UNKNOWN_TYPE'));
        });
    });

    describe('logAndSay', () => {
        it('should log and say the message', async () => {
            jest.spyOn(entity, 'say').mockResolvedValue(undefined);
            await entity.logAndSay('Hello from logAndSay');
            expect(console.log).toHaveBeenCalledWith('Hello from logAndSay');
            expect(entity.say).toHaveBeenCalledWith('Hello from logAndSay');
        });
    });

    describe('ask', () => {
        it('should send a request message and resolve with answer', async () => {
            jest.spyOn(entity, 'sendMessage').mockResolvedValue(undefined);
            const onAnswerSpy = jest.fn();
            entity.onAnswer = onAnswerSpy;

            const promise = entity.ask('What is your name?');

            // Simulate answer arriving
            const questionGuid = mockUuidv4.mock.results[0].value; // Get the generated UUID
            (entity as any).questions = [questionGuid]; // Manually add to questions array
            (entity as any).lastAnswer = 'My name is Gemini';
            (entity as any).questions = []; // Simulate question being removed by onAnswer

            jest.advanceTimersByTime(100); // Advance timer for setInterval
            await Promise.resolve(); // Allow promise to resolve

            const result = await promise;
            expect(entity.sendMessage).toHaveBeenCalledWith(MessageType.REQUEST, 'user', expect.objectContaining({ question: 'What is your name?', questionGuid }), true);
            expect(result).toBe('My name is Gemini');
        });
    });

    describe('onAnswer', () => {
        it('should remove question from questions array and set lastAnswer', () => {
            const questionGuid = 'q-123';
            (entity as any).questions = [questionGuid, 'q-456'];
            const mockRequest = { body: { questionGuid, answer: 'The answer' } } as express.Request;

            entity.onAnswer(mockRequest);

            expect((entity as any).questions).toEqual(['q-456']);
            expect((entity as any).lastAnswer).toBe('The answer');
        });

        it('should do nothing if questionGuid not found', () => {
            (entity as any).questions = ['q-456'];
            const mockRequest = { body: { questionGuid: 'q-123', answer: 'The answer' } } as express.Request;

            entity.onAnswer(mockRequest);

            expect((entity as any).questions).toEqual(['q-456']);
            expect((entity as any).lastAnswer).toBe('');
        });
    });

    describe('getTokenManager', () => {
        it('should return a singleton ServiceTokenManager instance', () => {
            const manager1 = (entity as any).getTokenManager();
            const manager2 = (entity as any).getTokenManager();
            expect(manager1).toBe(manager2);
            expect(MockedServiceTokenManager.getInstance).toHaveBeenCalledTimes(1);
            expect(MockedServiceTokenManager.getInstance).toHaveBeenCalledWith(
                `http://${MOCK_SECURITYMANAGER_URL}`,
                MOCK_COMPONENT_TYPE,
                MOCK_CLIENT_SECRET
            );
        });
    });

    describe('getAuthenticatedAxios', () => {
        it('should return an authenticated axios instance', () => {
            const axiosInstance = (entity as any).getAuthenticatedAxios();
            expect(mockCreateAuthenticatedAxios).toHaveBeenCalledWith(
                MOCK_COMPONENT_TYPE,
                MOCK_SECURITYMANAGER_URL,
                MOCK_CLIENT_SECRET
            );
            expect(axiosInstance).toBe(mockAxiosInstanceForAuthenticatedClient);
        });
    });

    describe('verifyToken', () => {
        let mockReq: Partial<express.Request>;
        let mockRes: Partial<express.Response>;
        let mockNext: jest.Mock;

        beforeEach(() => {
            mockReq = { headers: {}, path: '/api/test' };
            mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            mockNext = jest.fn();
            // Clear token cache for isolated tests
            (BaseEntity as any).tokenCache.clear();
            (BaseEntity as any).lastVerificationTime = 0;
        });

        it('should skip authentication for health check endpoints', async () => {
            mockReq.path = '/health';
            await entity.verifyToken(mockReq as express.Request, mockRes as express.Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should skip authentication for auth paths', async () => {
            mockReq.path = '/auth/login';
            await entity.verifyToken(mockReq as express.Request, mockRes as express.Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should return 401 if no authorization header', async () => {
            await entity.verifyToken(mockReq as express.Request, mockRes as express.Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: expect.stringContaining('No authorization token provided') });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 if invalid authorization header format', async () => {
            mockReq.headers = { authorization: 'Bearer' };
            await entity.verifyToken(mockReq as express.Request, mockRes as express.Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid authorization header format' });
        });

        it('should use cached token if valid', async () => {
            const mockToken = 'valid.jwt.token';
            const decodedToken = { userId: '123', exp: Math.floor(Date.now() / 1000) + 3600 }; // Expires in 1 hour
            (BaseEntity as any).tokenCache.set(mockToken, { decoded: decodedToken, expiry: Date.now() + 3600000 });
            mockReq.headers = { authorization: `Bearer ${mockToken}` };

            await entity.verifyToken(mockReq as express.Request, mockRes as express.Response, mockNext);

            expect(mockNext).toHaveBeenCalledTimes(1);
            expect((mockReq as any).user).toEqual(decodedToken);
            expect(MockedServiceTokenManager.getInstance().verifyToken).not.toHaveBeenCalled();
        });

        it('should verify token if not in cache or expired', async () => {
            const mockToken = 'new.jwt.token';
            const decodedToken = { userId: '123', exp: Math.floor(Date.now() / 1000) + 3600 };
            MockedServiceTokenManager.getInstance().verifyToken.mockResolvedValueOnce(decodedToken);
            mockReq.headers = { authorization: `Bearer ${mockToken}` };

            await entity.verifyToken(mockReq as express.Request, mockRes as express.Response, mockNext);

            expect(mockNext).toHaveBeenCalledTimes(1);
            expect((mockReq as any).user).toEqual(decodedToken);
            expect(MockedServiceTokenManager.getInstance().verifyToken).toHaveBeenCalledWith(mockToken);
            expect((BaseEntity as any).tokenCache.has(mockToken)).toBe(true);
        });

        it('should return 401 if token is expired (payload check)', async () => {
            const expiredToken = 'header.eyJleHAiOjEyMzQ1Njc4OTB9.signature'; // Expired in the past
            mockReq.headers = { authorization: `Bearer ${expiredToken}` };

            await entity.verifyToken(mockReq as express.Request, mockRes as express.Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token has expired' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 if token verification fails', async () => {
            MockedServiceTokenManager.getInstance().verifyToken.mockResolvedValueOnce(null);
            mockReq.headers = { authorization: 'Bearer invalid.token' };

            await entity.verifyToken(mockReq as express.Request, mockRes as express.Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 500 for internal errors during verification', async () => {
            MockedServiceTokenManager.getInstance().verifyToken.mockRejectedValueOnce(new Error('Internal verification error'));
            mockReq.headers = { authorization: 'Bearer some.token' };

            await entity.verifyToken(mockReq as express.Request, mockRes as express.Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error during authentication' });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });
});
