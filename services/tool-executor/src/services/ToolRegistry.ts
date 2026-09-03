import { Tool } from '../types'

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map()

  register(tool: Tool): void {
    this.tools.set(tool.id, tool)
  }

  unregister(id: string): boolean {
    return this.tools.delete(id)
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id)
  }

  list(): Tool[] {
    return Array.from(this.tools.values())
  }

  findByType(type: string): Tool[] {
    return this.list().filter((tool) => tool.type === type)
  }
}
