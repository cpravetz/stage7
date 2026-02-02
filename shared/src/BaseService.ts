import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import { MessageQueueClient } from './messaging/queueClient';
import { ServiceDiscovery } from './discovery/serviceDiscovery';
import { ServiceTokenManager } from './security/ServiceTokenManager';
import { Channel, ConsumeMessage } from 'amqplib';
import { IBaseEntity } from './interfaces/IBaseEntity';

// Import MessageType enum directly to avoid ESM import issues
import * as MessageModule from './types/Message';

export class BaseService implements IBaseEntity {
  id: string;
  componentType: string;
  postOfficeUrl: string;
  url: string;
  questions: string[] = [];
  port: string;
  registeredWithPostOffice: boolean = false;
  lastAnswer: string = '';
  protected mqClient: MessageQueueClient | null = null;
  protected serviceDiscovery: ServiceDiscovery | null = null;
  protected tokenManager: ServiceTokenManager | null = null;
  protected securityManagerUrl: string = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';

  constructor(id: string, componentType: string, urlBase: string, port: string, skipPostOfficeRegistration: boolean = false, skipServiceDiscovery: boolean = false) {
    this.id = id;
    this.componentType = componentType;
    this.postOfficeUrl = process.env.POSTOFFICE_URL || 'http://postoffice:5020';
    this.port = port;
    
    // Fix URL construction for Docker environments
    // If urlBase is localhost or 127.0.0.1, use the Docker service name instead
    let serviceUrlBase = urlBase;
    if (urlBase === 'localhost' || urlBase === '127.0.0.1') {
      // Use the component type as the service name for Docker
      serviceUrlBase = componentType.toLowerCase();
      console.log(`[URL_FIX] Replaced localhost with Docker service name: ${serviceUrlBase}`);
    }
    
    this.url = `http://${serviceUrlBase}:${port}`;
    this.securityManagerUrl = this.normalizeUrl(this.securityManagerUrl) || 'http://securitymanager:5010';
    this.postOfficeUrl = this.normalizeUrl(this.postOfficeUrl) || 'http://postoffice:5020';
    console.log(`[DIAGNOSTIC] ${this.componentType} constructor initialized with postOfficeUrl: ${this.postOfficeUrl}`);

    // Initialize services
    this.initializeMessageQueue();
    
    // Skip Consul registration if requested (some services defer this until fully initialized)
    if (!skipServiceDiscovery) {
      this.initializeServiceDiscovery();
    } else {
      console.log(`Skipping initial Consul registration for ${this.componentType} (will register manually)`);
    }

    // Register with service registry and PostOffice (unless skipped)
    if (!skipPostOfficeRegistration) {
      this.registerWithPostOffice();
    } else {
      console.log(`Skipping PostOffice registration for ${this.componentType} (self-registration)`);
      this.registeredWithPostOffice = true;
    }
  }

  normalizeUrl(url: string | null): string | null {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `http://${url}`;
  }

  protected setupHealthCheck(app?: any) {
    // If no app provided, subclasses should call this with their express app
    if (!app) {
      return;
    }

    // Import here to avoid circular dependencies
    const { HealthCheckManager } = require('./health/HealthCheckManager');
    
    // Create health check manager for this service
    const healthManager = new HealthCheckManager(app, this.componentType);

    // Register RabbitMQ dependency if available
    if (this.mqClient) {
      healthManager.registerDependency({
        name: 'RabbitMQ',
        isConnected: () => this.mqClient?.isConnected?.() || false,
        test: async () => {
          try {
            return await this.mqClient?.testConnection?.();
          } catch {
            return false;
          }
        }
      });
    }

    // Register Consul dependency if available
    if (this.serviceDiscovery) {
      healthManager.registerDependency({
        name: 'Consul',
        isConnected: () => !!this.serviceDiscovery,
        test: async () => {
          try {
            // Consul connectivity is already checked in service registration
            return this.serviceDiscovery?.isRegistered?.(this.id) || false;
          } catch {
            return false;
          }
        }
      });
    }

    // Set up the health check endpoints
    healthManager.setupHealthCheck();
  }

