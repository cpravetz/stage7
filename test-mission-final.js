/**
 * Test script to create a mission in Stage7
 */

const axios = require('axios');
const WebSocket = require('ws');

// Configuration
const CONFIG = {
  securityManagerUrl: 'http://localhost:5010',
  postOfficeUrl: 'http://localhost:5020',
  missionGoal: 'Invent a new business that can run fully automatically',
  componentType: 'MissionControl',
  clientSecret: 'stage7AuthSecret'
};

// Get authentication token
async function getAuthToken() {
  console.log('Getting authentication token...');

  try {
    // First try to read token from file
    try {
      const fs = require('fs');
      const token = fs.readFileSync('token.txt', 'utf8');
      console.log('Using token from file');
      return token;
    } catch (fsError) {
      console.log('Failed to read token from file:', fsError.message);
    }

    // If file read fails, get token from SecurityManager
    const response = await axios.post(`${CONFIG.securityManagerUrl}/auth/service`, {
      componentType: CONFIG.componentType,
      clientSecret: CONFIG.clientSecret
    });

    if (response.data.authenticated && response.data.token) {
      console.log('Authentication successful!');
      return response.data.token;
    } else {
      console.error('Authentication failed:', response.data);
      return null;
    }
  } catch (error) {
    console.error('Authentication error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return null;
  }
}

// Create a mission
async function createMission(token) {
  console.log('Creating mission with goal:', CONFIG.missionGoal);

  try {
    const response = await axios.post(`${CONFIG.postOfficeUrl}/createMission`, {
      goal: CONFIG.missionGoal,
      clientId: 'test-client-' + Date.now()
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Mission created successfully!');
    console.log('Response:', response.data);

    return response.data;
  } catch (error) {
    console.error('Failed to create mission:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return null;
  }
}

// Connect to WebSocket to receive updates
function connectWebSocket(token) {
  if (!token) {
    console.error('No token provided for WebSocket connection');
    return null;
  }

  const clientId = 'test-client-' + Date.now();
  const wsUrl = `ws://localhost:5020?clientId=${clientId}&token=${token}`;

  console.log('Connecting to WebSocket:', wsUrl);

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('WebSocket connection established!');
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`Received message type: ${message.type}`);

      if (message.content) {
        if (typeof message.content === 'string') {
          console.log(`Content: ${message.content.substring(0, 100)}...`);
        } else {
          console.log('Content:', message.content);
        }
      }
    } catch (error) {
      console.log('Received raw message:', data.toString());
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });

  ws.on('close', (code, reason) => {
    console.log(`WebSocket closed: ${code} - ${reason}`);
  });

  // Keep the connection open
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);

  return ws;
}

// Run the test
async function runTest() {
  try {
    // Get authentication token
    const token = await getAuthToken();
    if (!token) {
      console.error('Failed to get authentication token');
      process.exit(1);
    }

    // Connect to WebSocket
    const ws = connectWebSocket(token);

    // Create mission
    const missionData = await createMission(token);
    if (!missionData) {
      console.error('Failed to create mission');
      if (ws) ws.close();
      process.exit(1);
    }

    console.log('Test completed successfully! WebSocket connection remains open for updates.');
    console.log('Press Ctrl+C to exit');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest();
