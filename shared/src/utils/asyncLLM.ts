import { v4 as uuidv4 } from 'uuid';
import { MessageQueueClient } from '../messaging/queueClient';
import { MessageType } from '../types/Message';

/**
 * Utility class for making asynchronous LLM requests via the message queue
 */
export class AsyncLLM {
  private mqClient: MessageQueueClient;
  private responsePromises: Map<string, { 
    resolve: (value: any) => void, 
    reject: (reason: any) => void,
    timeout: NodeJS.Timeout
  }> = new Map();
  
  constructor(rabbitmqUrl?: string) {
    this.mqClient = new MessageQueueClient(rabbitmqUrl);
    this.initialize();
  }
  
  private async initialize() {
    try {
      await this.mqClient.connect();
      
      // Create a queue for responses
      const queueName = `llm-responses-${uuidv4().substring(0, 8)}`;
      await this.mqClient.subscribeToQueue(queueName, async (message) => {
        await this.handleResponse(message);
      });
      
      // Bind the queue to the exchange with appropriate routing pattern
      await this.mqClient.bindQueueToExchange(queueName, 'stage7', `message.${queueName}`);
      
      console.log('AsyncLLM initialized and connected to message queue');
    } catch (error) {
      console.error('Failed to initialize AsyncLLM:', error);
    }
  }
  
  /**
   * Send a chat request to the Brain service via the message queue
   * @param exchanges The conversation exchanges
   * @param optimization The optimization strategy
   * @param optionals Optional parameters
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise that resolves with the LLM response
   */
  async chat(
    exchanges: Array<{ role: string, content: string }>,
    optimization: string = 'accuracy',
    optionals: Record<string, any> = {},
    timeoutMs: number = 30000
  ): Promise<{ response: string, mimeType: string }> {
    const requestId = uuidv4();
    const responseQueueName = `llm-responses-${uuidv4().substring(0, 8)}`;
    
    return new Promise(async (resolve, reject) => {
      try {
        // Set up timeout
        const timeout = setTimeout(() => {
          const handler = this.responsePromises.get(requestId);
          if (handler) {
            this.responsePromises.delete(requestId);
            reject(new Error(`LLM request timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);
        
        // Store the promise handlers
        this.responsePromises.set(requestId, { resolve, reject, timeout });
        
        // Send the request via message queue
        await this.mqClient.publishMessage('stage7', 'message.Brain', {
          type: MessageType.CHAT_REQUEST,
          sender: responseQueueName,
          recipient: 'Brain',
          content: {
            requestId,
            exchanges,
            optimization,
            optionals
          },
          requiresSync: false,
          timestamp: new Date().toISOString()
        });
        
        console.log(`Sent async LLM chat request with ID ${requestId}`);
      } catch (error) {
        // Clean up and reject on error
        const handler = this.responsePromises.get(requestId);
        if (handler) {
          clearTimeout(handler.timeout);
          this.responsePromises.delete(requestId);
        }
        reject(error);
      }
    });
  }
  
  /**
   * Handle responses from the Brain service
   */
  private async handleResponse(message: any) {
    if (message.type !== MessageType.CHAT_RESPONSE) {
      console.log('Received non-chat response message:', message);
      return;
    }
    
    const { requestId, response, mimeType, error } = message.content;
    const handler = this.responsePromises.get(requestId);
    
    if (!handler) {
      console.log(`No handler found for request ID ${requestId}`);
      return;
    }
    
    // Clear the timeout and remove the promise handlers
    clearTimeout(handler.timeout);
    this.responsePromises.delete(requestId);
    
    if (error) {
      handler.reject(new Error(error));
    } else {
      handler.resolve({ response, mimeType });
    }
  }
}
