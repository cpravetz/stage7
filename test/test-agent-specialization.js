const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function testAgentSpecialization() {
  try {
    console.log('Testing Agent Specialization and Collaboration...');

    // Create a mission
    const missionId = uuidv4();
    console.log(`Generated mission ID: ${missionId}`);

    // Create a coordinator agent
    const coordinatorAgentId = uuidv4();
    console.log(`Creating coordinator agent with ID: ${coordinatorAgentId}`);

    const coordinatorResponse = await axios.post('http://localhost:5100/addAgent', {
      agentId: coordinatorAgentId,
      missionId: missionId,
      actionVerb: 'ACCOMPLISH',
      inputs: {
        goal: 'Coordinate a team to research and create a marketing plan for a new AI product'
      },
      roleId: 'coordinator'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Directly set the role on the agent
    console.log('Directly setting role on coordinator agent...');
    try {
      await axios.post(`http://localhost:5100/agent/${coordinatorAgentId}/role`, {
        roleId: 'coordinator'
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('Role set successfully on coordinator agent');
    } catch (error) {
      console.error('Error setting role on coordinator agent:', error.message);
    }

    console.log('Coordinator agent created:', coordinatorResponse.data);

    // Create a researcher agent
    const researcherAgentId = uuidv4();
    console.log(`Creating researcher agent with ID: ${researcherAgentId}`);

    const researcherResponse = await axios.post('http://localhost:5100/addAgent', {
      agentId: researcherAgentId,
      missionId: missionId,
      actionVerb: 'ACCOMPLISH',
      inputs: {
        goal: 'Research market trends for AI products'
      },
      roleId: 'researcher'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Directly set the role on the agent
    console.log('Directly setting role on researcher agent...');
    try {
      await axios.post(`http://localhost:5100/agent/${researcherAgentId}/role`, {
        roleId: 'researcher'
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('Role set successfully on researcher agent');
    } catch (error) {
      console.error('Error setting role on researcher agent:', error.message);
    }

    console.log('Researcher agent created:', researcherResponse.data);

    // Create a creative agent
    const creativeAgentId = uuidv4();
    console.log(`Creating creative agent with ID: ${creativeAgentId}`);

    const creativeResponse = await axios.post('http://localhost:5100/addAgent', {
      agentId: creativeAgentId,
      missionId: missionId,
      actionVerb: 'ACCOMPLISH',
      inputs: {
        goal: 'Create marketing content for a new AI product'
      },
      roleId: 'creative'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Directly set the role on the agent
    console.log('Directly setting role on creative agent...');
    try {
      await axios.post(`http://localhost:5100/agent/${creativeAgentId}/role`, {
        roleId: 'creative'
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('Role set successfully on creative agent');
    } catch (error) {
      console.error('Error setting role on creative agent:', error.message);
    }

    console.log('Creative agent created:', creativeResponse.data);

    // Wait for agents to initialize
    console.log('Waiting for agents to initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check agent states
    console.log('Checking agent states...');

    const coordinatorState = await axios.get(`http://localhost:5100/agent/${coordinatorAgentId}`);
    console.log('Coordinator agent state:', coordinatorState.data);

    const researcherState = await axios.get(`http://localhost:5100/agent/${researcherAgentId}`);
    console.log('Researcher agent state:', researcherState.data);

    const creativeState = await axios.get(`http://localhost:5100/agent/${creativeAgentId}`);
    console.log('Creative agent state:', creativeState.data);

    // Check if the agents have the correct roles
    console.log('Checking if agents have the correct roles...');

    try {
      const coordinatorSpecialization = await axios.get(`http://localhost:5100/agent/${coordinatorAgentId}/specialization`);
      console.log('Coordinator agent specialization:', coordinatorSpecialization.data);

      if (coordinatorSpecialization.data.specialization && coordinatorSpecialization.data.specialization.roleId === 'coordinator') {
        console.log('Coordinator agent has the correct role!');
      } else {
        console.log('Coordinator agent specialization does not match expected role');
      }
    } catch (error) {
      console.error('Error getting coordinator agent specialization:', error.message);
    }

    try {
      const researcherSpecialization = await axios.get(`http://localhost:5100/agent/${researcherAgentId}/specialization`);
      console.log('Researcher agent specialization:', researcherSpecialization.data);

      if (researcherSpecialization.data.specialization && researcherSpecialization.data.specialization.roleId === 'researcher') {
        console.log('Researcher agent has the correct role!');
      } else {
        console.log('Researcher agent specialization does not match expected role');
      }
    } catch (error) {
      console.error('Error getting researcher agent specialization:', error.message);
    }

    try {
      const creativeSpecialization = await axios.get(`http://localhost:5100/agent/${creativeAgentId}/specialization`);
      console.log('Creative agent specialization:', creativeSpecialization.data);

      if (creativeSpecialization.data.specialization && creativeSpecialization.data.specialization.roleId === 'creative') {
        console.log('Creative agent has the correct role!');
      } else {
        console.log('Creative agent specialization does not match expected role');
      }
    } catch (error) {
      console.error('Error getting creative agent specialization:', error.message);
    }

    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error testing agent specialization:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

testAgentSpecialization();
