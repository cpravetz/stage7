import { logger } from '@stage7-nextgen/shared';

export interface Message {
  id: string;
  recipient: string;
  type: string;
  payload: any;
  timestamp: number;
}

export class MessageRouter {
  private routes: Map<string, string> = new Map();

  registerRoute(recipient: string, serviceId: string): void {
    this.routes.set(recipient, serviceId);
    logger.debug({ recipient, serviceId }, 'Route registered');
  }

  route(message: Message): string | null {
    const serviceId = this.routes.get(message.recipient);
    if (serviceId) {
      logger.debug({ messageId: message.id, serviceId }, 'Message routed');
    }
    return serviceId || null;
  }

  removeRoute(recipient: string): boolean {
    const existed = this.routes.delete(recipient);
    if (existed) {
      logger.debug({ recipient }, 'Route removed');
    }
    return existed;
  }
}
