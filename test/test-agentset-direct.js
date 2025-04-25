const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function createAgentInAgentSet() {
  try {
    console.log('Creating agent directly through AgentSet...');
    
    const agentId = uuidv4();
    const missionId = uuidv4();
    
    console.log(`Generated agent ID: ${agentId}`);
    console.log(`Generated mission ID: ${missionId}`);
    
    const response = await axios.post('http://localhost:5100/addAgent', {
      agentId: agentId,
      missionId: missionId,
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
    console.log('Response:', response.data);
  } catch (error) {
    console.error('Error creating agent:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

createAgentInAgentSet();
