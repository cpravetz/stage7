const axios = require('axios');

async function createMission() {
  try {
    console.log('Creating mission directly...');
    
    const response = await axios.post('http://localhost:5020/createMission', {
      goal: 'Create a marketing plan for a new software product',
      clientId: 'test-client-direct'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy-token'
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

createMission();
