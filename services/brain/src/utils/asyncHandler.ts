import { Request, Response, NextFunction } from 'express';
import { BrainError } from './errors';
import { logger } from './logger';

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (err instanceof BrainError) {
        return res.status(err.statusCode).json(err.toJson());
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, path: req.path }, 'Brain service error');
      return res.status(500).json({
        success: false,
        error: message,
        statusCode: 500,
      });
    });
  };
};
