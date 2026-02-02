/**
 * Prompt templates with best practices and style guidelines
 * Ensures consistent, high-quality code generation
 */

import { InputValue } from '@cktmcs/shared';

/**
 * Code style guide from AGENTS.md
 */
const CODE_STYLE_GUIDE = `
CODING STANDARDS:
- Use single quotes for string literals (unless containing template literals)
- Use double quotes for object keys
- Use TypeScript types and interfaces extensively
- Include comprehensive comments for functions and complex blocks
- Use TODO: for placeholders
- Use consistent naming conventions (CamelCase for classes, camelCase for functions)
- Wrap function bodies with curly braces, even for single statements
- Use async/await with try/catch for promise handling
- Handle errors appropriately with meaningful messages
- Place type aliases at the top of files, before exports
- Organize imports alphabetically: third-party before local modules
- Add proper type annotations for function parameters and return types
`;

/**
 * Generate enhanced prompt for plugin creation with context
 */
export function generatePluginPrompt(
    verb: string,
    context: Map<string, InputValue>,
    guidance: string,
    language?: string
): string {
    const contextString = JSON.stringify(Array.from(context.entries()));
    const lang = language || 'typescript';

    return `You are an expert code generator creating a high-quality plugin for the action verb: "${verb}"

${CODE_STYLE_GUIDE}

CONTEXT:
- Action Verb: ${verb}
- Context/Inputs: ${contextString}
- Additional Guidance: ${guidance}
- Target Language: ${lang}

REQUIREMENTS:
1. Generate production-ready code following the style guide above
2. Include comprehensive error handling with try/catch blocks
3. Add JSDoc/docstring comments for all functions
4. Include input validation with clear error messages
5. Implement logging for debugging and monitoring
6. Use type definitions (TypeScript/interfaces)
7. Return proper structured output

EXPECTED OUTPUT STRUCTURE:
{
    "id": "plugin-${verb.toLowerCase()}",
    "verb": "${verb}",
    "description": "Clear, concise description",
    "explanation": "Detailed explanation of functionality",
    "inputDefinitions": [
        {
            "name": "input_name",
            "type": "string|number|boolean|array|object",
            "required": true,
            "description": "Input description"
        }
    ],
    "outputDefinitions": [
        {
            "name": "result",
            "type": "object|string",
            "required": true,
            "description": "Output description"
        }
    ],
    "language": "${lang}",
    "entryPoint": {
        "main": "index.${lang === 'python' ? 'py' : 'ts'}",
        "files": {
            "index.${lang === 'python' ? 'py' : 'ts'}": "// Complete implementation with error handling"
        }
    },
    "version": "1.0.0",
    "metadata": {
        "category": ["appropriate", "category"],
        "tags": ["relevant", "tags"],
        "complexity": 5,
        "dependencies": []
    }
}

Generate the plugin now:`;
}

/**
 * Generate enhanced prompt for wrapper plugin creation
 */
export function generateWrapperPluginPrompt(
    toolManifest: any,
    policyConfig: any,
    language: string
): string {
    return `You are an expert code generator creating a wrapper plugin for integrating with an external API.

${CODE_STYLE_GUIDE}

TOOL MANIFEST:
${JSON.stringify(toolManifest, null, 2)}

POLICY CONFIGURATION:
${JSON.stringify(policyConfig, null, 2)}

WRAPPER REQUIREMENTS:
1. Act as a type-safe client for the external API
2. Enforce all policy configurations (rate limits, access control, etc.)
3. Include comprehensive input/output schema validation
4. Handle authentication securely (never log credentials)
5. Implement retry logic for transient failures
6. Add request/response logging for debugging
7. Include a complete unit test suite with mocks
8. Document all public methods with JSDoc comments

CODE QUALITY:
- Follow the style guide provided above
- Add proper error handling and recovery
- Use ${language} best practices
- Include comprehensive type definitions
- Add inline comments for complex logic

OUTPUT FORMAT:
Return a PluginDefinition JSON object with:
- Complete wrapper implementation in entryPoint.files
- Unit tests for wrapper functionality
- Test file names following convention: test_wrapper.${language === 'python' ? 'py' : 'ts'} or wrapper.test.${language === 'python' ? 'py' : 'ts'}

Generate the wrapper plugin now:`;
}

