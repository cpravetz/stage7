const axios = require('axios');

async function testHealth() {
  try {
    console.log('Testing CapabilitiesManager health...');
    
    const response = await axios.get('http://localhost:5060/health', {
      timeout: 5000
    });
    
    console.log('CapabilitiesManager health check successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error checking health:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

testHealth();
