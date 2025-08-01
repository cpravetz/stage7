import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Step, MapSerializer, BaseEntity, ServiceTokenManager } from '@cktmcs/shared';
import { InputValue, PluginOutput, PluginDefinition, PluginParameterType, environmentType, PluginManifest, PluginLocator, PluginRepositoryType, PluginParameter, DefinitionManifest, DefinitionType, OpenAPITool, MCPTool, MCPActionMapping, MCPAuthentication, MCPServiceTarget, OpenAPIExecutionRequest, OpenAPIExecutionResult } from '@cktmcs/shared'; // Added DefinitionManifest, DefinitionType
import { executePluginInSandbox } from '@cktmcs/shared';
import { validatePluginPermissions, hasDangerousPermissions } from '@cktmcs/shared';
import { promisify } from 'util';
import { exec as execCallback, spawn } from 'child_process';
import { generateStructuredError, ErrorSeverity, GlobalErrorCodes, StructuredError } from './utils/errorReporter';
import { ConfigManager } from './utils/configManager';
import { PluginRegistry } from './utils/pluginRegistry';
import { PluginContextManager } from './utils/PluginContextManager';
import { validateAndStandardizeInputs } from './utils/validator';
import { ContainerManager } from './utils/containerManager';
import { ContainerExecutionRequest, ContainerPluginManifest } from './types/containerTypes';
const execAsync = promisify(execCallback);

// Helper to create PluginOutput error from a StructuredError
function createPluginOutputError(structuredError: StructuredError): PluginOutput[] {
    return [{
        success: false,
        name: structuredError.error_code || GlobalErrorCodes.UNKNOWN_ERROR,
        resultType: PluginParameterType.ERROR,
        resultDescription: structuredError.message_human_readable,
        result: structuredError,
        error: structuredError.message_human_readable
    }];
}

interface ExecutionContext {
    inputValues: Map<string, InputValue>;
    environment: environmentType;
    pluginDefinition: PluginDefinition;
    pluginRootPath: string;
    trace_id: string;
}

export class CapabilitiesManager extends BaseEntity {
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private server: any;
    private configManager!: ConfigManager;
    private pluginRegistry!: PluginRegistry;
    private containerManager!: ContainerManager;
    private pluginContextManager!: PluginContextManager;
    private initializationStatus: {
        pluginRegistry: boolean;
        configManager: boolean;
        overall: boolean;
    } = {
        pluginRegistry: false,
        configManager: false,
        overall: false
    };
    private serviceId = 'CapabilitiesManager';

    private failedPluginLookups: Map<string, number> = new Map(); // actionVerb -> last failure timestamp
    private static readonly PLUGIN_LOOKUP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes


    constructor() {
        super('CapabilitiesManager', 'CapabilitiesManager', `capabilitiesmanager`, process.env.PORT || '5060');
        const trace_id = `${this.serviceId}-constructor-${uuidv4().substring(0,8)}`;
        // Retry logic for initialization
        this.pluginRegistry = new PluginRegistry();
        // Initialize PluginContextManager with a direct reference to avoid circular calls
        this.pluginContextManager = new PluginContextManager(`localhost:${process.env.PORT || '5060'}`);
        const source_component = "CapabilitiesManager.constructor";
        let attempts = 0;
        const maxAttempts = 3;
        const retryDelayMs = 2000;
        const tryInitialize = async () => {
            attempts++;
            try {
                await this.initialize(trace_id);
            } catch (error) {
                const initError = error instanceof Error ? error : new Error(String(error));
                const message = (initError as any).message_human_readable || initError.message;
                console.error(`[${trace_id}] INIT_FAILURE (attempt ${attempts}): ${message}`, (initError as any).contextual_info || initError.stack);
                if (attempts < maxAttempts) {
                    console.warn(`[${trace_id}] ${source_component}: Retrying initialization in ${retryDelayMs}ms...`);
                    setTimeout(tryInitialize, retryDelayMs);
                } else {
                    console.error(`[${trace_id}] ${source_component}: Initialization failed after ${maxAttempts} attempts. CapabilitiesManager will not start.`);
                    // Optionally, set a flag or notify health check endpoint
                }
            }
        };
        tryInitialize();
    }

    private async initialize(trace_id: string) {
        const source_component = "CapabilitiesManager.initialize";
        try {
            // Ensure PluginRegistry is initialized before other dependent services
            if (this.pluginRegistry && typeof this.pluginRegistry.initialize === 'function') {
                try {
                    await this.pluginRegistry.initialize(); // Await PluginRegistry initialization
                    this.initializationStatus.pluginRegistry = true;
                    console.log(`[${trace_id}] ${source_component}: PluginRegistry initialized.`);
                } catch (error) {
                    console.warn(`[${trace_id}] ${source_component}: PluginRegistry initialization failed, continuing with limited functionality:`, error);
                    // Continue initialization even if plugin registry fails
                }
            } else {
                console.warn(`[${trace_id}] ${source_component}: PluginRegistry or its initialize method is not available.`);
            }

            try {
                this.configManager = await ConfigManager.initialize(this.librarianUrl);
                this.initializationStatus.configManager = true;
                console.log(`[${trace_id}] ${source_component}: ConfigManager initialized.`);
            } catch (error) {
                console.warn(`[${trace_id}] ${source_component}: ConfigManager initialization failed, using defaults:`, error);
                // Continue without ConfigManager - use default configurations
            }

            await this.start(trace_id);

            if (!this.registeredWithPostOffice) {
                //console.log(`[${trace_id}] ${source_component}: Registering with PostOffice...`);
                await this.registerWithPostOffice(15, 2000);
                if (this.registeredWithPostOffice) {
                    //console.log(`[${trace_id}] ${source_component}: Successfully registered with PostOffice.`);
                } else {
                    generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.CRITICAL,
                        message: "CRITICAL - Failed to register with PostOffice after multiple attempts.",
                        source_component,
                        trace_id_param: trace_id
                    });
                }
            }

