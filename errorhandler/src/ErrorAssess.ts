import axios from 'axios';
import * as fs from 'node:fs/promises';
import path from 'path';


let processingError: boolean = false;
const analyzedErrors: Set<string> = new Set();

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
  try {
    if (processingError) return;
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

    // Send the error information to the Brain for analysis
    const response = await axios.post(`http://${brainUrl}/chat`, {
        exchanges: conversation,
        optimization: 'accuracy'
    });
    const remediationGuidance = response.data.response;

    processingError = false;
    analyzedErrors.add(errorKey);

    console.log(`\n\n**** REMEDIATION GUIDANCE ****\n\n
    Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n
    Stack: ${stackTrace}\n\n
    Remediation Guidance:\n
    ${remediationGuidance}\n\n*******************************`);
    return remediationGuidance;
  } catch (err) {
    console.error('Error analyzing error:', err instanceof Error ? err.message : err);
    return `There is an error analyzing the error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  } finally {
    processingError = false;
  }
}


async function getSourceCode(stackTrace: string | undefined): Promise<string> {
    if (!stackTrace) return 'No stack trace available';

    const stackLines = stackTrace.split('\n');
    const sourceCodeSnippets: string[] = [];

    for (const line of stackLines) {
        const match = line.match(/^at\s+(?:\w+\s+)?\(([^:]+):(\d+):(\d+)\)/);
        if (match) {
            const [, filePath, lineNumber, columnNumber] = match;
            let absolutePath;

            if (filePath.startsWith('file:///')) {
                // Handle file:/// protocol
                absolutePath = new URL(filePath).pathname;
            } else if (filePath.startsWith('node:')) {
                // Skip built-in Node.js modules
                continue;
            } else {
                // Handle regular file paths
                absolutePath = path.resolve(filePath);
            }
            
            try {
                if (await fs.access(absolutePath).then(() => true).catch(() => false)) {
                    const fileContent = await fs.readFile(absolutePath, 'utf-8');
                    const lines = fileContent.split('\n');
                    const errorLine = parseInt(lineNumber, 10) - 1;

                    let startLine = Math.max(0, errorLine - 5);
                    let endLine = Math.min(lines.length - 1, errorLine + 5);

                    // Try to find function boundaries
                    let functionStart = startLine;
                    let functionEnd = endLine;

                    // Search backwards for function start
                    for (let i = errorLine; i >= 0; i--) {
                        if (lines[i].match(/^(async\s+)?function\s*\w*\s*\(|^(async\s+)?\w+\s*=\s*(\(.*\)\s*=>|\function)/)) {
                            functionStart = i;
                            break;
                        }
                    }

                    // Search forwards for function end
                    let braceCount = 0;
                    for (let i = functionStart; i < lines.length; i++) {
                        braceCount += (lines[i].match(/{/g) || []).length;
                        braceCount -= (lines[i].match(/}/g) || []).length;
                        if (braceCount === 0 && i > errorLine) {
                            functionEnd = i;
                            break;
                        }
                    }

                    // Decide whether to use function boundaries or fixed-line snippet
                    if (functionEnd - functionStart <= 20) {
                        startLine = functionStart;
                        endLine = functionEnd;
                    }

                    const snippet = lines.slice(startLine, endLine + 1).join('\n');
                    sourceCodeSnippets.push(`File: ${filePath}\nLine: ${lineNumber}\nColumn: ${columnNumber}\n\n${snippet}\n`);
                }
            } catch (error) { 
                console.error(`Error reading file ${absolutePath}:`, error);
                sourceCodeSnippets.push(`Unable to read file: ${filePath}`);
            }
        }
    }

    return sourceCodeSnippets.join('\n\n');
}

export const clearAnalyzedErrors = (): void => {
    analyzedErrors.clear();
  };
  
  export const getAnalyzedErrorCount = (): number => {
    return analyzedErrors.size;
  };  