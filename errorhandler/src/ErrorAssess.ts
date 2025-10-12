import axios from 'axios';
import * as fs from 'node:fs/promises';
import path from 'path';
import { ServiceTokenManager } from '@cktmcs/shared';


let processingError: boolean = false;
const analyzedErrors: Set<string> = new Set();

// Initialize token manager for service-to-service authentication
const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';
const serviceId = 'ErrorHandler';
const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
const tokenManager = ServiceTokenManager.getInstance(
    `http://${securityManagerUrl}`,
    serviceId,
    serviceSecret
);

function serializeError(error: Error): string {
    const seen = new WeakSet();

    const serializer = (key: string, value: any) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular]';
            }
            seen.add(value);
        }

        // Handle specific properties
        if (key === 'config' && value && typeof value === 'object') {
            // For axios errors, only include safe properties from config
            return {
                url: value.url,
                method: value.method,
                timeout: value.timeout
                // Add other safe properties as needed
            };
        }

        return value;
    };

    const serialized: Record<string, any> = {
        name: error.name,
        message: error.message,
        stack: error.stack
    };

    // Capture all enumerable properties
    Object.assign(serialized, error);

    // Capture non-enumerable properties
    Object.getOwnPropertyNames(error).forEach(prop => {
        if (!serialized.hasOwnProperty(prop)) {
            serialized[prop] = (error as any)[prop];
        }
    });

    // Remove potentially sensitive or irrelevant information
    delete serialized.domain;  // Node.js specific, usually not relevant

    try {
        let result:string = JSON.stringify(serialized, serializer, 2);
        result = result.replace(/\s+/g, ' ');
        return result.substring(0,1000);
    } catch (jsonError) {
        console.error('Error during JSON serialization:', jsonError);
        return JSON.stringify({
            name: error.name,
            message: error.message,
            stack: error.stack,
            serializationError: 'Failed to serialize full error object'
        }, null, 2);
    }
}

