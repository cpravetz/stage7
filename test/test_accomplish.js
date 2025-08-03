const axios = require('axios');

async function testAccomplish() {
  try {
    console.log('Testing ACCOMPLISH plugin...');
    
    const response = await axios.post('http://localhost:5060/executeAction', {
      actionVerb: 'ACCOMPLISH',
      inputs: {
        goal: 'Be the Product Manager for the stage7 open source project. This is the code you run on. Identify opportunities for system enhancements that extend its functionality or deepens its performance. Identify use cases for the system and build business cases around those most promising cases. Develop a marketing strategy, marketing materials and plans. Make stage7 one of the best known and most used open source Agentic platforms.'
      }
    }, {
      headers: {
        'Content-Type': 'application/json'
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
    if (error.code === 'ECONNABORTED') {
      console.error('Request timed out after 3 minutes');
    }
  }
}

testAccomplish();