  protected async initializeMessageQueue() {
    // Set up a retry mechanism with exponential backoff
    const maxRetries = 20;
    const initialRetryDelay = 2000;
    let retryCount = 0;
    let retryDelay = initialRetryDelay;

    const connectWithRetry = async () => {
      try {
        console.log(`Attempting to connect to RabbitMQ (attempt ${retryCount + 1}/${maxRetries})...`);

        // Get RabbitMQ URL from environment variables
        const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672';
        console.log(`Using RabbitMQ URL: ${rabbitmqUrl}`);

        // Create a new MessageQueueClient instance
        this.mqClient = new MessageQueueClient(rabbitmqUrl);

        // Connect to RabbitMQ
        await this.mqClient.connect({
          heartbeat: 60,
          reconnectDelay: 5000
        });

        // Verify connection is working
        try {
          const connectionWorking = await this.mqClient.testConnection();
          if (!connectionWorking) {
            console.warn('Connection test failed - connection appears to be unstable, will retry');
            throw new Error('Connection test failed');
          } else {
            console.log('Connection test successful - RabbitMQ connection is stable');
          }
        } catch (error) {
          console.warn('Error during connection test:', error);
          throw new Error('Connection test failed');
        }

        // Get the channel wrapper
        const channel = this.mqClient.getChannel();
        if (!channel) {
          throw new Error('Failed to get channel wrapper');
        }

        // Create a queue for this component
        // Use a deterministic queue name based on component type (not instance ID)
        // For PostOffice and critical services, this ensures messages are routed to the right queue even after restarts
        const queueName = `${this.componentType.toLowerCase()}-queue`;
        console.log(`Creating queue: ${queueName}`);

        // Set up the queue and bindings
        await channel.addSetup(async (ch: Channel) => {
          // Assert the queue exists
          await ch.assertQueue(queueName, {
            durable: true
          });

          // Set prefetch to limit concurrent message processing
          await (ch as any).prefetch(10);

          // Consume messages from the queue
          await ch.consume(queueName, async (msg: ConsumeMessage | null) => {
            if (msg) {
              try {
                // Parse the message content
                const content = JSON.parse(msg.content.toString());

                // Process the message
                await this.handleQueueMessage(content);

                // Acknowledge the message
                ch.ack(msg);
              } catch (error) {
                console.error(`Error processing message from queue ${queueName}:`, error);

                // Reject the message and requeue it if it's not a parsing error
                const requeue = !(error instanceof SyntaxError);
                (ch as any).reject(msg, requeue);
              }
            }
          });

          // Create and bind to the main exchange
          const exchangeName = 'stage7';
          console.log(`Binding queue to exchange: ${exchangeName}`);

          // Assert the exchange exists
          await ch.assertExchange(exchangeName, 'topic', { durable: true });

          // Bind the queue to the exchange with appropriate routing patterns
          await ch.bindQueue(queueName, exchangeName, `message.${this.id}`);
          await ch.bindQueue(queueName, exchangeName, `message.${this.componentType}`);
          await ch.bindQueue(queueName, exchangeName, 'message.all');
        });

        console.log('Successfully connected to RabbitMQ and set up queues/bindings');
        return true;
      } catch (error) {
        console.error(`Failed to initialize message queue (attempt ${retryCount + 1}/${maxRetries}):`,
          error instanceof Error ? error.message : 'Unknown error');

        if (retryCount < maxRetries) {
          retryCount++;
          const jitter = Math.random() * 0.3 * retryDelay;
          const actualDelay = Math.floor(retryDelay + jitter);
          console.log(`Retrying in ${actualDelay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, actualDelay));
          retryDelay = Math.min(retryDelay * 1.5, 30000);
          return await connectWithRetry();
        }

        return false;
      }
    };

    // Start the connection process
    const connected = await connectWithRetry();

    // If we couldn't connect after all retries, set up a background reconnection task
    if (!connected) {
      console.log('Setting up background reconnection task for RabbitMQ');
      setInterval(async () => {
        if (!this.mqClient || !this.mqClient.isConnected()) {
          console.log('Attempting to reconnect to RabbitMQ in background...');
          try {
            retryCount = 0;
            retryDelay = initialRetryDelay;
            const success = await connectWithRetry();
            if (success) {
              console.log('Successfully reconnected to RabbitMQ!');
            }
          } catch (error) {
            console.error('Background reconnection attempt failed:',
              error instanceof Error ? error.message : 'Unknown error');
          }
        } else {
          // Periodically test the connection
          try {
            if (this.mqClient.isConnected()) {
              const connectionWorking = await this.mqClient.testConnection();
              if (!connectionWorking) {
                console.log('RabbitMQ connection test failed, will attempt to reconnect');
                try {
                  await this.mqClient.close();
                } catch (err) {
                  console.log('Error closing existing connection:', err);
                }
                this.mqClient = null;
              } else {
                console.log('Periodic connection test successful - RabbitMQ connection is stable');
              }
            } else {
              console.log('RabbitMQ reports as disconnected, will attempt to reconnect');
              this.mqClient = null;
            }
          } catch (error) {
            console.error('Error testing RabbitMQ connection:',
              error instanceof Error ? error.message : 'Unknown error');
            this.mqClient = null;
          }
        }
      }, 30000);

      // Store the interval ID for cleanup
      const reconnectionInterval = setInterval(async () => {
        if (!this.mqClient || !this.mqClient.isConnected()) {
          console.log('Attempting to reconnect to RabbitMQ in background...');
          try {
            retryCount = 0;
            retryDelay = initialRetryDelay;
            const success = await connectWithRetry();
            if (success) {
              console.log('Successfully reconnected to RabbitMQ!');
            }
          } catch (error) {
            console.error('Background reconnection attempt failed:',
              error instanceof Error ? error.message : 'Unknown error');
          }
        } else {
          // Periodically test the connection
          try {
            if (this.mqClient.isConnected()) {
              const connectionWorking = await this.mqClient.testConnection();
              if (!connectionWorking) {
                console.log('RabbitMQ connection test failed, will attempt to reconnect');
                try {
                  await this.mqClient.close();
                } catch (err) {
                  console.log('Error closing existing connection:', err);
                }
                this.mqClient = null;
              } else {
                console.log('Periodic connection test successful - RabbitMQ connection is stable');
              }
            } else {
              console.log('RabbitMQ reports as disconnected, will attempt to reconnect');
              this.mqClient = null;
            }
          } catch (error) {
            console.error('Error testing RabbitMQ connection:',
              error instanceof Error ? error.message : 'Unknown error');
            this.mqClient = null;
          }
        }
      }, 30000);

      // Clean up interval on process exit
      process.on('beforeExit', () => {
        clearInterval(reconnectionInterval);
      });
    }
  }

  protected async cleanup() {
    try {
      // Deregister from service discovery
      if (this.serviceDiscovery && this.id) {
        await this.serviceDiscovery.deregisterService(this.id);
        console.log(`${this.componentType} deregistered from Consul`);
      }

      // Close message queue connection
      if (this.mqClient) {
        await this.mqClient.close();
        console.log(`${this.componentType} disconnected from RabbitMQ`);
      }
    } catch (error) {
      console.error(`Error during cleanup for ${this.componentType}:`,
        error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Register with Consul service discovery
   * Used by services that defer Consul registration until they are fully initialized
   */
  public async registerWithConsul(): Promise<void> {
    if (this.serviceDiscovery) {
      console.log(`${this.componentType} is already registered with Consul`);
      return;
    }
    console.log(`${this.componentType} starting deferred Consul registration...`);
    await this.initializeServiceDiscovery();
  }

  protected async initializeServiceDiscovery() {
    // Set up a retry mechanism with exponential backoff
    const maxRetries = 10;
    const initialRetryDelay = 2000;
    let retryCount = 0;
    let retryDelay = initialRetryDelay;

    const registerWithRetry = async () => {
      try {
        console.log(`Attempting to register with Consul (attempt ${retryCount + 1}/${maxRetries})...`);

        // Get Consul URL from environment variables
        const consulUrl = process.env.CONSUL_URL || 'consul:8500';
        console.log(`Using Consul URL: ${consulUrl}`);

        // Create a new ServiceDiscovery instance
        this.serviceDiscovery = new ServiceDiscovery(consulUrl);

        // Register this service with Consul
        const serviceUrl = this.url;
        const port = parseInt(this.port, 10);

        await this.serviceDiscovery.registerService(
          this.id,
          this.id,
          serviceUrl,
          [this.componentType.toLowerCase()],
          port
        );

        // Set up a health check endpoint
        this.setupHealthCheck();

        console.log(`Successfully registered ${this.componentType} with Consul`);

        // Set up cleanup on process exit
        process.on('SIGINT', async () => {
          await this.cleanup();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          await this.cleanup();
          process.exit(0);
        });

        return true;
      } catch (error) {
        console.error(`Failed to register with Consul (attempt ${retryCount + 1}/${maxRetries}):`,
          error instanceof Error ? error.message : 'Unknown error');

        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying in ${retryDelay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay = Math.min(retryDelay * 1.5, 30000);
          return await registerWithRetry();
        }

        return false;
      }
    };

    // Start the registration process
    const registered = await registerWithRetry();

    // If we couldn't register after all retries, set up a background registration task
    if (!registered) {
      console.log('Setting up background registration task for Consul');
      setInterval(async () => {
        if (!this.serviceDiscovery || !this.serviceDiscovery.isRegistered(this.id)) {
          console.log('Attempting to register with Consul in background...');
          try {
            await registerWithRetry();
            console.log('Successfully registered with Consul!');
          } catch (error) {
            console.error('Background registration attempt failed:',
              error instanceof Error ? error.message : 'Unknown error');
          }
        }
      }, 60000);
    }
  }

  protected async handleQueueMessage(message: any) {
    console.log(`${this.componentType} received message from queue:`, message);
    await this.handleBaseMessage(message);

    if (message.replyTo && message.correlationId) {
      try {
        const response = await this.handleSyncMessage(message);
        if (this.mqClient && this.mqClient.isConnected()) {
          const channel = this.mqClient.getChannel();
          if (channel) {
            await channel.addSetup(async (ch: Channel) => {
              const content = Buffer.from(JSON.stringify(response));
              ch.publish('', message.replyTo, content, {
                correlationId: message.correlationId
              });
            });
          }
        }
      } catch (error) {
        console.error(`Error handling sync message:`, error);
      }
    }
  }

  protected async handleSyncMessage(message: any): Promise<any> {
    return {
      type: 'response',
      content: { acknowledged: true },
      sender: this.id,
      recipient: message.sender,
      timestamp: new Date().toISOString()
    };
  }

  async isPostOfficeReady(): Promise<boolean> {
    try {
      console.log(`[DIAGNOSTIC] ${this.componentType} checking PostOffice readiness at URL: ${this.postOfficeUrl}`);
      const response = await axios.get(`${this.postOfficeUrl}/ready`, {
        timeout: 2000,
        maxRedirects: 0
      });
      return response.status === 200;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 307) {
        return true;
      }
      return false;
    }
  }

  protected async registerWithPostOffice(maxRetries: number = 10, initialDelayMs: number = 1000) {
    let retries = 0;
    let delay = initialDelayMs;

    while (retries < maxRetries) {
      try {
        const isReady = await this.isPostOfficeReady();
        if (!isReady) {
          console.log(`PostOffice not ready, waiting ${delay}ms before retry ${retries + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.5, 10000);
          retries++;
          continue;
        }

        const response = await axios.post(`${this.postOfficeUrl}/registerComponent`, {
          id: this.id,
          type: this.componentType,
          url: this.url
        });

        if (response.status === 200) {
          console.log(`${this.componentType} registered successfully with PostOffice`);
          this.registeredWithPostOffice = true;
          return;
        }
      } catch (error) {
        console.error(`Failed to register ${this.componentType} with PostOffice (attempt ${retries + 1}/${maxRetries}): ${(error as Error).message ? (error as Error).message : ''}`);

        if (retries >= maxRetries - 1) {
          console.error(`Maximum retries (${maxRetries}) reached for registering with PostOffice`);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 10000);
      }

      retries++;
    }
  }

  async sendViaRabbitMQ(message: any): Promise<any> {
    if (this.mqClient && this.mqClient.isConnected()) {
      try {
        const channel = this.mqClient.getChannel();
        if (!channel) {
          throw new Error('Failed to get channel wrapper');
        }

        const routingKey = `message.${message.recipient}`;
        console.log(`Publishing message to RabbitMQ with routing key: ${routingKey}`);

        if (message.requiresSync) {
          const correlationId = uuidv4();
          const replyQueueName = `rpc-reply-${uuidv4()}`;

          const responsePromise = new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error(`RPC request timed out after 30000ms`));
            }, 30000);

            try {
              await channel.addSetup(async (ch: Channel) => {
                const { queue } = await ch.assertQueue(replyQueueName, {
                  exclusive: true,
                  autoDelete: true
                });

                const { consumerTag } = await ch.consume(queue, (msg: ConsumeMessage | null) => {
                  if (msg && msg.properties.correlationId === correlationId) {
                    try {
                      const response = JSON.parse(msg.content.toString());
                      ch.ack(msg);
                      (ch as any).cancel(consumerTag);
                      clearTimeout(timeoutId);
                      resolve(response);
                    } catch (error) {
                      reject(error);
                    }
                  }
                }, { noAck: false });

                const content = Buffer.from(JSON.stringify(message));
                ch.publish('stage7', routingKey, content, {
                  correlationId,
                  replyTo: replyQueueName,
                  persistent: true
                });
              });
            } catch (error) {
              clearTimeout(timeoutId);
              reject(error);
            }
          });