export const analyzeError = async (error: Error) => {
  // If error is null or undefined, log and return early
  if (!error) {
    console.error('analyzeError called with null or undefined error');
    return;
  }

  // Ensure we have a proper Error object
  if (!(error instanceof Error)) {
    console.error('analyzeError called with non-Error object:', error);
    error = new Error(String(error));
  }

  //Don't analyze simple connection issues
  if (error.message.includes('ECONNREFUSED')) {
    console.error('Error is ',error.message);
    return;
  }

  try {
    // Prevent concurrent analysis of the same error
    if (processingError) {
      console.log('Error analysis already in progress, skipping');
      return;
    }

    // Skip already analyzed errors
    const errorKey = `${error.name}:${error.message}`;
    if (analyzedErrors.has(errorKey)) {
      console.log(`Error already analyzed: ${errorKey}`);
      return;
    }

    processingError = true;
    const brainUrl = process.env.BRAIN_URL || 'brain:5070';
    const stackTrace = error.stack;
    const sourceCode = await getSourceCode(stackTrace);
    const serializedError = serializeError(error);

    // Check if Brain service is available before proceeding
    try {
      // Get a token for authentication
      const token = await tokenManager.getToken();

      // Simple health check with authentication
      await axios.get(`http://${brainUrl}/models`, {
        timeout: 2000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (healthCheckError) {
      console.error(`Brain service at ${brainUrl} is not available:`,
        healthCheckError instanceof Error ? healthCheckError.message : String(healthCheckError));
      console.error('Original error:', error.message);
      processingError = false;
      return;
    }

    const conversation = [
        { role: 'user', content: `Evaluate the following error report and the associated source code. Provide remediation recommendations including proposed code improvements. Format your response as follows:

        ANALYSIS:
        [Your analysis here]

        RECOMMENDATIONS:
        [Your recommendations here]

        CODE SUGGESTIONS:
        [Your code suggestions here]

        "end of response"

        The error is:
         ${serializedError}

        and the source code is:
         ${sourceCode.substring(0,10000)}` }
      ];

    // Get a token for authentication
    const token = await tokenManager.getToken();

    // Send the error information to the Brain for analysis with timeout
    const response = await axios.post(`http://${brainUrl}/chat`, {
        exchanges: conversation,
        optimization: 'accuracy',
        responseType: 'text',
    }, {
        timeout: 60000, // 30 second timeout
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.data || !response.data.response) {
      console.error('Invalid response from Brain service');
      processingError = false;
      return;
    }

    const remediationGuidance = response.data.response;

    // Mark this error as analyzed
    analyzedErrors.add(errorKey);

    // Parse the remediation guidance
    const librarianUrl = process.env.LIBRARIAN_URL || 'librarian:5040';

    try {
      await axios.post(`http://${librarianUrl}/collections/code_recommendations/documents`, {
        serializedError,
        sourceCode,
        remediationGuidance,
        timestamp: new Date().toISOString()
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('New code suggestion logged to Librarian.');
    } catch (librarianError) {
      console.error('Error sending code suggestion to Librarian:', librarianError instanceof Error ? librarianError.message : String(librarianError));
    }

    return remediationGuidance;
  } catch (err) {
    console.error('Error analyzing error:', err instanceof Error ? err.message : String(err));
    return `There is an error analyzing the error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    processingError = false;
  }
}


async function getSourceCode(stackTrace: string | undefined): Promise<string> {
    if (!stackTrace) return 'No stack trace available';

    const stackLines = stackTrace.split('\n');
    const sourceCodeSnippets: string[] = [];
    const processedFiles = new Set<string>(); // Track already processed files to avoid duplicates

    // Try different regex patterns to match stack trace lines
    const patterns = [
        /^at\s+(?:\w+\s+)?\(([^:]+):(\d+):(\d+)\)/, // Standard format: at functionName (file:line:column)
        /^at\s+([^:]+):(\d+):(\d+)/, // Simplified format: at file:line:column
        /^\s*at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/ // Alternative format: at Object.method (file:line:column)
    ];

    for (const line of stackLines) {
        let filePath: string | undefined, lineNumber: string | undefined, columnNumber: string | undefined;
        let matched = false;

        // Try each pattern until one matches
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                if (match.length === 4) {
                    // First pattern or third pattern
                    [, filePath, lineNumber, columnNumber] = match;
                } else if (match.length === 5) {
                    // Third pattern
                    [, , filePath, lineNumber, columnNumber] = match;
                }
                matched = true;
                break;
            }
        }

        if (!matched || !filePath) continue;

        // Skip if we've already processed this file
        if (processedFiles.has(filePath)) continue;
        processedFiles.add(filePath);

        let absolutePath;

        try {
            if (filePath.startsWith('file:///')) {
                // Handle file:/// protocol
                absolutePath = new URL(filePath).pathname;
            } else if (filePath.startsWith('node:') || filePath.includes('node_modules')) {
                // Skip built-in Node.js modules and node_modules
                continue;
            } else {
                // Handle regular file paths
                absolutePath = path.resolve(filePath);
            }

            // Check if file exists and is readable
            if (await fs.access(absolutePath).then(() => true).catch(() => false)) {
                const fileContent = await fs.readFile(absolutePath, 'utf-8');
                const lines = fileContent.split('\n');
                const errorLine = parseInt(lineNumber || '0', 10) - 1;

                // Validate line number
                if (errorLine < 0 || errorLine >= lines.length) {
                    sourceCodeSnippets.push(`File: ${filePath}\nLine: ${lineNumber} (out of range)\n\nFile has ${lines.length} lines`);
                    continue;
                }

                let startLine = Math.max(0, errorLine - 5);
                let endLine = Math.min(lines.length - 1, errorLine + 5);

                // Try to find function boundaries
                let functionStart = startLine;
                let functionEnd = endLine;

                // Search backwards for function start
                for (let i = errorLine; i >= 0; i--) {
                    if (lines[i].match(/^(async\s+)?function\s*\w*\s*\(|^(async\s+)?\w+\s*=\s*(\(.*\)\s*=>|\function)|class\s+\w+|export\s+(const|class|function)/)) {
                        functionStart = i;
                        break;
                    }
                }

                // Search forwards for function end
                let braceCount = 0;
                let foundOpeningBrace = false;

                for (let i = functionStart; i < lines.length; i++) {
                    // Count braces only after we've found the first opening brace
                    if (!foundOpeningBrace) {
                        if (lines[i].includes('{')) {
                            foundOpeningBrace = true;
                            braceCount = 1; // Start with 1 for the opening brace
                        }
                        continue;
                    }

                    // Count braces in the line
                    const openBraces = (lines[i].match(/{/g) || []).length;
                    const closeBraces = (lines[i].match(/}/g) || []).length;
                    braceCount += openBraces - closeBraces;

                    if (braceCount <= 0 && i > errorLine) {
                        functionEnd = i;
                        break;
                    }
                }

                // Decide whether to use function boundaries or fixed-line snippet
                if (functionEnd - functionStart <= 30 && functionEnd > functionStart) {
                    startLine = functionStart;
                    endLine = functionEnd;
                }

                // Highlight the error line
                const snippet = lines.slice(startLine, endLine + 1)
                    .map((line, idx) => {
                        const lineNum = startLine + idx + 1;
                        if (lineNum === parseInt(lineNumber || '0', 10)) {
                            return `> ${lineNum}: ${line} <-- ERROR`;
                        }
                        return `  ${lineNum}: ${line}`;
                    })
                    .join('\n');

                sourceCodeSnippets.push(`File: ${filePath}\nLine: ${lineNumber}\nColumn: ${columnNumber}\n\n${snippet}\n`);
            }
        } catch (error) {
            console.error(`Error reading file ${absolutePath || filePath}:`, error);
            sourceCodeSnippets.push(`Unable to read file: ${filePath}`);
        }
    }

    if (sourceCodeSnippets.length === 0) {
        return 'Could not extract source code from stack trace';
    }

    return sourceCodeSnippets.join('\n\n');
}

export const clearAnalyzedErrors = (): void => {
    analyzedErrors.clear();
  };

  export const getAnalyzedErrorCount = (): number => {
    return analyzedErrors.size;
  };