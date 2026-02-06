import { Request, Response, NextFunction, Application } from 'express';
import { Assistant } from './Assistant';
import { MessageParser } from './parser/MessageParser';

/**
 * Adds standardized middleware to all assistant APIs:
 * - Message parsing (converts natural language to structured tool calls)
 * - Request logging with assistant context
 * - Response headers
 * - Error handling
 * 
 * This eliminates the need for each assistant to implement its own middleware.
 */
export function addStandardMiddleware(
  app: Application,
  assistant: Assistant,
  messageParser: MessageParser
): void {
  // Message parsing middleware - converts text to structured payloads
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.body && req.body.message && typeof req.body.message === 'string') {
      try {
        const parsed = messageParser.parse(req.body.message);
        req.body.parsedMessage = parsed;
        console.log(
          `[${assistant.id}] Parsed message: action=${parsed.action}, tool=${parsed.toolName}, confidence=${parsed.confidence}`
        );
      } catch (error) {
        console.warn(`[${assistant.id}] Message parsing warning: ${error}`);
        // Continue without parsed message on failure - fallback to string processing
      }
    }
    next();
  });

  // Request logging and response headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[${assistant.id}] ${req.method} ${req.path}`);
    res.setHeader('X-Assistant-Name', assistant.name);
    res.setHeader('X-Assistant-ID', assistant.id);
    res.setHeader('X-Stage7-Version', '7.0');
    next();
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(`[${assistant.id}] Unhandled error:`, err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
      timestamp: new Date().toISOString(),
      assistantId: assistant.id,
      conversationId: req.params.id
    });
  });
}
