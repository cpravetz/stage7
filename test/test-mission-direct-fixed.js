const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function createMissionDirect() {
  try {
    console.log('Creating mission directly to MissionControl...');
    
    const clientId = 'test-client-' + Date.now();
    console.log('Using client ID:', clientId);
    
    const response = await axios.post('http://localhost:5030/message', {
      type: 'CREATE_MISSION',
      sender: 'TestScript',
      recipient: 'MissionControl',
      clientId: clientId,
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
    
    // Now, let's create an agent for this mission
    console.log('Creating agent for the mission...');
    
    const agentId = uuidv4();
    console.log('Generated agent ID:', agentId);
    
    const agentResponse = await axios.post('http://localhost:5100/addAgent', {
      agentId: agentId,
      missionId: response.data.missionId || 'test-mission-' + Date.now(),
      goal: 'Create a marketing plan for a new software product',
      actionVerb: 'ACCOMPLISH',
      inputs: {
        goal: 'Create a marketing plan for a new software product'
      }
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Agent created successfully!');
    console.log('Agent Response:', agentResponse.data);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

createMissionDirect();
