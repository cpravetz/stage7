import axios from 'axios';
import * as fs from 'node:fs/promises';
import path from 'path';


export const analyzeError = async (error: Error) => {
  try {

    const brainUrl = process.env.BRAIN_URL || 'brain:5070';
    const stackTrace = error.stack;
    const sourceCode = await getSourceCode(stackTrace);

    const conversation = [
        { role: 'user', content: `Evaluate the following error report and the associated source code. Provide remediation recommendations including proposed code improvements. Format your response as follows:
        
        ANALYSIS:
        [Your analysis here]
  
        RECOMMENDATIONS:
        [Your recommendations here]
  
        CODE SUGGESTIONS:
        
        [Your code suggestions here]
        
        `},
        { role: 'user', content: `The error is ${JSON.stringify(error)} and the source code is ${sourceCode}` }
      ];

    // Send the error information to the Brain for analysis
    const response = await axios.post(`http://${brainUrl}/chat`, {
        exchanges: conversation,
        optimization: 'accuracy'
    });
    const remediationGuidance = response.data.response;

    console.log(`**** REMEDIATION GUIDANCE ****\n
    Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n
    ${remediationGuidance}\n\n*******************************`);

    return remediationGuidance;
  } catch (err) {
    console.error('Error analyzing error:', err);
    throw err;
  }
}

async function getSourceCode(stackTrace: string | undefined): Promise<string> {
    if (!stackTrace) return 'No stack trace available';

    const stackLines = stackTrace.split('\n');
    const sourceCodeSnippets: string[] = [];

    for (const line of stackLines) {
        const match = line.match(/at .+ \((.+):(\d+):(\d+)\)/);
        if (match) {
            const [, filePath, lineNumber, columnNumber] = match;
            const absolutePath = path.resolve(filePath);
            
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