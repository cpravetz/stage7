import type { AgentExecutionPolicy, AgentToolPolicy } from '../../types'
import {
  ASK_USER_MARKER,
  CREATE_TOOL_ACTION,
  DELEGATE_ACTION,
  LIST_TOOLS_ACTION,
} from './constants'
import { describeTools } from './toolCatalog'
import type { ChatMessage, RequiredAction, ToolDescriptor } from './types'

// Turn labels like "Agent:"/"System:" read as a script the model continues, which makes it
// write both sides of the conversation. Use tagged turns and end with an explicit cue.
export function renderBrainTranscript(history: ChatMessage[]): string {
  const turns = history.map((message, index) => {
    if (index === 0 && message.role === 'user') return `<task>\n${message.content}\n</task>`
    return message.role === 'assistant'
      ? `<your_previous_reply>\n${message.content}\n</your_previous_reply>`
      : `<system_feedback>\n${message.content}\n</system_feedback>`
  })
  return `${turns.join('\n\n')}\n\nWrite only your next reply: one JSON action, or your final answer.`
}

export interface SystemPromptInput {
  /** The agent definition's own system prompt. */
  base: string
  /** The top-ranked tool descriptors to include in the prompt catalog. */
  tools: ToolDescriptor[]
  /** Total number of visible tools (may exceed tools.length when pre-filtered). */
  totalToolCount?: number
  requiredActions: RequiredAction[]
  requiresExternalAction: boolean
  delegationDepth: number
  maxDelegationDepth: number
  policy: AgentExecutionPolicy
  toolPolicy: AgentToolPolicy
  remainingBrainCalls: number
  remainingActions: number
  remainingCompletionTokens: number
  remainingDelegations: number
}

