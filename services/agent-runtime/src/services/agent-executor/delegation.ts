import type { AgentExecutionContext, ToolResult } from './types'

/** Runs a bounded subtask through the host-provided delegate, returning the child's completed result. */
export async function delegateSubtask(
  args: Record<string, unknown>,
  context: AgentExecutionContext,
): Promise<ToolResult> {
  if (!context.delegate) return { isError: true, content: 'Delegation is not available in this execution context.' }
  const goal = typeof args.goal === 'string' ? args.goal.trim() : ''
  if (!goal) return { isError: true, content: 'Delegation requires a non-empty goal.' }
  try {
    const result = await context.delegate({
      goal,
      ...(typeof args.role === 'string' ? { role: args.role } : {}),
      ...(typeof args.systemPrompt === 'string' ? { systemPrompt: args.systemPrompt } : {}),
    })
    return { isError: false, content: JSON.stringify(result) }
  } catch (error) {
    return { isError: true, content: error instanceof Error ? error.message : String(error) }
  }
}
