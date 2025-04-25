const axios = require('axios');

async function deregisterAgentSetServices() {
  try {
    // Get all services
    const servicesResponse = await axios.get('http://localhost:8500/v1/catalog/services');
    const services = servicesResponse.data;
    
    if (services.AgentSet) {
      // Get all instances of AgentSet
      const agentSetResponse = await axios.get('http://localhost:8500/v1/catalog/service/AgentSet');
      const agentSetInstances = agentSetResponse.data;
      
      console.log(`Found ${agentSetInstances.length} AgentSet instances`);
      
      // Deregister each instance
      for (const instance of agentSetInstances) {
        console.log(`Deregistering AgentSet instance: ${instance.ServiceID}`);
        await axios.put(`http://localhost:8500/v1/agent/service/deregister/${instance.ServiceID}`);
      }
      
      console.log('All AgentSet instances deregistered');
    } else {
      console.log('No AgentSet service found');
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

deregisterAgentSetServices();
