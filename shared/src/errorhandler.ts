/**
 * Simple error reporting and handling utility
 */

/**
 * Analyzes an error and logs appropriate information
 * @param error The error to analyze
 */
export function reportError(error: Error): void {
  console.error('Error details:');
  console.error(`- Message: ${error.message}`);
  console.error(`- Name: ${error.name}`);
  
  if (error.stack) {
    console.error(`- Stack trace: ${error.stack}`);
  }
  
  // Additional error properties that might be available
  const anyError = error as any;
  if (anyError.code) {
    console.error(`- Error code: ${anyError.code}`);
  }
  
  if (anyError.statusCode) {
    console.error(`- Status code: ${anyError.statusCode}`);
  }
  
  if (anyError.response) {
    console.error('- Response data:', anyError.response.data);
    console.error(`- Response status: ${anyError.response.status}`);
  }
}
