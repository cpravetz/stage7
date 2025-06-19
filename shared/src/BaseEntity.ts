import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import { MessageQueueClient } from './messaging/queueClient.js';
import { ServiceDiscovery } from './discovery/serviceDiscovery.js';
import { IBaseEntity } from './interfaces/IBaseEntity.js';
import { ServiceTokenManager } from './security/ServiceTokenManager.js';
import { Channel, ConsumeMessage } from 'amqplib';

// Export middleware for easy access
export { createAuthMiddleware, requireRoles, requirePermissions } from './middleware/authMiddleware.js';

// Export authenticated axios creator for easy access
export { createAuthenticatedAxios, createClientAuthenticatedAxios } from './http/createAuthenticatedAxios.js';

// Import MessageType enum directly to avoid ESM import issues
import * as MessageModule from './types/Message.js';

// Forward declaration to avoid circular dependency
type AuthenticatedApiClientType = any; // Will be properly typed when used

export class BaseEntity implements IBaseEntity {
  id: string;
  componentType: string;
  postOfficeUrl: string;
  url: string;
  questions: string[] = [];
  port : string;
  registeredWithPostOffice: boolean = false;
  lastAnswer: string = '';
  authenticatedApi: AuthenticatedApiClientType;
  protected mqClient: MessageQueueClient | null = null;
  protected serviceDiscovery: ServiceDiscovery | null = null;
  protected tokenManager: ServiceTokenManager | null = null;
  protected securityManagerUrl: string = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010';

