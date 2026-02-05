import { Conversation } from './Conversation';
import { HumanInputTimeoutError, SdkError, ConversationEvent, ConversationMessage } from './types';
import { ICoreEngineClient } from './types';

export class HumanInTheLoop {
  /**
   * A private helper function to handle the common logic for requesting human input.
   */
  private static async requestInput<T>(
    conversation: Conversation,
    inputType: 'ask' | 'getApproval' | 'selectOption',
    prompt: string,
    metadata?: any,
    timeoutMs: number = 300000
  ): Promise<T> {
    return new Promise<T>(async (resolve, reject) => {
      let responseListener: (() => void) | undefined;

      const timeout = setTimeout(() => {
        if (responseListener) {
          responseListener(); // Unsubscribe
        }
        reject(new HumanInputTimeoutError(
          `Human input timed out after ${timeoutMs}ms for conversation ${conversation.id}.`,
          conversation.id,
          '' // Placeholder for stepId
        ));
      }, timeoutMs);

      try {
        const inputStepId = await (conversation as any).coreEngineClient.requestHumanInput(
          conversation.id,
          inputType,
          prompt,
          metadata
        );

        responseListener = conversation.on('message', (event: ConversationEvent, data: ConversationMessage) => {
          if (data.type === 'tool_output' && data.metadata?.inputStepId === inputStepId) {
            clearTimeout(timeout);
            if (responseListener) {
              responseListener(); // Unsubscribe
            }
            if (inputType === 'getApproval') {
              resolve((String(data.content).toLowerCase() === 'true') as T);
            } else {
              resolve(data.content as T);
            }
          }
        });

      } catch (error: any) {
        clearTimeout(timeout);
        if (responseListener) {
          responseListener(); // Unsubscribe
        }
        reject(new SdkError(`Failed to request human input: ${error.message}`));
      }
    });
  }

  /**
   * Prompts the user with a question and waits for a text response.
   */
  static async ask(
    conversation: Conversation,
    question: string,
    metadata?: any,
    timeoutMs?: number
  ): Promise<string> {
    return HumanInTheLoop.requestInput<string>(conversation, 'ask', question, metadata, timeoutMs);
  }

  /**
   * Prompts the user for approval (e.g., yes/no, confirm/deny).
   */
  static async getApproval(
    conversation: Conversation,
    prompt: string,
    metadata?: any,
    timeoutMs?: number
  ): Promise<boolean> {
    return HumanInTheLoop.requestInput<boolean>(conversation, 'getApproval', prompt, { ...metadata, inputType: 'boolean' }, timeoutMs);
  }

  /**
   * Prompts the user to select from a list of options.
   */
  static async selectOption(
    conversation: Conversation,
    prompt: string,
    options: string[] | object[],
    metadata?: any,
    timeoutMs?: number
  ): Promise<any> {
    return HumanInTheLoop.requestInput<any>(conversation, 'selectOption', prompt, { ...metadata, inputType: 'select', options }, timeoutMs);
  }

  /**
   * Simplified version of ask without timeout handling.
   */
  public static async askSimple(conversation: Conversation, question: string, metadata?: any): Promise<string> {
    const coreEngineClient = (conversation as any).coreEngineClient as ICoreEngineClient;
    const stepId = await coreEngineClient.requestHumanInput(conversation.id, 'text', question, metadata);

    return new Promise((resolve, reject) => {
      const unsubscribe = conversation.on('message', (event: ConversationEvent, data: ConversationMessage) => {
        if (data.type === 'tool_output' && data.metadata?.stepId === stepId) {
          unsubscribe();
          resolve(data.content as string);
        }
      });
      // TODO: Add timeout
    });
  }

  /**
   * Simplified version of getApproval without timeout handling.
   */
  public static async getApprovalSimple(conversation: Conversation, prompt: string, metadata?: any): Promise<boolean> {
    const coreEngineClient = (conversation as any).coreEngineClient as ICoreEngineClient;
    const stepId = await coreEngineClient.requestHumanInput(conversation.id, 'approval', prompt, metadata);

    return new Promise((resolve, reject) => {
      const unsubscribe = conversation.on('message', (event: ConversationEvent, data: ConversationMessage) => {
        if (data.type === 'tool_output' && data.metadata?.stepId === stepId) {
          unsubscribe();
          resolve((data.content as string).toLowerCase() === 'true' || (data.content as string).toLowerCase() === 'yes');
        }
      });
      // TODO: Add timeout
    });
  }

  /**
   * Simplified version of selectOption without timeout handling.
   */
  public static async selectOptionSimple(conversation: Conversation, prompt: string, options: string[] | object[], metadata?: any): Promise<any> {
    const coreEngineClient = (conversation as any).coreEngineClient as ICoreEngineClient;
    const augmentedMetadata = { ...metadata, options };
    const stepId = await coreEngineClient.requestHumanInput(conversation.id, 'select', prompt, augmentedMetadata);

    return new Promise((resolve, reject) => {
      const unsubscribe = conversation.on('message', (event: ConversationEvent, data: ConversationMessage) => {
        if (data.type === 'tool_output' && data.metadata?.stepId === stepId) {
          unsubscribe();
          resolve(data.content);
        }
      });
      // TODO: Add timeout
    });
  }
}