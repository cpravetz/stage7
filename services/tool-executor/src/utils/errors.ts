export class ToolNotFoundError extends Error {
  constructor(id: string) {
    super(`Tool not found: ${id}`)
    this.name = 'ToolNotFoundError'
  }
}

export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolExecutionError'
  }
}

export class PluginGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginGenerationError'
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}
