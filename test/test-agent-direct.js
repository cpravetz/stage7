const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function createAgentDirect() {
  try {
    console.log('Creating agent directly through TrafficManager...');
    
    const missionId = uuidv4();
    console.log(`Generated mission ID: ${missionId}`);
    
    // Create serialized inputs
    const serializedInputs = {
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
    };
    
    const response = await axios.post('http://localhost:5080/createAgent', {
      actionVerb: 'ACCOMPLISH',
      inputs: serializedInputs,
      missionId: missionId,
      missionContext: '',
      dependencies: []
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Agent created successfully!');
    console.log('Response:', response.data);
  } catch (error) {
    console.error('Error creating agent:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

createAgentDirect();
