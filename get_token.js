const axios = require('axios');

async function getToken() {
  try {
    console.log('Getting service token...');
    
    const response = await axios.post('http://localhost:5010/auth/service', {
      componentType: 'TestClient',
      clientSecret: 'stage7AuthSecret'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('Token received:', response.data.token);
    return response.data.token;
  } catch (error) {
    console.error('Error getting token:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    return null;
  }
}

async function testAccomplish() {
  const token = await getToken();
  if (!token) {
    console.log('Could not get token, trying without authentication...');
    return;
  }
  
  try {
    console.log('Testing ACCOMPLISH plugin...');
    
    const response = await axios.post('http://localhost:5060/executeAction', {
      actionVerb: 'ACCOMPLISH',
      inputs: {
        goal: 'Be the Product Manager for the stage7 open source project. This is the code you run on. Identify opportunities for system enhancements that extend its functionality or deepens its performance. Identify use cases for the system and build business cases around those most promising cases. Develop a marketing strategy, marketing materials and plans. Make stage7 one of the best known and most used open source Agentic platforms.'
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      timeout: 180000 // 3 minutes
    });
    
    console.log('ACCOMPLISH plugin executed successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error executing ACCOMPLISH plugin:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

testAccomplish();
