import { Request, Response, NextFunction, RequestHandler } from 'express';

// Define a type that extends RequestHandler to allow returning Response
export interface AsyncRequestHandler extends RequestHandler {
  (req: Request, res: Response, next: NextFunction): Promise<void | Response> | void;
}

declare global {
  namespace Express {
    interface Request {
      user?: import('../models/User').User;
      accessToken?: string;
    }
  }
}
