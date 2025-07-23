import axios from 'axios';
import express from 'express';
import {
    MapSerializer,
    BaseEntity,
    InputValue,
    PluginDefinition,
    PluginParameter,
    PluginMetadata, // Changed from MetadataType
    PluginConfigurationItem, // Changed from ConfigItem
    signPlugin,
    EntryPointType,      // Added for clarity if used directly
    PluginParameterType,  // Added for clarity if used directly
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
// Removed createHash as it wasn't used in the provided snippets
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path'; // Added for temp file operations
import os from 'os';     // Added for temp file operations

const execAsync = promisify(exec);

export class Engineer extends BaseEntity {
    private brainUrl: string = process.env.BRAIN_URL || 'brain:5070';
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private newPlugins: Array<string> = [];
    private pluginMarketplace: PluginMarketplace;

    constructor() {
        super('Engineer', 'Engineer', `engineer`, process.env.PORT || '5050');
        this.pluginMarketplace = new PluginMarketplace();
        this.initialize();
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
                optimization: 'accuracy' // Consider other optimization strategies if needed
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


            if (!this.validatePluginStructure(pluginStructure)) {
                console.error('Generated plugin structure is invalid:', pluginStructure);
                throw new Error('Generated plugin structure is invalid');
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
                optimization: 'accuracy'
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

    private validatePluginStructure(plugin: any): boolean {
      // TODO: Implement JSON schema validation for comprehensive manifest checking.
      const requiredFields = ['id', 'verb', 'description', 'inputDefinitions', 'outputDefinitions', 'language', 'entryPoint'];
      const allPresent = requiredFields.every(field => plugin[field]);
      if (!allPresent) {
          console.error('Missing one or more required fields in plugin structure:', requiredFields.filter(f => !plugin[f]));
          return false;
      }
      if (!plugin.entryPoint.main || typeof plugin.entryPoint.main !== 'string') {
          console.error('plugin.entryPoint.main is missing or not a string.');
          return false;
      }
      // entryPoint.files can be optional if packageSource is used, but for LLM generation, we expect files.
      if (!plugin.entryPoint.files || typeof plugin.entryPoint.files !== 'object' || Object.keys(plugin.entryPoint.files).length === 0) {
          console.warn('plugin.entryPoint.files is missing or empty. This might be okay if packageSource is intended, but Engineer usually generates files.');
          // Depending on strictness, this could return false. For now, a warning.
      }
      return true;
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

    private finalizePlugin(pluginStructure: any, explanation: string): PluginDefinition {
      const plugin: PluginDefinition = {
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
                optimization: 'accuracy'
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

            return {
                valid: issues.length === 0,
                issues
            };

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
                // Basic JavaScript syntax check
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

    // MCP Tool Management Methods - REMOVED as per revised plan
    // private validateMCPToolDefinition(...) { ... }
    // async registerMCPTool(...) { ... }
    // async updateMCPTool(...) { ... }
    // async getMCPTool(...) { ... }
    // async listMCPTools(...) { ... }
    // async deleteMCPTool(...) { ... }
}

// Instantiate the Engineer - this line should typically be in an entry point file (e.g., index.ts for the service)
// If Engineer.ts is the main file for the service, it's fine.
new Engineer(); // Commenting out if this isn't the main service entry point.
