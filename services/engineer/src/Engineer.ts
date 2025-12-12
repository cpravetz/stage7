import axios from 'axios';
import express from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
    MapSerializer,
    BaseEntity,
    InputValue,
    PluginDefinition,
    PluginManifest,
    PluginParameter,
    PluginMetadata,
    PluginConfigurationItem,
    signPlugin,
    EntryPointType,
    PluginParameterType,
    OpenAPITool,
    OpenAPIToolRegistrationRequest,
    OpenAPIParsingResult,
    OpenAPIActionMapping,
    OpenAPIAuthentication,
    OpenAPIParameterMapping,
    OpenAPIResponseMapping,
    MCPTool,
    MCPToolRegistrationRequest
} from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { PluginMarketplace } from '@cktmcs/marketplace';
import { redisCache } from '@cktmcs/shared';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

const execAsync = promisify(exec);

export class Engineer extends BaseEntity {
    private brainUrl: string = process.env.BRAIN_URL || 'brain:5070';
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private newPlugins: Array<string> = [];
    private pluginMarketplace: PluginMarketplace;
    private ajv: Ajv;
    private pluginSchema: object;
    private containerPluginSchema: object;
    private validationCache: Map<string, { valid: boolean; issues: string[] }>;
    private performanceMetrics: {
        validationTime: number;
        generationTime: number;
        testExecutionTime: number;
    };

    constructor() {
        super('Engineer', 'Engineer', `engineer`, process.env.PORT || '5050');
        this.pluginMarketplace = new PluginMarketplace();
        this.ajv = new Ajv({ allErrors: true, strict: false });
        this.pluginSchema = {};
        this.containerPluginSchema = {};
        this.validationCache = new Map();
        this.performanceMetrics = {
            validationTime: 0,
            generationTime: 0,
            testExecutionTime: 0
        };
        this.initialize();
        this.setupJsonSchemaValidation();
    }