            // Mark overall initialization as complete
            this.initializationStatus.overall = true;
            console.log(`[${trace_id}] ${source_component}: CapabilitiesManager initialization completed.`);

        } catch (error: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.CRITICAL,
                message: "Failed to initialize CapabilitiesManager.",
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
        }
    }

    private setupServer(trace_id_parent: string): Promise<void> {
        const source_component = "CapabilitiesManager.setupServer";
        return new Promise((resolve, reject) => {
            try {
                const app = express();
                app.use(bodyParser.json());

                // Authentication middleware - skip for health checks
                app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
                    if (req.path === '/health' || req.path === '/ready') return next();
                    this.verifyToken(req, res, next);
                });

                // Core routes
                app.post('/executeAction', (req, res) => this.executeActionVerb(req, res));

                // Health check endpoints
                app.get('/health', (req, res) => {
                    res.json({
                        status: 'ok',
                        service: 'CapabilitiesManager',
                        initialization: this.initializationStatus
                    });
                });

                app.get('/ready', (req, res) => {
                    const isReady = this.initializationStatus.overall;
                    res.status(isReady ? 200 : 503).json({
                        ready: isReady,
                        service: 'CapabilitiesManager',
                        initialization: this.initializationStatus
                    });
                });

                // --- Plugin CRUD API ---
                app.get('/plugins', async (req, res) => {
                    try {
                        const repository = req.query.repository as PluginRepositoryType | undefined;
                        console.log(`[${trace_id_parent}] ${source_component}: Fetching plugins from repository: ${repository || 'default'}`);
                        const plugins = await this.pluginRegistry.list(repository);
                        res.json({ plugins });
                    } catch (error: any) {
                        res.status(200).json({ plugins: [] });
                    }
                });
                app.get('/plugins/:id', async (req, res) => {
                    try {
                        const repository = req.query.repository as PluginRepositoryType | undefined;
                        const plugin = await this.pluginRegistry.fetchOne(req.params.id, undefined, repository);
                        if (!plugin) {
                            res.status(404).json({ error: 'Plugin not found' });
                        } else {
                            res.json({ plugin });
                        }
                    } catch (error: any) {
                        res.status(404).json({ error: 'Plugin not found' });
                    }
                });
                app.post('/plugins', async (req, res) => {
                    try {
                        await this.pluginRegistry.store(req.body);
                        res.status(201).json({ success: true });
                    } catch (error: any) {
                        res.status(400).json({ error: 'Failed to create plugin', details: error.message });
                    }
                });
                app.put('/plugins/:id', async (req, res) => {
                    try {
                        await this.pluginRegistry.store(req.body);
                        res.json({ success: true });
                    } catch (error: any) {
                        res.status(400).json({ error: 'Failed to update plugin', details: error.message });
                    }
                });
                app.delete('/plugins/:id', async (req, res) => {
                    try {
                        const repository = req.query.repository as string | undefined;
                        // Only librarian-definition repos support delete
                        if (repository === 'librarian-definition' && typeof this.pluginRegistry.delete === 'function') {
                            await this.pluginRegistry.delete(req.params.id, undefined, repository);
                        }
                        res.json({ success: true });
                    } catch (error: any) {
                        res.status(400).json({ error: 'Failed to delete plugin', details: error.message });
                    }
                });
                // --- Plugin Repositories API ---
                app.get('/pluginRepositories', (req, res) => {
                    try {
                        const repos = this.pluginRegistry.getActiveRepositories();
                        res.json({ repositories: repos });
                    } catch (error: any) {
                        res.status(200).json({ repositories: [] });
                    }
                });

                app.post('/message', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-msg-${uuidv4().substring(0,8)}`;
                    try {
                        await super.handleBaseMessage(req.body);
                        res.status(200).send({ status: 'Message received and processed' });
                    } catch (error: any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                            severity: ErrorSeverity.ERROR,
                            message: "Error handling message.",
                            source_component: `${source_component}.handleMessage`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(500).json(sError);
                    }
                });

                app.get('/availablePlugins', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-avail-${uuidv4().substring(0,8)}`;
                    try {
                        const plugins: PluginLocator[] = (await this.pluginRegistry.list()).filter(
                            (p: PluginLocator) => !('language' in p) || (p as any).language === 'javascript' || (p as any).language === 'python' || (p as any).language === 'container'
                        );
                        res.json(plugins);
                    } catch (error:any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: "Failed to list available plugins.",
                            source_component: `${source_component}.availablePlugins`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(500).json(sError);
                    }
                });

                // New endpoint for intelligent plugin context generation
                app.post('/generatePluginContext', async (req: any, res: any) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-context-${uuidv4().substring(0,8)}`;
                    try {
                        const { goal, constraints } = req.body;

                        if (!goal || typeof goal !== 'string') {
                            return res.status(400).json({
                                error: 'Missing or invalid goal parameter'
                            });
                        }

                        const defaultConstraints = {
                            maxTokens: 2000,
                            maxPlugins: 20,
                            ...constraints
                        };

                        const context = await this.pluginContextManager.generateContext(goal, defaultConstraints);
                        res.json(context);
                    } catch (error: any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: "Failed to generate plugin context.",
                            source_component: `${source_component}.generatePluginContext`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(500).json(sError);
                    }
                });

                this.server = app.listen(this.port, () => {
                    console.log(`[${trace_id_parent}] CapabilitiesManager server listening on port ${this.port}`);
                    resolve();
                });

                this.server.on('error', (error: Error) => {
                    const sError = generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.CRITICAL,
                        message: "CapabilitiesManager server startup error.",
                        source_component,
                        original_error: error,
                        trace_id_param: trace_id_parent
                    });
                    reject(sError);
                });

            } catch (error) {
                const sError = generateStructuredError({
                    error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                    severity: ErrorSeverity.CRITICAL,
                    message: "Error in CapabilitiesManager server setup.",
                    source_component,
                    original_error: error as Error,
                    trace_id_param: trace_id_parent
                });
                reject(sError);
            }
        });
    }

    public async start(trace_id_parent?: string): Promise<void> {
        const trace_id = trace_id_parent || `${this.serviceId}-start-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.start";
        try {
            console.log(`[${trace_id}] Setting up express server...`);
            await this.setupServer(trace_id);
            this.setupPeriodicReregistration(trace_id);
            console.log(`[${trace_id}] CapabilitiesManager server setup complete`);
        } catch (error:any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.CRITICAL,
                message: `Failed to start CapabilitiesManager: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
        }
    }

    private setupPeriodicReregistration(trace_id_parent: string): void {
        const source_component = "CapabilitiesManager.setupPeriodicReregistration";
        setInterval(async () => {
            const trace_id = `${trace_id_parent}-reReg-${uuidv4().substring(0,8)}`;
            if (!this.registeredWithPostOffice) {
                await this.registerWithPostOffice(5, 1000);
            } else {
                try {
                    const response = await this.authenticatedApi.get(`http://${this.postOfficeUrl}/getServices`);
                    const services = response.data;
                    if (!services || !services.capabilitiesManagerUrl) {
                        this.registeredWithPostOffice = false;
                        await this.registerWithPostOffice(5, 1000);
                    }
                } catch (error:any) {
                    generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.WARNING,
                        message: "Error verifying registration with PostOffice.",
                        source_component,
                        original_error: error,
                        trace_id_param: trace_id
                    });
                }
            }
        }, 5 * 60 * 1000);
    }


    private async executeActionVerb(req: express.Request, res: express.Response) {
        const trace_id = (req as any).trace_id || uuidv4();
        const source_component = "CapabilitiesManager.executeActionVerb";
        const step = { ...req.body, inputValues: MapSerializer.transformFromSerialization(req.body.inputValues || {}) } as Step;

        if (!step.actionVerb || typeof step.actionVerb !== 'string') {
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_INVALID_REQUEST_GENERIC,
                severity: ErrorSeverity.ERROR,
                message: 'Invalid or missing actionVerb in request.',
                source_component,
                trace_id_param: trace_id
            });
            res.status(400).json(createPluginOutputError(sError));
            return;
        }

        try {
            // Redirect 'ACCOMPLISH' to executeAccomplishPlugin
            if (step.actionVerb === 'ACCOMPLISH' && step.inputValues) {
                const accomplishResultArray = await this.executeAccomplishPlugin(step.inputValues.get('goal')?.value || '', trace_id, 'goal');
                res.status(200).send(MapSerializer.transformForSerialization(accomplishResultArray));
                return;
            }
            // Query PluginRegistry for the handler for this actionVerb
            // The handlerResult.handler will be a PluginManifest (or DefinitionManifest)
            const handlerResult = await this.getHandlerForActionVerb(step.actionVerb, trace_id);
            console.log(`[${trace_id}] ${source_component}: Handler result for verb '${step.actionVerb}':`, handlerResult ? { type: handlerResult.type, lang: handlerResult.handler?.language, id: handlerResult.handler?.id } : null);

            if (handlerResult && handlerResult.handler) {
                const manifest = handlerResult.handler; // Could be DefinitionManifest
                console.log(`[${trace_id}] ${source_component}: Found handler for '${step.actionVerb}'. Language: '${manifest.language}', ID: '${manifest.id}'. Attempting direct execution.`);

                if (manifest.language === DefinitionType.OPENAPI) {
                    const definitionManifest = manifest as DefinitionManifest;
                    if (definitionManifest.toolDefinition && (definitionManifest.toolDefinition as OpenAPITool).specUrl) {
                        console.log(`[${trace_id}] ${source_component}: Executing '${step.actionVerb}' as OpenAPI tool.`);
                        const result = await this.executeOpenAPIToolInternal(definitionManifest.toolDefinition as OpenAPITool, step, trace_id);
                        res.status(200).send(MapSerializer.transformForSerialization(result));
                        return;
                    } else {
                         throw generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_INVALID_HANDLER_DEF,
                            severity: ErrorSeverity.ERROR,
                            message: `OpenAPI manifest for verb '${step.actionVerb}' is missing toolDefinition.`,
                            trace_id_param: trace_id, source_component
                        });
                    }
                } else if (manifest.language === DefinitionType.MCP) {
                    const definitionManifest = manifest as DefinitionManifest;
                     if (definitionManifest.toolDefinition && (definitionManifest.toolDefinition as MCPTool).actionMappings) {
                        console.log(`[${trace_id}] ${source_component}: Executing '${step.actionVerb}' as MCP tool.`);
                        const result = await this.executeMCPTool(definitionManifest.toolDefinition as MCPTool, step, trace_id);
                        res.status(200).send(MapSerializer.transformForSerialization(result));
                        return;
                    } else {
                         throw generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_INVALID_HANDLER_DEF,
                            severity: ErrorSeverity.ERROR,
                            message: `MCP manifest for verb '${step.actionVerb}' is missing toolDefinition.`,
                            trace_id_param: trace_id, source_component
                        });
                    }
                } else if (manifest.language === 'javascript' || manifest.language === 'python' || manifest.language === 'container') {
                    console.log(`[${trace_id}] ${source_component}: Executing '${step.actionVerb}' as ${manifest.language} plugin.`);
                    // Standard code-based plugin execution
                    const pluginDefinition = manifest as PluginDefinition; // Assuming PluginManifest is compatible enough

                    // Add optional inputs automatically before validation
                    const enhancedInputs = this.addOptionalInputsToStep(step, pluginDefinition);

                    const validatedInputs = await validateAndStandardizeInputs(pluginDefinition, enhancedInputs);
                    if (!validatedInputs.success || !validatedInputs.inputs) {
                        throw generateStructuredError({
                            error_code: GlobalErrorCodes.INPUT_VALIDATION_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: validatedInputs.error || "Input validation failed for plugin.",
                            source_component,
                            contextual_info: { plugin_id: pluginDefinition.id, version: pluginDefinition.version, verb: pluginDefinition.verb },
                            trace_id_param: trace_id
                        });
                    }
                    // preparePluginForExecution expects PluginManifest, which DefinitionManifest extends
                    const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(manifest);
                    const result = await this.executePlugin(effectiveManifest, validatedInputs.inputs, pluginRootPath, trace_id);
                    res.status(200).send(MapSerializer.transformForSerialization(result));
                    return;
                } else {
                    console.warn(`[${trace_id}] ${source_component}: Unknown handler language/type '${manifest.language}' for verb '${step.actionVerb}'. Falling back.`);
                }
            }

            const cachedPlanArray = await this.checkCachedPlan(step.actionVerb);
            if (cachedPlanArray && cachedPlanArray.length > 0) {
                res.status(200).send(MapSerializer.transformForSerialization(cachedPlanArray));
                return;
            }
            const resultUnknownVerb = await this.handleUnknownVerb(step, trace_id);
            res.status(200).send(MapSerializer.transformForSerialization(resultUnknownVerb));
        } catch (error: any) {
            // Classify the error type to determine appropriate handling
            const errorType = this.classifyError(error, trace_id);

            switch (errorType) {
                case 'unknown_verb':
                    // Only handle as unknown verb if it's actually an unknown verb issue
                    console.log(`[${trace_id}] ${source_component}: Handling as unknown verb: ${step.actionVerb}`);
                    const resultUnknownVerb = await this.handleUnknownVerb(step, trace_id);
                    res.status(200).send(MapSerializer.transformForSerialization(resultUnknownVerb));
                    return;

                case 'validation_error':
                    // Input validation errors should be returned as errors, not handled as unknown verbs
                    console.error(`[${trace_id}] ${source_component}: Input validation error for ${step.actionVerb}:`, error.message);
                    res.status(400).json(createPluginOutputError(error));
                    return;

                case 'authentication_error':
                    // Authentication errors should be returned as errors
                    console.error(`[${trace_id}] ${source_component}: Authentication error for ${step.actionVerb}:`, error.message);
                    res.status(401).json(createPluginOutputError(error));
                    return;

                case 'plugin_execution_error':
                    // Plugin execution errors should be returned as errors
                    console.error(`[${trace_id}] ${source_component}: Plugin execution error for ${step.actionVerb}:`, error.message);
                    res.status(500).json(createPluginOutputError(error));
                    return;

                case 'brain_response_error':
                    // Brain service response errors - these indicate issues with LLM responses
                    console.error(`[${trace_id}] ${source_component}: Brain response error for ${step.actionVerb}:`, error.message);
                    res.status(500).json(createPluginOutputError(error));
                    return;

                default:
                    // Generic errors
                    console.error(`[${trace_id}] ${source_component}: Execution error for ${step.actionVerb}:`, error);
                    res.status(500).json(createPluginOutputError(error));
                    return;
            }
        }
    }

    /**
     * Classify error types to determine appropriate handling strategy
     */
    private classifyError(error: any, trace_id: string): string {
        const source_component = "CapabilitiesManager.classifyError";

        // Check error codes first
        if (error.error_code) {
            switch (error.error_code) {
                case GlobalErrorCodes.INPUT_VALIDATION_FAILED:
                    return 'validation_error';
                case GlobalErrorCodes.AUTHENTICATION_ERROR:
                    return 'authentication_error';
                case GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED:
                case GlobalErrorCodes.ACCOMPLISH_PLUGIN_EXECUTION_FAILED:
                    return 'plugin_execution_error';
                case GlobalErrorCodes.CAPABILITIES_MANAGER_UNKNOWN_VERB_HANDLING_FAILED:
                    return 'unknown_verb';
            }
        }

        const errorMessage = error.message || error.toString();
        const lowerMessage = errorMessage.toLowerCase();

        // Classify based on error patterns
        if (lowerMessage.includes('validation') || lowerMessage.includes('required input')) {
            return 'validation_error';
        }
        if (lowerMessage.includes('authentication') || lowerMessage.includes('unauthorized')) {
            return 'authentication_error';
        }
        if (lowerMessage.includes('plugin not found') || lowerMessage.includes('unknown verb')) {
            return 'unknown_verb';
        }
        if (lowerMessage.includes('brain') && lowerMessage.includes('500')) {
            return 'brain_service_error';
        }
        if (lowerMessage.includes('json') && lowerMessage.includes('parse')) {
            return 'json_parse_error';
        }

        return 'generic_error';
    }

    /**
     * Find the best handler (plugin or plan template) for an actionVerb.
     * Returns an object: { type: 'plugin' | 'planTemplate', handler: PluginDefinition | PlanTemplate }
     */
    private async getHandlerForActionVerb(actionVerb: string, trace_id: string): Promise<{ type: string, handler: any } | null> {
        const source_component = "CapabilitiesManager.getHandlerForActionVerb";
        try {
            const plugin = await this.pluginRegistry.fetchOneByVerb(actionVerb);
            if (plugin) {
                return { type: 'plugin', handler: plugin };
            }

            // If plugin is found by pluginRegistry, it could be a code plugin, openapi tool, or mcp tool.
            // The type differentiation will happen based on plugin.language in executeActionVerb.
            if (plugin) {
                 // The 'type' here is generic 'plugin' now, specific type (openapi, mcp) determined by language later.
                return { type: 'plugin', handler: plugin };
            }

            // TODO: Add PlanTemplate lookup here if they are also to be channelled via PluginRegistry.
            // For now, PlanTemplates are not dynamically looked up as primary handlers in this function if not via pluginRegistry.

            return null;
        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error resolving handler for actionVerb '${actionVerb}':`, error.message);
            return null;
        }
    }

    protected async executePlugin(
        pluginToExecute: PluginDefinition,
        inputsForPlugin: Map<string, InputValue>,
        actualPluginRootPath: string,
        trace_id: string
    ): Promise<PluginOutput[]> {
        if (pluginToExecute.verb === 'SEARCH') {
            console.log(`[${trace_id}] CapabilitiesManager.executePlugin: Inputs for SEARCH plugin execution:`, MapSerializer.transformForSerialization(inputsForPlugin));
        }
        const source_component = "CapabilitiesManager.executePlugin";
        console.log(`[${trace_id}] ${source_component}: Executing plugin ${pluginToExecute.id} v${pluginToExecute.version} (${pluginToExecute.verb}) at ${actualPluginRootPath}`);

        try {
            const permissionErrors = validatePluginPermissions(pluginToExecute);
            if (permissionErrors.length > 0) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.PLUGIN_PERMISSION_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR,
                    message: `Plugin permission validation failed: ${permissionErrors.join(', ')}`,
                    contextual_info: {plugin_id: pluginToExecute.id, version: pluginToExecute.version},
                    trace_id_param: trace_id,
                    source_component
                });
            }

            if (hasDangerousPermissions(pluginToExecute)) {
                console.warn(`[${trace_id}] ${source_component}: Plugin ${pluginToExecute.id} v${pluginToExecute.version} has dangerous permissions.`);
            }

            const configSet = await this.configManager.getPluginConfig(pluginToExecute.id);
            await this.configManager.recordPluginUsage(pluginToExecute.id);

            let token = null;
            let brainToken = null;
            const tokenManager = this.getTokenManager();
            token = await tokenManager.getToken();

            if (pluginToExecute.verb === 'ACCOMPLISH') {
                const brainTokenManager = new ServiceTokenManager(
                    `http://${this.securityManagerUrl}`,
                    'Brain',
                    process.env.CLIENT_SECRET || 'stage7AuthSecret'
                );
                brainToken = await brainTokenManager.getToken();
            }

            const currentEnv = { ...process.env };
            if (token) currentEnv.CM_AUTH_TOKEN = token;
            if (brainToken) currentEnv.BRAIN_AUTH_TOKEN = brainToken;

            const environment: environmentType = {
                env: currentEnv,
                credentials: configSet ?? []
            };

            // Add missionId and service URLs to inputsForPlugin if not already present
            if (!inputsForPlugin.has('missionId')) {
                const missionIdEnv = process.env.MISSION_ID || null;
                if (missionIdEnv) {
                    inputsForPlugin.set('missionId', {
                        inputName: 'missionId',
                        value: missionIdEnv,
                        valueType: PluginParameterType.STRING,
                        args: {}
                    });
                }
            }
            if (!inputsForPlugin.has('postOffice_url')) {
                const postOfficeUrlEnv = process.env.POSTOFFICE_URL || null;
                if (postOfficeUrlEnv) {
                    inputsForPlugin.set('postOffice_url', {
                        inputName: 'postOffice_url',
                        value: postOfficeUrlEnv,
                        valueType: PluginParameterType.STRING,
                        args: {}
                    });
                }
            }
            if (!inputsForPlugin.has('brain_url')) {
                const brainUrlEnv = process.env.BRAIN_URL || null;
                if (brainUrlEnv) {
                    inputsForPlugin.set('brain_url', {
                        inputName: 'brain_url',
                        value: brainUrlEnv,
                        valueType: PluginParameterType.STRING,
                        args: {}
                    });
                }
            }
            if (!inputsForPlugin.has('librarian_url')) {
                const librarianUrlEnv = process.env.LIBRARIAN_URL || this.librarianUrl || null;
                if (librarianUrlEnv) {
                    inputsForPlugin.set('librarian_url', {
                        inputName: 'librarian_url',
                        value: librarianUrlEnv,
                        valueType: PluginParameterType.STRING,
                        args: {}
                    });
                }
            }

            const executionInputs = new Map(inputsForPlugin);
            if (token) executionInputs.set('__auth_token', {
                inputName: '__auth_token',
                value: token,
                valueType: PluginParameterType.STRING,
                args: { token }
            });

            if (brainToken) {
                executionInputs.set('__brain_auth_token', {
                    inputName: '__brain_auth_token',
                    value: brainToken,
                    valueType: PluginParameterType.STRING,
                    args: { token: brainToken }
                });
                executionInputs.set('token', {
                    inputName: 'token',
                    value: brainToken,
                    valueType: PluginParameterType.STRING,
                    args: { token: brainToken }
                });
            }
            const executionContext: ExecutionContext = {
                inputValues: executionInputs,
                environment,
                pluginDefinition: pluginToExecute,
                pluginRootPath: actualPluginRootPath,
                trace_id
            };

            if (pluginToExecute.language === 'javascript') {
                try {
                    return await executePluginInSandbox(
                        executionContext.pluginDefinition,
                        Array.from(executionContext.inputValues.values()),
                        executionContext.environment
                    );
                } catch (sandboxError: any) {
                    console.error(`[${trace_id}] ${source_component}: Sandbox execution failed for ${pluginToExecute.id} v${pluginToExecute.version}, falling back to direct: ${sandboxError.message}`);
                    sandboxError.trace_id = trace_id;
                    throw sandboxError;
                }
            } else if (pluginToExecute.language === 'python') {
                return this.executePythonPlugin(executionContext);
            } else if (pluginToExecute.language === 'container') {
                return this.executeContainerPlugin(executionContext);
            }

            throw generateStructuredError({
                error_code: GlobalErrorCodes.UNSUPPORTED_LANGUAGE,
                severity: ErrorSeverity.ERROR,
                message: `Unsupported plugin language: ${pluginToExecute.language}`,
                contextual_info: {plugin_id: pluginToExecute.id, version: pluginToExecute.version},
                trace_id_param: trace_id,
                source_component
            });

        } catch (error: any) {
            if (error.error_id && error.trace_id) {
                return createPluginOutputError(error);
            }

            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Execution failed for plugin ${pluginToExecute?.id || 'unknown'} v${pluginToExecute?.version || 'unknown'}: ${error.message}`,
                source_component,
                original_error: error,
                contextual_info: {
                    plugin_id: pluginToExecute?.id,
                    verb: pluginToExecute?.verb,
                    version: pluginToExecute?.version
                },
                trace_id_param: trace_id
            });
            return createPluginOutputError(sError);
        }
    }

    private async executePythonPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputValues, environment, pluginRootPath, trace_id } = executionContext;
        const source_component = "CapabilitiesManager.executePythonPlugin";
        const mainFilePath = path.join(pluginRootPath, pluginDefinition.entryPoint!.main);

        console.log(`[${trace_id}] ${source_component}: Python execution - Main file path: ${mainFilePath}, Root path: ${pluginRootPath}`);
        
        try {
            await this.ensurePythonDependencies(pluginRootPath, trace_id);

            // Platform-aware venv paths (same logic as in ensurePythonDependencies)
            const isWindows = process.platform === 'win32';
            const venvBinDir = isWindows ? path.join(pluginRootPath, 'venv', 'Scripts') : path.join(pluginRootPath, 'venv', 'bin');
            const venvPythonPath = path.join(venvBinDir, isWindows ? 'python.exe' : 'python');

            // Check if venv python exists, otherwise fall back to system python
            let pythonExecutable: string;
            if (fs.existsSync(venvPythonPath)) {
                pythonExecutable = venvPythonPath;
            } else {
                // Try to find system python - check multiple options
                const pythonOptions = isWindows ? ['python.exe', 'python', 'python3.exe', 'python3'] : ['python3', 'python'];
                pythonExecutable = 'python3'; // default fallback

                for (const option of pythonOptions) {
                    try {
                        require('child_process').execSync(`${option} --version`, { stdio: 'ignore' });
                        pythonExecutable = option;
                        break;
                    } catch {
                        continue;
                    }
                }

                console.log(`[${trace_id}] ${source_component}: Using Python executable: ${pythonExecutable}`);
            }

            const inputsArray: [string, InputValue][] = Array.from(inputValues.entries());
            const inputsJsonString = JSON.stringify(inputsArray);
            //console.log(`[${trace_id}] ${source_component}: Piping inputsJsonString to Python plugin: ${inputsJsonString}`);

            return new Promise<PluginOutput[]>((resolve, reject) => {
                const pythonProcess = spawn(pythonExecutable, [mainFilePath, pluginRootPath], {
                    cwd: pluginRootPath,
                    env: {
                        ...environment.env,
                        PYTHONPATH: pluginRootPath,
                        PYTHONUNBUFFERED: '1',
                        PYTHONDONTWRITEBYTECODE: '1'
                    },
                    timeout: pluginDefinition.security?.sandboxOptions?.timeout || 60000
                });

                let stdout = '';
                let stderr = '';

                pythonProcess.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                pythonProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                pythonProcess.on('close', (code) => {
                    if (code !== 0) {
                        const error = new Error(`Python script exited with code ${code}. Stderr: ${stderr}`);
                        (error as any).stdout = stdout;
                        (error as any).stderr = stderr;
                        reject(error);
                    } else {
                        console.log(`[${trace_id}] ${source_component}: Raw stdout from Python plugin ${pluginDefinition.verb} v${pluginDefinition.version}:\n${stdout}`);
                        if (stderr) {
                            console.warn(`[${trace_id}] ${source_component}: Raw stderr from Python plugin ${pluginDefinition.verb} v${pluginDefinition.version}:\n${stderr}`);
                        }
                        const result = this.validatePythonOutput(stdout, pluginDefinition, trace_id);
                        resolve(result);
                    }
                });

                pythonProcess.on('error', (err) => {
                    // This catches errors like ENOENT if pythonExecutable is not found
                    console.error(`[${trace_id}] ${source_component}: Python process spawn error: ${err.message}`);
                    console.error(`[${trace_id}] ${source_component}: Attempted to execute: ${pythonExecutable}`);
                    console.error(`[${trace_id}] ${source_component}: Working directory: ${pluginRootPath}`);
                    console.error(`[${trace_id}] ${source_component}: Main file: ${mainFilePath}`);
                    reject(new Error(`Failed to spawn Python process: ${err.message}. Executable: ${pythonExecutable}`));
                });

                // Write inputs to stdin and close it to signal end of input
                pythonProcess.stdin.write(inputsJsonString);
                pythonProcess.stdin.end();
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error during execAsync for ${pluginDefinition.verb} v${pluginDefinition.version}. Error: ${error.message}`);
            if ((error as any).stdout) {
                console.error(`[${trace_id}] ${source_component}: Error stdout: ${(error as any).stdout}`);
            }
            if ((error as any).stderr) {
                console.error(`[${trace_id}] ${source_component}: Error stderr: ${(error as any).stderr}`);
            }
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Python plugin ${pluginDefinition.verb} v${pluginDefinition.version} execution failed: ${error.message}`,
                source_component,
                original_error: error,
                trace_id,
                contextual_info: {
                    plugin_id: pluginDefinition.id,
                    version: pluginDefinition.version,
                    command_executed: "python3", // This might be slightly inaccurate due to buildPythonCommand changes
                    stdout_on_error: (error as any).stdout,
                    stderr_on_error: (error as any).stderr,
                    main_file: mainFilePath
                }
            });
        }
    }

    private async executeContainerPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputValues, pluginRootPath, trace_id } = executionContext;
        const source_component = "CapabilitiesManager.executeContainerPlugin";

        console.log(`[${trace_id}] ${source_component}: Container execution for plugin ${pluginDefinition.id} v${pluginDefinition.version}`);

        try {
            // Validate container configuration
            if (!pluginDefinition.container || !pluginDefinition.api) {
                throw new Error("Container plugin missing container or api configuration");
            }

            // Convert to ContainerPluginManifest
            const containerManifest: ContainerPluginManifest = {
                id: pluginDefinition.id,
                name: pluginDefinition.verb,
                version: pluginDefinition.version,
                actionVerb: pluginDefinition.verb,
                language: 'container',
                container: {
                    dockerfile: pluginDefinition.container.dockerfile,
                    buildContext: pluginDefinition.container.buildContext,
                    image: pluginDefinition.container.image,
                    ports: pluginDefinition.container.ports,
                    environment: pluginDefinition.container.environment,
                    resources: pluginDefinition.container.resources,
                    healthCheck: pluginDefinition.container.healthCheck
                },
                api: pluginDefinition.api,
                inputs: pluginDefinition.inputDefinitions,
                outputs: pluginDefinition.outputDefinitions,
                security: pluginDefinition.security,
                metadata: pluginDefinition.metadata
            };

            // Build the container image if needed
            await this.containerManager.buildPluginImage(containerManifest, pluginRootPath, trace_id);

            // Start the container
            const containerInstance = await this.containerManager.startPluginContainer(containerManifest, trace_id);

            try {
                // Prepare execution request
                const inputsObject: { [key: string]: any } = {};
                inputValues.forEach((value, key) => {
                    inputsObject[key] = value.value;
                });

                const executionRequest: ContainerExecutionRequest = {
                    inputs: inputsObject,
                    context: {
                        trace_id,
                        plugin_id: pluginDefinition.id,
                        version: pluginDefinition.version
                    }
                };

                // Execute the plugin in the container
                const response = await this.containerManager.executePluginInContainer(
                    containerInstance,
                    containerManifest,
                    executionRequest,
                    trace_id
                );

                if (!response.success) {
                    throw new Error(response.error || "Container execution failed");
                }

                // Convert container response to PluginOutput format
                const outputs: PluginOutput[] = [];
                if (response.outputs) {
                    for (const [key, value] of Object.entries(response.outputs)) {
                        outputs.push({
                            success: true,
                            name: key,
                            resultType: this.inferResultType(value),
                            result: value,
                            resultDescription: `Container plugin output: ${key}`,
                            mimeType: 'application/json'
                        });
                    }
                }

                if (outputs.length === 0) {
                    outputs.push({
                        success: true,
                        name: 'result',
                        resultType: PluginParameterType.STRING,
                        result: 'Container execution completed successfully',
                        resultDescription: 'Container plugin execution result'
                    });
                }

                console.log(`[${trace_id}] ${source_component}: Container plugin executed successfully in ${response.executionTime}ms`);
                return outputs;

            } finally {
                // Clean up the container
                try {
                    await this.containerManager.stopPluginContainer(containerInstance.id, trace_id);
                } catch (cleanupError: any) {
                    console.warn(`[${trace_id}] ${source_component}: Failed to cleanup container: ${cleanupError.message}`);
                }
            }

        } catch (error: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Container plugin ${pluginDefinition.verb} v${pluginDefinition.version} execution failed: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {
                    plugin_id: pluginDefinition.id,
                    version: pluginDefinition.version,
                    container_image: pluginDefinition.container?.image,
                    api_endpoint: pluginDefinition.api?.endpoint
                }
            });
        }
    }

    private inferResultType(value: any): PluginParameterType {
        if (typeof value === 'string') return PluginParameterType.STRING;
        if (typeof value === 'number') return PluginParameterType.NUMBER;
        if (typeof value === 'boolean') return PluginParameterType.BOOLEAN;
        if (Array.isArray(value)) return PluginParameterType.ARRAY;
        if (typeof value === 'object' && value !== null) return PluginParameterType.OBJECT;
        return PluginParameterType.ANY;
    }

    private async ensurePythonDependencies(pluginRootPath: string, trace_id: string): Promise<void> {
        const source_component = "CapabilitiesManager.ensurePythonDependencies";
        const requirementsPath = path.join(pluginRootPath, 'requirements.txt');
        const markerPath = path.join(pluginRootPath, '.dependencies_installed');

        const venvPath = path.join(pluginRootPath, 'venv');
        // Platform-aware venv paths
        const isWindows = process.platform === 'win32';
        const venvBinDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
        const venvPythonPath = path.join(venvBinDir, isWindows ? 'python.exe' : 'python');
        const venvPipPath = path.join(venvBinDir, isWindows ? 'pip.exe' : 'pip');

        // Helper to check if venv is healthy
        function venvHealthy() {
            // More lenient check - only require python executable, pip can be installed later
            return fs.existsSync(venvPythonPath);
        }

        // Helper to sleep for ms milliseconds
        function sleep(ms: number) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // Helper to delete venv directory with retries
        async function deleteVenvWithRetries(pathToDelete: string, maxRetries: number, delayMs: number): Promise<void> {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    if (fs.existsSync(pathToDelete)) {
                        fs.rmSync(pathToDelete, { recursive: true, force: true });
                        console.log(`[${trace_id}] ${source_component}: Successfully deleted venv directory on attempt ${attempt}`);
                        return;
                    } else {
                        console.log(`[${trace_id}] ${source_component}: venv directory does not exist, no need to delete`);
                        return;
                    }
                } catch (err: any) {
                    console.warn(`[${trace_id}] ${source_component}: Failed to delete venv directory on attempt ${attempt}: ${err.message}`);
                    if (attempt < maxRetries) {
                        await sleep(delayMs);
                    } else {
                        throw err;
                    }
                }
            }
        }

        // Check if venv exists but is not healthy, remove it with retries
        if (fs.existsSync(venvPath) && !venvHealthy()) {
            console.warn(`[${trace_id}] ${source_component}: Existing venv at ${venvPath} is broken (missing python or pip). Deleting and recreating.`);
            try {
                await deleteVenvWithRetries(venvPath, 5, 1000);
            } catch (deleteError: any) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
                    severity: ErrorSeverity.CRITICAL,
                    message: `Failed to delete broken venv directory after multiple attempts: ${deleteError.message}`,
                    source_component,
                    original_error: deleteError,
                    trace_id_param: trace_id,
                    contextual_info: { pluginRootPath }
                });
            }
        }

        // Helper to check if python3 or python is available
        async function checkPythonExecutable(): Promise<string> {
            const exec = require('child_process').exec;
            const checkCmds = ['python3 --version', 'python --version'];
            for (const cmd of checkCmds) {
                try {
                    await new Promise<void>((resolve, reject) => {
                        exec(cmd, (error: any, stdout: string, stderr: string) => {
                            if (!error) {
                                console.log(`[${trace_id}] ${source_component}: Found python executable with command: ${cmd}`);
                                resolve();
                            } else {
                                reject(error);
                            }
                        });
                    });
                    return cmd.split(' ')[0]; // Return 'python3' or 'python'
                } catch {
                    continue;
                }
            }
            throw new Error('No python3 or python executable found in PATH');
        }

        let requirementsHash: string | null = null;
        try {
            const pythonCmd = await checkPythonExecutable();

            // Create venv if it doesn't exist
            if (!fs.existsSync(venvPath)) {
                console.log(`[${trace_id}] ${source_component}: Creating virtual environment at ${venvPath}.`);
                const createVenvCmd = `${pythonCmd} -m venv "${venvPath}"`;
                console.log(`[${trace_id}] ${source_component}: Running command: ${createVenvCmd}`);
                await execAsync(createVenvCmd, { cwd: pluginRootPath, timeout: 60000 });
            } else {
                console.log(`[${trace_id}] ${source_component}: Virtual environment exists and is healthy at ${venvPath}.`);
            }

            // Upgrade pip (only if pip exists)
            if (fs.existsSync(venvPipPath)) {
                const upgradePipCmd = `"${venvPipPath}" install --upgrade pip`;
                console.log(`[${trace_id}] ${source_component}: Upgrading pip with command: ${upgradePipCmd}`);
                await execAsync(upgradePipCmd, { cwd: pluginRootPath, timeout: 60000 });
            } else {
                // Try to bootstrap pip using ensurepip
                console.log(`[${trace_id}] ${source_component}: pip not found, attempting to bootstrap with ensurepip`);
                try {
                    const bootstrapPipCmd = `"${venvPythonPath}" -m ensurepip --upgrade`;
                    console.log(`[${trace_id}] ${source_component}: Bootstrapping pip with command: ${bootstrapPipCmd}`);
                    await execAsync(bootstrapPipCmd, { cwd: pluginRootPath, timeout: 60000 });

                    // Now try to upgrade pip
                    if (fs.existsSync(venvPipPath)) {
                        const upgradePipCmd = `"${venvPipPath}" install --upgrade pip`;
                        console.log(`[${trace_id}] ${source_component}: Upgrading pip after bootstrap with command: ${upgradePipCmd}`);
                        await execAsync(upgradePipCmd, { cwd: pluginRootPath, timeout: 60000 });
                    }
                } catch (ensurepipError: any) {
                    console.warn(`[${trace_id}] ${source_component}: Failed to bootstrap pip with ensurepip: ${ensurepipError.message}`);
                    // Try using system pip to install into venv
                    try {
                        const systemPipCmd = `pip install --target "${path.join(venvPath, 'lib', 'python3.*/site-packages')}" --upgrade pip`;
                        console.log(`[${trace_id}] ${source_component}: Attempting to use system pip: ${systemPipCmd}`);
                        await execAsync(systemPipCmd, { cwd: pluginRootPath, timeout: 60000 });
                    } catch (systemPipError: any) {
                        console.warn(`[${trace_id}] ${source_component}: System pip also failed: ${systemPipError.message}`);
                        // Continue without pip upgrade - we'll try to install requirements directly
                    }
                }
            }

            if (fs.existsSync(requirementsPath)) {
                const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
                requirementsHash = require('crypto').createHash('md5').update(requirementsContent).digest('hex');

                if (fs.existsSync(markerPath)) {
                    const existingHash = fs.readFileSync(markerPath, 'utf8').trim();
                    if (existingHash === requirementsHash) {
                        console.log(`[${trace_id}] ${source_component}: Dependencies already installed and up to date`);
                        return;
                    }
                }

                // Install requirements
                let installReqsCmd: string;
                if (fs.existsSync(venvPipPath)) {
                    installReqsCmd = `"${venvPipPath}" install -r "${requirementsPath}"`;
                } else {
                    // Fallback to using python -m pip
                    installReqsCmd = `"${venvPythonPath}" -m pip install -r "${requirementsPath}"`;
                }
                console.log(`[${trace_id}] ${source_component}: Installing requirements with command: ${installReqsCmd}`);
                const { stdout, stderr } = await execAsync(installReqsCmd, { cwd: pluginRootPath, timeout: 120000 });

                if (stderr && !stderr.includes('Successfully installed') && !stderr.includes('Requirement already satisfied')) {
                    console.warn(`[${trace_id}] ${source_component}: Python dependency installation stderr: ${stderr}`);
                }
                if (stdout) {
                    console.log(`[${trace_id}] ${source_component}: Python dependency installation stdout: ${stdout}`);
                }

                // Create marker file with requirements hash
                if (requirementsHash !== null) {
                    fs.writeFileSync(markerPath, requirementsHash);
                    console.log(`[${trace_id}] ${source_component}: Python dependencies processed successfully for ${pluginRootPath}. Marker file updated.`);
                }
            } else {
                console.log(`[${trace_id}] ${source_component}: No requirements.txt found, skipping dependency installation`);
            }

        } catch (error: any) {
            const errorMessage = error.message || '';
            const errorStderr = error.stderr || '';

            // If the error is that a directory is not empty, it's often a sign of a corrupted venv.
            // Let's try to fix this by forcefully removing the venv and retrying the installation once.
            if (errorMessage.includes('ENOTEMPTY') || errorStderr.includes('ENOTEMPTY')) {
                console.warn(`[${trace_id}] ${source_component}: Dependency installation failed with ENOTEMPTY. Attempting to repair by deleting venv and retrying.`);
                try {
                    await deleteVenvWithRetries(venvPath, 5, 1000);
                    // Retry venv creation and installation after deletion
                    const pythonCmd = await checkPythonExecutable();
                    const createVenvCmd = `${pythonCmd} -m venv "${venvPath}"`;
                    console.log(`[${trace_id}] ${source_component}: Retrying venv creation with command: ${createVenvCmd}`);
                    await execAsync(createVenvCmd, { cwd: pluginRootPath, timeout: 60000 });

                    // Retry pip upgrade (with fallback)
                    if (fs.existsSync(venvPipPath)) {
                        const upgradePipCmd = `"${venvPipPath}" install --upgrade pip`;
                        console.log(`[${trace_id}] ${source_component}: Retrying pip upgrade with command: ${upgradePipCmd}`);
                        await execAsync(upgradePipCmd, { cwd: pluginRootPath, timeout: 60000 });
                    } else {
                        console.log(`[${trace_id}] ${source_component}: pip not found during retry, skipping pip upgrade`);
                    }

                    // Retry requirements installation (with fallback)
                    let installReqsCmd: string;
                    if (fs.existsSync(venvPipPath)) {
                        installReqsCmd = `"${venvPipPath}" install -r "${requirementsPath}"`;
                    } else {
                        installReqsCmd = `"${venvPythonPath}" -m pip install -r "${requirementsPath}"`;
                    }
                    console.log(`[${trace_id}] ${source_component}: Retrying requirements installation with command: ${installReqsCmd}`);
                    const { stdout, stderr } = await execAsync(installReqsCmd, { cwd: pluginRootPath, timeout: 120000 });

                    if (stderr && !stderr.includes('Successfully installed') && !stderr.includes('Requirement already satisfied')) {
                        console.warn(`[${trace_id}] ${source_component}: Python dependency installation stderr on retry: ${stderr}`);
                    }
                    if (stdout) {
                        console.log(`[${trace_id}] ${source_component}: Python dependency installation stdout on retry: ${stdout}`);
                    }

                    if (requirementsHash) {// Create marker file with requirements hash
                        fs.writeFileSync(markerPath, requirementsHash);
                        console.log(`[${trace_id}] ${source_component}: Python dependencies successfully installed after repair.`);
                    }
                    return; // Success, exit the function.

                } catch (retryError: any) {
                    throw generateStructuredError({
                        error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
                        severity: ErrorSeverity.CRITICAL,
                        message: `Failed to install Python dependencies for ${pluginRootPath} even after retry: ${retryError.message}`,
                        source_component, original_error: retryError, trace_id_param: trace_id,
                        contextual_info: { pluginRootPath, initial_error: error.message, retry_stderr: retryError.stderr }
                    });
                }
            }

            // For other errors, throw a structured error immediately to halt execution
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
                severity: ErrorSeverity.CRITICAL,
                message: `Failed to install Python dependencies for ${pluginRootPath}: ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id,
                contextual_info: { pluginRootPath, stderr: error.stderr }
            });
        }
    }

    private validatePythonOutput(stdout: string, pluginDefinition: PluginDefinition, trace_id: string): PluginOutput[] {
        const source_component = "CapabilitiesManager.validatePythonOutput";
        console.log(`[${trace_id}] ${source_component}: Validating Python output for ${pluginDefinition.verb} v${pluginDefinition.version}. Received stdout:\n${stdout}`);

        try {
            // Parse JSON output
            const result = JSON.parse(stdout);

            // Validate that result is an array
            if (!Array.isArray(result)) {
                throw new Error("Plugin output must be an array of PluginOutput objects");
            }

            // Validate each output object
            for (const output of result) {
                if (typeof output !== 'object' || output === null) {
                    throw new Error("Each output must be an object");
                }

                // Check required fields
                const requiredFields = ['success', 'name', 'resultType', 'result', 'resultDescription'];
                for (const field of requiredFields) {
                    if (!(field in output)) {
                        throw new Error(`Missing required field: ${field}`);
                    }
                }
            }

            console.log(`[${trace_id}] ${source_component}: Python plugin output parsed and validated successfully for ${pluginDefinition.verb} v${pluginDefinition.version}`);
            return result;

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Invalid Python plugin output for ${pluginDefinition.verb} v${pluginDefinition.version}: JSON parsing failed. Error: ${error.message}`);
            console.error(`[${trace_id}] ${source_component}: Raw stdout that failed to parse: ${stdout}`);

            // Return error output
            return [{
                success: false,
                name: 'validation_error',
                resultType: PluginParameterType.ERROR,
                result: null,
                resultDescription: `Invalid plugin output format: ${error.message}. Raw output: ${stdout.substring(0, 200)}...`,
                error: error.message
            }];
        }
    }

    private async handleUnknownVerb(step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.handleUnknownVerb";
        try {
            // Create structured novel verb information instead of a string goal
            const novelVerbInfo = {
                verb: step.actionVerb,
                description: step.description || `Execute the action: ${step.actionVerb}`,
                context: step.description || '',
                inputValues: MapSerializer.transformForSerialization(step.inputValues),
                outputs: step.outputs ? MapSerializer.transformForSerialization(step.outputs) : {},
                stepId: step.id,
                stepNo: step.stepNo
            };

            // Pass the structured information to the ACCOMPLISH plugin
            const accomplishResultArray = await this.executeAccomplishPluginForNovelVerb(novelVerbInfo, trace_id);
            console.log(`[handleUnknownVerb] plugin result:`, accomplishResultArray);
            if (!accomplishResultArray[0].success) {
                return accomplishResultArray;
            }

            const accomplishResult = accomplishResultArray[0];
            if (accomplishResult.resultType === PluginParameterType.PLAN) {
                // Original step's outputs
                const originalOutputs = step.outputs;

                // The plan steps returned by ACCOMPLISH plugin
                // ACCOMPLISH now returns the plan array directly as accomplishResult[0].result
                const newPlanSteps = (accomplishResult as any)[0]?.result as any[];

                if (!Array.isArray(newPlanSteps) || newPlanSteps.length === 0) {
                    throw generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.ERROR,
                        message: "ACCOMPLISH plugin returned an empty or invalid plan.",
                        source_component,
                        trace_id_param: trace_id
                    });
                }

                // The ACCOMPLISH plugin returns a plan that Step.createFromPlan can handle directly
                // No conversion needed - just pass it through

                // Ensure outputs of final steps match original step outputs
                // Find final steps (steps that are not dependencies of any other step)
                const allDependencies = new Set<string>();
                for (const stepItem of newPlanSteps) {
                    if (stepItem.dependencies) {
                        for (const depOutput in stepItem.dependencies) {
                            allDependencies.add(depOutput);
                        }
                    }
                }
                // Final steps are those whose outputs are not dependencies of others
                const finalSteps = newPlanSteps.filter(stepItem => {
                    if (!stepItem.outputs) return false;
                    return Object.keys(stepItem.outputs).some(outputName => !allDependencies.has(outputName));
                });

                // For each final step, set outputs to match original step outputs if not already set
                for (const finalStep of finalSteps) {
                    if (!finalStep.outputs) {
                        finalStep.outputs = {};
                    }
                    for (const [key, value] of originalOutputs.entries()) {
                        if (!(key in finalStep.outputs)) {
                            finalStep.outputs[key] = value;
                        }
                    }
                }

                // Reset dependencies on the original step to the new steps producing the outputs
                // This logic depends on the Agent's plan management, so here we just return the new plan
                // The Agent or caller should handle inserting these steps and resetting dependencies accordingly

                // Return the new plan as PluginOutput[]
                return [{
                    success: true,
                    name: 'plan',
                    resultType: PluginParameterType.PLAN,
                    resultDescription: `A plan to accomplish the original step '${step.actionVerb}'`,
                    result: newPlanSteps,
                    mimeType: 'application/json'
                }];
            } else {
                // For other result types, return as is
                return accomplishResultArray;
            }
        } catch (error: any) {
            if (error.error_id && error.trace_id) {
                throw error;
            }
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_UNKNOWN_VERB_HANDLING_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Failed to handle unknown verb '${step.actionVerb}': ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {actionVerb: step.actionVerb}
            });
        }
    }

    private async executeAccomplishPlugin(goal: string, trace_id: string, callType: string = 'goal'): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeAccomplishPlugin";
        let availablePluginsStr = ""; // Initialize
        try {            
            // Fetch detailed plugin manifests to provide a schema to the Brain
            const allPlugins = await this.pluginRegistry.list();
            const manifestPromises = allPlugins.map(p => 
                this.pluginRegistry.fetchOne(p.id, p.version, p.repository.type)
                    .catch(e => {
                        console.warn(`[${trace_id}] Failed to fetch manifest for ${p.id} v${p.version}: ${e.message}`);
                        return null; // Return null on failure to not break Promise.all
                    })
            );
            const manifests = (await Promise.all(manifestPromises)).filter((m): m is PluginManifest => m !== null);
            
            // Create a lean, prompt-friendly version of the manifests
            const leanManifests = manifests.map(m => ({
                actionVerb: m.verb,
                description: m.description,
                inputs: (m.inputDefinitions || []).map(i => ({ name: i.name, description: i.description, type: i.type, required: i.required }))
            }));
            availablePluginsStr = JSON.stringify(leanManifests, null, 2);
            console.log(`[${trace_id}] ${source_component}: Plugins string for ACCOMPLISH: ${availablePluginsStr.substring(0,100)}...`);

            const accomplishInputs : Map<string, InputValue> = new Map([
                [callType, { inputName: callType, value: goal, valueType: PluginParameterType.STRING, args: {} }],
                ['available_plugins', { inputName: 'available_plugins', value: availablePluginsStr, valueType: PluginParameterType.STRING, args: {} }]
            ]);

            const accomplishPluginManifest = await this.pluginRegistry.fetchOneByVerb('ACCOMPLISH');
            if (!accomplishPluginManifest) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_MANIFEST_NOT_FOUND,
                    severity: ErrorSeverity.CRITICAL,
                    message: "ACCOMPLISH plugin manifest not found.",
                    trace_id_param: trace_id,
                    source_component
                });
            }

            // Convert PluginDefinition to PluginManifest for execution
            const manifestForExecution: PluginManifest = {
                ...accomplishPluginManifest,
                repository: {
                    type: 'local' as any,
                    url: '',
                    dependencies: {}
                }
            };
            const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(manifestForExecution);
            return await this.executePlugin(effectiveManifest, accomplishInputs, pluginRootPath, trace_id);
        } catch (error:any) {
            if (error.error_id && error.trace_id) {
                throw error;
            }
            throw generateStructuredError({
                error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Core ACCOMPLISH plugin execution failed: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {goal_length: goal.length}
            });
        }
    }

    private async executeAccomplishPluginForNovelVerb(novelVerbInfo: any, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeAccomplishPluginForNovelVerb";
        try {
            // Fetch available plugins for context
            const allPlugins = await this.pluginRegistry.list();
            const manifestPromises = allPlugins.map(p =>
                this.pluginRegistry.fetchOne(p.id, p.version, p.repository.type)
                    .catch(e => {
                        console.warn(`[${trace_id}] Failed to fetch manifest for ${p.id} v${p.version}: ${e.message}`);
                        return null;
                    })
            );
            const manifests = (await Promise.all(manifestPromises)).filter((m): m is PluginManifest => m !== null);

            const leanManifests = manifests.map(m => ({
                actionVerb: m.verb,
                description: m.description,
                inputs: (m.inputDefinitions || []).map(i => ({ name: i.name, description: i.description, type: i.type, required: i.required }))
            }));
            const availablePluginsStr = JSON.stringify(leanManifests, null, 2);

            // Create inputs specifically for novel verb handling
            const accomplishInputs: Map<string, InputValue> = new Map([
                ['novel_actionVerb', {
                    inputName: 'novel_actionVerb',
                    value: novelVerbInfo,
                    valueType: PluginParameterType.OBJECT,
                    args: {}
                }],
                ['available_plugins', {
                    inputName: 'available_plugins',
                    value: availablePluginsStr,
                    valueType: PluginParameterType.STRING,
                    args: {}
                }]
            ]);

            const accomplishPluginManifest = await this.pluginRegistry.fetchOneByVerb('ACCOMPLISH');
            if (!accomplishPluginManifest) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_MANIFEST_NOT_FOUND,
                    severity: ErrorSeverity.CRITICAL,
                    message: "ACCOMPLISH plugin manifest not found.",
                    trace_id_param: trace_id,
                    source_component
                });
            }

            const manifestForExecution: PluginManifest = {
                ...accomplishPluginManifest,
                repository: {
                    type: 'local' as any,
                    url: '',
                    dependencies: {}
                }
            };
            const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(manifestForExecution);
            return await this.executePlugin(effectiveManifest, accomplishInputs, pluginRootPath, trace_id);
        } catch (error: any) {
            if (error.error_id && error.trace_id) {
                throw error;
            }
            throw generateStructuredError({
                error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Novel verb ACCOMPLISH plugin execution failed: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: { verb: novelVerbInfo.verb }
            });
        }
    }

    private async checkCachedPlan(actionVerb: string): Promise<PluginOutput[] | null> {
        const trace_id = uuidv4();
        const source_component = "CapabilitiesManager.checkCachedPlan";
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${actionVerb}`, {
                params: { collection: 'actionPlans', storageType: 'mongo' }
            });

            if (response.data?.data) {
                console.log(`[${trace_id}] ${source_component}: Found cached plan for verb: ${actionVerb}`);
                return response.data.data as PluginOutput[];
            }
            return null;
        } catch (error:any) {
            generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.WARNING,
                message: `Could not check cached plan for verb '${actionVerb}'. ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
            return null;
        }
    }

    private async executeOpenAPIToolInternal(tool: OpenAPITool, step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeOpenAPIToolInternal";

        try {
            // Find the action mapping for this action verb
            const actionMapping = tool.actionMappings.find(mapping => mapping.actionVerb === step.actionVerb);
            if (!actionMapping) {
                throw new Error(`Action verb ${step.actionVerb} not found in OpenAPI tool ${tool.id}`);
            }

            // Build the API request
            const apiRequest = await this.buildOpenAPIRequest(tool, actionMapping, step);

            // Execute the API call
            const startTime = Date.now();
            const apiResponse = await this.makeOpenAPICall(apiRequest);
            const responseTime = Date.now() - startTime;

            // Convert API response to PluginOutput format
            const pluginOutputs: PluginOutput[] = [{
                success: true,
                name: 'result',
                resultType: PluginParameterType.OBJECT,
                result: apiResponse.data,
                resultDescription: `OpenAPI call to ${actionMapping.method} ${actionMapping.path}`,
                mimeType: 'application/json'
            }];

            // Add metadata about the API call
            if (apiResponse.status) {
                pluginOutputs.push({
                    success: true,
                    name: 'statusCode',
                    resultType: PluginParameterType.NUMBER,
                    result: apiResponse.status,
                    resultDescription: 'HTTP status code'
                });
            }

            pluginOutputs.push({
                success: true,
                name: 'responseTime',
                resultType: PluginParameterType.NUMBER,
                result: responseTime,
                resultDescription: 'Response time in milliseconds'
            });

            console.log(`[${trace_id}] ${source_component}: Successfully executed OpenAPI tool ${tool.id} action ${step.actionVerb}`);
            return pluginOutputs;

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error executing OpenAPI tool:`, error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: null,
                resultDescription: `OpenAPI execution failed: ${error.message}`,
                error: error.message
            }];
        }
    }

    private async buildOpenAPIRequest(tool: OpenAPITool, actionMapping: any, step: Step): Promise<any> {
        const url = new URL(actionMapping.path, tool.baseUrl);
        const headers: any = {
            'Content-Type': 'application/json',
            'User-Agent': 'Stage7-Agent/1.0'
        };

        let body: any = null;
        const queryParams: any = {};

        // Process inputs according to parameter mappings
        for (const inputMapping of actionMapping.inputs) {
            const inputValue = step.inputValues?.get(inputMapping.name)?.value;

            if (inputValue !== undefined) {
                switch (inputMapping.in) {
                    case 'path':
                        // Replace path parameters
                        url.pathname = url.pathname.replace(`{${inputMapping.name}}`, String(inputValue));
                        break;
                    case 'query':
                        queryParams[inputMapping.name] = inputValue;
                                               break;
                    case 'header':
                        headers[inputMapping.name] = inputValue;
                        break;
                    case 'body':
                        body = inputValue;
                        break;
                }
            }
        }

        // Add query parameters to URL
        for (const [key, value] of Object.entries(queryParams)) {
            url.searchParams.append(key, String(value));
        }

        // Add authentication
        await this.addOpenAPIAuthentication(headers, tool.authentication);

        return {
            method: actionMapping.method,
            url: url.toString(),
            headers,
            data: body,
            timeout: actionMapping.timeout || 30000
        };
    }

    private async addOpenAPIAuthentication(headers: any, auth: any): Promise<void> {
        if (!auth || auth.type === 'none') return;

        switch (auth.type) {
            case 'apiKey':
                if (auth.apiKey) {
                    const apiKey = await this.getCredential(auth.apiKey.credentialSource);
                    if (auth.apiKey.in === 'header') {
                        headers[auth.apiKey.name] = apiKey;
                    }
                    // Query and cookie auth would be handled in buildOpenAPIRequest
                }
                break;
            case 'bearer':
                if (auth.bearer) {
                    const token = await this.getCredential(auth.bearer.credentialSource);
                    headers['Authorization'] = `Bearer ${token}`;
                }
                break;
            case 'basic':
                if (auth.basic) {
                    const credentials = await this.getCredential(auth.basic.credentialSource);
                    headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
                }
                break;
        }
    }

    private async getCredential(credentialSource: string): Promise<string> {
        // For now, try to get from environment variables
        // In a production system, this would integrate with a proper secrets manager
        const envVar = credentialSource.replace('env:', '');
        return process.env[envVar] || '';
    }

    private async makeOpenAPICall(request: any): Promise<any> {
        try {
            const response = await axios({
                method: request.method,
                url: request.url,
                headers: request.headers,
                data: request.data,
                timeout: request.timeout,
                validateStatus: (status) => status < 500 // Accept 4xx as valid responses
            });

            return response;
        } catch (error: any) {
            if (error.response) {
                // API returned an error response
                throw new Error(`API call failed with status ${error.response.status}: ${error.response.data?.message || error.response.statusText}`);
            } else if (error.request) {
                // Network error
                throw new Error(`Network error: ${error.message}`);
            } else {
                // Other error
                throw new Error(`Request setup error: ${error.message}`);
            }
        }
    }

    /**
     * Cleanup method for graceful shutdown
     */
    async cleanup(): Promise<void> {
        const trace_id = `cleanup-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.cleanup";

        try {
            console.log(`[${trace_id}] ${source_component}: Starting cleanup...`);

            // Cleanup container manager
            if (this.containerManager) {
                await this.containerManager.cleanup(trace_id);
            }

            // Close server if running
            if (this.server) {
                this.server.close();
            }

            console.log(`[${trace_id}] ${source_component}: Cleanup completed`);
        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Cleanup failed: ${error.message}`);
        }
    }

    private async executeMCPTool(mcpTool: MCPTool, step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeMCPTool";
        console.log(`[${trace_id}] ${source_component}: Executing MCP Tool ${mcpTool.id} for actionVerb ${step.actionVerb}`);

        const actionMapping = mcpTool.actionMappings.find(m => m.actionVerb === step.actionVerb);
        if (!actionMapping) {
            const errorMsg = `ActionVerb '${step.actionVerb}' not found in MCP Tool '${mcpTool.id}'. This should have been caught by getHandlerForActionVerb.`;
            console.error(`[${trace_id}] ${source_component}: ${errorMsg}`);
            return [this.createErrorOutput(GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, errorMsg, trace_id)];
        }

        try {
            // 1. Validate Inputs
            const validatedInputsResult = await validateAndStandardizeInputs(actionMapping as any, step.inputValues || new Map()); // Cast as any because actionMapping is not PluginDefinition
            if (!validatedInputsResult.success || !validatedInputsResult.inputs) {
                const errorMsg = validatedInputsResult.error || "Input validation failed for MCP tool.";
                console.error(`[${trace_id}] ${source_component}: ${errorMsg}`);
                return [this.createErrorOutput(GlobalErrorCodes.INPUT_VALIDATION_FAILED, errorMsg, trace_id, { toolId: mcpTool.id, actionVerb: step.actionVerb })];
            }
            const validatedInputs = validatedInputsResult.inputs;
            const inputsObject: { [key: string]: any } = {};
            validatedInputs.forEach((value, key) => {
                inputsObject[key] = value.value;
            });

            // 2. Prepare Request for MCP Service
            // This part is highly dependent on the specifics of MCPServiceTarget and how MCP services are called.
            // For this example, let's assume mcpServiceTarget.serviceName is a key for a URL in config or env,
            // and we make a POST request with inputsObject as JSON body.

            const mcpTarget = actionMapping.mcpServiceTarget;
            let targetUrl = mcpTarget.serviceName; // Could be a direct URL or a service discovery key

            // Basic service discovery placeholder (replace with actual discovery if used)
            if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                 // Try to resolve from environment, assuming format MCP_SERVICE_<NAME>_URL
                const envUrl = process.env[`MCP_SERVICE_${targetUrl.toUpperCase().replace(/-/g, '_')}_URL`];
                if (envUrl) {
                    targetUrl = envUrl;
                } else {
                    // Fallback or error if service name cannot be resolved
                    console.error(`[${trace_id}] ${source_component}: Cannot resolve MCP service name '${mcpTarget.serviceName}' to a URL.`);
                    return [this.createErrorOutput(GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, `Cannot resolve MCP service name '${mcpTarget.serviceName}'.`, trace_id)];
                }
            }

            // Append endpoint/command if it's a path
            if (mcpTarget.endpointOrCommand.startsWith('/')) {
                targetUrl += mcpTarget.endpointOrCommand;
            } else {
                // If not a path, it might be part of the payload or a different protocol.
                // This example focuses on HTTP.
                console.warn(`[${trace_id}] ${source_component}: MCP endpointOrCommand '${mcpTarget.endpointOrCommand}' is not a path, specific handling required.`);
            }

            const requestConfig: any = {
                method: mcpTarget.method.toLowerCase() || 'post',
                url: targetUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Trace-ID': trace_id,
                    // Add other common headers
                },
                data: inputsObject // Assuming inputs are sent as JSON body
            };

            // Add additional static config from mcpServiceTarget
            if (mcpTarget.additionalConfig) {
                if (mcpTarget.additionalConfig.headers) {
                    requestConfig.headers = { ...requestConfig.headers, ...mcpTarget.additionalConfig.headers };
                }
                // Handle other additionalConfig fields as needed
            }


            // 3. Handle Authentication
            // Use authentication from mcpTool, since MCPActionMapping does not have 'authentication'
            const authConfig = mcpTool.authentication;
            if (authConfig) {
                await this.applyMCPAuthentication(requestConfig.headers, authConfig, trace_id);
            }


            // 4. Make the call
            console.log(`[${trace_id}] ${source_component}: Calling MCP service. URL: ${requestConfig.url}, Method: ${requestConfig.method}`);
            const mcpResponse = await axios(requestConfig);

            // 5. Transform Response to PluginOutput[]
            // This is also highly dependent on the expected response structure from MCP services
            // and what's defined in actionMapping.outputs.
            // For simplicity, assume the response data is an object with keys matching output names.
            const outputs: PluginOutput[] = [];
            if (mcpResponse.data && typeof mcpResponse.data === 'object') {
                for (const outputDef of actionMapping.outputs) {
                    if (mcpResponse.data.hasOwnProperty(outputDef.name)) {
                        outputs.push({
                            success: true,
                            name: outputDef.name,
                            resultType: outputDef.type,
                            result: mcpResponse.data[outputDef.name],
                            resultDescription: outputDef.description || `Output from MCP tool ${mcpTool.id}`,
                        });
                    } else {
                         outputs.push({
                            success: false, // Or true if partial success is allowed and output is optional
                            name: outputDef.name,
                            resultType: PluginParameterType.ERROR,
                            result: null,
                            resultDescription: `Output '${outputDef.name}' not found in MCP response.`,
                            error: `Output '${outputDef.name}' not found in MCP response.`
                        });
                    }
                }
                 // If no specific outputs matched, but we got data, return it as a generic result
                if (outputs.length === 0) {
                     outputs.push({
                        success: true,
                        name: 'mcp_result',
                        resultType: PluginParameterType.OBJECT,
                        result: mcpResponse.data,
                        resultDescription: `Raw response from MCP tool ${mcpTool.id}`,
                    });
                }

            } else {
                // Handle non-object or empty responses
                outputs.push({
                    success: true, // Or false if data is strictly expected
                    name: 'mcp_response',
                    resultType: this.inferResultType(mcpResponse.data),
                    result: mcpResponse.data,
                    resultDescription: `Response from MCP tool ${mcpTool.id}`,
                });
            }

            console.log(`[${trace_id}] ${source_component}: MCP Tool ${mcpTool.id} executed successfully.`);
            return outputs;

        } catch ( error: any) {
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `MCP Tool '${mcpTool.id}' action '${step.actionVerb}' execution failed: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {
                    toolId: mcpTool.id,
                    actionVerb: step.actionVerb,
                    mcpTarget: actionMapping.mcpServiceTarget,
                    responseStatus: error.response?.status,
                    responseData: error.response?.data
                }
            });
            return createPluginOutputError(sError);
        }
    }

    private async applyMCPAuthentication(headers: any, authConfig: MCPAuthentication, trace_id: string): Promise<void> {
        const source_component = "CapabilitiesManager.applyMCPAuthentication";
        console.log(`[${trace_id}] ${source_component}: Applying MCP authentication type: ${authConfig.type}`);

        try {
            switch (authConfig.type) {
                case 'none':
                    break;
                case 'apiKey':
                    if (authConfig.apiKey) {
                        const keyName = authConfig.apiKey.name;
                        const keyValue = authConfig.apiKey.value || (authConfig.apiKey.credentialSource ? await this.getCredential(authConfig.apiKey.credentialSource) : undefined);
                        if (!keyValue) {
                            throw new Error(`API key value not found for ${keyName}.`);
                        }
                        if (authConfig.apiKey.in === 'header') {
                            headers[keyName] = keyValue;
                        } else if (authConfig.apiKey.in === 'query') {
                            // Query params need to be added to URL, this function only modifies headers
                            // This indicates a need for a more comprehensive request modification function
                            console.warn(`[${trace_id}] ${source_component}: API key in query for ${keyName} not directly supported by this header modification function.`);
                        }
                        // 'body' would also need different handling
                    } else {
                         throw new Error("apiKey authentication config is missing.");
                    }
                    break;
                case 'customToken':
                    if (authConfig.customToken && authConfig.customToken.credentialSource) {
                        const token = await this.getCredential(authConfig.customToken.credentialSource);
                        const tokenPrefix = authConfig.customToken.tokenPrefix || '';
                        headers[authConfig.customToken.headerName] = `${tokenPrefix}${token}`;
                    } else {
                        throw new Error("customToken authentication config is incomplete.");
                    }
                    break;
                // Add cases for oauth2 or other MCP-specific auth types
                default:
                    console.warn(`[${trace_id}] ${source_component}: Unsupported MCP authentication type: ${authConfig.type}`);
                    // Potentially throw an error if unsupported auth type is critical
                    break;
            }
        } catch (error: any) {
             generateStructuredError({
                error_code: GlobalErrorCodes.AUTHENTICATION_ERROR,
                severity: ErrorSeverity.ERROR,
                message: `Failed to apply MCP authentication: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: { authType: authConfig.type }
            });
            throw error; // Re-throw to be caught by the calling function
        }
    }

    private createErrorOutput(
        errorCode: string,
        message: string,
        trace_id: string,
        contextual_info?: any
    ): PluginOutput {
        const sError = generateStructuredError({
            error_code: errorCode,
            severity: ErrorSeverity.ERROR,
            message: message,
            source_component: "CapabilitiesManager", // Generic source for this helper
            trace_id_param: trace_id,
            contextual_info: contextual_info
        });
        return {
            success: false,
            name: sError.error_code || 'error',
            resultType: PluginParameterType.ERROR,
            result: sError,
            resultDescription: sError.message_human_readable,
            error: sError.message_human_readable,
        };
    }

    /**
     * Automatically adds optional inputs (as defined in the plugin manifest) to a step's inputs
     * if they are not already present. This ensures all optional inputs are available during execution.
     */
    private addOptionalInputsToStep(step: Step, pluginDefinition: PluginDefinition): Map<string, InputValue> {
        const enhancedInputs = new Map<string, InputValue>(step.inputValues || new Map());

        // Iterate through all input definitions in the plugin
        for (const inputDef of pluginDefinition.inputDefinitions || []) {
            // Skip if input is already present
            if (enhancedInputs.has(inputDef.name)) {
                continue;
            }

            // Skip required inputs - they should be provided by the step
            if (inputDef.required) {
                continue;
            }

            // Add optional input with appropriate default value
            let defaultValue: any = undefined;

            // Use explicit default if provided
            if (inputDef.defaultValue !== undefined) {
                defaultValue = inputDef.defaultValue;
            } else {
                // Provide type-based defaults for optional inputs
                switch (inputDef.type?.toLowerCase()) {
                    case 'object':
                        defaultValue = {};
                        break;
                    case 'array':
                        defaultValue = [];
                        break;
                    case 'string':
                        defaultValue = '';
                        break;
                    case 'number':
                        defaultValue = 0;
                        break;
                    case 'boolean':
                        defaultValue = false;
                        break;
                    default:
                        defaultValue = null;
                }
            }

            enhancedInputs.set(inputDef.name, {
                inputName: inputDef.name,
                value: defaultValue,
                valueType: inputDef.type || 'string',
                args: {}
            });
        }

        return enhancedInputs;
    }

}

export const capabilitiesManager = new CapabilitiesManager();
export default CapabilitiesManager;

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, starting graceful shutdown...');
    await capabilitiesManager.cleanup();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, starting graceful shutdown...');
    await capabilitiesManager.cleanup();
    process.exit(0);
});