/**
 * Generate enhanced prompt for container plugin creation
 */
export function generateContainerPluginPrompt(
    verb: string,
    context: Map<string, InputValue>,
    explanation: string,
    guidance: string
): string {
    const contextString = JSON.stringify(Array.from(context.entries()));

    return `Create a production-ready containerized plugin for the action verb: "${verb}"

CONTAINER PLUGIN REQUIREMENTS:
1. Dockerfile with multi-stage builds if possible (optimize for size/speed)
2. Python Flask application or Node.js Express (your choice for efficiency)
3. Implement POST /execute endpoint for plugin execution
4. Implement GET /health endpoint for health checks
5. Implement GET /metrics endpoint (basic metrics)
6. Include comprehensive error handling and logging
7. Use environment variables for configuration
8. Include resource limits and health checks

PLUGIN CONTEXT:
- Verb: ${verb}
- Explanation: ${explanation}
- Context: ${contextString}
- Guidance: ${guidance}

CODE STANDARDS:
- Clear, documented code
- Proper error handling
- Input validation with clear messages
- Structured logging
- Security best practices

EXPECTED OUTPUT STRUCTURE:
{
    "id": "plugin-${verb}",
    "verb": "${verb}",
    "description": "Brief description",
    "explanation": "Detailed explanation",
    "inputDefinitions": [...],
    "outputDefinitions": [...],
    "language": "container",
    "container": {
        "dockerfile": "Dockerfile content",
        "buildContext": "./",
        "image": "stage7/plugin-${verb.toLowerCase()}:1.0.0",
        "ports": [{"container": 8080, "host": 0}],
        "environment": {},
        "resources": {
            "memory": "256m",
            "cpu": "0.5"
        },
        "healthCheck": {
            "path": "/health",
            "interval": "30s",
            "timeout": "10s",
            "retries": 3
        }
    },
    "api": {
        "endpoint": "/execute",
        "method": "POST",
        "timeout": 30000
    },
    "entryPoint": {
        "main": "app.py",
        "files": {
            "app.py": "Flask application code",
            "Dockerfile": "Docker configuration",
            "requirements.txt": "Python dependencies"
        }
    },
    "version": "1.0.0",
    "metadata": {...}
}

Generate the containerized plugin now:`;
}

/**
 * Generate enhanced prompt for code repair with context
 */
export function generateRepairPrompt(
    errorMessage: string,
    code: string | string[],
    context?: Record<string, any>
): string {
    const codeString = Array.isArray(code) ? code.join('\n') : code;

    return `You are an expert code debugger and fixer.

ERROR: ${errorMessage}

${context ? `CONTEXT:\n${JSON.stringify(context, null, 2)}\n` : ''}

CODE STYLE GUIDELINES:
${CODE_STYLE_GUIDE}

FAILING CODE:
\`\`\`
${codeString}
\`\`\`

TASKS:
1. Identify the root cause of the error
2. Fix the code while maintaining the original logic
3. Ensure the fixed code follows the style guidelines
4. Add error handling if missing
5. Add helpful comments explaining the fix

RETURN ONLY THE FIXED CODE with no additional explanation or markdown formatting.`;
}

/**
 * Generate prompt for analyzing code quality
 */
export function generateCodeQualityPrompt(
    code: string,
    language: string
): string {
    return `Analyze the following ${language} code for quality issues and best practices:

CODE STYLE GUIDELINES:
${CODE_STYLE_GUIDE}

CODE TO ANALYZE:
\`\`\`${language}
${code}
\`\`\`

ANALYSIS AREAS:
1. Code style and formatting compliance
2. Error handling completeness
3. Type safety and annotations
4. Function/method documentation
5. Performance concerns
6. Security vulnerabilities
7. Best practices violations

Provide a structured JSON response:
{
    "quality_score": 1-10,
    "issues": [
        {
            "severity": "high|medium|low",
            "type": "category",
            "line": number,
            "message": "description",
            "suggestion": "how to fix"
        }
    ],
    "strengths": ["list of good practices observed"],
    "recommendations": ["list of improvements"]
}`;
}
