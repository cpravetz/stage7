import WebSocket from 'ws';
import { WebSocketHandler } from '../services/postoffice/src/webSocketHandler';

async function main() {
  // Create the maps expected by WebSocketHandler
  const clients = new Map<string, WebSocket.WebSocket>();
  const clientMessageQueue = new Map<string, any[]>();
  const clientMissions = new Map<string, string>();
  const missionClients = new Map<string, Set<string>>();

  // Stubs for dependencies not needed in this test
  const authenticatedApi = {};
  const getComponentUrl = (_type: string) => undefined;
  const handleWebSocketMessage = async (_message: any, _token: string) => {};

  const handler = new WebSocketHandler(
    clients as any,
    clientMessageQueue as any,
    clientMissions as any,
    missionClients as any,
    authenticatedApi,
    getComponentUrl,
    handleWebSocketMessage
  );

  // Start a local WebSocket server
  const port = 5051;
  const wss = new WebSocket.Server({ port });
  console.log(`Test WebSocket server listening on ws://localhost:${port}`);

  handler.setupWebSocket(wss as any);

  // Connect a client
  const client = new WebSocket(`ws://localhost:${port}/?clientId=browser-test-client`);

  client.on('open', () => {
    console.log('Client connected to test server');
  });

  client.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      console.log('Client received message:', parsed);
    } catch (e) {
      console.log('Client received (non-json):', data.toString());
    }
  });

  // Wait a moment for handshake
  await new Promise((r) => setTimeout(r, 500));

  // At this point, the handler should have added the client to its clients map
  // Trigger a broadcast
  const testMessage = {
    type: 'sharedFilesUpdate',
    sender: 'test',
    recipient: 'user',
    content: {
      missionId: 'mock-mission',
      files: [{ id: 'f1', originalName: 'test1.txt', storagePath: '/tmp/test1.txt' }]
    }
  };

  console.log('Invoking broadcastToClients...');
  handler.broadcastToClients(testMessage as any);

  // Give the client time to receive
  await new Promise((r) => setTimeout(r, 500));

  // Cleanup
  client.close();
  wss.close();
  console.log('Test complete');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
