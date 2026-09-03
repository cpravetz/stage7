import { Tool, ToolExecution } from '../types'
import logger from '../utils/logger'

export class ToolExecutor {
  async execute(tool: Tool, input: Record<string, unknown>): Promise<ToolExecution> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const startedAt = new Date()

    logger.info({ executionId, toolId: tool.id, toolName: tool.name }, 'Tool execution started')

    try {
      await this.simulateDelay(tool)

      const output = this.generateMockOutput(tool, input)
      const completedAt = new Date()

      logger.info({ executionId, toolId: tool.id }, 'Tool execution completed')

      return {
        executionId,
        toolId: tool.id,
        input,
        output,
        status: 'completed',
        startedAt,
        completedAt,
      }
    } catch (error) {
      const completedAt = new Date()
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      logger.error({ executionId, toolId: tool.id, error: errorMessage }, 'Tool execution failed')

      return {
        executionId,
        toolId: tool.id,
        input,
        error: errorMessage,
        status: 'failed',
        startedAt,
        completedAt,
      }
    }
  }

  private async simulateDelay(tool: Tool): Promise<void> {
    const delayMap: Record<string, number> = {
      mcp: 100,
      openapi: 200,
      code: 50,
    }
    const delay = delayMap[tool.type] || 100
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  private generateMockOutput(tool: Tool, input: Record<string, unknown>): Record<string, unknown> {
    const mockResponses: Record<string, Record<string, unknown>> = {
      query: { results: ['mock result 1', 'mock result 2'], count: 2 },
      search: { items: [{ id: 1, title: 'Mock Item' }], total: 1 },
      calculate: { result: 42, expression: input.expression || 'unknown' },
      default: { message: `Executed ${tool.name} successfully`, toolId: tool.id },
    }

    const lowerName = tool.name.toLowerCase()
    for (const [key, value] of Object.entries(mockResponses)) {
      if (lowerName.includes(key) && key !== 'default') {
        return value
      }
    }

    return mockResponses.default
  }
}
