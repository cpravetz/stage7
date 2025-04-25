const axios = require('axios');

async function checkAgentStatus(agentId) {
  try {
    console.log(`Checking status of agent ${agentId}...`);
    
    const response = await axios.get(`http://localhost:5100/agent/${agentId}`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Agent status:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Also check agent output
    const outputResponse = await axios.get(`http://localhost:5100/agent/${agentId}/output`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Agent output:');
    console.log(JSON.stringify(outputResponse.data, null, 2));
  } catch (error) {
    console.error('Error checking agent status:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

// Use the agent ID from the previous script
const agentId = 'e1e19e01-3863-45a5-ab36-bf1a73031070';
checkAgentStatus(agentId);
