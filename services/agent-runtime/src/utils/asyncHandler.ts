import { Request, Response, NextFunction } from 'express'

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => void | Promise<void | Response>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
