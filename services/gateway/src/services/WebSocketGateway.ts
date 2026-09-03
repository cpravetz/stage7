import { Server as WebSocketServer, WebSocket } from 'ws';
import { logger } from '@stage7-nextgen/shared';

interface ClientInfo {
  clientId: string;
  subscriptions: Set<string>;
  socket: WebSocket;
}

type WSMessage =
  | { type: 'subscribe'; missionId: string }
  | { type: 'unsubscribe'; missionId: string }
  | { type: 'subscribe-all' }
  | { type: string; [key: string]: unknown };

export class WebSocketGateway {
  private server: WebSocketServer;
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private missionSubscribers: Map<string, Set<WebSocket>> = new Map();

  constructor(server: any, path: string) {
    this.server = new WebSocketServer({ server, path });
  }

  start(): void {
    this.server.on('connection', (socket: WebSocket) => {
      const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const clientInfo: ClientInfo = {
        clientId,
        subscriptions: new Set<string>(),
        socket,
      };

      this.clients.set(socket, clientInfo);
      logger.info({ clientId }, 'WebSocket client connected');

      this.sendToSocket(socket, { type: 'welcome', clientId });

      socket.on('message', (raw: Buffer) => {
        let parsed: WSMessage;
        try {
          parsed = JSON.parse(raw.toString()) as WSMessage;
        } catch (err) {
          logger.warn({ clientId, err }, 'Invalid JSON message received');
          return;
        }

        this.handleMessage(clientInfo, parsed);
      });

      socket.on('close', () => {
        this.removeClient(socket);
        logger.info({ clientId }, 'WebSocket client disconnected');
      });

      socket.on('error', (error: Error) => {
        logger.error({ clientId, error }, 'WebSocket client error');
      });
    });

    logger.info('WebSocket gateway started on /ws');
  }

  stop(): void {
    this.clients.forEach((_, socket) => {
      try {
        socket.close();
      } catch {
        // ignore close errors
      }
    });
    this.clients.clear();
    this.missionSubscribers.clear();
    this.server.close();
    logger.info('WebSocket gateway stopped');
  }

  broadcast(data: unknown): void {
    const payload = this.ensureTimestamp(data);
    const message = JSON.stringify(payload);
    this.clients.forEach((_, socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    });
  }

  broadcastToMission(missionId: string, data: unknown): void {
    const payload = this.ensureTimestamp(data);
    const message = JSON.stringify(payload);
    const subscribers = this.missionSubscribers.get(missionId);

    this.clients.forEach((clientInfo, socket) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const isSubscribedToMission = subscribers?.has(socket) ?? false;
      const isSubscribedToAll = clientInfo.subscriptions.has('*');
      if (isSubscribedToMission || isSubscribedToAll) {
        socket.send(message);
      }
    });
  }

  sendToClient(clientId: string, data: unknown): boolean {
    const payload = this.ensureTimestamp(data);
    const message = JSON.stringify(payload);
    let delivered = false;
    this.clients.forEach((clientInfo, socket) => {
      if (clientInfo.clientId === clientId && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
        delivered = true;
      }
    });
    return delivered;
  }

  private ensureTimestamp(data: unknown): Record<string, unknown> {
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (obj.timestamp === undefined || obj.timestamp === null) {
        return { ...obj, timestamp: Date.now() };
      }
      return obj;
    }
    return { type: 'message', data, timestamp: Date.now() };
  }

  getConnectedCount(): number {
    return this.clients.size;
  }

  getSubscribers(missionId: string): string[] {
    const subscribers = this.missionSubscribers.get(missionId);
    if (!subscribers) {
      return [];
    }
    const ids: string[] = [];
    subscribers.forEach((socket) => {
      const info = this.clients.get(socket);
      if (info) {
        ids.push(info.clientId);
      }
    });
    return ids;
  }

  private handleMessage(clientInfo: ClientInfo, message: WSMessage): void {
    switch (message.type) {
      case 'subscribe': {
        const { missionId } = message;
        if (typeof missionId !== 'string' || missionId.length === 0) {
          this.sendToSocket(clientInfo.socket, {
            type: 'error',
            error: 'missionId is required for subscribe',
          });
          return;
        }
        clientInfo.subscriptions.add(missionId);
        let set = this.missionSubscribers.get(missionId);
        if (!set) {
          set = new Set<WebSocket>();
          this.missionSubscribers.set(missionId, set);
        }
        set.add(clientInfo.socket);
        logger.debug(
          { clientId: clientInfo.clientId, missionId },
          'Client subscribed to mission',
        );
        this.sendToSocket(clientInfo.socket, { type: 'subscribed', missionId });
        return;
      }
      case 'unsubscribe': {
        const { missionId } = message;
        if (typeof missionId !== 'string' || missionId.length === 0) {
          this.sendToSocket(clientInfo.socket, {
            type: 'error',
            error: 'missionId is required for unsubscribe',
          });
          return;
        }
        clientInfo.subscriptions.delete(missionId);
        const set = this.missionSubscribers.get(missionId);
        if (set) {
          set.delete(clientInfo.socket);
          if (set.size === 0) {
            this.missionSubscribers.delete(missionId);
          }
        }
        logger.debug(
          { clientId: clientInfo.clientId, missionId },
          'Client unsubscribed from mission',
        );
        this.sendToSocket(clientInfo.socket, { type: 'unsubscribed', missionId });
        return;
      }
      case 'subscribe-all': {
        clientInfo.subscriptions.add('*');
        logger.debug({ clientId: clientInfo.clientId }, 'Client subscribed to all');
        this.sendToSocket(clientInfo.socket, { type: 'subscribed-all' });
        return;
      }
      default:
        logger.debug(
          { clientId: clientInfo.clientId, message },
          'Unhandled WS message type',
        );
        return;
    }
  }

  private sendToSocket(socket: WebSocket, data: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
      const payload = this.ensureTimestamp(data);
      socket.send(JSON.stringify(payload));
    }
  }

  private removeClient(socket: WebSocket): void {
    const clientInfo = this.clients.get(socket);
    if (!clientInfo) {
      return;
    }
    clientInfo.subscriptions.forEach((missionId) => {
      const set = this.missionSubscribers.get(missionId);
      if (set) {
        set.delete(socket);
        if (set.size === 0) {
          this.missionSubscribers.delete(missionId);
        }
      }
    });
    this.clients.delete(socket);
  }
}
