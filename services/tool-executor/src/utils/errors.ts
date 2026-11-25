import { NextGenError } from '@stage7-nextgen/shared';

export class ToolNotFoundError extends NextGenError {
  constructor(id: string) {
    super(`Tool not found: ${id}`, 404)
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

export class ValidationError extends NextGenError {
  constructor(message: string) {
    super(message, 400)
    this.name = 'ValidationError'
  }
}