          const response = await responsePromise;
          console.log(`Received RPC response from ${message.recipient}`);
          return response;
        } else {
          await channel.addSetup(async (ch: Channel) => {
            const content = Buffer.from(JSON.stringify(message));
            ch.publish('stage7', routingKey, content, {
              persistent: true
            });
          });

          console.log(`Published async message to queue with routing key: ${routingKey}`);
          return { success: true };
        }
      } catch (error) {
        console.error('Failed to publish message to RabbitMQ:', error instanceof Error ? error.message : 'Unknown error');
      }
    } else {
      console.warn('RabbitMQ not connected, falling back to HTTP-based communication');
    }
  }

  async sendMessage(type: string, recipient: string, content: any, requiresSync: boolean = false, visibility: 'user' | 'developer' = 'developer'): Promise<any> {
    console.log(`${this.componentType} ${this.id} sending message of type ${type} to ${recipient}`);

    const message = {
      type: type,
      content,
      sender: this.id,
      recipient,
      requiresSync,
      timestamp: new Date().toISOString(),
      visibility,
    };

    // Always try to use RabbitMQ first (primary method)
    if (this.mqClient && this.mqClient.isConnected()) {
      return this.sendViaRabbitMQ(message);
    }
    
    // Fall back to HTTP-based communication for unauthenticated messages or when RabbitMQ is not connected
    try {
      const authenticatedAxios = this.getAuthenticatedAxios();
      const response = await authenticatedAxios.post(`${this.postOfficeUrl}/message`, message);
      return response.data;
    } catch (directError) {
      console.error(`Failed to send message via direct HTTP:`,
        directError instanceof Error ? directError.message : directError);
      throw directError;
    }
  }

  async say(content: string, isUserVisible: boolean = false, persistent: boolean = false): Promise<void> {
    console.log(`${this.componentType} ${this.id} saying: ${content}`);

    let formattedContent = content;

    if (content.includes('Result {') && content.includes('agentId')) {
      try {
        const jsonMatch = content.match(/Result (\{.*\})/);
        if (jsonMatch && jsonMatch[1]) {
          const resultData = JSON.parse(jsonMatch[1]);
          if (resultData.data && resultData.data.data && resultData.data.data.length > 0) {
            const outputData = resultData.data.data[0];
            formattedContent = `I've completed my task: ${outputData.resultDescription}\n\n${outputData.result}`;
          }
        }
      } catch (error) {
        console.error('Error formatting agent result:', error);
      }
    }

    formattedContent = formattedContent.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}: /gi, '');

    try {
      const visibility = isUserVisible ? 'user' : 'developer';
      await this.sendMessage('say', 'user', { message: formattedContent, persistent }, false, visibility);
    } catch (error) {
      console.error(`Error sending message to PostOffice: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getServiceUrl(serviceType: string): Promise<string | null> {
    try {
      const envVarName = `${serviceType.toUpperCase()}_URL`;
      const envUrl = process.env[envVarName];
      if (envUrl) {
        console.log(`Service ${serviceType} found via environment variable ${envVarName}: ${envUrl}`);
        return envUrl;
      }

      if (this.serviceDiscovery) {
        try {
          const discoveredUrl = await this.serviceDiscovery.discoverService(serviceType);
          if (discoveredUrl) {
            console.log(`Service ${serviceType} discovered via service discovery: ${discoveredUrl}`);
            return discoveredUrl;
          }
        } catch (error) {
          console.error(`Error discovering service ${serviceType} via service discovery:`, error);
        }
      }

      try {
        const response = await axios.get(`${this.postOfficeUrl}/getServices`);
        const services = response.data;
        const serviceTypeLower = serviceType.charAt(0).toLowerCase() + serviceType.slice(1);
        const urlPropertyName = `${serviceTypeLower}Url`;

        if (services && services[urlPropertyName]) {
          console.log(`Service ${serviceType} found via PostOffice: ${services[urlPropertyName]}`);
          return services[urlPropertyName];
        }
      } catch (error) {
        console.error(`Error getting service ${serviceType} URL from PostOffice:`, error);
      }

      const defaultPort = this.getDefaultPortForService(serviceType);
      const defaultUrl = `${serviceType.toLowerCase()}:${defaultPort}`;
      console.log(`Using default URL for service ${serviceType}: ${defaultUrl}`);
      return defaultUrl;
    } catch (error) {
      console.error(`Error getting URL for service ${serviceType}:`, error);
      return null;
    }
  }

  async getServiceUrls(): Promise<{
    capabilitiesManagerUrl: string,
    brainUrl: string,
    librarianUrl: string,
    missionControlUrl: string,
    engineerUrl: string
  }> {
    const [capabilitiesManagerUrl, brainUrl, librarianUrl, missionControlUrl, engineerUrl] = await Promise.all([
      this.getServiceUrl('CapabilitiesManager').then(url => url || 'capabilitiesmanager:5060'),
      this.getServiceUrl('Brain').then(url => url || 'brain:5070'),
      this.getServiceUrl('Librarian').then(url => url || 'librarian:5040'),
      this.getServiceUrl('MissionControl').then(url => url || 'missioncontrol:5030'),
      this.getServiceUrl('Engineer').then(url => url || 'engineer:5050')
    ]);

    return {
      capabilitiesManagerUrl,
      brainUrl,
      librarianUrl,
      missionControlUrl,
      engineerUrl
    };
  }

  getDefaultPortForService(serviceType: string): string {
    const serviceTypeLower = serviceType.toLowerCase();
    const portMap: Record<string, string> = {
      'postoffice': '5020',
      'securitymanager': '5010',
      'missioncontrol': '5030',
      'librarian': '5040',
      'engineer': '5050',
      'capabilitiesmanager': '5060',
      'brain': '5070',
      'agentset': '5100'
    };

    return portMap[serviceTypeLower] || '8080';
  }

  async handleBaseMessage(message: any): Promise<void> {
    console.log(`${this.componentType} handling message of type ${message.type} from ${message.sender}`);

    switch (message.type) {
      case MessageModule.MessageType.ANSWER:
        if (this.onAnswer) {
          this.onAnswer(message.answer);
        }
        break;

      case MessageModule.MessageType.REQUEST:
        console.log(`${this.componentType} received request: ${JSON.stringify(message.content)}`);
        break;

      case MessageModule.MessageType.RESPONSE:
        console.log(`${this.componentType} received response: ${JSON.stringify(message.content)}`);
        break;

      case MessageModule.MessageType.STATUS_UPDATE:
        console.log(`${this.componentType} received status update: ${JSON.stringify(message.content)}`);
        break;

      default:
        console.log(`${this.componentType} received unhandled message type: ${message.type}`);
        break;
    }
  }

  async logAndSay(message: string, persistent: boolean = false): Promise<void> {
    console.log(message);
    await this.say(message, true, persistent);
  }

  protected askPromises: Map<string, Promise<string>> = new Map();

  ask(content: string, answerType: string = 'text', choices?: string[]): Promise<string> {
    return new Promise(async (resolve) => {
      const questionGuid = uuidv4();
      this.questions.push(questionGuid);
      this.askPromises.set(questionGuid, Promise.resolve(''));

      await this.sendMessage(MessageModule.MessageType.REQUEST, 'user', {
        question: content,
        questionGuid: questionGuid,
        choices: choices,
        answerType: answerType,
        asker: this.id
      }, true);

      this.askPromises.set(questionGuid, new Promise((resolve) => {
        const checkAnswer = setInterval(() => {
          if (!this.questions.includes(questionGuid)) {
            clearInterval(checkAnswer);
            resolve(this.lastAnswer);
          }
        }, 100);
      }));

      this.askPromises.get(questionGuid)!.then(resolve);
    });
  }

  onAnswer(answer: express.Request): void {
    if (answer.body.questionGuid && this.questions.includes(answer.body.questionGuid)) {
      this.questions = this.questions.filter(q => q !== answer.body.questionGuid);
      this.lastAnswer = answer.body.answer;
    }
  }

  protected getTokenManager(): ServiceTokenManager {
    if (!this.tokenManager) {
      const serviceId = this.componentType;
      const clientSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
      this.tokenManager = ServiceTokenManager.getInstance(
        `${this.securityManagerUrl}`,
        serviceId,
        clientSecret
      );
      console.log(`Created ServiceTokenManager for ${serviceId}`);
    }
    return this.tokenManager;
  }

  protected getAuthenticatedAxios(): import('axios').AxiosInstance {
    const { createAuthenticatedAxios } = require('./http/createAuthenticatedAxios.js');
    const serviceId = this.componentType;
    const clientSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
    return createAuthenticatedAxios(
      serviceId,
      this.securityManagerUrl,
      clientSecret
    );
  }

  // Cache for verified tokens to reduce verification overhead
  protected static tokenCache: Map<string, { decoded: any, expiry: number }> = new Map();
  protected static lastVerificationTime: number = 0;
  protected static verificationThrottleMs: number = 1000;

  protected isHealthCheckEndpoint(path: string): boolean {
    const { HEALTH_CHECK_PATHS } = require('./middleware/authMiddleware');
    return HEALTH_CHECK_PATHS.some((healthPath: string) => path === healthPath || path.startsWith(`${healthPath}/`));
  }

  public async verifyToken(req: express.Request, res: express.Response, next: express.NextFunction): Promise<any> {
    try {
      if (this.isHealthCheckEndpoint(req.path)) {
        return next();
      }
      const AUTH_PATHS = ['/auth/', '/login', '/securityManager/login', '/securityManager/register', '/public-key', '/refresh-token', '/registerComponent'];
      if (AUTH_PATHS.some(path => req.path.startsWith(path))) {
        console.log(`[BaseService] Skipping authentication for path: ${req.path}`);
        return next();
      }

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        const stackTrace = new Error().stack;
        console.log(`[BaseService] No authorization header provided for request to ${req.method} ${req.originalUrl}`);
        console.log(`[BaseService] Call stack: ${stackTrace}`);

        console.log(`[BaseService] Request details:
          - IP: ${req.ip}
          - User-Agent: ${req.headers['user-agent']}
          - Referrer: ${req.headers.referer || req.headers.referrer || 'none'}
          - Path: ${req.path}
          - Query: ${JSON.stringify(req.query)}
          - Body: ${JSON.stringify(req.body).substring(0, 200)}...
        `);

        return res.status(401).json({ error: `[BS] No authorization token provided for ${req.path}` });
      }

      const token = ServiceTokenManager.extractTokenFromHeader(authHeader);
      if (!token) {
        console.log(`[BaseService] Invalid authorization header format for ${this.componentType}`);
        return res.status(401).json({ error: 'Invalid authorization header format' });
      }

      const now = Date.now();
      const cachedToken = BaseService.tokenCache.get(token);
      if (cachedToken && cachedToken.expiry > now) {
        (req as any).user = cachedToken.decoded;
        return next();
      }

      const timeSinceLastVerification = now - BaseService.lastVerificationTime;
      if (timeSinceLastVerification < BaseService.verificationThrottleMs) {
        if (cachedToken) {
          (req as any).user = cachedToken.decoded;
          return next();
        }
      }

      BaseService.lastVerificationTime = now;

      const tokenManager = this.getTokenManager();

      try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString());
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

          const now = Math.floor(Date.now() / 1000);
          if (payload.exp && payload.exp < now) {
            console.error(`[BaseService] Token is expired. Expired at ${new Date(payload.exp * 1000).toISOString()}, current time is ${new Date().toISOString()}`);
            return res.status(401).json({ error: 'Token has expired' });
          }
        }
      } catch (parseError) {
        console.error(`[BaseService] Error parsing token:`, parseError);
      }

      const decoded = await tokenManager.verifyToken(token);
      if (!decoded) {
        console.log(`[BaseService] Invalid or expired token for ${this.componentType}`);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const expiry = typeof decoded.exp === 'number'
        ? decoded.exp * 1000
        : now + (50 * 60 * 1000);

      BaseService.tokenCache.set(token, { decoded, expiry });

      (req as any).user = decoded;
      return next();
    } catch (error) {
      console.error(`[BaseService] Error verifying token for ${this.componentType}:`, error);
      return res.status(500).json({ error: 'Internal server error during authentication' });
    }
  }
}