# L2 - Assistant SDK API Design

This document specifies the API design for the "Assistant SDK", the reusable foundation for building collaborative assistants.

## Design Goals

1.  **Simplicity & Intuitiveness:** The SDK should hide the complexity of the core engine. Developers should work with simple, intuitive nouns and verbs (e.g., `Assistant`, `Tool`, `Conversation`, `ask`).
2.  **Extensibility:** It should be easy to add new tools and capabilities. The `Tool` class should be a flexible wrapper for various functions (simple functions, API calls, other agents).
3.  **Testability:** The SDK should be designed to be easily testable, allowing for unit tests of individual assistants and tools without needing the full Core Engine running.
4.  **Async-first:** All interactions that involve the Core Engine or external tools will be asynchronous. The SDK should use Promises and async/await patterns cleanly.
5.  **Robust Error Handling:** The SDK should provide clear mechanisms for handling errors from the Core Engine and tools, translating them into SDK-level exceptions or events.

## Core Classes

### `Assistant`

Manages the identity, high-level capabilities, and lifecycle of an AI assistant. It acts as the primary interface to start interactions.

```typescript
interface AssistantConfig {
  id: string; // Unique identifier for the assistant instance
  name: string;
  role: string;
  personality: string; // A prompt-friendly description of the assistant's persona for the LLM
  tools: Tool[]; // Tools available to this assistant
  // Internal client to communicate with the Core Engine (e.g., MissionControl, AgentSet)
  // This client will handle translation of SDK calls into L1 plans/steps.
  private coreEngineClient: ICoreEngineClient;
}

class Assistant {
  constructor(config: AssistantConfig);

  /**
   * Starts a new conversation thread with the assistant.
   * @param initialPrompt The user's initial message to start the conversation.
   * @returns A new Conversation instance.
   */
  startConversation(initialPrompt: string): Conversation;

  /**
   * Registers a tool with the assistant, making it available for use by the underlying LLM.
   * This might involve updating the assistant's internal tool registry or sending updates to L1.
   * @param tool The Tool instance to register.
   */
  registerTool(tool: Tool): void;

  /**
   * Retrieves a registered tool by its name.
   * @param toolName The name of the tool.
   * @returns The Tool instance if found, otherwise undefined.
   */
  getTool(toolName: string): Tool | undefined;

  /**
   * Allows the assistant to maintain context across conversation turns or long-running tasks.
   * This might involve internal state management or interaction with L1's knowledge base.
   */
  getContext(): Promise<any>;
  updateContext(newContext: any): Promise<void>;
}
```

### `Tool`

A wrapper for a capability that an `Assistant` can use. It abstracts the underlying `actionVerb` mechanisms of the Core Engine.

```typescript
interface ToolConfig {
  name: string; // Unique name for the tool (used by LLM for function calling)
  description: string; // Detailed description for the LLM on what the tool does and when to use it
  inputSchema: JsonSchema; // JSON schema defining the expected input arguments for the execute method
  outputSchema?: JsonSchema; // Optional JSON schema defining the expected output structure
  // The actual implementation logic for the tool. This will translate to L1 actionVerbs.
  execute: (args: any, conversationId: string) => Promise<any>;
}

class Tool {
  constructor(config: ToolConfig);

  /**
   * Executes the tool's defined action. This method will typically interact with the Core Engine
   * by constructing and dispatching appropriate L1 plans/steps derived from the tool's purpose.
   * @param args The input arguments conforming to the inputSchema.
   * @param conversationId The ID of the conversation context in which the tool is being executed.
   * @returns A Promise resolving with the tool's output, conforming to outputSchema.
   * @throws ToolExecutionError if the tool execution fails in L1.
   */
  execute(args: any, conversationId: string): Promise<any>;
}
```

### `Conversation`

Manages the state and flow of an interaction between a user and an `Assistant` for a specific task or dialogue.

```typescript
type ConversationEvent = 'message' | 'tool_call' | 'tool_output' | 'human_input_required' | 'error' | 'end';

interface ConversationMessage {
  sender: 'user' | 'assistant' | 'tool';
  type: 'text' | 'tool_call' | 'tool_output' | 'human_input_prompt';
  content: string | object; // Text for 'text', ToolCall/ToolOutput object for others
  timestamp: Date;
  metadata?: any;
}

class Conversation {
  readonly id: string; // Unique identifier for this conversation, likely mapping to an L1 Mission/Plan ID
  readonly assistantId: string;

  private coreEngineClient: ICoreEngineClient; // Client for L1 communication

  constructor(id: string, assistantId: string, coreEngineClient: ICoreEngineClient);

  /**
   * Registers an event listener for conversation-related events.
   * Events include: new messages, tool calls, tool outputs, requests for human input, errors, and conversation end.
   * @param event The type of event to listen for.
   * @param handler The callback function to execute when the event occurs.
   */
  on(event: ConversationEvent, handler: (data: any) => void): void;

  /**
   * Sends a message from the user to the assistant, triggering further processing in L1.
   * This will likely translate into creating a new Step in an L1 Plan for the assistant to process.
   * @param prompt The user's message.
   * @throws ConversationError if the message cannot be sent.
   */
  sendMessage(prompt: string): Promise<void>;

  /**
   * Submits a response to a previously requested human input (e.g., from HumanInTheLoop.ask).
   * @param response The user's response.
   * @param inputStepId The ID of the L1 step that requested human input.
   * @throws ConversationError if the response cannot be submitted.
   */
  submitHumanInput(response: string, inputStepId: string): Promise<void>;


  /**
   * Retrieves the full history of the conversation.
   * @returns A Promise resolving to an array of ConversationMessage objects.
   */
  getHistory(): Promise<ConversationMessage[]>;

  /**
   * Ends the current conversation and cleans up associated L1 resources.
   */
  end(): Promise<void>;
}
```

### `HumanInTheLoop`

A utility class providing methods for assistants to explicitly request user input or approval, pausing agent execution until a response is received. These methods will create specific `Steps` in L1 that signal the UI to prompt the user.

```typescript
class HumanInTheLoop {
  /**
   * Prompts the user with a question and waits for a text response.
   * This will trigger an L1 Step that pauses the agent and sends a 'human_input_required' event
   * via the Conversation's event stream.
   * @param conversation The Conversation instance to interact with the user through.
   * @param question The question to ask the user.
   * @param metadata Optional metadata to pass to the UI (e.g., input type, options).
   * @returns A Promise resolving with the user's text response.
   * @throws HumanInputTimeoutError if the user does not respond within a configured time.
   */
  static async ask(conversation: Conversation, question: string, metadata?: any): Promise<string>;

  /**
   * Prompts the user for approval (e.g., yes/no, confirm/deny).
   * Similar to ask, but expects a boolean response.
   * @param conversation The Conversation instance.
   * @param prompt The prompt for approval.
   * @param metadata Optional metadata.
   * @returns A Promise resolving to true if approved, false if denied.
   */
  static async getApproval(conversation: Conversation, prompt: string, metadata?: any): Promise<boolean>;

  /**
   * Prompts the user to select from a list of options.
   * @param conversation The Conversation instance.
   * @param prompt The prompt for selection.
   * @param options A list of strings or objects representing selectable options.
   * @param metadata Optional metadata.
   * @returns A Promise resolving to the user's selected option.
   */
  static async selectOption(conversation: Conversation, prompt: string, options: string[] | object[], metadata?: any): Promise<any>;
}
```