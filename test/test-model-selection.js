const axios = require('axios');

async function testModelSelection() {
  try {
    console.log('Testing model selection...');
    
    // Make a request to the Brain service
    const response = await axios.post('http://localhost:5070/chat', {
      exchanges: [
        { role: 'user', content: 'Hello, how are you?' }
      ],
      optimization: 'accuracy',
      conversationType: 'TextToText'
    });
    
    console.log('Response:', response.data);
    
    // Make another request with a different optimization
    const response2 = await axios.post('http://localhost:5070/chat', {
      exchanges: [
        { role: 'user', content: 'Tell me a joke.' }
      ],
      optimization: 'creativity',
      conversationType: 'TextToText'
    });
    
    console.log('Response 2:', response2.data);
    
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

testModelSelection();
