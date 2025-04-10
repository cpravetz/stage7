import { AsyncLLM } from '../shared/src/utils/asyncLLM';

/**
 * Example of using the AsyncLLM utility to make asynchronous LLM requests
 */
async function main() {
  // Create an instance of AsyncLLM
  const asyncLLM = new AsyncLLM();
  
  try {
    console.log('Sending async LLM request...');
    
    // Send a chat request
    const result = await asyncLLM.chat(
      [{ role: 'user', content: 'What is the capital of France?' }],
      'accuracy',
      { temperature: 0.7 }
    );
    
    console.log('Received response:');
    console.log(`Content: ${result.response}`);
    console.log(`MIME Type: ${result.mimeType}`);
  } catch (error) {
    console.error('Error making async LLM request:', error);
  }
}

// Run the example
main().catch(console.error);
