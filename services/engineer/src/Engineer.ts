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
import { analyzeError } from '@cktmcs/shared';
import { PluginMarketplace } from '@cktmcs/marketplace';
import { redisCache } from '@cktmcs/shared';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

// New utility imports
import logger, { ScopedLogger } from './utils/Logger';
import {
    EngineerErrorHandler,
    ErrorSeverity,
    withRetry,
    DEFAULT_RETRY_STRATEGY,
    RetryStrategy
} from './utils/ErrorHandler';
import {
    serviceClientManager,
    BrainClient,
    LibrarianClient
} from './utils/ServiceClient';
import {
    generatePluginPrompt,
    generateWrapperPluginPrompt,
    generateContainerPluginPrompt,
    generateRepairPrompt
} from './utils/PromptTemplates';
import {
    cacheManager,
    validationCache,
    generatedCodeCache,
    ValidationCache,
    GeneratedCodeCache
} from './utils/CacheManager';

const execAsync = promisify(exec);

// Log service initialization
logger.info('Engineer service module loaded');

export class Engineer extends BaseEntity {
    private brainUrl: string = process.env.BRAIN_URL || 'brain:5070';
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private newPlugins: Array<string> = [];
    private pluginMarketplace: PluginMarketplace;
    private ajv: Ajv;
    private pluginSchema: object;
    private containerPluginSchema: object;
    private validationCache: ValidationCache;
    private generatedCodeCache: GeneratedCodeCache;
    private brainClient!: BrainClient;
    private librarianClient!: LibrarianClient;
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
        this.validationCache = new ValidationCache();
        this.generatedCodeCache = new GeneratedCodeCache();
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
        // Initialize service clients with retry strategies
        serviceClientManager.initialize(this.brainUrl, this.librarianUrl);
        this.brainClient = serviceClientManager.getBrainClient();
        this.librarianClient = serviceClientManager.getLibrarianClient();
        
        logger.info('Engineer service initializing', { 
            port: this.port,
            brainUrl: this.brainUrl,
            librarianUrl: this.librarianUrl
        });
        
