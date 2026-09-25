import { Tool } from '../types'

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map()

  register(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool with id '${tool.id}' is already registered`)
    }

    const lowerOrderToolIds = new Set<string>()
    const lowerOrderToolSources = new Map<string, string>()

    const addLowerOrderTools = (source: Tool): void => {
      const lowerOrderTools = source.manifest?.lowerOrderTools
      if (!Array.isArray(lowerOrderTools)) return

      for (const lowerOrderToolId of lowerOrderTools) {
        if (typeof lowerOrderToolId !== 'string') continue
        lowerOrderToolIds.add(lowerOrderToolId)
        if (!lowerOrderToolSources.has(lowerOrderToolId)) {
          lowerOrderToolSources.set(lowerOrderToolId, source.id)
        }
      }
    }

    this.list().forEach(addLowerOrderTools)
    addLowerOrderTools(tool)

    for (const lowerOrderToolId of lowerOrderToolIds) {
      const candidate = lowerOrderToolId === tool.id
        ? tool
        : this.tools.get(lowerOrderToolId)
      if (candidate?.isSkill !== true) continue

      const referencedBy = lowerOrderToolSources.get(lowerOrderToolId)
      throw new Error(
        `Registration conflict: tool '${lowerOrderToolId}' is declared as a lower-order tool ` +
        `(referenced in ${referencedBy}'s lowerOrderTools) but is also marked isSkill:true. ` +
        `Lower-order tools must be isSkill:false.`
      )
    }

    for (const lowerOrderToolId of lowerOrderToolIds) {
      const registeredTool = this.tools.get(lowerOrderToolId)
      if (registeredTool) registeredTool.isSkill = false
    }
    if (lowerOrderToolIds.has(tool.id)) tool.isSkill = false

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

  getMap(): Map<string, Tool> {
    return this.tools
  }
}
