import { ICoreEngineClient, ConversationEvent, ConversationMessage, ConversationError, ScheduledContent, ApprovalRequest } from './types';

type EventHandler = (event: ConversationEvent, data: any) => void;

export class Conversation {
  public readonly id: string; // Maps to L1 Mission ID
  public readonly assistantId: string;
  public readonly isSimple: boolean; // Flag to indicate if this is a simple, non-agentic conversation
  private coreEngineClient: ICoreEngineClient;
  private eventHandlers: Map<ConversationEvent, EventHandler[]>;
  private unsubscribeFromL1Events: (() => void) | null = null; // Function to clean up L1 event listener
  public scheduledContent: ScheduledContent[] = []; // New property for scheduled content
  public approvalRequests: ApprovalRequest[] = []; // New property for approval requests
  private messages: ConversationMessage[] = []; // NEW: Internal storage for messages

  constructor(id: string, assistantId: string, coreEngineClient: ICoreEngineClient, isSimple: boolean = false, initialMessages: ConversationMessage[] = []) { // MODIFIED: Added initialMessages
    this.id = id;
    this.assistantId = assistantId;
    this.coreEngineClient = coreEngineClient;
    this.eventHandlers = new Map();
    this.isSimple = isSimple;
    this.messages = initialMessages; // Store initial messages

    if (!isSimple) {
      // Start listening to events from L1 for this mission only if it's not a simple conversation
      this.unsubscribeFromL1Events = this.coreEngineClient.onMissionEvent(this.id, (event, data) => {
        this.emit(event, data);
      });
    }
  }

  /**
   * Returns the internal message history for this conversation.
   * For simple conversations, this is the complete history.
   * For agentic missions, this may only reflect events seen by the SDK.
   */
  public getMessages(): ConversationMessage[] { // NEW method
    return this.messages;
  }

  /**
   * Returns a mutable reference to the internal message history for this conversation.
   * This is intended for use by the Assistant to directly manage the history array
   * for simple conversations to ensure synchronization.
   */
  public getMutableMessages(): ConversationMessage[] {
    return this.messages;
  }

  /**
   * Registers an event listener for conversation-related events.
   * Events include: new messages, tool calls, tool outputs, requests for human input, errors, and conversation end.
   * @param event The type of event to listen for.
   * @param handler The callback function to execute when the event occurs.
   * @returns A function to unsubscribe the handler.
   */
  public on(event: ConversationEvent, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);

    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        this.eventHandlers.set(event, handlers.filter(h => h !== handler));
      }
    };
  }

  private emit(event: ConversationEvent, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(event, data)); // Pass both event and data for more context
    }
  }

  /**
   * Adds a message to the local conversation history and emits it.
   * This is the public method the Assistant class should use to interact with
   * a Conversation object's local message state and notify listeners.
   * @param message The message to add and emit.
   */
  public addAndEmitMessage(message: ConversationMessage): void {
    this.messages.push(message);
    this.emit('message', message);
  }

  /**
   * Sends a message from the user to the assistant, triggering further processing in L1.
   * This method should ONLY be called for agentic (non-simple) conversations.
   * For simple conversations, messages are handled locally by the Assistant class
   * using `addAndEmitMessage` and direct Brain calls.
   * @param prompt The user's message.
   * @throws ConversationError if the message cannot be sent or if called for a simple conversation.
   */
  public async sendMessage(prompt: string): Promise<void> {
    if (this.isSimple) {
      throw new ConversationError(`sendMessage cannot be called on a simple conversation. Use Assistant.sendMessageToConversation.`, this.id);
    }
    try {
      // For agentic conversations, add user message and emit it before sending to MissionControl
      this.addAndEmitMessage({ sender: 'user', type: 'text', content: prompt, timestamp: new Date() });
      
      await this.coreEngineClient.sendMessageToMission(this.id, prompt);
    } catch (error: any) {
      throw new ConversationError(`Failed to send message to conversation ${this.id}: ${error.message}`, this.id, error);
    }
  }

  /**
   * Submits a response to a previously requested human input (e.g., from HumanInTheLoop.ask).
   * @param response The user's response.
   * @param inputStepId The ID of the L1 step that requested human input.
   * @throws ConversationError if the response cannot be submitted.
   */
  public async submitHumanInput(response: string, inputStepId: string): Promise<void> {
    try {
      await this.coreEngineClient.submitHumanInputToMission(this.id, inputStepId, response);
      // Optionally emit an event indicating human input was submitted
      this.emit('message', { sender: 'user', type: 'text', content: `Human input provided for step ${inputStepId}: ${response}`, timestamp: new Date() });
    } catch (error: any) {
      throw new ConversationError(`Failed to submit human input for conversation ${this.id}, step ${inputStepId}: ${error.message}`, this.id, error);
    }
  }

  /**
   * Retrieves the full history of the conversation.
   * @returns A Promise resolving to an array of ConversationMessage objects.
   */
  public async getHistory(): Promise<ConversationMessage[]> {
    if (this.isSimple) { // MODIFIED: For simple conversations, return internal messages
        return this.messages;
    }
    try {
      return await this.coreEngineClient.getMissionHistory(this.id);
    } catch (error: any) {
      throw new ConversationError(`Failed to retrieve conversation history for ${this.id}: ${error.message}`, this.id, error);
    }
  }

  /**
   * Ends the current conversation and cleans up associated L1 resources.
   */
  public async end(): Promise<void> {
    try {
      if (this.unsubscribeFromL1Events) {
        this.unsubscribeFromL1Events();
        this.unsubscribeFromL1Events = null;
      }
      await this.coreEngineClient.endMission(this.id);
      this.emit('end', { conversationId: this.id });
    } catch (error: any) {
      throw new ConversationError(`Failed to end conversation ${this.id}: ${error.message}`, this.id, error);
    }
  }

  /**
   * Simplified version of sendMessage without context handling.
   */
  public async sendMessageSimple(prompt: string): Promise<void> {
    await this.coreEngineClient.sendMessageToMission(this.id, prompt);
  }

  /**
   * Simplified version of submitHumanInput without context handling.
   */
  public async submitHumanInputSimple(response: string, inputStepId: string): Promise<void> {
    await this.coreEngineClient.submitHumanInputToMission(this.id, inputStepId, response);
  }

  /**
   * Simplified version of getHistory without context handling.
   */
  public async getHistorySimple(): Promise<ConversationMessage[]> {
    return this.coreEngineClient.getMissionHistory(this.id);
  }

  /**
   * Simplified version of end without context handling.
   */
  public async endSimple(): Promise<void> {
    await this.coreEngineClient.endMission(this.id);
  }
}