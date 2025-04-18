const axios = require('axios');

async function testBrainModelSelection() {
  try {
    console.log('Testing Brain model selection...');
    
    // Get available models
    const modelsResponse = await axios.get('http://localhost:5070/models');
    console.log('Available models:', modelsResponse.data);
    
    // Make a request to the Brain service
    const response = await axios.post('http://localhost:5070/chat', {
      exchanges: [
        { role: 'user', content: 'Hello, how are you?' }
      ],
      optimization: 'accuracy',
      conversationType: 'TextToText'
    });
    
    console.log('Response:', response.data);
    
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

testBrainModelSelection();
