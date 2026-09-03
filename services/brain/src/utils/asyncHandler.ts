import { Request, Response, NextFunction } from 'express';
import { BrainError } from './errors';

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (err instanceof BrainError) {
        return res.status(err.statusCode).json(err.toJson());
      }
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        statusCode: 500,
      });
    });
  };
};
