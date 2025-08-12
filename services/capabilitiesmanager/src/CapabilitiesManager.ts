import express from 'express';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import { Step, MapSerializer, BaseEntity } from '@cktmcs/shared';
import { InputValue, PluginOutput, PluginDefinition, PluginParameterType, PluginManifest, PluginLocator, PluginRepositoryType, PluginParameter, DefinitionManifest, DefinitionType, OpenAPITool, MCPTool, MCPActionMapping, MCPAuthentication, MCPServiceTarget, OpenAPIExecutionRequest, OpenAPIExecutionResult } from '@cktmcs/shared'; // Added DefinitionManifest, DefinitionType
import { generateStructuredError, ErrorSeverity, GlobalErrorCodes } from './utils/errorReporter';
import { createPluginOutputError } from './utils/errorHelper';
import { ConfigManager } from './utils/configManager';
import { PluginRegistry } from './utils/pluginRegistry';
import { PluginContextManager } from './utils/PluginContextManager';
import { validateAndStandardizeInputs } from './utils/validator';
import { ContainerManager } from './utils/containerManager';
import { PluginExecutor } from './utils/pluginExecutor';

function truncate(obj: any, length = 256): string {
    const str = JSON.stringify(obj);
    if (str.length > length) {
        return str.substring(0, length) + '...';
    }
    return str;
}

export class CapabilitiesManager extends BaseEntity {
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private server: any;
    private configManager!: ConfigManager;
    private pluginRegistry!: PluginRegistry;
    private containerManager!: ContainerManager;
    private pluginContextManager!: PluginContextManager;
    private pluginExecutor!: PluginExecutor;
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

    // Cache for input transformations: missionId -> { actionVerb -> { originalInput -> transformedInput } }
    private inputTransformationCache: Map<string, Map<string, Map<string, string>>> = new Map();

    constructor() {
        super('CapabilitiesManager', 'CapabilitiesManager', `capabilitiesmanager`, process.env.PORT || '5060');
        const trace_id = `${this.serviceId}-constructor-${uuidv4().substring(0,8)}`;
        // Retry logic for initialization
        this.pluginRegistry = new PluginRegistry();
        this.containerManager = new ContainerManager();
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

            // Initialize PluginExecutor after ConfigManager is available
            this.pluginExecutor = new PluginExecutor(this.configManager, this.containerManager, this.librarianUrl, this.securityManagerUrl);
            console.log(`[${trace_id}] ${source_component}: PluginExecutor initialized.`);

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

                // Authentication middleware - skip for health checks and executeAction (temporary for testing)
                app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
                    if (req.path === '/health' || req.path === '/ready' || req.path === '/executeAction') return next();
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
        console.log(`[${trace_id}] ${source_component}: Received request for action execution`, {
            actionVerb: req.body.actionVerb,
            inputKeys: Object.keys(req.body.inputValues || {})
        });
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
                    const result = await this.pluginExecutor.executeOpenAPITool(definitionManifest.toolDefinition as OpenAPITool, step, trace_id);
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
                    const result = await this.pluginExecutor.executeMCPTool(definitionManifest.toolDefinition as MCPTool, step, trace_id);
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

                    step.inputValues = step.inputValues || new Map<string, InputValue>();
                    const validatedInputs = await validateAndStandardizeInputs(pluginDefinition, step.inputValues);
                    if (!validatedInputs.success || !validatedInputs.inputs) {
                        throw generateStructuredError({
                            error_code: GlobalErrorCodes.INPUT_VALIDATION_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: validatedInputs.error || "Input validation failed for plugin.",
                            source_component,
                            trace_id_param: trace_id,
                            contextual_info: {
                                plugin_id: pluginDefinition.id,
                                version: pluginDefinition.version,
                                verb: pluginDefinition.verb
                            }
                        });
                    }
                    // preparePluginForExecution expects PluginManifest, which DefinitionManifest extends
                    const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(manifest);
                    const result = await this.pluginExecutor.execute(effectiveManifest, validatedInputs.inputs, pluginRootPath, trace_id);
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
                    // Don't call handleUnknownVerb recursively - return error instead
                    console.error(`[${trace_id}] ${source_component}: Error in handleUnknownVerb, avoiding recursion:`, error.message);
                    res.status(500).json(createPluginOutputError(error));
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


    private async handleUnknownVerb(step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.handleUnknownVerb";
        try {
            console.log(`[${trace_id}] ${source_component}: Starting handleUnknownVerb for ${step.actionVerb}`);
            console.log(`[${trace_id}] ${source_component}: step.outputs type:`, typeof step.outputs, step.outputs);
            // Create structured novel verb information instead of a string goal
            const novelVerbInfo = {
                verb: step.actionVerb,
                description: step.description || `Execute the action: ${step.actionVerb}`,
                context: `The user wants to perform the action '${step.actionVerb}'. The step is described as: '${step.description}'. The available inputs are: ${JSON.stringify(Array.from(step.inputValues?.keys()||[]))}. The expected outputs are: ${JSON.stringify(step.outputs)}`,
                inputValues: step.inputValues ? MapSerializer.transformForSerialization(step.inputValues) : {},
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
                const originalOutputs = step.outputs || new Map<string, string>();

                // The plan steps returned by ACCOMPLISH plugin
                // ACCOMPLISH returns the plan array directly as accomplishResult.result
                const newPlanSteps = accomplishResult.result as any[];

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
                    if (originalOutputs && originalOutputs.entries) {
                        for (const [key, value] of originalOutputs.entries()) {
                            if (!(key in finalStep.outputs)) {
                                finalStep.outputs[key] = value;
                            }
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
            console.log(`[${trace_id}] ${source_component}: Plugins string for ACCOMPLISH: ${truncate(availablePluginsStr)}...`);

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
            return await this.pluginExecutor.execute(effectiveManifest, accomplishInputs, pluginRootPath, trace_id);
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
            return await this.pluginExecutor.execute(effectiveManifest, accomplishInputs, pluginRootPath, trace_id);
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