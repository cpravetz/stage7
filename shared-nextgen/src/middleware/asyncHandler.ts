import { Request, Response, NextFunction } from 'express';
import { NextGenError } from '../errors';
import { logger } from '../utils/logger';

const production = (): boolean => process.env.NODE_ENV === 'production';

/**
 * Wraps an async route handler so a rejected promise becomes a response instead
 * of an unhandled rejection. The failure is always logged with its request
 * context; the response keeps the real message outside production so an opaque
 * 500 can never hide the actual cause.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      const params = (req.params || {}) as Record<string, unknown>;
      const context = {
        method: req.method,
        path: req.originalUrl || req.url,
        ...(params.missionId ? { missionId: params.missionId } : {}),
      };
      const status = err instanceof NextGenError
        ? err.statusCode
        : (err as { statusCode?: unknown } | null)?.statusCode;
      const expectedFailure = typeof status === 'number' && status < 500;
      if (expectedFailure) {
        // An expected client error is not a server fault; keep it out of the
        // error log without hiding the request that produced it.
        logger.warn({ ...context, statusCode: status, err: error.message }, 'Request rejected');
      } else {
        logger.error({ ...context, err: error.message, stack: error.stack }, 'Unhandled request error');
      }

      if (res.headersSent) {
        // The response is already on the wire; only Express can finish it.
        next(error);
        return;
      }
      if (err instanceof NextGenError) {
        res.status(err.statusCode).json(err.toJson());
        return;
      }
      if (typeof status === 'number' && status >= 400 && status < 600) {
        // Errors from libraries and services often carry their own HTTP status;
        // honouring it keeps a bad request from being reported as a server bug.
        res.status(status).json({
          success: false,
          error: error.message,
          statusCode: status,
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: production() ? 'Middleware Internal server error' : (error.message || 'Internal server error'),
        statusCode: 500,
      });
    });
  };
};