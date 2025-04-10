import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import { MessageType } from './types/Message';
import { AuthenticatedApiClient } from './AuthenticatedApiClient';
import { MessageQueueClient } from './messaging/queueClient';
import { ServiceDiscovery } from './discovery/serviceDiscovery';

export class BaseEntity {
  id: string;
  componentType: string;
  postOfficeUrl: string;
  url: string;
  questions: string[] = [];
  port : string;
  registeredWithPostOffice: boolean = false;
  lastAnswer: string = '';
  authenticatedApi: AuthenticatedApiClient;
  protected mqClient: MessageQueueClient | null = null;
  protected serviceDiscovery: ServiceDiscovery | null = null;

  constructor(id: string, componentType: string, urlBase: string, port: string) {
    this.id = id;
    this.componentType = componentType;
    this.postOfficeUrl = process.env.POSTOFFICE_URL || 'postoffice:5020'
    this.port = port;
    this.url = `${urlBase}:${port}` //url;
    this.authenticatedApi = new AuthenticatedApiClient(this);

    // Initialize services
    this.initializeMessageQueue();
    this.initializeServiceDiscovery();

    // Register with service registry and PostOffice
    this.registerWithPostOffice();
  }

  protected async initializeMessageQueue() {
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
    } catch (error) {
      console.error(`Failed to initialize message queue for ${this.componentType}:`, error);
      // Continue without message queue - will fall back to HTTP
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
      if (this.serviceDiscovery) {
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

  protected async handleQueueMessage(message: any) {
    console.log(`${this.componentType} received message from queue:`, message);

    // Process the message using the same handler as HTTP messages
    await this.handleBaseMessage(message);

    // Subclasses should override handleBaseMessage or implement their own message handling
  }

  protected async registerWithPostOffice(retryCount: number = 10) {
    const register = async () => {
      try {
        const response = await this.authenticatedApi.post(`http://${this.postOfficeUrl}/registerComponent`, {
          id: this.id,
          type: this.componentType,
          url: this.url
        });
        if (response.status === 200) {
          console.log(`${this.componentType} registered successfully with PostOffice`);
          this.registeredWithPostOffice = true;
        }
      } catch (error) {
        console.error(`Failed to register ${this.componentType} with PostOffice:`, error);
        throw error;
      }
    };

    await register();
  }

  async sendMessage(type: string, recipient: string, content: any, requiresSync: boolean = false): Promise<void> {
    const message = {
      type: type,
      content,
      sender: this.id,
      recipient,
      requiresSync,
      timestamp: new Date().toISOString()
    };

    // If message queue is available and message doesn't require sync, use it
    if (this.mqClient && !requiresSync) {
      try {
        await this.mqClient.publishMessage('stage7', `message.${recipient}`, message);
        return;
      } catch (error) {
        console.error(`Failed to send message via queue, falling back to HTTP:`, error);
        // Fall back to HTTP if queue fails
      }
    }

    // Try to discover PostOffice service via service discovery
    let postOfficeUrl = this.postOfficeUrl;
    if (this.serviceDiscovery) {
      try {
        const discoveredUrl = await this.serviceDiscovery.discoverService('PostOffice');
        if (discoveredUrl) {
          postOfficeUrl = discoveredUrl;
        }
      } catch (error) {
        console.error('Failed to discover PostOffice service, using default URL:', error);
        // Continue with default URL
      }
    }

    // Fall back to HTTP
    try {
      await axios.post(`http://${postOfficeUrl}/message`, message);
    } catch (error) {
      console.error(`Failed to send message to ${recipient} via ${postOfficeUrl}:`, error);

      // If service discovery failed, try with the default URL as a last resort
      if (postOfficeUrl !== this.postOfficeUrl) {
        try {
          await axios.post(`http://${this.postOfficeUrl}/message`, message);
        } catch (fallbackError) {
          console.error(`Failed to send message to ${recipient} via fallback URL:`, fallbackError);
        }
      }
    }
  }

  async say(content: string): Promise<void> {
    await this.sendMessage('say', 'user', content, false);
  }

  async handleBaseMessage(message: any): Promise<void> {
    // Log the message receipt
    console.log(`${this.componentType} handling message of type ${message.type} from ${message.sender}`);

    // Handle different message types
    switch (message.type) {
      case MessageType.ANSWER:
        if (this.onAnswer) {
          this.onAnswer(message.answer);
        }
        break;

      case MessageType.REQUEST:
        // Handle requests - subclasses should override for specific handling
        console.log(`${this.componentType} received request: ${JSON.stringify(message.content)}`);
        break;

      case MessageType.RESPONSE:
        // Handle responses - subclasses should override for specific handling
        console.log(`${this.componentType} received response: ${JSON.stringify(message.content)}`);
        break;

      case MessageType.STATUS_UPDATE:
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
      await this.sendMessage(MessageType.REQUEST, 'user', {
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
}