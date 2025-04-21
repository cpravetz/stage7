import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import type { MessageType } from './types/Message.js';
import { MessageQueueClient } from './messaging/queueClient.js';
import { ServiceDiscovery } from './discovery/serviceDiscovery.js';
import { IBaseEntity } from './interfaces/IBaseEntity.js';
import { ServiceTokenManager } from './security/ServiceTokenManager.js';

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

  constructor(id: string, componentType: string, urlBase: string, port: string) {
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

    // Register with service registry and PostOffice
    this.registerWithPostOffice();
  }

  protected async initializeMessageQueue() {
    // Set up a retry mechanism with exponential backoff
    const maxRetries = 10;
    const initialRetryDelay = 2000; // 2 seconds
    let retryCount = 0;
    let retryDelay = initialRetryDelay;

    const connectWithRetry = async () => {
      try {
        const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672';
        this.mqClient = new MessageQueueClient(rabbitmqUrl);
        await this.mqClient.connect();

        // Create a queue for this component
        const queueName = `${this.componentType.toLowerCase()}-${this.id}`;
        await this.mqClient.subscribeToQueue(queueName, async (message) => {
          await this.handleQueueMessage(message);
        });

        // Bind the queue to the exchange with appropriate routing patterns
        await this.mqClient.bindQueueToExchange(queueName, 'stage7', `message.${this.id}`);
        await this.mqClient.bindQueueToExchange(queueName, 'stage7', `message.${this.componentType}`);
        await this.mqClient.bindQueueToExchange(queueName, 'stage7', 'message.all');

        console.log(`${this.componentType} connected to message queue`);
        return true; // Connection successful
      } catch (error) {
        console.error(`Failed to initialize message queue for ${this.componentType} (attempt ${retryCount + 1}/${maxRetries}):`, error);

        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying in ${retryDelay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay = Math.min(retryDelay * 2, 30000); // Exponential backoff, max 30 seconds
          return await connectWithRetry();
        }

        return false; // Failed to connect after all retries
      }
    };

    // Start the connection process
    const connected = await connectWithRetry();

    // If we couldn't connect after all retries, set up a background reconnection task
    if (!connected) {
      console.log(`Setting up background reconnection task for ${this.componentType} message queue`);
      setInterval(async () => {
        if (!this.mqClient || !this.mqClient.isConnected()) {
          console.log(`Attempting to reconnect ${this.componentType} to message queue in background...`);
          try {
            await connectWithRetry();
            console.log(`Successfully reconnected ${this.componentType} to message queue!`);
          } catch (error) {
            console.error(`Background reconnection attempt for ${this.componentType} failed:`, error);
          }
        }
      }, 60000); // Try every minute
    }
  }

  protected async initializeServiceDiscovery() {
    try {
      const consulUrl = process.env.CONSUL_URL || 'consul:8500';
      this.serviceDiscovery = new ServiceDiscovery(consulUrl);

      // Register this service with Consul
      const serviceUrl = this.url;
      await this.serviceDiscovery.registerService(
        this.id,
        this.componentType,
        serviceUrl,
        [this.componentType.toLowerCase()],
        parseInt(this.port)
      );

      // Set up a health check endpoint if it doesn't exist
      this.setupHealthCheck();

      console.log(`${this.componentType} registered with service discovery`);

      // Set up cleanup on process exit
      process.on('SIGINT', async () => {
        await this.cleanup();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await this.cleanup();
        process.exit(0);
      });
    } catch (error) {
      console.error(`Failed to initialize service discovery for ${this.componentType}:`, error);
      // Continue without service discovery - will fall back to environment variables
    }
  }

  protected setupHealthCheck() {
    // This method should be overridden by subclasses to set up a health check endpoint
    // Default implementation does nothing
  }

  protected async cleanup() {
    try {
      // Deregister from service discovery
      if (this.serviceDiscovery && this.id) {
        await this.serviceDiscovery.deregisterService(this.id);
        console.log(`${this.componentType} deregistered from service discovery`);
      }

      // Close message queue connection
      if (this.mqClient) {
        await this.mqClient.close();
        console.log(`${this.componentType} disconnected from message queue`);
      }
    } catch (error) {
      console.error(`Error during cleanup for ${this.componentType}:`, error);
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
        if (this.mqClient) {
          await this.mqClient.publishMessage('', message.replyTo, response, {
            correlationId: message.correlationId
          });
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
      const response = await axios.get(`http://${this.postOfficeUrl}/ready`, { timeout: 2000 });
      return response.status === 200;
    } catch (error) {
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

  /**
   * Send a message to another component
   * @param type Message type
   * @param recipient Recipient ID
   * @param content Message content
   * @param requiresSync Whether the message requires a synchronous response
   * @returns Promise that resolves when the message is sent, or with the response if sync
   */
  async sendMessage(type: string, recipient: string, content: any, requiresSync: boolean = false): Promise<any> {
    const message = {
      type: type,
      content,
      sender: this.id,
      recipient,
      requiresSync,
      timestamp: new Date().toISOString()
    };

    // Use environment variable for PostOffice URL if available (highest priority)
    const envPostOfficeUrl = process.env.POSTOFFICE_URL;
    let postOfficeUrl = envPostOfficeUrl || this.postOfficeUrl;

    // Try direct HTTP communication first (more reliable)
    try {
      await axios.post(`http://${postOfficeUrl}/message`, message);
      return;
    } catch (directError) {
      console.error(`Failed to send message via direct HTTP to ${postOfficeUrl}:`, directError);
      // Continue with fallback methods
    }

    // If message queue is available, use it as fallback
    if (this.mqClient && this.mqClient.isConnected()) {
      try {
        if (requiresSync) {
          // For synchronous messages, use RPC pattern
          return await this.mqClient.sendRpcRequest('stage7', `message.${recipient}`, message, 30000);
        } else {
          // For asynchronous messages, just publish
          await this.mqClient.publishMessage('stage7', `message.${recipient}`, message);
          return;
        }
      } catch (queueError) {
        console.error(`Failed to send message via queue:`, queueError);
        // Continue with other fallback methods
      }
    }

    // Try to discover PostOffice service via service discovery as last resort
    if (this.serviceDiscovery) {
      try {
        const discoveredUrl = await this.serviceDiscovery.discoverService('PostOffice');
        if (discoveredUrl && discoveredUrl !== postOfficeUrl) {
          console.log(`Discovered PostOffice at ${discoveredUrl}, trying this URL`);
          try {
            await axios.post(`http://${discoveredUrl}/message`, message);
            return;
          } catch (discoveryError) {
            console.error(`Failed to send message via discovered URL ${discoveredUrl}:`, discoveryError);
          }
        }
      } catch (error) {
        console.error('Failed to discover PostOffice service:', error);
      }
    }

    console.error(`All attempts to send message to ${recipient} failed`);
  }

  async say(content: string): Promise<void> {
    await this.sendMessage('say', 'user', content, false);
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
        const response = await axios.get(`http://${this.postOfficeUrl}/getServices`);
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
   * Verify a JWT token using the ServiceTokenManager
   * This is the recommended method for token verification in all services
   * @param req Express request object
   * @param res Express response object
   * @param next Express next function
   */
  public async verifyToken(req: express.Request, res: express.Response, next: express.NextFunction): Promise<any> {` + `
    // Skip authentication for health endpoints
    if (req.path === '/health' || req.path === '/ready') {
      return next();
    }

    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'No Authorization header provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided in Authorization header' });
    }

    try {
      // Verify token using the token manager
      const tokenManager = this.getTokenManager();
      const decoded = await tokenManager.verifyToken(token);

      if (!decoded) {
        return res.status(401).json({ message: 'Invalid token' });
      }

      // Add user info to request
      (req as any).user = decoded;
      return next();
    } catch (error) {
      console.error('Token verification error:', error instanceof Error ? error.message : String(error));
      return res.status(401).json({ message: 'Invalid token' });
    }
  }
}