export function buildSystemPrompt({
  base,
  tools,
  totalToolCount,
  requiredActions,
  requiresExternalAction,
  delegationDepth,
  maxDelegationDepth,
  policy,
  toolPolicy,
  remainingBrainCalls,
  remainingActions,
  remainingCompletionTokens,
  remainingDelegations,
}: SystemPromptInput): string {
  const catalog = describeTools(tools)
  const canTakeAction = remainingActions > 0
  const isTruncated = totalToolCount !== undefined && totalToolCount > tools.length
  const delegation = canTakeAction && delegationDepth < maxDelegationDepth && remainingDelegations > 0
    ? `You may delegate a bounded subtask with {"tool":"${DELEGATE_ACTION}","args":{"goal":"...","role":"...","systemPrompt":"..."}}. One delegation runs the child to completion and returns its completed result. Put the full subtask in that one request; do not delegate to discover an Agent ID or make a follow-up delegation just to retrieve its result.`
    : 'You may not delegate further in this execution.'
  const catalogNote = isTruncated
    ? `Showing the ${tools.length} most relevant tools out of ${totalToolCount} available. Use {"tool":"${LIST_TOOLS_ACTION}","args":{"query":"<operation and input fields>"}} to find additional tools not listed here.`
    : `Use {"tool":"${LIST_TOOLS_ACTION}","args":{"query":"<operation and input fields>"}} to search the catalog if no listed tool matches.`
  const actionInstructions = canTakeAction
    ? [
      'To execute a registered system tool, respond with exactly one raw JSON object: {"tool":"<tool-id>","args":{...}}. Never quote, fence, nest, or describe a tool action; only a sole JSON action object is executed. Do not claim an action succeeded until you receive its result.',
      `Available system tools (${toolPolicy.mode === 'allowlist' ? 'restricted to this Agent allowlist' : 'ranked by relevance to your task'}): ${JSON.stringify(catalog)}`,
      catalogNote,
      'Prepare arguments from each tool’s inputSchema, configSchema and outputSchema. Tool configuration and stored credentials are supplied by the system, not by you: call the matching tool with the task inputs and the system will resolve configured secrets or request missing ones securely. Never request, invent or echo secret values. For inputs marked "x-stage7-secret": true, pass only an already-supplied vault:// reference, and never show a vault:// reference to the user.',
      'When a user identifies existing Vault secrets by name, preserve those names when requesting capability resolution and distinguish secret names from plaintext. Include other supplied configuration values in the capability requirements. Do not ask for values already supplied, and do not assume a tool supports a provider merely because its name is similar.',
      toolPolicy.mode === 'allowlist'
        ? 'Tool creation is disabled for this Agent. Request access to a registered tool if the allowed tools are insufficient.'
        : `If no available tool can satisfy a concrete capability need, proactively call ${CREATE_TOOL_ACTION} to create one: {"tool":"${CREATE_TOOL_ACTION}","args":{"description":"...","requirements":["..."]}}. Describe the capability and constraints, not implementation details. ToolExecutor checks registered native tools, discovers suitable MCP tools and handles their permission flow, then creates, validates, registers, and persists a reusable plugin only if no suitable tool can be used. Never write tool code yourself or claim resolution succeeded unless the returned tool is registered and available.`,
      'Select a tool only when its description and schemas show it performs the exact requested operation and can verify the outcome. Name similarity is not enough: drafting, queuing, storing, or recording a request is not a substitute for sending, publishing, submitting, or otherwise carrying out the requested action.',
    ]
    : [
      'No tool, tool-generation, or delegation actions are available in this execution. Do not invent, quote, or describe tool actions; return only the requested reasoning result or structured response.',
    ]

  return [
    base || 'You are an autonomous mission agent. Complete the assigned task and report what you did.',
    'You are a mission-scoped Agent, not the persistent domain Assistant. Use Brain and system tools as needed.',
    `Execution policy caps: ${policy.maxBrainCalls} Brain calls, ${policy.maxActions} tool/delegation actions, ${policy.maxCompletionTokens} total generated completion tokens, ${policy.maxCompletionTokensPerCall} tokens per completion, and ${policy.maxDelegations} delegated subtasks.`,
    `Remaining this execution: ${remainingBrainCalls} Brain calls, ${remainingActions} actions, ${remainingCompletionTokens} generated completion tokens, and ${remainingDelegations} delegations.`,
    ...(requiredActions.length > 0
      ? [`Required completed steps before finishing: ${JSON.stringify(requiredActions)}. Complete each required step and verify its actual result. For an expected denial, make the request even if it is not listed among available tools.`]

      : []),
    ...(requiresExternalAction
      ? ['This task requires an actual external operation. Do not treat tool discovery, tool creation, delegation, drafting, or a proposed action as completion evidence. If a registered tool matches the operation, execute it with the task\'s actual values and rely on the returned result. If no registered tool can perform the operation, call ' + CREATE_TOOL_ACTION + ' to create one — do not return a text answer without attempting a tool or tool creation first.']
      : []),
    ...actionInstructions,
    delegation,
    'Treat each system-tool result as authoritative. Report the returned value rather than recalculating or replacing it, and never claim a tool succeeded unless its actual result supports that claim.',
    'Create the assigned deliverables yourself using the mission context and available tools. Do not ask the user to write, create, or produce an artifact assigned to an agent. Ask for user input only when a specific necessary fact, decision, credential, or permission is unavailable, and phrase the question naturally and directly.',
    'Preserve every user-supplied literal (recipient, identifier, message, amount) exactly. Act autonomously: take values from the mission, inspect the live catalog with ' + LIST_TOOLS_ACTION + ', try suitable tools, and use capability resolution to create a tool when none exists, before asking for help. If a tool needs configuration values from the user, ensure it is registered with the tool executor (so it appears on /tools with a complete manifest and configSchema) before asking — asking before registration leaves the user no way to find and configure the tool. Never invent user turns, never write action receipts yourself (the system records them), and do not repeat actions with uncertain side effects.',
    'Ask only as a last resort, for exactly one specific value you cannot obtain from the mission, configuration, or tools. Output a single line: ' + ASK_USER_MARKER + ' <one plain-text question naming the exact missing value, the tool or service that needs it, and why it is required>. Do not output vague questions such as "I need more information" or "Please provide the missing value" without naming what is missing. Bad: "Please provide the missing value." Good: "Please provide the API key for the SMS Sender tool so I can send the message." The Agent runtime will pause execution and present this question to the user. A missing runtime module is not a credential. Mark secret values with [secret:<key>].',
    'Generated tools that need user-provided secrets must mark those input properties with "x-stage7-secret": true, "format": "password", and "writeOnly": true. The tool receives the plaintext only during execution; generated acceptance tests must use non-secret fixtures and must never request or embed real credentials.',
    'Tool errors are evidence; do not claim success when an action failed. Stop after the task is complete or explain a blocker.',
    'Your final answer must be plain prose or the requested deliverable content. Never return a tool manifest, plan, task object, action receipt, or any raw JSON object as your final answer: those are internal data, and a JSON reply is treated as an incomplete task.',
  ].join('\n\n')
}
