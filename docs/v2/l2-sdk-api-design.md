# L2 - Assistant SDK API Design

This document specifies the API design for the "Assistant SDK", the reusable foundation for building collaborative assistants.

## Design Goals

1.  **Simplicity & Intuitiveness:** The SDK should hide the complexity of the core engine. Developers should work with simple, intuitive nouns and verbs (e.g., `Assistant`, `Tool`, `Conversation`, `ask`).
2.  **Extensibility:** It should be easy to add new tools and capabilities. The `Tool` class should be a flexible wrapper for various functions (simple functions, API calls, other agents).
3.  **Testability:** The SDK should be designed to be easily testable, allowing for unit tests of individual assistants and tools without needing the full Core Engine running.
4.  **Async-first:** All interactions that involve the Core Engine or external tools will be asynchronous. The SDK should use Promises and async/await patterns cleanly.

## Core Classes (Initial Proposal)

### `Assistant`

Manages the identity and high-level capabilities of an AI assistant.

```typescript
interface AssistantConfig {
  id: string;
  role: string;
  personality: string; // A prompt-friendly description of the assistant's persona
  tools: Tool[];
}

class Assistant {
  constructor(config: AssistantConfig);
  startConversation(initialPrompt: string): Conversation;
}
```

### `Tool`

A wrapper for a capability that an Assistant can use.

```typescript
interface ToolConfig {
  name: string;
  description: string; // For the LLM to understand what the tool does
  execute: (args: any) => Promise<any>;
}

class Tool {
  constructor(config: ToolConfig);
}
```

### `Conversation`

Manages the state of an interaction between a user and an Assistant.

```typescript
class Conversation {
  on(event: 'message' | 'error' | 'end', handler: (data: any) => void): void;
  sendMessage(prompt: string): Promise<void>;
  getHistory(): Promise<any[]>;
}
```

### `HumanInTheLoop`

A utility for explicitly requesting user input.

```typescript
function ask(question: string, conversation: Conversation): Promise<string>;
function getApproval(prompt: string, conversation: Conversation): Promise<boolean>;
```