    private setupJsonSchemaValidation(): void {
        // Add formats for common data types
        addFormats(this.ajv);

        // Plugin JSON Schema
        this.pluginSchema = {
            type: 'object',
            properties: {
                id: { type: 'string', minLength: 1 },
                verb: { type: 'string', minLength: 1 },
                description: { type: 'string', minLength: 1 },
                explanation: { type: 'string', minLength: 1 },
                inputDefinitions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', minLength: 1 },
                            required: { type: 'boolean' },
                            type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object', 'any'] },
                            description: { type: 'string' }
                        },
                        required: ['name', 'required', 'type']
                    },
                    minItems: 1
                },
                outputDefinitions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', minLength: 1 },
                            required: { type: 'boolean' },
                            type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object', 'any'] },
                            description: { type: 'string' }
                        },
                        required: ['name', 'required', 'type']
                    },
                    minItems: 1
                },
                language: { type: 'string', enum: ['python', 'javascript', 'typescript', 'container'] },
                entryPoint: {
                    type: 'object',
                    properties: {
                        main: { type: 'string', minLength: 1 },
                        files: {
                            type: 'object',
                            additionalProperties: { type: 'string', minLength: 1 }
                        }
                    },
                    required: ['main']
                },
                configuration: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            key: { type: 'string', minLength: 1 },
                            value: { type: ['string', 'number', 'boolean', 'null'] },
                            description: { type: 'string' },
                            required: { type: 'boolean' },
                            type: { type: 'string', enum: ['string', 'number', 'boolean', 'secret'] }
                        },
                        required: ['key', 'description', 'required', 'type']
                    }
                },
                version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
                metadata: {
                    type: 'object',
                    properties: {
                        category: { type: 'array', items: { type: 'string' } },
                        tags: { type: 'array', items: { type: 'string' } },
                        complexity: { type: 'number', minimum: 1, maximum: 10 },
                        dependencies: { type: 'array', items: { type: 'string' } },
                        version: { type: 'string' }
                    }
                }
            },
            required: ['id', 'verb', 'description', 'inputDefinitions', 'outputDefinitions', 'language', 'entryPoint']
        };

        // Container Plugin JSON Schema
        this.containerPluginSchema = {
            type: 'object',
            properties: {
                id: { type: 'string', minLength: 1 },
                verb: { type: 'string', minLength: 1 },
                description: { type: 'string', minLength: 1 },
                explanation: { type: 'string', minLength: 1 },
                inputDefinitions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', minLength: 1 },
                            required: { type: 'boolean' },
                            type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object', 'any'] },
                            description: { type: 'string' }
                        },
                        required: ['name', 'required', 'type']
                    },
                    minItems: 1
                },
                outputDefinitions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', minLength: 1 },
                            required: { type: 'boolean' },
                            type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object', 'any'] },
                            description: { type: 'string' }
                        },
                        required: ['name', 'required', 'type']
                    },
                    minItems: 1
                },
                language: { type: 'string', enum: ['container'] },
                container: {
                    type: 'object',
                    properties: {
                        dockerfile: { type: 'string', minLength: 1 },
                        buildContext: { type: 'string', minLength: 1 },
                        image: { type: 'string', minLength: 1 },
                        ports: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    container: { type: 'number' },
                                    host: { type: 'number' }
                                },
                                required: ['container']
                            }
                        },
                        environment: { type: 'object' },
                        resources: {
                            type: 'object',
                            properties: {
                                memory: { type: 'string' },
                                cpu: { type: 'string' }
                            }
                        },
                        healthCheck: {
                            type: 'object',
                            properties: {
                                path: { type: 'string' },
                                interval: { type: 'string' },
                                timeout: { type: 'string' },
                                retries: { type: 'number' }
                            },
                            required: ['path']
                        }
                    },
                    required: ['dockerfile', 'image', 'ports']
                },
                api: {
                    type: 'object',
                    properties: {
                        endpoint: { type: 'string', minLength: 1 },
                        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
                        timeout: { type: 'number' }
                    },
                    required: ['endpoint', 'method']
                },
                entryPoint: {
                    type: 'object',
                    properties: {
                        main: { type: 'string', minLength: 1 },
                        files: {
                            type: 'object',
                            additionalProperties: { type: 'string', minLength: 1 }
                        }
                    },
                    required: ['main', 'files']
                }
            },
            required: ['id', 'verb', 'description', 'inputDefinitions', 'outputDefinitions', 'language', 'container', 'api', 'entryPoint']
        };
    }

    private async initialize() {
        await this.setupServer();
    }

    private async setupServer() {
        const app = express();
        app.use(express.json());

        app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (req.path === '/health' || req.path === '/ready') {
                return next();
            }
            this.verifyToken(req, res, next);
        });

        app.post('/createPlugin', async (req, res) => {
            // Ensure req.body is properly deserialized if it's not auto-parsed as JSON
            // For MapSerializer, it expects a specific structure if inputs are Maps.
            // Assuming 'verb', 'context', 'guidance', 'language' are top-level properties in req.body.
            const { verb, context, guidance, language } = req.body; // Include language parameter

            try {
                // If context is expected to be a Map and is serialized, deserialize it
                const deserializedContext = context instanceof Map ? context : MapSerializer.transformFromSerialization(context || {});

                const plugin = await this.createPlugin(verb, deserializedContext, guidance, language);
                res.json(plugin || {}); // Ensure to send a valid JSON response even if plugin is undefined
            } catch (error) {
                analyzeError(error as Error);
                console.error('Failed to create plugin:', error instanceof Error ? error.message : error);
                res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // OpenAPI tool registration endpoints
        app.post('/tools/openapi', async (req, res) => {
            try {
                const registrationRequest: OpenAPIToolRegistrationRequest = req.body;
                const result = await this.registerOpenAPITool(registrationRequest);
                res.json(result);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Failed to register OpenAPI tool:', error instanceof Error ? error.message : error);
                res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        app.post('/validate', async (req, res) => {
            try {
                const { manifest, code } = req.body;
                const result = await this.validateTool(manifest, code);
                res.json(result);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Failed to validate tool:', error instanceof Error ? error.message : error);
                res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        app.get('/tools/openapi/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const tool = await this.getOpenAPITool(id);
                if (!tool) {
                    res.status(404).json({ error: 'OpenAPI tool not found' });
                    return;
                }
                res.json(tool);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Failed to get OpenAPI tool:', error instanceof Error ? error.message : error);
                res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        // MCP Tool Endpoints - REMOVED as per revised plan
        // app.post('/tools/mcp', async (req, res) => { ... });
        // app.put('/tools/mcp/:id', async (req, res) => { ... });
        // app.get('/tools/mcp/:id', async (req, res) => { ... });
        // app.get('/tools/mcp', async (req, res) => { ... });
        // app.delete('/tools/mcp/:id', async (req, res) => { ... });

        app.post('/message', (req, res) => this.handleMessage(req, res));
        app.get('/statistics', (req, res) => { this.getStatistics(req, res) });

        app.post('/tools/onboard', async (req, res) => {
            try {
                const { toolManifest, policyConfig } = req.body;
                const result = await this.onboardTool(toolManifest, policyConfig);
                res.json(result);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Failed to onboard tool:', error instanceof Error ? error.message : error);
                res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        app.post('/repair', async (req, res) => {
            try {
                const { errorMessage, code } = req.body;
                const codeString = Array.isArray(code) ? code.join('\n') : code;
                const prompt = `The following code has an error: "${errorMessage}". Please repair the code and return only the fixed code with no additional text or explanation.\n\nCode:\n${codeString}`;

                const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, {
                    exchanges: [{ role: 'user', content: prompt }],
                    optimization: 'accuracy',
                    responseType: 'text'
                });

                const repairedCode = response.data.result || response.data.response || '';
                res.send(repairedCode);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Failed to repair code:', error instanceof Error ? error.message : error);
                res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        app.listen(this.port, () => {
            console.log(`Engineer listening at ${this.url}`);
        });
    }

    private getStatistics(req: express.Request, res: express.Response) {
        res.status(200).json({ newPlugins: this.newPlugins });
    }

    async createPlugin(verb: string, context: Map<string, InputValue>, guidance: string, language?: string): Promise<PluginDefinition | undefined> {
        console.log('Creating plugin for verb:', verb, 'with language:', language || 'auto-detect');
        this.newPlugins.push(verb);
        const explanation = await this.generateExplanation(verb, context);
        // Removed unused pluginStructure, configItems, metadata variable declarations from here

        try {
            const contextString = JSON.stringify(Array.from(context.entries()));

            // Determine plugin type and generate accordingly
            if (language === 'container') {
                return await this.createContainerPlugin(verb, context, explanation, guidance);
            }

            const engineeringPrompt = `Create a Python 3.9+ based plugin for the action verb "${verb}" with the following context: ${explanation}
            If Python is not suitable for this specific task (provide a brief justification if so), you may generate a JavaScript plugin instead.

            The planner provides this additional guidance: ${guidance}

            The plugin should expect inputs structured as a Map<string, InputValue>, where InputValue is defined as:
            interface InputValue {
                inputName: string;
                value: string | number | boolean | any[] | object | null;
                valueType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
                args?: Record<string, any>;
            }
            (Note: dependencyOutputs and agentDependencies are usually populated by the execution environment, not directly by you or planner).

            Use this context to determine the required inputs: ${contextString}

            Important requirements:
              1. The plugin MUST include comprehensive error handling.
              2. All external dependencies must be explicitly declared (e.g., in requirements.txt for Python).
              3. Include input validation for all parameters within the plugin code.
              4. Add logging for important operations.
              5. If the plugin might generate a plan, include PLAN in outputDefinitions.
              6. Include comprehensive unit tests in a separate file (e.g., 'test_main.py' for Python or 'plugin.test.js' for JavaScript) covering primary functionality, input validation, and edge cases.
              7. Add retry logic for external service calls if applicable.
              8. For Python plugins, ensure the main logic is in a \`main.py\` file.
              9. If the Python plugin requires external Python packages, include a \`requirements.txt\` file in the \`entryPoint.files\` listing these dependencies (e.g., \`requests==2.25.1\`).
              10. Python plugins MUST read their inputs (a JSON string representing the input Map, not InputValue directly but its serialized form) from standard input (stdin) and print their results (a JSON string representing a PluginOutput[] array) to standard output (stdout).
              11. Generated code should follow security best practices, including sanitizing any inputs used in shell commands or file paths, and avoiding common vulnerabilities.

            Provide a JSON object with the following structure:
            {
                "id": "plugin-${verb}",
                "verb": "${verb}",
                "description": "A short description of the plugin",
                "explanation": "A more complete description including inputs, process overview, and outputs",
                "inputDefinitions": [{
                  "name": "inputNameExample",
                  "required": true,
                  "type": "string", // Use PluginParameterType enum values
                  "description": "Brief explanation of the input"
                }],
                "outputDefinitions": [{
                  "name": "outputNameExample",
                  "required": true,
                  "type": "string", // Use PluginParameterType enum values
                  "description": "Brief explanation of the output"
                }],
                "language": "python", // "python" or "javascript"
                "entryPoint": {
                    "main": "main.py", // For Python
                    "files": {
                        "main.py": "# Python code here...\nimport json, sys\nif __name__ == '__main__':\n  try:\n    inputs_map_str = sys.stdin.read()\n    # inputs_map is a list of [key, InputValue] pairs as a JSON string from MapSerializer.transformForSerialization(Map<string, InputValue>)\n    # The Python script needs to deserialize this structure properly.\n    # Example: inputs_list_of_pairs = json.loads(inputs_map_str)\n    # inputs_dict = {item[0]: item[1]['inputValue'] for item in inputs_list_of_pairs} # Simplified example, actual structure of InputValue is more complex\n    # A better approach for Python would be to expect a simple JSON object of inputs, not a serialized Map.\n    # For now, stick to the prompt that it's a serialized Map<string, InputValue> from stdin.\n    result = [{'name': 'outputName', 'result': 'resultValue', 'resultType': 'string', 'success': true}]\n  except Exception as e:\n    result = [{'name': 'error', 'result': str(e), 'resultType': 'ERROR', 'success': false}]\n  print(json.dumps(result))",
                        "requirements.txt": "# e.g., requests>=2.20"
                    },
                    "test": {
                        "test_main.py": "# Python unit tests here..."
                    }
                },
                "configuration": [{
                    "key": "API_KEY_EXAMPLE",
                    "value": "Default value if any. If no default, this field can be omitted or set to null.",
                    "description": "Description of the configuration item",
                    "required": true,
                    "type": "string" // Should be one of 'string' | 'number' | 'boolean' | 'secret'
                }],
                "metadata": {
                    "category": ["text_processing"],
                    "tags": ["example", "text"],
                    "complexity": 3, // number from 1 to 10
                    "dependencies": ["python>=3.9"],
                    "version": "1.0.0" // Initial version
                }
            }
            Ensure the plugin's 'inputDefinitions' field accurately defines the expected inputs.
            The main file should implement the plugin logic.
            Include appropriate error handling and logging.
            Use publicly available web services where possible.
            The code should be immediately executable without any compilation step for the target language.
            Determine any necessary environment variables or configuration items needed for the plugin to function correctly.
`;

            const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, {
                exchanges: [{ role: 'user', content: engineeringPrompt }],
                optimization: 'accuracy',
                responseType: 'json'
            });
            
            // It's crucial that the Brain returns a JSON string that can be parsed.
            // Add robust parsing and error handling for the Brain's response.
            let pluginStructure;
            try {
                pluginStructure = JSON.parse(response.data.result || response.data.response || response.data); // Adjust based on actual Brain response structure
            } catch (parseError) {
                console.error('Error parsing Brain response for plugin structure:', parseError);
                console.error('Raw Brain response:', response.data);
                const errorMsg = (parseError && typeof parseError === 'object' && 'message' in parseError)
                    ? (parseError as Error).message
                    : String(parseError);
                throw new Error(`Failed to parse plugin structure from Brain: ${errorMsg}`);
            }


            const validationResult = this.validatePluginStructure(pluginStructure);
            if (!validationResult.valid) {
                console.error('Generated plugin structure is invalid:', validationResult.issues);
                throw new Error(`Generated plugin structure is invalid: ${validationResult.issues.join(', ')}`);
            }

            if (!await this.validatePluginCode(pluginStructure.entryPoint, pluginStructure.language)) {
                 console.error('Generated plugin code failed validation.');
                throw new Error('Generated plugin code failed validation');
            }

            return this.finalizePlugin(pluginStructure, explanation);
        } catch (error) {
            analyzeError(error as Error); // Ensure analyzeError is effective
            console.error('Error creating plugin in Engineer.createPlugin:', error instanceof Error ? error.message : String(error));
            return undefined; // Or rethrow, depending on desired error propagation
        }
    }


    private async handleMessage(req: express.Request, res: express.Response) {
        const message = req.body;
        console.log('Received message:', message);
        await super.handleBaseMessage(message);
        res.status(200).send({ status: 'Message received and processed' });
    }

    private determineRequiredPermissions(plugin: PluginDefinition): string[] {
        const permissions: string[] = [];
        if (!plugin.entryPoint?.files) return permissions;
        for (const [_, fileContent] of Object.entries(plugin.entryPoint?.files || {})) {
            const content = String(fileContent); // Ensure content is a string
            if (content.includes('fs.')) permissions.push('fs.read', 'fs.write'); // Basic check
            if (content.includes('fetch(')) permissions.push('net.fetch');
            if (content.includes('http.')) permissions.push('net.http');
            // Add more permission checks as needed
        }
        return [...new Set(permissions)]; // Remove duplicates
    }

    /**
     * Create a containerized plugin
     */
    async createContainerPlugin(verb: string, context: Map<string, InputValue>, explanation: string, guidance: string): Promise<PluginDefinition | undefined> {
        try {
            const contextString = JSON.stringify(Array.from(context.entries()));

            const containerPrompt = `Create a containerized plugin for the action verb "${verb}" with the following context: ${explanation}

The planner provides this additional guidance: ${guidance}

Generate a complete containerized plugin with the following structure:
1. A Dockerfile for the plugin container
2. A Python Flask application that implements the plugin logic
3. A manifest.json with container and API configuration
4. Requirements.txt for Python dependencies

The plugin should:
- Expose an HTTP API on port 8080
- Implement POST /execute endpoint for plugin execution
- Implement GET /health endpoint for health checks
- Handle inputs and outputs according to the plugin specification
- Include proper error handling and logging

Return a JSON object with this exact structure:
{
    "id": "plugin-${verb}",
    "verb": "${verb}",
    "description": "Brief description",
    "explanation": "Detailed explanation",
    "inputDefinitions": [...],
    "outputDefinitions": [...],
    "language": "container",
    "container": {
        "dockerfile": "Dockerfile",
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
            "app.py": "# Flask application code here",
            "Dockerfile": "# Dockerfile content here",
            "requirements.txt": "# Python dependencies here"
        }
    },
    "version": "1.0.0",
    "metadata": {...},
    "security": {...}
}

Context: ${contextString}`;

            const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, {
                exchanges: [{ role: 'user', content: containerPrompt }],
                optimization: 'accuracy',
                responseType: 'json'
            });
            const responseText = response.data.result || response.data.response || '';
            const pluginStructure = JSON.parse(responseText);

            if (!this.validateContainerPluginStructure(pluginStructure)) {
                console.error('Generated container plugin structure is invalid:', pluginStructure);
                throw new Error('Generated container plugin structure is invalid');
            }

            return this.finalizePlugin(pluginStructure, explanation);
        } catch (error) {
            console.error('Error creating container plugin:', error instanceof Error ? error.message : String(error));
            return undefined;
        }
    }

    /**
     * Validate container plugin structure
     */
    private validateContainerPluginStructure(plugin: any): boolean {
        const requiredFields = ['id', 'verb', 'description', 'inputDefinitions', 'outputDefinitions', 'language', 'container', 'api', 'entryPoint'];
        const allPresent = requiredFields.every(field => plugin[field]);

        if (!allPresent) {
            console.error('Missing required fields in container plugin structure:', requiredFields.filter(f => !plugin[f]));
            return false;
        }

        // Validate container configuration
        const container = plugin.container;
        if (!container.dockerfile || !container.image || !container.ports) {
            console.error('Container configuration missing required fields');
            return false;
        }

        // Validate API configuration
        const api = plugin.api;
        if (!api.endpoint || !api.method) {
            console.error('API configuration missing required fields');
            return false;
        }

        // Validate entry point
        if (!plugin.entryPoint.main || !plugin.entryPoint.files) {
            console.error('Entry point configuration missing required fields');
            return false;
        }

        return true;
    }

    private validatePluginStructure(plugin: any): { valid: boolean; issues: string[] } {
        const cacheKey = JSON.stringify(plugin);
        if (this.validationCache.has(cacheKey)) {
            return this.validationCache.get(cacheKey)!;
        }

        const startTime = Date.now();
        const issues: string[] = [];

        try {
            // Use AJV for JSON schema validation
            const validate = this.ajv.compile(this.pluginSchema);
            const valid = validate(plugin);

            if (!valid) {
                if (validate.errors) {
                    for (const error of validate.errors) {
                        issues.push(`Schema validation error: ${error.instancePath || 'root'} ${error.message}`);
                    }
                }
            }

            // Additional semantic validation
            if (plugin.language === 'container') {
                const containerValidate = this.ajv.compile(this.containerPluginSchema);
                const containerValid = containerValidate(plugin);
                if (!containerValid && containerValidate.errors) {
                    for (const error of containerValidate.errors) {
                        issues.push(`Container schema validation error: ${error.instancePath || 'root'} ${error.message}`);
                    }
                }
            }

            // Semantic analysis for plugin descriptions
            if (plugin.description && typeof plugin.description === 'string') {
                const semanticIssues = this.performSemanticAnalysis(plugin);
                issues.push(...semanticIssues);
            }

            const result = { valid: issues.length === 0, issues };

            // Cache the result
            this.validationCache.set(cacheKey, result);

            // Update performance metrics
            this.performanceMetrics.validationTime += Date.now() - startTime;

            return result;
        } catch (error) {
            console.error('Error during plugin validation:', error instanceof Error ? error.message : String(error));
            issues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
            return { valid: false, issues };
        }
    }

    private performSemanticAnalysis(plugin: any): string[] {
        const issues: string[] = [];

        // Check for meaningful descriptions
        if (plugin.description && plugin.description.length < 10) {
            issues.push('Plugin description should be more detailed (at least 10 characters)');
        }

        if (plugin.explanation && plugin.explanation.length < 20) {
            issues.push('Plugin explanation should be more comprehensive (at least 20 characters)');
        }

        // Check for duplicate input/output names
        const inputNames = plugin.inputDefinitions?.map((input: any) => input.name) || [];
        const outputNames = plugin.outputDefinitions?.map((output: any) => output.name) || [];

        const allNames = [...inputNames, ...outputNames];
        const uniqueNames = new Set(allNames);

        if (uniqueNames.size !== allNames.length) {
            issues.push('Duplicate input/output names detected');
        }

        // Check for common security issues in descriptions
        if (plugin.description && plugin.description.toLowerCase().includes('password')) {
            issues.push('Potential security concern: plugin description mentions password');
        }

        // Check for reasonable complexity
        if (plugin.metadata?.complexity && (plugin.metadata.complexity < 1 || plugin.metadata.complexity > 10)) {
            issues.push('Complexity should be between 1 and 10');
        }

        return issues;
    }

    private async validatePluginCode(entryPoint: EntryPointType, language: string): Promise<boolean> {
      if (!entryPoint || !entryPoint.files) {
          console.warn('No files found in entryPoint to validate.');
          // If files are truly optional (e.g. for packageSource plugins not generated here), this could be true.
          // But for Engineer-generated plugins, we expect files.
          return true; 
      }
      try {
          for (const [filename, contentStr] of Object.entries(entryPoint.files)) {
              const content = contentStr as string;
              if (language === 'javascript' && (filename.endsWith('.js') || filename.endsWith('.ts'))) {
                  new Function(content); 
                  console.log(`JavaScript file ${filename} passed basic syntax check.`);
              } else if (language === 'python' && filename.endsWith('.py')) {
                  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validate-python-'));
                  const tempPyFile = path.join(tempDir, filename);
                  await fs.writeFile(tempPyFile, content);
                  try {
                      await execAsync(`python3 -m py_compile ${tempPyFile}`);
                      console.log(`Python file ${filename} compiled successfully.`);
                  } catch (compileError: any) {
                      console.error(`Python compilation failed for ${filename}:`, compileError.stderr || compileError.message);
                      throw new Error(`Python compilation failed for ${filename}: ${compileError.stderr || compileError.message}`);
                  } finally {
                      await fs.rm(tempDir, { recursive: true, force: true }).catch(e => console.error(`Error deleting temp dir ${tempDir}: ${e}`));
                  }
              }
          }
          return true;
      } catch (error: any) {
          console.error('Code validation error:', error.message);
          return false;
      }
    }

    private finalizePlugin(pluginStructure: any, explanation: string): PluginManifest {
      const plugin: PluginManifest = {
          id: pluginStructure.id,
          verb: pluginStructure.verb,
          description: pluginStructure.description,
          explanation: explanation,
          inputDefinitions: pluginStructure.inputDefinitions,
          outputDefinitions: pluginStructure.outputDefinitions,
          language: pluginStructure.language,
          entryPoint: pluginStructure.entryPoint,
          packageSource: pluginStructure.packageSource, // Include if LLM might provide it
          configuration: (pluginStructure.configuration || []).map((item: any): PluginConfigurationItem => ({
              key: item.key,
              value: item.value, // Relies on PluginConfigurationItem.value being optional (value?: type | null)
              description: item.description,
              required: item.required,
              type: item.type || 'string' // Default 'type' for safety
          })),
          version: pluginStructure.version || '1.0.0', // Default version
          metadata: pluginStructure.metadata as PluginMetadata, // Cast, assuming LLM provides compatible structure
          repository: pluginStructure.repository || { type: 'generated', url: 'internal' }, // Ensure repository is always present
          security: {
              permissions: this.determineRequiredPermissions(pluginStructure as PluginDefinition), // Cast for this call
              sandboxOptions: {
                  allowEval: pluginStructure.security?.sandboxOptions?.allowEval || false,
                  timeout: pluginStructure.security?.sandboxOptions?.timeout || 5000,
                  memory: pluginStructure.security?.sandboxOptions?.memory || (128 * 1024 * 1024),
                  allowedModules: pluginStructure.security?.sandboxOptions?.allowedModules || ['fs', 'path', 'http', 'https'],
                  allowedAPIs: pluginStructure.security?.sandboxOptions?.allowedAPIs || ['fetch', 'console']
              },
              trust: {
                  publisher: pluginStructure.security?.trust?.publisher || 'system-generated',
                  signature: undefined // Signature will be added here
              }
          }
      };

      try {
          plugin.security.trust.signature = signPlugin(plugin);
          console.log(`Plugin ${plugin.id} signed successfully`);
      } catch (error: any) {
          console.error(`Error signing plugin ${plugin.id}:`, error.message);
          // Decide if failure to sign should prevent plugin creation
      }

      return plugin;
  }

    private async generateExplanation(verb: string, context: Map<string, InputValue>): Promise<string> {
        const contextString = JSON.stringify(Array.from(context.entries()));
        const prompt = `Given the action verb "${verb}" and the context (inputs for the current step) "${contextString}", provide a detailed explanation of what a plugin for this verb should do. Include expected inputs it would define and typical outputs it would produce.`;
        try {
            const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, {
                exchanges: [{ role: 'user', content: prompt }],
                optimization: 'accuracy',
                responseType: 'text'
            });
            return response.data.result || response.data.response || ''; // Adjust based on Brain response
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error querying Brain for explanation:', error instanceof Error ? error.message : String(error));
            return ''; // Return empty string or throw, depending on how critical this is
        }
    }

    // OpenAPI Tool Management Methods

    async registerOpenAPITool(request: OpenAPIToolRegistrationRequest): Promise<OpenAPIParsingResult> {
        console.log('Registering OpenAPI tool:', request.name);

        try {
            // Fetch and parse the OpenAPI specification
            const specResponse = await axios.get(request.specUrl);
            const spec = specResponse.data;

            // Parse the OpenAPI specification
            const parsingResult = await this.parseOpenAPISpec(spec, request);

            if (parsingResult.success && parsingResult.tool) {
                // Store the tool in the librarian
                await this.storeOpenAPITool(parsingResult.tool);
                console.log(`OpenAPI tool ${parsingResult.tool.id} registered successfully`);
            }

            return parsingResult;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error registering OpenAPI tool:', error instanceof Error ? error.message : error);
            return {
                success: false,
                errors: [error instanceof Error ? error.message : String(error)]
            };
        }
    }

    private async parseOpenAPISpec(spec: any, request: OpenAPIToolRegistrationRequest): Promise<OpenAPIParsingResult> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const discoveredOperations: any[] = [];

        try {
            // Validate basic OpenAPI structure
            if (!spec.openapi && !spec.swagger) {
                errors.push('Invalid OpenAPI specification: missing version field');
                return { success: false, errors };
            }

            const specVersion = spec.openapi || spec.swagger;
            const isV3 = specVersion.startsWith('3.');
            const isV2 = specVersion.startsWith('2.');

            if (!isV2 && !isV3) {
                errors.push(`Unsupported OpenAPI version: ${specVersion}`);
                return { success: false, errors };
            }

            // Extract basic info
            const info = spec.info || {};
            const baseUrl = request.baseUrl || this.extractBaseUrl(spec);

            // Parse paths and operations
            const paths = spec.paths || {};
            const actionMappings: OpenAPIActionMapping[] = [];

            for (const [pathPattern, pathItem] of Object.entries(paths)) {
                if (typeof pathItem !== 'object' || pathItem === null) continue;

                for (const [method, operation] of Object.entries(pathItem as any)) {
                    if (!['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) continue;
                    if (typeof operation !== 'object' || operation === null) continue;

                    const op = operation as any;
                    const operationId = op.operationId || `${method}_${pathPattern.replace(/[^a-zA-Z0-9]/g, '_')}`;

                    // Discover operation details
                    discoveredOperations.push({
                        operationId,
                        method: method.toUpperCase(),
                        path: pathPattern,
                        summary: op.summary,
                        description: op.description,
                        parameters: op.parameters || [],
                        responses: op.responses || {}
                    });

                    // Create action mapping
                    const actionMapping = this.createActionMapping(
                        operationId,
                        method.toUpperCase(),
                        pathPattern,
                        op,
                        isV3
                    );

                    if (actionMapping) {
                        actionMappings.push(actionMapping);
                    }
                }
            }

            // Create the OpenAPI tool
            const tool: OpenAPITool = {
                id: this.generateToolId(request.name),
                name: request.name,
                description: request.description || info.description || `OpenAPI tool for ${request.name}`,
                version: info.version || '1.0.0',
                specUrl: request.specUrl,
                specVersion: isV3 ? '3.0' : '2.0',
                baseUrl,
                authentication: request.authentication,
                actionMappings,
                metadata: {
                    author: request.metadata?.author || info.contact?.name || 'Unknown',
                    created: new Date(),
                    tags: request.metadata?.tags || [],
                    category: request.metadata?.category || 'external-api'
                }
            };

            return {
                success: true,
                tool,
                warnings,
                discoveredOperations
            };

        } catch (error) {
            analyzeError(error as Error);
            errors.push(`Error parsing OpenAPI spec: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false, errors };
        }
    }

    private extractBaseUrl(spec: any): string {
        // OpenAPI 3.x
        if (spec.servers && spec.servers.length > 0) {
            return spec.servers[0].url;
        }

        // OpenAPI 2.x (Swagger)
        if (spec.host) {
            const scheme = spec.schemes && spec.schemes.length > 0 ? spec.schemes[0] : 'https';
            const basePath = spec.basePath || '';
            return `${scheme}://${spec.host}${basePath}`;
        }

        return '';
    }

    private createActionMapping(
        operationId: string,
        method: string,
        path: string,
        operation: any,
        isV3: boolean
    ): OpenAPIActionMapping | null {
        try {
            const inputs: OpenAPIParameterMapping[] = [];
            const outputs: OpenAPIResponseMapping[] = [];

            // Parse parameters
            const parameters = operation.parameters || [];
            for (const param of parameters) {
                const input: OpenAPIParameterMapping = {
                    name: param.name,
                    in: param.in as any,
                    type: this.mapOpenAPITypeToPluginType(param.type || param.schema?.type),
                    required: param.required || false,
                    description: param.description,
                    schema: isV3 ? param.schema : undefined
                };
                inputs.push(input);
            }

            // Parse request body (OpenAPI 3.x)
            if (isV3 && operation.requestBody) {
                const requestBody = operation.requestBody;
                const content = requestBody.content;

                if (content) {
                    for (const [mediaType, mediaTypeObject] of Object.entries(content)) {
                        if (mediaType.includes('json')) {
                            const input: OpenAPIParameterMapping = {
                                name: 'body',
                                in: 'body',
                                type: PluginParameterType.OBJECT,
                                required: requestBody.required || false,
                                description: requestBody.description || 'Request body',
                                schema: (mediaTypeObject as any).schema
                            };
                            inputs.push(input);
                            break;
                        }
                    }
                }
            }

            // Parse responses
            const responses = operation.responses || {};
            for (const [statusCode, response] of Object.entries(responses)) {
                if (statusCode.startsWith('2')) { // Success responses
                    const output: OpenAPIResponseMapping = {
                        name: 'result',
                        type: PluginParameterType.OBJECT,
                        description: (response as any).description || 'API response',
                        statusCode: parseInt(statusCode),
                        schema: isV3 ? (response as any).content?.['application/json']?.schema : (response as any).schema
                    };
                    outputs.push(output);
                }
            }

            // Generate action verb from operation ID
            const actionVerb = this.generateActionVerb(operationId);

            return {
                actionVerb,
                operationId,
                method: method as any,
                path,
                description: operation.summary || operation.description,
                inputs,
                outputs,
                timeout: 60000 // Default 60 second timeout
            };

        } catch (error) {
            console.error(`Error creating action mapping for ${operationId}:`, error);
            return null;
        }
    }

    private mapOpenAPITypeToPluginType(openApiType: string): PluginParameterType {
        switch (openApiType?.toLowerCase()) {
            case 'string':
                return PluginParameterType.STRING;
            case 'number':
            case 'integer':
                return PluginParameterType.NUMBER;
            case 'boolean':
                return PluginParameterType.BOOLEAN;
            case 'array':
                return PluginParameterType.ARRAY;
            case 'object':
                return PluginParameterType.OBJECT;
            default:
                return PluginParameterType.STRING;
        }
    }

    private generateToolId(name: string): string {
        return `openapi-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    }

    private generateActionVerb(operationId: string): string {
        // Convert camelCase or snake_case to UPPER_CASE
        return operationId
            .replace(/([a-z])([A-Z])/g, '$1_$2')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .toUpperCase();
    }

    private async storeOpenAPITool(tool: OpenAPITool): Promise<void> {
        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'openApiTools',
                id: tool.id,
                data: tool,
                storageType: 'mongo'
            });
            console.log(`Stored OpenAPI tool: ${tool.id}`);
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to store OpenAPI tool: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async getOpenAPITool(id: string): Promise<OpenAPITool | null> {
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${id}`, {
                params: {
                    collection: 'openApiTools',
                    storageType: 'mongo'
                }
            });
            return response.data?.data || null;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error retrieving OpenAPI tool:', error instanceof Error ? error.message : error);
            return null;
        }
    }

    async validateTool(manifest: any, code?: string): Promise<{ valid: boolean; issues: string[] }> {
        const cacheKey = `validate-tool-${crypto.createHash('sha256').update(JSON.stringify({ manifest, code })).digest('hex')}`;
        try {
            const cachedResult = await redisCache.get<{ valid: boolean; issues: string[] }>(cacheKey);
            if (cachedResult) {
                console.log(`[Engineer] Cache hit for tool validation: ${manifest.id}`);
                return cachedResult;
            }
        } catch (error) {
            analyzeError(error as Error);
        }

        const issues: string[] = [];

        try {
            // Basic manifest validation
            if (!manifest.id) issues.push('Tool ID is required');
            if (!manifest.name) issues.push('Tool name is required');
            if (!manifest.description) issues.push('Tool description is required');

            // Type-specific validation
            if (manifest.type === 'openapi') {
                if (!manifest.specUrl) issues.push('OpenAPI spec URL is required');
                if (!manifest.authentication) issues.push('Authentication configuration is required');
            } else if (manifest.type === 'plugin') {
                if (!manifest.language) issues.push('Plugin language is required');
                if (!manifest.entryPoint) issues.push('Plugin entry point is required');
                if (code && !this.validatePluginCodeString(code, manifest.language)) {
                    issues.push('Plugin code validation failed');
                }
            }

            const result = {
                valid: issues.length === 0,
                issues
            };

            try {
                await redisCache.set(cacheKey, result, 3600); // Cache for 1 hour
            } catch (error) {
                analyzeError(error as Error);
            }

            return result;

        } catch (error) {
            analyzeError(error as Error);
            issues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
            return { valid: false, issues };
        }
    }

    private validatePluginCodeString(code: string, language: string): boolean {
        // Basic code validation - can be enhanced
        if (!code || code.trim().length === 0) return false;

        switch (language.toLowerCase()) {
            case 'python':
                // Basic Python syntax check
                return !code.includes('import os') || code.includes('# SAFE_OS_IMPORT');
            case 'javascript':
            case 'typescript': // Added typescript
                // Basic JavaScript/TypeScript syntax check
                try {
                    new Function(code);
                    return true;
                } catch {
                    return false;
                }
            default:
                return true; // Allow unknown languages for now
        }
    }

    private async onboardTool(toolManifest: any, policyConfig: any): Promise<any> {
        console.log(`Onboarding tool: ${toolManifest.id}`);

        try {
            // 1. Determine wrapper language (e.g., TypeScript for web APIs, Python for others)
            const wrapperLanguage = 'typescript'; // Default for now, can be dynamic

            // 2. Generate wrapper plugin code and unit tests using the Brain
            const generatedPlugin = await this.generateWrapperPlugin(toolManifest, policyConfig, wrapperLanguage);

            if (!generatedPlugin) {
                throw new Error('Failed to generate wrapper plugin.');
            }

            // 3. Validate and execute generated unit tests
            const testResult = await this.executeWrapperTests(generatedPlugin);
            if (!testResult.valid) {
                throw new Error(`Wrapper plugin tests failed: ${testResult.issues.join(', ')}`);
            }

            // 4. Register the new wrapper plugin with the PluginMarketplace/CapabilitiesManager
            // The finalizePlugin method already handles signing and returns a PluginDefinition
            const finalPluginDefinition = this.finalizePlugin(generatedPlugin, generatedPlugin.explanation);

            // Assuming PluginMarketplace.store takes a PluginDefinition
            await this.pluginMarketplace.store(finalPluginDefinition);
            console.log(`Wrapper plugin ${finalPluginDefinition.id} registered with PluginMarketplace.`);

            // 5. Update the status of the tool in the Librarian's database (from approved to active)
            // This would be an API call to Librarian, e.g., PUT /tools/pending/:id/activate
            // For now, we'll assume the Librarian handles this after receiving the approval response.

            return { success: true, message: `Tool ${toolManifest.id} onboarded successfully.` };

        } catch (error) {
            console.error('Error in onboardTool:', error instanceof Error ? error.message : error);
            throw error; // Re-throw for API endpoint to catch and return 500
        }
    }

    private async generateWrapperPlugin(toolManifest: any, policyConfig: any, language: string): Promise<any> {
        console.log(`Generating wrapper plugin for ${toolManifest.id} in ${language}...`);
        const prompt = `Generate a ${language} wrapper plugin for the following tool manifest:
${JSON.stringify(toolManifest, null, 2)}

Apply the following policy configurations:
${JSON.stringify(policyConfig, null, 2)}

The wrapper should:
1. Act as a client for the external API defined in the toolManifest.
2. Enforce the provided policy configurations (e.g., rate limits, access control).
3. Include input/output schema validation.
4. Provide a basic unit test suite for the wrapper.
5. Return a PluginDefinition JSON object, including entryPoint.files for the wrapper code and tests.
`;

        try {
            const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, {
                exchanges: [{ role: 'user', content: prompt }],
                optimization: 'accuracy',
                responseType: 'json'
            });
            const generatedPlugin = JSON.parse(response.data.result || response.data.response || response.data);
            const validationResult = this.validatePluginStructure(generatedPlugin);
            if (!validationResult.valid) {
                throw new Error(`Generated wrapper plugin structure is invalid: ${validationResult.issues.join(', ')}`);
            }
            return generatedPlugin;
        } catch (error) {
            console.error('Error generating wrapper plugin:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    private async executeWrapperTests(generatedPlugin: any): Promise<{ valid: boolean; issues: string[] }> {
        console.log(`Executing wrapper tests for ${generatedPlugin.id}...`);
        const issues: string[] = [];
        const startTime = Date.now();

        // Assuming generatedPlugin has entryPoint.files and language
        if (!generatedPlugin.entryPoint || !generatedPlugin.entryPoint.files || !generatedPlugin.language) {
            issues.push('Generated plugin missing entryPoint, files, or language for testing.');
            return { valid: false, issues };
        }

        try {
            // Use the existing validatePluginCode for basic syntax and compilation checks
            const codeValidationPassed = await this.validatePluginCode(generatedPlugin.entryPoint, generatedPlugin.language);
            if (!codeValidationPassed) {
                issues.push('Generated wrapper code failed basic validation.');
                return { valid: false, issues };
            }

            // Implement actual test execution logic
            const testExecutionResult = await this.executeTestRunner(generatedPlugin);
            if (!testExecutionResult.valid) {
                issues.push(...testExecutionResult.issues);
            }

            // Update performance metrics
            this.performanceMetrics.testExecutionTime += Date.now() - startTime;

            return { valid: issues.length === 0, issues };
        } catch (error) {
            console.error('Error executing wrapper tests:', error instanceof Error ? error.message : error);
            issues.push(`Test execution failed: ${error instanceof Error ? error.message : String(error)}`);
            return { valid: false, issues };
        }
    }

    private async executeTestRunner(generatedPlugin: any): Promise<{ valid: boolean; issues: string[] }> {
        const issues: string[] = [];
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `plugin-test-${generatedPlugin.id}-`));

        try {
            // Write all plugin files to temporary directory
            for (const [filename, content] of Object.entries(generatedPlugin.entryPoint.files)) {
                const filePath = path.join(tempDir, filename);
                const contentStr = typeof content === 'string' ? content : String(content);
                await fs.writeFile(filePath, contentStr);
            }

            // Determine test runner based on language
            const language = generatedPlugin.language;
            let testCommand = '';
            let testPattern = '';

            if (language === 'javascript' || language === 'typescript') {
                // Look for test files (Jest/Mocha)
                const testFiles = Object.keys(generatedPlugin.entryPoint.files || {})
                    .filter(f => f.includes('test') || f.includes('spec'));

                if (testFiles.length === 0) {
                    issues.push('No test files found for JavaScript/TypeScript plugin');
                    return { valid: false, issues };
                }

                testCommand = 'npx jest --passWithNoTests';
                testPattern = testFiles.join(' ');
            } else if (language === 'python') {
                // Look for Python test files
                const testFiles = Object.keys(generatedPlugin.entryPoint.files || {})
                    .filter(f => f.startsWith('test_') || f.endsWith('_test.py'));

                if (testFiles.length === 0) {
                    issues.push('No test files found for Python plugin');
                    return { valid: false, issues };
                }

                testCommand = 'python -m pytest --tb=short';
                testPattern = testFiles.join(' ');
            } else {
                issues.push(`Test execution not supported for language: ${language}`);
                return { valid: false, issues };
            }

            // Execute tests
            const fullCommand = `${testCommand} ${testPattern}`;
            console.log(`Executing test command: ${fullCommand}`);

            const { stdout, stderr } = await execAsync(fullCommand, { cwd: tempDir });

            // Parse test results
            if (stderr && stderr.includes('FAIL')) {
                issues.push(`Tests failed: ${stderr}`);
                return { valid: false, issues };
            }

            if (stdout && (stdout.includes('PASS') || stdout.includes('passed'))) {
                console.log(`Tests passed successfully for ${generatedPlugin.id}`);
                return { valid: true, issues };
            }

            // If we get here, tests might have run but we couldn't determine the result
            issues.push('Could not determine test execution result');
            return { valid: false, issues };

        } catch (error) {
            console.error(`Test execution error for ${generatedPlugin.id}:`, error);
            issues.push(`Test execution error: ${error instanceof Error ? error.message : String(error)}`);
            return { valid: false, issues };
        } finally {
            // Clean up temporary directory
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error(`Error cleaning up test directory ${tempDir}:`, cleanupError);
            }
        }
    }

    private async createPluginWithRecovery(verb: string, context: Map<string, InputValue>, guidance: string, language?: string, attempt: number = 1): Promise<PluginDefinition | undefined> {
        const maxAttempts = 3;
        const maxBackoff = 5000; // 5 seconds

        try {
            console.log(`Attempt ${attempt} to create plugin for verb: ${verb}`);
            return await this.createPlugin(verb, context, guidance, language);
        } catch (error) {
            if (attempt >= maxAttempts) {
                console.error(`Failed to create plugin after ${maxAttempts} attempts:`, error);
                throw error;
            }

            // Exponential backoff with jitter
            const backoff = Math.min(
                maxBackoff,
                Math.pow(2, attempt) * 1000 + Math.random() * 1000
            );

            console.warn(`Plugin creation attempt ${attempt} failed. Retrying in ${backoff}ms...`, error);

            await new Promise(resolve => setTimeout(resolve, backoff));

            // Try to recover by generating a simpler version
            if (attempt === 1) {
                const simplifiedGuidance = `Create a simpler version of: ${guidance}`;
                return this.createPluginWithRecovery(verb, context, simplifiedGuidance, language, attempt + 1);
            }

            return this.createPluginWithRecovery(verb, context, guidance, language, attempt + 1);
        }
    }

    private async enhanceErrorHandlingInPlugin(plugin: PluginDefinition): Promise<PluginDefinition> {
        // Add enhanced error handling to the plugin code
        if (!plugin.entryPoint || !plugin.entryPoint.files) {
            return plugin;
        }

        const enhancedFiles = { ...plugin.entryPoint.files };

        // Add error handling wrapper to main file
        if (plugin.language === 'python' && enhancedFiles['main.py']) {
            let mainCode = enhancedFiles['main.py'];
            if (!mainCode.includes('try:')) {
                mainCode = `import traceback
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

${mainCode}

if __name__ == '__main__':
    try:
        ${mainCode.match(/if __name__ == '__main__':\\n([\\s\\S]*)/)?.[1] || 'pass'}
    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        logger.debug(traceback.format_exc())
        # Return error output
        import json
        print(json.dumps([{
            'name': 'error',
            'result': str(e),
            'resultType': 'ERROR',
            'success': False
        }]))
`;
                enhancedFiles['main.py'] = mainCode;
            }
        }
        else if ((plugin.language === 'javascript' || plugin.language === 'typescript') &&
                 (enhancedFiles['index.js'] || enhancedFiles['main.js'])) {
            const mainFile = enhancedFiles['index.js'] ? 'index.js' : 'main.js';
            let jsCode = enhancedFiles[mainFile];
            if (!jsCode.includes('try ') && !jsCode.includes('catch')) {
                jsCode = `const logger = console;

${jsCode}

try {
    ${jsCode.match(/module\\.exports = ([\\s\\S]*);/)?.[1] || jsCode}
} catch (error) {
    logger.error('Plugin execution failed:', error);
    // Return error output
    return [{
        name: 'error',
        result: error.message,
        resultType: 'ERROR',
        success: false
    }];
}`;
                enhancedFiles[mainFile] = jsCode;
            }
        }

        return {
            ...plugin,
            entryPoint: {
                ...plugin.entryPoint,
                files: enhancedFiles
            }
        };
    }

    private logPerformanceMetrics() {
        console.log('Engineer Performance Metrics:');
        console.log(`- Validation Time: ${this.performanceMetrics.validationTime}ms`);
        console.log(`- Generation Time: ${this.performanceMetrics.generationTime}ms`);
        console.log(`- Test Execution Time: ${this.performanceMetrics.testExecutionTime}ms`);
        console.log(`- Total Time: ${this.performanceMetrics.validationTime + this.performanceMetrics.generationTime + this.performanceMetrics.testExecutionTime}ms`);
    }
}


// Instantiate the Engineer - this line should typically be in an entry point file (e.g., index.ts for the service)
// If Engineer.ts is the main file for the service, it's fine.
new Engineer(); // Commenting out if this isn't the main service entry point.
