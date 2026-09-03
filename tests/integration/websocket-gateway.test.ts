import http from 'http';
import express from 'express';
import request from 'supertest';
import WebSocket from 'ws';
import { WebSocketGateway } from '../../services/gateway/src/services/WebSocketGateway';
import gatewayRoutes from '../../services/gateway/src/routes/gateway';
import { setWsGateway, getWsGateway } from '../../services/gateway/src/utils/sharedInstances';

describe('Integration: WebSocket Gateway with real WS clients', () => {
  let httpServer: http.Server;
  let wsGateway: WebSocketGateway;
  let port: number;
  let baseUrl: string;
  let app: express.Application;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/gateway', gatewayRoutes);

    httpServer = http.createServer(app);
    wsGateway = new WebSocketGateway(httpServer, '/ws');
    wsGateway.start();
    setWsGateway(wsGateway);

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address() as { address: string; port: number };
    port = addr.port;
    baseUrl = `http://${addr.address}:${addr.port}`;
  });

  afterAll(async () => {
    wsGateway.stop();
    setWsGateway(null as any);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connectClient(): Promise<{ ws: WebSocket; messages: any[] }> {
    return new Promise((resolve, reject) => {
      const messages: any[] = [];
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on('open', () => resolve({ ws, messages }));
      ws.on('message', (raw: Buffer) => {
        try {
          messages.push(JSON.parse(raw.toString()));
        } catch {
          messages.push(raw.toString());
        }
      });
      ws.on('error', reject);
    });
  }

  function waitFor(messages: any[], predicate: (m: any) => boolean, timeoutMs = 1000): Promise<any> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const found = messages.find(predicate);
        if (found) return resolve(found);
        if (Date.now() - start > timeoutMs) return reject(new Error('Timeout waiting for message'));
        setTimeout(check, 10);
      };
      check();
    });
  }

  it('should send welcome message on connect', async () => {
    const { ws, messages } = await connectClient();
    const welcome = await waitFor(messages, (m) => m.type === 'welcome');
    expect(welcome.clientId).toBeDefined();
    expect(typeof welcome.clientId).toBe('string');
    ws.close();
  });

  it('should handle subscribe and broadcast to mission', async () => {
    const { ws, messages } = await connectClient();
    await waitFor(messages, (m) => m.type === 'welcome');

    ws.send(JSON.stringify({ type: 'subscribe', missionId: 'mission-ws-1' }));
    const subscribed = await waitFor(messages, (m) => m.type === 'subscribed' && m.missionId === 'mission-ws-1');
    expect(subscribed.missionId).toBe('mission-ws-1');

    // Trigger broadcast via HTTP route
    const broadcastRes = await request(app)
      .post('/api/gateway/broadcast/mission/mission-ws-1')
      .send({ event: 'mission-update', data: { status: 'running' } });
    expect(broadcastRes.status).toBe(200);

    const broadcast = await waitFor(messages, (m) => m.event === 'mission-update');
    expect(broadcast.data.status).toBe('running');

    ws.close();
  });

  it('should not receive broadcast for unsubscribed mission', async () => {
    const { ws, messages } = await connectClient();
    await waitFor(messages, (m) => m.type === 'welcome');

    // Subscribe to mission A
    ws.send(JSON.stringify({ type: 'subscribe', missionId: 'mission-A' }));
    await waitFor(messages, (m) => m.type === 'subscribed');

    // Broadcast to mission B
    const broadcastRes = await request(app)
      .post('/api/gateway/broadcast/mission/mission-B')
      .send({ event: 'unrelated' });
    expect(broadcastRes.status).toBe(200);

    // Wait a bit and verify no message received
    await new Promise((r) => setTimeout(r, 200));
    const receivedUnrelated = messages.some((m) => m.event === 'unrelated');
    expect(receivedUnrelated).toBe(false);

    ws.close();
  });

  it('should handle subscribe-all and receive all broadcasts', async () => {
    const { ws, messages } = await connectClient();
    await waitFor(messages, (m) => m.type === 'welcome');

    ws.send(JSON.stringify({ type: 'subscribe-all' }));
    const ack = await waitFor(messages, (m) => m.type === 'subscribed-all');
    expect(ack).toBeDefined();

    // Broadcast to any mission
    const broadcastRes = await request(app)
      .post('/api/gateway/broadcast/mission/any-mission')
      .send({ event: 'global-event' });
    expect(broadcastRes.status).toBe(200);

    const globalMsg = await waitFor(messages, (m) => m.event === 'global-event');
    expect(globalMsg.event).toBe('global-event');

    ws.close();
  });

  it('should handle unsubscribe', async () => {
    const { ws, messages } = await connectClient();
    await waitFor(messages, (m) => m.type === 'welcome');

    ws.send(JSON.stringify({ type: 'subscribe', missionId: 'mission-unsub' }));
    await waitFor(messages, (m) => m.type === 'subscribed');

    ws.send(JSON.stringify({ type: 'unsubscribe', missionId: 'mission-unsub' }));
    const unsub = await waitFor(messages, (m) => m.type === 'unsubscribed');
    expect(unsub.missionId).toBe('mission-unsub');

    // Broadcast should not be received
    await request(app)
      .post('/api/gateway/broadcast/mission/mission-unsub')
      .send({ event: 'after-unsub' });

    await new Promise((r) => setTimeout(r, 200));
    const received = messages.some((m) => m.event === 'after-unsub');
    expect(received).toBe(false);

    ws.close();
  });

  it('should track connected count and subscribers', async () => {
    const initial = getWsGateway().getConnectedCount();
    const { ws, messages } = await connectClient();
    await waitFor(messages, (m) => m.type === 'welcome');

    expect(getWsGateway().getConnectedCount()).toBe(initial + 1);

    ws.send(JSON.stringify({ type: 'subscribe', missionId: 'mission-count' }));
    await waitFor(messages, (m) => m.type === 'subscribed');

    const subs = getWsGateway().getSubscribers('mission-count');
    expect(subs.length).toBeGreaterThanOrEqual(1);

    ws.close();
    // Wait for close to propagate
    await new Promise((r) => setTimeout(r, 100));
  });
});