        await this.setupServer();
    }

    private async setupServer() {
        const app = express();
        app.use(express.json());

        // Request logging middleware with correlation IDs
        app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            const context = logger.createContext(`${req.method} ${req.path}`, {
                method: req.method,
                path: req.path,
                ip: req.ip
            });

            if (req.path === '/health' || req.path === '/ready') {
                return next();
            }

            logger.info(`Incoming request: ${req.method} ${req.path}`);
            this.verifyToken(req, res, next);
        });

        app.post('/createPlugin', async (req, res) => {
            const scoped = logger.createScoped('POST /createPlugin');
            
            try {
                const { verb, context, guidance, language } = req.body;
                scoped.debug('Creating plugin', { verb, language });

                const deserializedContext = context instanceof Map ? context : MapSerializer.transformFromSerialization(context || {});
                const plugin = await this.createPlugin(verb, deserializedContext, guidance, language, scoped);
                
                scoped.complete('Plugin created successfully');
                res.json(plugin || {});
            } catch (error) {
                this.handleErrorResponse(res, error as Error, scoped);
            }
        });

        // OpenAPI tool registration endpoints
        app.post('/tools/openapi', async (req, res) => {
            const scoped = logger.createScoped('POST /tools/openapi');
            try {
                const registrationRequest: OpenAPIToolRegistrationRequest = req.body;
                scoped.debug('Registering OpenAPI tool', { toolName: registrationRequest.name });
                
                const result = await this.registerOpenAPITool(registrationRequest, scoped);
                scoped.complete('OpenAPI tool registered');
                res.json(result);
            } catch (error) {
                this.handleErrorResponse(res, error as Error, scoped);
            }
        });

        app.post('/validate', async (req, res) => {
            const scoped = logger.createScoped('POST /validate');
            try {
                const { manifest, code } = req.body;
                scoped.debug('Validating tool', { toolId: manifest.id });
                
                const result = await this.validateTool(manifest, code, scoped);
                scoped.complete('Tool validation complete');
                res.json(result);
            } catch (error) {
                this.handleErrorResponse(res, error as Error, scoped);
            }
        });

        app.get('/tools/openapi/:id', async (req, res) => {
            const scoped = logger.createScoped('GET /tools/openapi/:id');
            try {
                const { id } = req.params;
                scoped.debug('Retrieving OpenAPI tool', { id });
                
                const tool = await this.getOpenAPITool(id, scoped);
                if (!tool) {
                    return res.status(404).json({ error: 'OpenAPI tool not found' });
                }
                res.json(tool);
            } catch (error) {
                this.handleErrorResponse(res, error as Error, scoped);
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
            const scoped = logger.createScoped('POST /tools/onboard');
            try {
                const { toolManifest, policyConfig } = req.body;
                scoped.debug('Onboarding tool', { toolId: toolManifest.id });
                
                const result = await this.onboardTool(toolManifest, policyConfig, scoped);
                scoped.complete('Tool onboarded successfully');
                res.json(result);
            } catch (error) {
                this.handleErrorResponse(res, error as Error, scoped);
            }
        });

        app.post('/createPluginFromOpenAPI', async (req, res) => {
            const scoped = logger.createScoped('POST /createPluginFromOpenAPI');
            const { specUrl, name, description, authentication, baseUrl } = req.body;

            if (!specUrl || !name) {
                return res.status(400).json({ error: 'specUrl and name are required' });
            }

            try {
                scoped.debug('Creating plugin from OpenAPI', { name, specUrl });
                const result = await this.createPluginFromOpenAPI(specUrl, name, description, authentication, baseUrl, scoped);
                scoped.complete('Plugin created from OpenAPI');
                res.json(result);
            } catch (error) {
                this.handleErrorResponse(res, error as Error, scoped);
            }
        });

        app.post('/repair', async (req, res) => {
            const scoped = logger.createScoped('POST /repair');
            try {
                const { errorMessage, code } = req.body;
                scoped.debug('Repairing code', { errorLength: String(code).length });
                
                const result = await this.repairCode(errorMessage, code, scoped);
                scoped.complete('Code repaired successfully');
                res.send(result);
            } catch (error) {
                this.handleErrorResponse(res, error as Error, scoped);
            }
        });

        app.listen(this.port, () => {
            logger.info(`Engineer listening at ${this.url}`);
        });
    }

    private getStatistics(req: express.Request, res: express.Response) {
        const stats = {
            newPlugins: this.newPlugins,
            cache: cacheManager.getStatistics(),
            performanceMetrics: this.performanceMetrics
        };
        res.status(200).json(stats);
    }

    /**
     * Centralized error response handler
     */
    private handleErrorResponse(
        res: express.Response,
        error: Error,
        scoped?: ScopedLogger
    ): void {
        const engineerError = error as any;
        const statusCode = EngineerErrorHandler.extractStatusCode(engineerError);
        const message = EngineerErrorHandler.extractMessage(engineerError);

        if (scoped) {
            scoped.error('Operation failed', error);
        } else {
            logger.error('Operation failed', error);
        }

        res.status(statusCode).json({
            error: message,
            code: engineerError.code || 'UNKNOWN',
            severity: engineerError.severity || ErrorSeverity.MEDIUM,
            retryable: engineerError.retryable ?? false
        });
    }

    async createPlugin(
        verb: string,
        context: Map<string, InputValue>,
        guidance: string,
        language?: string,
        scoped?: ScopedLogger
    ): Promise<PluginDefinition | undefined> {
        return await this.createPluginWithRecovery(verb, context, guidance, language, 1, scoped);
    }




    private async handleMessage(req: express.Request, res: express.Response) {
        const scoped = logger.createScoped('POST /message');
        try {
            const message = req.body;
            scoped.debug('Processing message', { messageType: message.type });
            
            const result = await super.handleBaseMessage(message);
            scoped.complete('Message processed');
            
            res.status(200).send({ status: 'Message received and processed', result });
        } catch (error) {
            this.handleErrorResponse(res, error as Error, scoped);
        }
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

    async createPluginFromOpenAPI(
        specUrl: string,
        name: string,
        description: string = '',
        authentication?: any,
        baseUrl?: string,
        scoped?: ScopedLogger
    ): Promise<any> {
        if (scoped) {
            scoped.debug(`Creating plugin from OpenAPI spec: ${specUrl}`);
        }

        const registrationRequest: OpenAPIToolRegistrationRequest = {
            name,
            specUrl,
            description,
            authentication,
            baseUrl,
        };

        const parsingResult = await this.registerOpenAPITool(registrationRequest, scoped);

        if (!parsingResult.success || !parsingResult.tool) {
            throw EngineerErrorHandler.createError(
                'OPENAPI_PARSING_FAILED',
                `Failed to parse OpenAPI spec: ${parsingResult.errors?.join(', ')}`,
                ErrorSeverity.HIGH
            );
        }

        const toolManifest = parsingResult.tool;
        const policyConfig = {}; // Add policy config if needed
        const wrapperLanguage = 'typescript'; // Or make this configurable

        const generatedPlugin = await this.generateWrapperPlugin(toolManifest, policyConfig, wrapperLanguage, scoped);

        if (!generatedPlugin) {
            throw EngineerErrorHandler.createError(
                'PLUGIN_GENERATION_FAILED',
                'Failed to generate wrapper plugin from OpenAPI tool manifest.',
                ErrorSeverity.HIGH
            );
        }

        return this.finalizePlugin(generatedPlugin, generatedPlugin.explanation);
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

            // Update performance metrics
            this.performanceMetrics.validationTime += Date.now() - startTime;

            return result;
        } catch (error) {
            logger.error('Error during plugin validation', error as Error);
            issues.push(`Validation error: ${(error as Error).message}`);
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
            const response = await this.brainClient.chat(
                {
                    exchanges: [{ role: 'user', content: prompt }],
                    optimization: 'accuracy',
                    responseType: 'text'
                }
            );
            return response.result || response.response || '';
        } catch (error) {
            logger.error('Error generating explanation', error as Error);
            return '';
        }
    }

    private async repairCode(errorMessage: string, code: string | string[], scoped?: ScopedLogger): Promise<string> {
        const prompt = generateRepairPrompt(errorMessage, code);

        try {
            const response = await this.brainClient.chat(
                {
                    exchanges: [{ role: 'user', content: prompt }],
                    optimization: 'accuracy',
                    responseType: 'text'
                },
                scoped
            );

            return response.result || response.response || '';
        } catch (error) {
            logger.error('Failed to repair code', error as Error);
            throw EngineerErrorHandler.createError(
                'CODE_REPAIR_FAILED',
                `Failed to repair code: ${EngineerErrorHandler.extractMessage(error)}`,
                ErrorSeverity.HIGH
            );
        }
    }

    // OpenAPI Tool Management Methods

    async registerOpenAPITool(
        request: OpenAPIToolRegistrationRequest,
        scoped?: ScopedLogger
    ): Promise<OpenAPIParsingResult> {
        if (scoped) {
            scoped.info('Registering OpenAPI tool', { name: request.name });
        }

        try {
            // Fetch and parse the OpenAPI specification
            const specResponse = await withRetry(
                () => axios.get(request.specUrl),
                `Fetch OpenAPI spec from ${request.specUrl}`,
                { ...DEFAULT_RETRY_STRATEGY, timeoutMs: 15000 }
            );
            const spec = specResponse.data;

            // Parse the OpenAPI specification
            const parsingResult = await this.parseOpenAPISpec(spec, request, scoped);

            if (parsingResult.success && parsingResult.tool) {
                // Store the tool in the librarian
                await this.storeOpenAPITool(parsingResult.tool, scoped);
                if (scoped) {
                    scoped.info(`OpenAPI tool ${parsingResult.tool.id} registered successfully`);
                }
            }

            return parsingResult;
        } catch (error) {
            logger.error('Error registering OpenAPI tool', error as Error);
            return {
                success: false,
                errors: [EngineerErrorHandler.extractMessage(error)]
            };
        }
    }

    private async parseOpenAPISpec(
        spec: any,
        request: OpenAPIToolRegistrationRequest,
        scoped?: ScopedLogger
    ): Promise<OpenAPIParsingResult> {
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

            if (scoped) {
                scoped.debug('Parsing OpenAPI spec', { version: specVersion });
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
            logger.error('Error parsing OpenAPI spec', error as Error);
            errors.push(`Error parsing OpenAPI spec: ${EngineerErrorHandler.extractMessage(error)}`);
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

    private async storeOpenAPITool(tool: OpenAPITool, scoped?: ScopedLogger): Promise<void> {
        try {
            await this.librarianClient.storeData(
                {
                    collection: 'openApiTools',
                    id: tool.id,
                    data: tool,
                    storageType: 'mongo'
                },
                scoped
            );
            if (scoped) {
                scoped.debug(`Stored OpenAPI tool: ${tool.id}`);
            }
        } catch (error) {
            logger.error('Failed to store OpenAPI tool', error as Error);
            throw EngineerErrorHandler.createError(
                'LIBRARIAN_STORAGE_FAILED',
                `Failed to store OpenAPI tool: ${EngineerErrorHandler.extractMessage(error)}`,
                ErrorSeverity.HIGH
            );
        }
    }

    async getOpenAPITool(id: string, scoped?: ScopedLogger): Promise<OpenAPITool | null> {
        try {
            const data = await this.librarianClient.loadData(id, 'openApiTools', scoped);
            return data?.data || null;
        } catch (error) {
            logger.error('Error retrieving OpenAPI tool', error as Error);
            return null;
        }
    }

    async validateTool(manifest: any, code?: string, scoped?: ScopedLogger): Promise<{ valid: boolean; issues: string[] }> {
        try {
            // Check cache first
            const cachedResult = await validationCache.getValidationResult({ manifest, code });
            if (cachedResult) {
                if (scoped) {
                    scoped.debug('Validation result from cache');
                }
                return cachedResult;
            }
        } catch (error) {
            logger.warn('Cache lookup failed', error as Error);
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

            // Cache the result
            try {
                await validationCache.cacheValidationResult({ manifest, code }, result);
            } catch (error) {
                logger.warn('Failed to cache validation result', error as Error);
            }

            return result;

        } catch (error) {
            logger.error('Validation error', error as Error);
            issues.push(`Validation error: ${EngineerErrorHandler.extractMessage(error)}`);
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

    private async onboardTool(toolManifest: any, policyConfig: any, scoped?: ScopedLogger): Promise<any> {
        if (scoped) {
            scoped.info(`Onboarding tool: ${toolManifest.id}`);
        }

        try {
            // 1. Determine wrapper language
            const wrapperLanguage = 'typescript';

            // 2. Generate wrapper plugin code and unit tests using the Brain
            const generatedPlugin = await this.generateWrapperPlugin(toolManifest, policyConfig, wrapperLanguage, scoped);

            if (!generatedPlugin) {
                throw EngineerErrorHandler.createError(
                    'WRAPPER_GENERATION_FAILED',
                    'Failed to generate wrapper plugin.',
                    ErrorSeverity.HIGH
                );
            }

            // 3. Validate and execute generated unit tests
            const testResult = await this.executeWrapperTests(generatedPlugin, scoped);
            if (!testResult.valid) {
                throw EngineerErrorHandler.createError(
                    'WRAPPER_TESTS_FAILED',
                    `Wrapper plugin tests failed: ${testResult.issues.join(', ')}`,
                    ErrorSeverity.HIGH
                );
            }

            // 4. Register the new wrapper plugin with the PluginMarketplace
            const finalPluginDefinition = this.finalizePlugin(generatedPlugin, generatedPlugin.explanation);
            await this.pluginMarketplace.store(finalPluginDefinition);
            
            if (scoped) {
                scoped.info(`Wrapper plugin ${finalPluginDefinition.id} registered with PluginMarketplace.`);
            }

            return { success: true, message: `Tool ${toolManifest.id} onboarded successfully.` };

        } catch (error) {
            logger.error('Error in onboardTool', error as Error);
            throw error;
        }
    }

    private async generateWrapperPlugin(
        toolManifest: any,
        policyConfig: any,
        language: string,
        scoped?: ScopedLogger
    ): Promise<any> {
        if (scoped) {
            scoped.debug(`Generating wrapper plugin for ${toolManifest.id} in ${language}...`);
        }

        const prompt = generateWrapperPluginPrompt(toolManifest, policyConfig, language);

        try {
            const response = await this.brainClient.chat(
                {
                    exchanges: [{ role: 'user', content: prompt }],
                    optimization: 'accuracy',
                    responseType: 'json'
                },
                scoped
            );

            const generatedPlugin = JSON.parse(response.result || response.response || response);
            const validationResult = this.validatePluginStructure(generatedPlugin);
            
            if (!validationResult.valid) {
                throw EngineerErrorHandler.createError(
                    'INVALID_PLUGIN_STRUCTURE',
                    `Generated wrapper plugin structure is invalid: ${validationResult.issues.join(', ')}`,
                    ErrorSeverity.MEDIUM
                );
            }

            return generatedPlugin;
        } catch (error) {
            logger.error('Error generating wrapper plugin', error as Error);
            throw error;
        }
    }

    private async executeWrapperTests(generatedPlugin: any, scoped?: ScopedLogger): Promise<{ valid: boolean; issues: string[] }> {
        if (scoped) {
            scoped.debug(`Executing wrapper tests for ${generatedPlugin.id}...`);
        }

        const issues: string[] = [];
        const startTime = Date.now();

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
            const testExecutionResult = await this.executeTestRunner(generatedPlugin, scoped);
            if (!testExecutionResult.valid) {
                issues.push(...testExecutionResult.issues);
            }

            this.performanceMetrics.testExecutionTime += Date.now() - startTime;

            return { valid: issues.length === 0, issues };
        } catch (error) {
            logger.error('Error executing wrapper tests', error as Error);
            issues.push(`Test execution failed: ${EngineerErrorHandler.extractMessage(error)}`);
            return { valid: false, issues };
        }
    }

    private async executeTestRunner(generatedPlugin: any, scoped?: ScopedLogger): Promise<{ valid: boolean; issues: string[] }> {
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
                const testFiles = Object.keys(generatedPlugin.entryPoint.files || {})
                    .filter(f => f.includes('test') || f.includes('spec'));

                if (testFiles.length === 0) {
                    issues.push('No test files found for JavaScript/TypeScript plugin');
                    return { valid: false, issues };
                }

                testCommand = 'npx jest --passWithNoTests';
                testPattern = testFiles.join(' ');
            } else if (language === 'python') {
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
            if (scoped) {
                scoped.debug(`Executing test command: ${fullCommand}`);
            }

            const { stdout, stderr } = await execAsync(fullCommand, { cwd: tempDir });

            // Parse test results
            if (stderr && stderr.includes('FAIL')) {
                issues.push(`Tests failed: ${stderr}`);
                return { valid: false, issues };
            }

            if (stdout && (stdout.includes('PASS') || stdout.includes('passed'))) {
                if (scoped) {
                    scoped.debug(`Tests passed successfully for ${generatedPlugin.id}`);
                }
                return { valid: true, issues };
            }

            // If we get here, tests might have run but we couldn't determine the result
            issues.push('Could not determine test execution result');
            return { valid: false, issues };

        } catch (error) {
            logger.error(`Test execution error for ${generatedPlugin.id}`, error as Error);
            issues.push(`Test execution error: ${EngineerErrorHandler.extractMessage(error)}`);
            return { valid: false, issues };
        } finally {
            // Clean up temporary directory
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                logger.warn(`Error cleaning up test directory ${tempDir}`, cleanupError as Error);
            }
        }
    }

    private async createPluginWithRecovery(
        verb: string,
        context: Map<string, InputValue>,
        guidance: string,
        language?: string,
        attempt: number = 1,
        scoped?: ScopedLogger
    ): Promise<PluginDefinition | undefined> {
        const maxAttempts = 3;
        const maxBackoff = 5000;

        try {
            if (scoped) {
                scoped.debug(`Attempt ${attempt} to create plugin for verb: ${verb}`);
            }

            const startTime = Date.now();
            
            // Check cache first
            const cached = await generatedCodeCache.getGeneratedCode(verb, context, language || 'typescript');
            if (cached) {
                if (scoped) {
                    scoped.debug('Retrieved plugin from cache');
                }
                return cached;
            }

            // Generate using enhanced prompts
            const prompt = generatePluginPrompt(verb, context, guidance, language);
            const response = await this.brainClient.chat(
                {
                    exchanges: [{ role: 'user', content: prompt }],
                    optimization: 'accuracy',
                    responseType: 'json'
                },
                scoped
            );

            const pluginStructure = JSON.parse(response.result || response.response || response);
            const validationResult = this.validatePluginStructure(pluginStructure);

            if (!validationResult.valid) {
                throw EngineerErrorHandler.createError(
                    'INVALID_PLUGIN_STRUCTURE',
                    `Generated plugin structure is invalid: ${validationResult.issues.join(', ')}`,
                    ErrorSeverity.MEDIUM,
                    { issues: validationResult.issues }
                );
            }

            const plugin = this.finalizePlugin(pluginStructure, await this.generateExplanation(verb, context));
            
            // Cache the result
            await generatedCodeCache.cacheGeneratedCode(verb, context, language || 'typescript', plugin);
            
            this.performanceMetrics.generationTime += Date.now() - startTime;
            
            if (scoped) {
                scoped.debug(`Plugin created successfully in ${Date.now() - startTime}ms`);
            }
            
            return plugin;

        } catch (error) {
            const engineerError = error as any;
            
            if (attempt >= maxAttempts) {
                logger.error(`Failed to create plugin after ${maxAttempts} attempts`, error as Error);
                return undefined;
            }

            const isRetryable = engineerError.retryable ?? true;
            if (!isRetryable) {
                throw error;
            }

            const backoff = EngineerErrorHandler.calculateBackoff(attempt - 1, maxBackoff);

            if (scoped) {
                scoped.warn(`Plugin creation attempt ${attempt} failed. Retrying in ${backoff}ms...`, {
                    error: (error as Error).message
                });
            }

            await new Promise(resolve => setTimeout(resolve, backoff));

            // Try with simplified guidance on first retry
            if (attempt === 1) {
                const simplifiedGuidance = `Create a simpler version of: ${guidance}`;
                return await this.createPluginWithRecovery(
                    verb,
                    context,
                    simplifiedGuidance,
                    language,
                    attempt + 1,
                    scoped
                );
            }

            return await this.createPluginWithRecovery(
                verb,
                context,
                guidance,
                language,
                attempt + 1,
                scoped
            );
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

    private logPerformanceMetrics(): void {
        const totalTime = this.performanceMetrics.validationTime +
                         this.performanceMetrics.generationTime +
                         this.performanceMetrics.testExecutionTime;

        console.log('Engineer Performance Metrics:');
        console.log(`- Validation Time: ${this.performanceMetrics.validationTime}ms`);
        console.log(`- Generation Time: ${this.performanceMetrics.generationTime}ms`);
        console.log(`- Test Execution Time: ${this.performanceMetrics.testExecutionTime}ms`);
        console.log(`- Total Time: ${totalTime}ms`);
    }
}


// Instantiate the Engineer - this line should typically be in an entry point file (e.g., index.ts for the service)
// If Engineer.ts is the main file for the service, it's fine.
new Engineer(); // Commenting out if this isn't the main service entry point.
