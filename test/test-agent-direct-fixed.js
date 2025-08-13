const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function createAgentDirect() {
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
      },
      timeout: 5000 // 5 second timeout
    });
    
    console.log('Agent created successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    // Wait a bit for the agent to initialize
    console.log('Waiting 5 seconds for agent to initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check agent status
    console.log(`Checking status of agent ${agentId}...`);
    
    const statusResponse = await axios.get(`http://localhost:5100/agent/${agentId}`, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 second timeout
    });
    
    console.log('Agent status:');
    console.log(JSON.stringify(statusResponse.data, null, 2));
    
    // Also check agent output
    const outputResponse = await axios.get(`http://localhost:5100/agent/${agentId}/output`, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 second timeout
    });
    
    console.log('Agent output:');
    console.log(JSON.stringify(outputResponse.data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

createAgentDirect();