  constructor(id: string, componentType: string, urlBase: string, port: string, skipPostOfficeRegistration: boolean = false) {
    this.id = id;
    this.componentType = componentType;
    this.postOfficeUrl = process.env.POSTOFFICE_URL || 'postoffice:5020'
    this.port = port;
    this.url = `${urlBase}:${port}` //url;
    // Dynamically import to avoid circular dependency
    const { AuthenticatedApiClient } = require('./AuthenticatedApiClient.js');
    this.authenticatedApi = new AuthenticatedApiClient(this);

    // Initialize services
    this.initializeMessageQueue();
    this.initializeServiceDiscovery();

    // Register with service registry and PostOffice (unless skipped)
    if (!skipPostOfficeRegistration) {
      this.registerWithPostOffice();
    } else {
      console.log(`Skipping PostOffice registration for ${this.componentType} (self-registration)`);
      this.registeredWithPostOffice = true;
    }
  }
  protected setupHealthCheck() {
  }

protected async initializeMessageQueue() {
  // Set up a retry mechanism with exponential backoff
  const maxRetries = 20; // Increased for better reliability
  const initialRetryDelay = 2000; // 2 seconds
  let retryCount = 0;
  let retryDelay = initialRetryDelay;

  const connectWithRetry = async () => {
    try {
      console.log(`Attempting to connect to RabbitMQ (attempt ${retryCount + 1}/${maxRetries})...`);

      // Get RabbitMQ URL from environment variables
      const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672';
      console.log(`Using RabbitMQ URL: ${rabbitmqUrl}`);

      // Parse the URL to check if it's valid and extract host for DNS resolution check
      const urlParts = rabbitmqUrl.split('@');
      if (urlParts.length !== 2) {
        throw new Error(`Invalid RabbitMQ URL format: ${rabbitmqUrl}`);
      }

      const hostPart = urlParts[1].split(':');
      if (hostPart.length < 2) {
        throw new Error(`Invalid RabbitMQ host format: ${urlParts[1]}`);
      }

      const host = hostPart[0];
      console.log(`Attempting to connect to RabbitMQ host: ${host}`);

      // Create a new MessageQueueClient instance with improved connection options
      this.mqClient = new MessageQueueClient(rabbitmqUrl);

      // Connect to RabbitMQ with connection options
      await this.mqClient.connect({
        heartbeat: 60,       // Increase heartbeat interval to 60 seconds
        reconnectDelay: 5000 // Wait 5 seconds between reconnection attempts
      });

      // Verify connection is working with an active test
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
      const queueName = `${this.componentType.toLowerCase()}-${this.id}`;
      console.log(`Creating queue: ${queueName}`);

      // Set up the queue and bindings
      await channel.addSetup(async (ch: Channel) => {
        // Assert the queue exists
        await ch.assertQueue(queueName, {
          durable: true
        });

        // Set prefetch to limit concurrent message processing
        // Using type assertion because the type definition is incomplete
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
              // Using type assertion because the type definition is incomplete
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
      return true; // Connection successful
    } catch (error) {
      console.error(`Failed to initialize message queue (attempt ${retryCount + 1}/${maxRetries}):`,
        error instanceof Error ? error.message : 'Unknown error');

      if (retryCount < maxRetries) {
        retryCount++;

        // Add jitter to avoid thundering herd problem
        const jitter = Math.random() * 0.3 * retryDelay; // Add up to 30% jitter
        const actualDelay = Math.floor(retryDelay + jitter);

        console.log(`Retrying in ${actualDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, actualDelay));
        retryDelay = Math.min(retryDelay * 1.5, 30000); // Exponential backoff, max 30 seconds
        return await connectWithRetry();
      }

      return false; // Failed to connect after all retries
    }
  };

  // Start the connection process
  const connected = await connectWithRetry();

  // If we couldn't connect after all retries, set up a background reconnection task
  if (!connected) {
    console.log('Setting up background reconnection task for RabbitMQ');

    // Set up a persistent reconnection task
    const reconnectionInterval = setInterval(async () => {
      if (!this.mqClient || !this.mqClient.isConnected()) {
        console.log('Attempting to reconnect to RabbitMQ in background...');
        try {
          retryCount = 0; // Reset retry count for a fresh attempt
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
        // Periodically test the connection to ensure it's still working
        try {
          // Only test if the connection reports as connected
          if (this.mqClient.isConnected()) {
            const connectionWorking = await this.mqClient.testConnection();
            if (!connectionWorking) {
              console.log('RabbitMQ connection test failed, will attempt to reconnect');
              // Force close the connection before reconnecting
              try {
                await this.mqClient.close();
              } catch (err) {
                console.log('Error closing existing connection:', err);
              }
              this.mqClient = null; // Force reconnection on next interval
            } else {
              console.log('Periodic connection test successful - RabbitMQ connection is stable');
            }
          } else {
            console.log('RabbitMQ reports as disconnected, will attempt to reconnect');
            this.mqClient = null; // Force reconnection on next interval
          }
        } catch (error) {
          console.error('Error testing RabbitMQ connection:',
            error instanceof Error ? error.message : 'Unknown error');
          // Force reconnection on next interval
          this.mqClient = null;
        }
      }
    }, 30000); // Try every 30 seconds

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


  protected async initializeServiceDiscovery() {
    // Set up a retry mechanism with exponential backoff
    const maxRetries = 10;
    const initialRetryDelay = 2000; // 2 seconds
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
          this.componentType,
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

        return true; // Registration successful
      } catch (error) {
        console.error(`Failed to register with Consul (attempt ${retryCount + 1}/${maxRetries}):`,
          error instanceof Error ? error.message : 'Unknown error');

        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying in ${retryDelay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay = Math.min(retryDelay * 1.5, 30000); // Exponential backoff, max 30 seconds
          return await registerWithRetry();
        }

        return false; // Failed to register after all retries
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
      }, 60000); // Try every minute
    }
  }


  /**
   * Handle a message received from the message queue
   * @param message Message received from the queue
   */
  protected async handleQueueMessage(message: any) {
    console.log(`${this.componentType} received message from queue:`, message);

    // Process the message using the same handler as HTTP messages
    await this.handleBaseMessage(message);

    // If the message requires a synchronous response, send it back via the queue
    if (message.replyTo && message.correlationId) {
      try {
        // Get the response from the message handler
        const response = await this.handleSyncMessage(message);

        // Send the response back via the queue
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

    // Subclasses should override handleBaseMessage or implement their own message handling
  }

  /**
   * Handle a synchronous message that requires a response
   * This should be overridden by subclasses that need to handle sync messages
   * @param message Message to handle
   * @returns Response to the message
   */
  protected async handleSyncMessage(message: any): Promise<any> {
    // Default implementation just returns an acknowledgement
    return {
      type: 'response',
      content: { acknowledged: true },
      sender: this.id,
      recipient: message.sender,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if PostOffice is ready to accept connections
   * @returns Promise that resolves to true if PostOffice is ready, false otherwise
   */
  private async isPostOfficeReady(): Promise<boolean> {
    try {
      // Health check endpoints don't require authentication, so we can use a direct axios call
      const response = await axios.get(`http://${this.postOfficeUrl}/ready`, {
        timeout: 2000,
        // Don't follow redirects - we want the actual status code
        maxRedirects: 0
      });
      return response.status === 200;
    } catch (error) {
      // If the error is a redirect to /ready?detail=full, that's still a valid response
      if (axios.isAxiosError(error) && error.response?.status === 307) {
        return true;
      }
      return false;
    }
  }

  /**
   * Register this entity with the PostOffice service
   * @param maxRetries Maximum number of retry attempts
   * @param initialDelayMs Initial delay between retries in milliseconds
   */
  protected async registerWithPostOffice(maxRetries: number = 10, initialDelayMs: number = 1000) {
    let retries = 0;
    let delay = initialDelayMs;

    while (retries < maxRetries) {
      try {
        // First check if PostOffice is ready
        const isReady = await this.isPostOfficeReady();
        if (!isReady) {
          console.log(`PostOffice not ready, waiting ${delay}ms before retry ${retries + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.5, 10000); // Exponential backoff with 10s cap
          retries++;
          continue;
        }

        // Use authenticated API with shared secret
        const response = await this.authenticatedApi.post(`http://${this.postOfficeUrl}/registerComponent`, {
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
        delay = Math.min(delay * 1.5, 10000); // Exponential backoff with 10s cap
      }

      retries++;
    }
  }

  async sendViaRabbitMQ(message: any): Promise<any> {
    // Always try to use RabbitMQ first (primary method)
    if (this.mqClient && this.mqClient.isConnected()) {
      try {
        const channel = this.mqClient.getChannel();
        if (!channel) {
          throw new Error('Failed to get channel wrapper');
        }

        const routingKey = `message.${message.recipient}`;
        console.log(`Publishing message to RabbitMQ with routing key: ${routingKey}`);

        if (message.requiresSync) {
          // For synchronous messages, use RPC pattern
          console.log(`Sending RPC request to ${message.recipient}`);

          // Create a unique correlation ID for this request
          const correlationId = uuidv4();

          // Create a temporary queue for the response
          const replyQueueName = `rpc-reply-${uuidv4()}`;

          // Set up a promise to handle the response
          const responsePromise = new Promise(async (resolve, reject) => {
            // Set up a timeout
            const timeoutId = setTimeout(() => {
              reject(new Error(`RPC request timed out after 30000ms`));
            }, 30000);

            try {
              await channel.addSetup(async (ch: Channel) => {
                // Create the reply queue
                const { queue } = await ch.assertQueue(replyQueueName, {
                  exclusive: true,
                  autoDelete: true
                });

                // Set up a consumer for the reply queue
                const { consumerTag } = await ch.consume(queue, (msg: ConsumeMessage | null) => {
                  if (msg && msg.properties.correlationId === correlationId) {
                    try {
                      // Parse the response
                      const response = JSON.parse(msg.content.toString());

                      // Clean up
                      ch.ack(msg);
                      // Cancel the consumer - note: this is a workaround for TypeScript type issues
                      (ch as any).cancel(consumerTag);

                      // Clear the timeout
                      clearTimeout(timeoutId);

                      // Resolve the promise with the response
                      resolve(response);
                    } catch (error) {
                      reject(error);
                    }
                  }
                }, { noAck: false });

                // Publish the message with the reply queue and correlation ID
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

          // Wait for the response
          const response = await responsePromise;
          console.log(`Received RPC response from ${message.recipient}`);
          return response;
        } else {
          // For asynchronous messages, just publish
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
        // Continue with fallback methods
      }
    } else {
      console.warn('RabbitMQ not connected, falling back to HTTP-based communication');
    }
  }

  /**
   * Send a message to another component
   * @param type Message type
   * @param recipient Recipient ID
   * @param content Message content
   * @param requiresSync Whether the message requires a synchronous response
   * @returns Promise that resolves when the message is sent, or with the response if sync
   */
  async sendMessage(type: string, recipient: string, content: any, requiresSync: boolean = false): Promise<any> {
    console.log(`${this.componentType} ${this.id} sending message of type ${type} to ${recipient}`);

    const message = {
      type: type,
      content,
      sender: this.id,
      recipient,
      requiresSync,
      timestamp: new Date().toISOString()
    };

    // Always try to use RabbitMQ first (primary method)
    /*
    if (this.mqClient && this.mqClient.isConnected()) {
      return this.sendViaRabbitMQ(message);
    }
    */
    
    // Fall back to HTTP-based communication (secondary method)
    try {
      // Use environment variable for PostOffice URL if available (highest priority)
      const envPostOfficeUrl = process.env.POSTOFFICE_URL;
      let postOfficeUrl = envPostOfficeUrl || this.postOfficeUrl;

      console.log(`Using PostOffice URL: ${postOfficeUrl}`);

      // Use authenticated API for HTTP communication
      const response = await this.authenticatedApi.post(`http://${postOfficeUrl}/message`, message);
      console.log(`Successfully sent message to ${recipient} via HTTP. Response status: ${response.status}`);
      return response.data;
    } catch (directError) {
      console.error(`Failed to send message via direct HTTP:`, directError instanceof Error ? directError.message : directError);
      throw directError;
    }
  }

  async say(content: string): Promise<void> {
    console.log(`${this.componentType} ${this.id} saying: ${content}`);

    // Format the content to be more human-friendly
    let formattedContent = content;

    // If the content contains a JSON string with agent results, format it
    if (content.includes('Result {') && content.includes('agentId')) {
      try {
        // Extract the JSON part
        const jsonMatch = content.match(/Result (\{.*\})/);
        if (jsonMatch && jsonMatch[1]) {
          const resultData = JSON.parse(jsonMatch[1]);

          // Format the output in a more human-friendly way
          if (resultData.data && resultData.data.data && resultData.data.data.length > 0) {
            const outputData = resultData.data.data[0];
            formattedContent = `I've completed my task: ${outputData.resultDescription}\n\n${outputData.result}`;
          }
        }
      } catch (error) {
        console.error('Error formatting agent result:', error);
        // If there's an error parsing, just use the original content
      }
    }

    // If the content contains a UUID, remove it
    formattedContent = formattedContent.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}: /gi, '');

    try {
      await this.sendMessage('say', 'user', formattedContent, false);
      console.log(`Successfully sent message to PostOffice: ${formattedContent}`);
    } catch (error) {
      console.error(`Error sending message to PostOffice: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the URL for a specific service type
   * @param serviceType The type of service to get the URL for
   * @returns Promise that resolves with the service URL or null if not found
   */
  async getServiceUrl(serviceType: string): Promise<string | null> {
    try {
      // First try environment variables (highest priority for consistency)
      const envVarName = `${serviceType.toUpperCase()}_URL`;
      const envUrl = process.env[envVarName];
      if (envUrl) {
        console.log(`Service ${serviceType} found via environment variable ${envVarName}: ${envUrl}`);
        return envUrl;
      }

      // Next try to discover the service using service discovery
      if (this.serviceDiscovery) {
        try {
          const discoveredUrl = await this.serviceDiscovery.discoverService(serviceType);
          if (discoveredUrl) {
            console.log(`Service ${serviceType} discovered via service discovery: ${discoveredUrl}`);
            return discoveredUrl;
          }
        } catch (error) {
          console.error(`Error discovering service ${serviceType} via service discovery:`, error);
          // Continue with fallback methods
        }
      }

      // Then try to get the URL from PostOffice
      try {
        // Use authenticated API for HTTP communication
        const response = await this.authenticatedApi.get(`http://${this.postOfficeUrl}/getServices`);
        const services = response.data;

        // Convert service type to camelCase for property lookup
        const serviceTypeLower = serviceType.charAt(0).toLowerCase() + serviceType.slice(1);
        const urlPropertyName = `${serviceTypeLower}Url`;

        if (services && services[urlPropertyName]) {
          console.log(`Service ${serviceType} found via PostOffice: ${services[urlPropertyName]}`);
          return services[urlPropertyName];
        }
      } catch (error) {
        console.error(`Error getting service ${serviceType} URL from PostOffice:`, error);
        // Continue with fallback methods
      }

      // If all else fails, use default Docker service name and port
      const defaultPort = this.getDefaultPortForService(serviceType);
      const defaultUrl = `${serviceType.toLowerCase()}:${defaultPort}`;
      console.log(`Using default URL for service ${serviceType}: ${defaultUrl}`);
      return defaultUrl;
    } catch (error) {
      console.error(`Error getting URL for service ${serviceType}:`, error);
      return null;
    }
  }

  /**
   * Get URLs for commonly used services
   * @returns Promise that resolves with an object containing service URLs
   */
  async getServiceUrls(): Promise<{
    capabilitiesManagerUrl: string,
    brainUrl: string,
    trafficManagerUrl: string,
    librarianUrl: string,
    missionControlUrl: string,
    engineerUrl: string,
    configServiceUrl: string
  }> {
    const [capabilitiesManagerUrl, brainUrl, trafficManagerUrl, librarianUrl, missionControlUrl, engineerUrl, configServiceUrl] = await Promise.all([
      this.getServiceUrl('CapabilitiesManager').then(url => url || 'capabilitiesmanager:5060'),
      this.getServiceUrl('Brain').then(url => url || 'brain:5070'),
      this.getServiceUrl('TrafficManager').then(url => url || 'trafficmanager:5080'),
      this.getServiceUrl('Librarian').then(url => url || 'librarian:5040'),
      this.getServiceUrl('MissionControl').then(url => url || 'missioncontrol:5030'),
      this.getServiceUrl('Engineer').then(url => url || 'engineer:5050'),
      this.getServiceUrl('ConfigService').then(url => url || 'configservice:5090')
    ]);

    return {
      capabilitiesManagerUrl,
      brainUrl,
      trafficManagerUrl,
      librarianUrl,
      missionControlUrl,
      engineerUrl,
      configServiceUrl
    };
  }

  /**
   * Get the default port for a service type
   * @param serviceType The type of service
   * @returns The default port for the service
   */
  private getDefaultPortForService(serviceType: string): string {
    const serviceTypeLower = serviceType.toLowerCase();
    const portMap: Record<string, string> = {
      'postoffice': '5020',
      'securitymanager': '5010',
      'missioncontrol': '5030',
      'librarian': '5040',
      'engineer': '5050',
      'capabilitiesmanager': '5060',
      'brain': '5070',
      'trafficmanager': '5080',
      'configservice': '5090',
      'agentset': '5100'
    };

    return portMap[serviceTypeLower] || '8080';
  }

  async handleBaseMessage(message: any): Promise<void> {
    // Log the message receipt
    console.log(`${this.componentType} handling message of type ${message.type} from ${message.sender}`);

    // Handle different message types
    switch (message.type) {
      case MessageModule.MessageType.ANSWER:
        if (this.onAnswer) {
          this.onAnswer(message.answer);
        }
        break;

      case MessageModule.MessageType.REQUEST:
        // Handle requests - subclasses should override for specific handling
        console.log(`${this.componentType} received request: ${JSON.stringify(message.content)}`);
        break;

      case MessageModule.MessageType.RESPONSE:
        // Handle responses - subclasses should override for specific handling
        console.log(`${this.componentType} received response: ${JSON.stringify(message.content)}`);
        break;

      case MessageModule.MessageType.STATUS_UPDATE:
        // Handle status updates - subclasses should override for specific handling
        console.log(`${this.componentType} received status update: ${JSON.stringify(message.content)}`);
        break;

      default:
        // For any other message types, log and let subclasses handle
        console.log(`${this.componentType} received unhandled message type: ${message.type}`);
        break;
    }
  }

  async logAndSay(message: string): Promise<void> {
    console.log(message);
    await this.say(message);
  }

  private askPromises: Map<string, Promise<string>> = new Map();

  ask(content: string, choices?: string[]): Promise<string> {
    return new Promise(async (resolve) => {
      const questionGuid = uuidv4();
      this.questions.push(questionGuid);
      this.askPromises.set(questionGuid, Promise.resolve(''));

      // User requests always require synchronous handling
      await this.sendMessage(MessageModule.MessageType.REQUEST, 'user', {
        question: content,
        questionGuid: questionGuid,
        choices: choices,
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

  /**
   * Get the token manager for this entity
   * @returns ServiceTokenManager instance
   */
  protected getTokenManager(): ServiceTokenManager {
    if (!this.tokenManager) {
      const serviceId = this.componentType;
      const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
      this.tokenManager = ServiceTokenManager.getInstance(
        `http://${this.securityManagerUrl}`,
        serviceId,
        serviceSecret
      );
      console.log(`Created ServiceTokenManager for ${serviceId}`);
    }
    return this.tokenManager;
  }

  /**
   * Get an authenticated axios instance for making API calls
   * This is the recommended way to make authenticated API calls to other services
   * @returns Authenticated axios instance
   */
  protected getAuthenticatedAxios(): import('axios').AxiosInstance {
    const { createAuthenticatedAxios } = require('./http/createAuthenticatedAxios.js');
    return createAuthenticatedAxios(
      this.componentType,
      this.securityManagerUrl,
      process.env.CLIENT_SECRET || 'stage7AuthSecret'
    );
  }

  /**
   * Verify a JWT token using the ServiceTokenManager
   * This is the recommended method for token verification in all services
   * @param req Express request object
   * @param res Express response object
   * @param next Express next function
   */
  // Cache for verified tokens to reduce verification overhead
  private static tokenCache: Map<string, { decoded: any, expiry: number }> = new Map();
  private static lastVerificationTime: number = 0;
  private static verificationThrottleMs: number = 1000; // Minimum 1 second between verifications

  /**
   * Check if a path is a health check endpoint
   * @param path The path to check
   * @returns True if the path is a health check endpoint
   */
  protected isHealthCheckEndpoint(path: string): boolean {
    // Import the shared health check paths
    const { HEALTH_CHECK_PATHS } = require('./middleware/authMiddleware.js');
    return HEALTH_CHECK_PATHS.some((healthPath: string) => path === healthPath || path.startsWith(`${healthPath}/`));
  }

  /**
   * Verify a JWT token using the ServiceTokenManager
   * This is the recommended method for token verification in all services
   * Health check endpoints are excluded from authentication
   * @param req Express request object
   * @param res Express response object
   * @param next Express next function
   */
  public async verifyToken(req: express.Request, res: express.Response, next: express.NextFunction): Promise<any> {
    try {
      // Skip authentication for health check endpoints
      if (this.isHealthCheckEndpoint(req.path)) {
        console.log(`[BaseEntity] Skipping authentication for health check endpoint: ${req.path}`);
        return next();
      }
      const AUTH_PATHS = ['/auth/', '/login', '/securityManager/login', '/securityManager/register', '/public-key', '/refresh-token', '/registerComponent'];
      if (AUTH_PATHS.some(path => req.path.startsWith(path))) {
        console.log(`[BaseEntity] Skipping authentication for path: ${req.path}`);
        return next();
      }
      // Get the token from the Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        // Capture stack trace to identify the API endpoint being called without a token
        const stackTrace = new Error().stack;
        console.log(`[BaseEntity] No authorization header provided for request to ${req.method} ${req.originalUrl}`);
        console.log(`[BaseEntity] Call stack: ${stackTrace}`);

        // Log additional request information to help with debugging
        console.log(`[BaseEntity] Request details:
          - IP: ${req.ip}
          - User-Agent: ${req.headers['user-agent']}
          - Referrer: ${req.headers.referer || req.headers.referrer || 'none'}
          - Path: ${req.path}
          - Query: ${JSON.stringify(req.query)}
          - Body: ${JSON.stringify(req.body).substring(0, 200)}...
        `);

        return res.status(401).json({ error: `[BE] No authorization token provided for ${req.path}` });
      }

      // Extract the token from the Authorization header
      const token = ServiceTokenManager.extractTokenFromHeader(authHeader);
      if (!token) {
        console.log(`[BaseEntity] Invalid authorization header format for ${this.componentType}`);
        return res.status(401).json({ error: 'Invalid authorization header format' });
      }


      // Check if token is in cache and not expired
      const now = Date.now();
      const cachedToken = BaseEntity.tokenCache.get(token);
      if (cachedToken && cachedToken.expiry > now) {
        // Use cached token verification result
        (req as any).user = cachedToken.decoded;
        return next();
      }

      // Throttle verification requests
      const timeSinceLastVerification = now - BaseEntity.lastVerificationTime;
      if (timeSinceLastVerification < BaseEntity.verificationThrottleMs) {
        // If we have a cached result, use it even if expired
        if (cachedToken) {
          (req as any).user = cachedToken.decoded;
          return next();
        }
      }

      BaseEntity.lastVerificationTime = now;

      // Get the token manager instance
      const tokenManager = this.getTokenManager();

      // Log token details for debugging (without revealing the full token)
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString());
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

          // Check if token is expired
          const now = Math.floor(Date.now() / 1000);
          if (payload.exp && payload.exp < now) {
            console.error(`[BaseEntity] Token is expired. Expired at ${new Date(payload.exp * 1000).toISOString()}, current time is ${new Date().toISOString()}`);
            return res.status(401).json({ error: 'Token has expired' });
          }
        }
      } catch (parseError) {
        console.error(`[BaseEntity] Error parsing token:`, parseError);
      }

      // Verify the token
      const decoded = await tokenManager.verifyToken(token);
      if (!decoded) {
        console.log(`[BaseEntity] Invalid or expired token for ${this.componentType}`);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      //console.log(`[BaseEntity] Token verified successfully for ${this.componentType}`);

      // Cache the verification result
      const expiry = typeof decoded.exp === 'number'
        ? decoded.exp * 1000 // Convert seconds to milliseconds
        : now + (50 * 60 * 1000); // Default 50 minutes if no exp claim

      BaseEntity.tokenCache.set(token, { decoded, expiry });

      // Add the decoded user information to the request
      (req as any).user = decoded;

      // Continue with the request
      return next();
    } catch (error) {
      console.error(`[BaseEntity] Error verifying token for ${this.componentType}:`, error);
      return res.status(500).json({ error: 'Internal server error during authentication' });
    }
  }

}
