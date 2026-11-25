import { Request, Response, NextFunction } from 'express';
import { MCPToolDiscoveryRequiredError } from '../types';
import { renderPermissionPrompt } from '../services/ToolPermissionService';
import { ToolNotFoundError, ValidationError, SpendLimitReachedError } from './errors';
import logger from './logger';

/**
 * Terminal error mapping for every tool-executor route. Spend-limit refusals
 * answer HTTP 429 with the Brain's exact contract body (OD-5 finding B) so
 * callers — worker-pool's `executeToolCall` and the frontend's parser — can
 * surface the limit-reached notice instead of a generic failure.
 */
export function toolExecutorErrorMiddleware(err: any, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof SpendLimitReachedError) {
    res.status(429).json(err.payload);
    return;
  }
  if (err instanceof ToolNotFoundError) {
    res.status(404).json({ success: false, error: err.message, statusCode: 404 });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ success: false, error: err.message, statusCode: 400 });
    return;
  }
  if (err instanceof MCPToolDiscoveryRequiredError) {
    res.status(202).json({
      success: false,
      error: err.message,
      permissionRequired: true,
      toolId: err.toolId,
      toolName: err.toolName,
      capability: err.capability,
      request: err.permissionRequest,
      prompt: renderPermissionPrompt(err.permissionRequest),
      candidate: err.candidate,
      statusCode: 202,
    });
    return;
  }
  logger.error({ err: err?.message || String(err) }, 'Unhandled error in tool-executor');
  res.status(500).json({ success: false, error: err?.message || 'Tool Executor Internal server error', statusCode: 500 });
}
