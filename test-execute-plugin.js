const axios = require('axios');

async function executePlugin() {
  try {
    console.log('Executing ACCOMPLISH plugin directly...');
    
    const response = await axios.post('http://localhost:5060/executeAction', {
      actionVerb: 'ACCOMPLISH',
      inputs: {
        type: 'Map',
        value: [
          [
            'goal',
            {
              inputName: 'goal',
              inputValue: 'Create a marketing plan for a new software product',
              args: {}
            }
          ]
        ]
      }
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Plugin executed successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error executing plugin:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

executePlugin();
