const axios = require('axios');

async function createMissionDirect() {
  try {
    console.log('Creating mission directly to MissionControl...');
    
    const response = await axios.post('http://localhost:5030/message', {
      type: 'CREATE_MISSION',
      sender: 'TestScript',
      recipient: 'MissionControl',
      clientId: 'test-client-direct',
      content: {
        goal: 'Create a marketing plan for a new software product'
      },
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Mission created successfully!');
    console.log('Response:', response.data);
  } catch (error) {
    console.error('Error creating mission:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

createMissionDirect();
