const axios = require('axios');
const { ServiceTokenManager } = require('@cktmcs/shared');

// Initialize token manager for service-to-service authentication
const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';
const serviceId = 'TestClient';
const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
const tokenManager = ServiceTokenManager.getInstance(
    `http://${securityManagerUrl}`,
    serviceId,
    serviceSecret
);

async function testModelSelection() {
  try {
    console.log('Testing model selection...');

    // Get a token for authentication
    const token = await tokenManager.getToken();

    // Make a request to the Brain service
    const response = await axios.post('http://localhost:5070/chat', {
      exchanges: [
        { role: 'user', content: 'Hello, how are you?' }
      ],
      optimization: 'accuracy',
      conversationType: 'TextToText'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Response:', response.data);

    // Make another request with a different optimization
    const response2 = await axios.post('http://localhost:5070/chat', {
      exchanges: [
        { role: 'user', content: 'Tell me a joke.' }
      ],
      optimization: 'creativity',
      conversationType: 'TextToText'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Response 2:', response2.data);

  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

testModelSelection();
