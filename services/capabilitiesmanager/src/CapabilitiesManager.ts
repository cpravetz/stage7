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
    private planCache: Map<string, PluginOutput[]> = new Map();
    private activeOperations: Map<string, { resources: Set<string>, startTime: number }> = new Map();
    private resourceUsage: Map<string, { inUse: boolean, lastAccessed: number }> = new Map();

    constructor() {
        super('CapabilitiesManager', 'CapabilitiesManager', `capabilitiesmanager`, process.env.PORT || '5060');
        const trace_id = `${this.serviceId}-constructor-${uuidv4().substring(0,8)}`;
        // Retry logic for initialization
        this.pluginRegistry = new PluginRegistry();
        this.containerManager = new ContainerManager();
        
        // Start periodic cleanup of stale resources
        setInterval(() => this.cleanupStaleResources(), 5 * 60 * 1000); // Every 5 minutes
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
            } catch (error: any) {
                const initError = error instanceof Error ? error : new Error(String(error));
                const message = (initError as any).message_human_readable || initError.message;
                generateStructuredError({
                    error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                    severity: ErrorSeverity.CRITICAL,
                    message: `INIT_FAILURE (attempt ${attempts}): ${message}`,
                    source_component,
                    original_error: initError,
                    trace_id_param: trace_id
                });
                if (attempts < maxAttempts) {
                    console.warn(`[${trace_id}] ${source_component}: Retrying initialization in ${retryDelayMs}ms...`);
                    setTimeout(tryInitialize, retryDelayMs);
                } else {
                    // Final failure, log as critical and do not retry
                    generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.CRITICAL,
                        message: `Initialization failed after ${maxAttempts} attempts. CapabilitiesManager will not start.`,
                        source_component,
                        trace_id_param: trace_id
                    });
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
                } catch (error: any) {
                    generateStructuredError({
                        error_code: GlobalErrorCodes.PLUGIN_REGISTRY_INITIALIZATION_FAILED,
                        severity: ErrorSeverity.WARNING,
                        message: "PluginRegistry initialization failed, continuing with limited functionality.",
                        source_component,
                        original_error: error,
                        trace_id_param: trace_id
                    });
                    // Continue initialization even if plugin registry fails
                }
            } else {
                generateStructuredError({
                    error_code: GlobalErrorCodes.PLUGIN_REGISTRY_NOT_AVAILABLE,
                    severity: ErrorSeverity.WARNING,
                    message: "PluginRegistry or its initialize method is not available.",
                    source_component,
                    trace_id_param: trace_id
                });
            }

            try {
                this.configManager = await ConfigManager.initialize(this.librarianUrl);
                this.initializationStatus.configManager = true;
                console.log(`[${trace_id}] ${source_component}: ConfigManager initialized.`);
            } catch (error: any) {
                generateStructuredError({
                    error_code: GlobalErrorCodes.CONFIG_MANAGER_INITIALIZATION_FAILED,
                    severity: ErrorSeverity.WARNING,
                    message: "ConfigManager initialization failed, using defaults.",
                    source_component,
                    original_error: error,
                    trace_id_param: trace_id
                });
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
                app.use(bodyParser.json({ limit: '50mb' }));

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
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-plugins-list-${uuidv4().substring(0,8)}`;
                    try {
                        const repository = req.query.repository as PluginRepositoryType | undefined;
                        console.log(`[${trace_id}] ${source_component}: Fetching plugins from repository: ${repository || 'default'}`);
                        const plugins = await this.pluginRegistry.list(repository);
                        res.json({ plugins });
                    } catch (error: any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: "Failed to list plugins.",
                            source_component: `${source_component}.getPlugins`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(500).json(createPluginOutputError(sError));
                    }
                });
                app.get('/plugins/:id', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-plugins-get-${uuidv4().substring(0,8)}`;
                    try {
                        const repository = req.query.repository as PluginRepositoryType | undefined;
                        const plugin = await this.pluginRegistry.fetchOne(req.params.id, undefined, repository);
                        if (!plugin) {
                            const sError = generateStructuredError({
                                error_code: GlobalErrorCodes.PLUGIN_NOT_FOUND,
                                severity: ErrorSeverity.WARNING,
                                message: `Plugin with ID ${req.params.id} not found.`, 
                                source_component: `${source_component}.getPluginById`,
                                trace_id_param: trace_id
                            });
                            res.status(404).json(createPluginOutputError(sError));
                        } else {
                            res.json({ plugin });
                        }
                    } catch (error: any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: `Failed to fetch plugin with ID ${req.params.id}.`, 
                            source_component: `${source_component}.getPluginById`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(500).json(createPluginOutputError(sError));
                    }
                });
                app.post('/plugins', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-plugins-post-${uuidv4().substring(0,8)}`;
                    try {
                        await this.pluginRegistry.store(req.body);
                        res.status(201).json({ success: true });
                    } catch (error: any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: "Failed to create plugin.",
                            source_component: `${source_component}.postPlugins`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(400).json(createPluginOutputError(sError));
                    }
                });
                app.put('/plugins/:id', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-plugins-put-${uuidv4().substring(0,8)}`;
                    try {
                        await this.pluginRegistry.store(req.body);
                        res.json({ success: true });
                    } catch (error: any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: `Failed to update plugin with ID ${req.params.id}.`, 
                            source_component: `${source_component}.putPlugins`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(400).json(createPluginOutputError(sError));
                    }
                });
                app.delete('/plugins/:id', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-plugins-delete-${uuidv4().substring(0,8)}`;
                    try {
                        const repository = req.query.repository as string | undefined;
                        // Only librarian-definition repos support delete
                        if (repository === 'librarian-definition' && typeof this.pluginRegistry.delete === 'function') {
                            await this.pluginRegistry.delete(req.params.id, undefined, repository);
                        } else {
                            const sError = generateStructuredError({
                                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_INVALID_REQUEST_GENERIC,
                                severity: ErrorSeverity.WARNING,
                                message: "Plugin deletion only supported for 'librarian-definition' repository type.",
                                source_component: `${source_component}.deletePlugins`,
                                trace_id_param: trace_id
                            });
                            res.status(400).json(createPluginOutputError(sError));
                            return;
                        }
                        res.json({ success: true });
                    } catch (error: any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: `Failed to delete plugin with ID ${req.params.id}.`, 
                            source_component: `${source_component}.deletePlugins`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(400).json(createPluginOutputError(sError));
                    }
                });
                // --- Plugin Repositories API ---
                app.get('/pluginRepositories', (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-repos-list-${uuidv4().substring(0,8)}`;
                    try {
                        const repos = this.pluginRegistry.getActiveRepositories();
                        res.json({ repositories: repos });
                    } catch (error: any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: "Failed to list plugin repositories.",
                            source_component: `${source_component}.getPluginRepositories`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(500).json(createPluginOutputError(sError));
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
                        res.status(500).json(createPluginOutputError(sError));
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
                        res.status(500).json(createPluginOutputError(sError));
                    }
                });

                // New endpoint for intelligent plugin context generation
                app.post('/generatePluginContext', async (req: any, res: any) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-context-${uuidv4().substring(0,8)}`;
                    try {
                        const { goal, constraints } = req.body;

                        if (!goal || typeof goal !== 'string') {
                            const sError = generateStructuredError({
                                error_code: GlobalErrorCodes.MISSING_REQUIRED_INPUT,
                                severity: ErrorSeverity.ERROR,
                                message: 'Missing or invalid goal parameter for plugin context generation.',
                                source_component: `${source_component}.generatePluginContext`,
                                trace_id_param: trace_id,
                                contextual_info: { parameter: 'goal' }
                            });
                            return res.status(400).json(createPluginOutputError(sError));
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
                        res.status(500).json(createPluginOutputError(sError));
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


    private async beginTransaction(trace_id: string, step: Step): Promise<string> {
        const opId = `${step.actionVerb}-${uuidv4()}`;
        this.activeOperations.set(opId, {
            resources: new Set(),
            startTime: Date.now()
        });
        return opId;
    }

    private async commitTransaction(opId: string): Promise<void> {
        const operation = this.activeOperations.get(opId);
        if (operation) {
            // Mark resources as no longer in use
            operation.resources.forEach(resourceId => {
                const resource = this.resourceUsage.get(resourceId);
                if (resource) {
                    resource.inUse = false;
                    resource.lastAccessed = Date.now();
                }
            });
            this.activeOperations.delete(opId);
        }
    }

    private async rollbackTransaction(opId: string): Promise<void> {
        const operation = this.activeOperations.get(opId);
        if (operation) {
            // Release all resources
            operation.resources.forEach(resourceId => {
                const resource = this.resourceUsage.get(resourceId);
                if (resource) {
                    resource.inUse = false;
                    resource.lastAccessed = Date.now();
                }
            });
            this.activeOperations.delete(opId);
        }
    }

    private normalizePluginOutput(output: any): PluginOutput {
        const normalized: PluginOutput = {
            success: output.success ?? false,
            name: output.name || 'unknown',
            resultType: output.resultType || PluginParameterType.ANY,
            result: output.result,
            resultDescription: output.resultDescription || '',
            error: output.error,
            mimeType: output.mimeType,
            fileName: output.fileName,
            trace_id: output.trace_id,
            console: output.console || [],
            context: output.context || {}
        };
        return normalized;
    }

    private extractRawInputValues(inputMap: Map<string, InputValue>): Map<string, any> {
        const rawInputs = new Map<string, any>();
        inputMap.forEach((inputValue, key) => {
            // Check if inputValue is an object and has a 'value' property
            if (inputValue && typeof inputValue === 'object' && inputValue !== null && 'value' in inputValue) {
                rawInputs.set(key, inputValue.value);
            } else if (inputValue && typeof inputValue === 'object' && inputValue !== null && 'outputName' in inputValue && 'sourceStep' in inputValue) {
                // Handle input references, pass them as is for now, validation might handle this later
                rawInputs.set(key, { outputName: (inputValue as any).outputName, sourceStep: (inputValue as any).sourceStep });
            } else {
                // Fallback for unexpected InputValue structure
                rawInputs.set(key, inputValue);
            }
        });
        return rawInputs;
    }

    private async executeActionVerb(req: express.Request, res: express.Response) {
        const trace_id = (req as any).trace_id || uuidv4();
        const source_component = "CapabilitiesManager.executeActionVerb";
        let opId: string | null = null;

        console.log(`[${trace_id}] ${source_component}: Received request for action execution`, {
            actionVerb: req.body.actionVerb,
            inputKeys: Object.keys(req.body.inputValues || {})
        });
        //console.log(`[${trace_id}] ${source_component}: Full request body:`, JSON.stringify(req.body, null, 2));
        // Handle inputValues - can be either array of [key, value] pairs or serialized Map
        let inputValues: Map<string, InputValue>;
        if (Array.isArray(req.body.inputValues)) {
            // Convert array of [key, value] pairs to Map
            inputValues = new Map(req.body.inputValues);
        } else if (req.body.inputValues && req.body.inputValues._type === 'Map') {
            // Handle serialized Map format
            inputValues = MapSerializer.transformFromSerialization(req.body.inputValues);
        } else {
            // Handle object format
            inputValues = new Map(Object.entries(req.body.inputValues || {}));
        }

        const step = {
            ...req.body,
            inputValues: inputValues,
            outputs: MapSerializer.transformFromSerialization(req.body.outputs || {}) instanceof Map ? MapSerializer.transformFromSerialization(req.body.outputs || {}) : new Map(Object.entries(MapSerializer.transformFromSerialization(req.body.outputs || {})))
        } as Step;



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
            opId = await this.beginTransaction(trace_id, step);

            // Redirect 'ACCOMPLISH' to executeAccomplishPlugin
            if (step.actionVerb === 'ACCOMPLISH' && step.inputValues) {
                const result = await this.executeAccomplishPlugin(step.inputValues, trace_id);
                await this.commitTransaction(opId);
                res.status(200).send(MapSerializer.transformForSerialization(result.map(r => this.normalizePluginOutput(r))));
                return;
            }
            // Query PluginRegistry for the handler for this actionVerb
            // The handlerResult.handler will be a PluginManifest (or DefinitionManifest)
            const handlerResult = await this.getHandlerForActionVerb(step.actionVerb, trace_id);
            console.log(`[${trace_id}] ${source_component}: Handler result for verb '${step.actionVerb}':`, handlerResult ? { type: handlerResult.type, handlerType: handlerResult.handler?.language || handlerResult.handler?.type, id: handlerResult.handler?.id || handlerResult.handler?.verb } : null);

            if (handlerResult) {
                const { type, handler } = handlerResult;

                if (type === 'plugin') {
                    const manifest = handler; // Could be DefinitionManifest or PluginManifest
                    console.log(`[${trace_id}] ${source_component}: Found plugin handler for '${step.actionVerb}'. Language: '${manifest.language}', ID: '${manifest.id}'. Attempting direct execution.`);

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

                        if (!(step.inputValues instanceof Map)) {
                            step.inputValues = new Map(Object.entries(step.inputValues || {}));
                        }

                        // Fetch all available plugins to provide context to Python plugins
                        const allPlugins = await this.pluginRegistry.list();
                        const manifestPromises = allPlugins.map(p => {
                            // Ensure repository property exists and has type
                            const repositoryType = p.repository?.type;
                            if (!repositoryType) {
                                console.warn(`[${trace_id}] Plugin ${p.id} missing repository.type, skipping`);
                                return Promise.resolve(null);
                            }
                            return this.pluginRegistry.fetchOne(p.id, p.version, repositoryType)
                                .catch(e => {
                                    console.warn(`[${trace_id}] Failed to fetch manifest for ${p.id} v${p.version}: ${e.message}`);
                                    return null;
                                });
                        });
                        const manifests = (await Promise.all(manifestPromises)).filter((m): m is PluginManifest => m !== null);

                        // Transform manifests to the format expected by Python plugins (verb -> actionVerb, type -> valueType)
                        const transformedManifests = manifests.map(manifest => ({
                            ...manifest,
                            actionVerb: manifest.verb, // Add actionVerb property for plugin compatibility
                            inputDefinitions: manifest.inputDefinitions.map(input => ({
                                ...input,
                                valueType: input.type // Map type to valueType for plugin compatibility
                            })),
                            outputDefinitions: manifest.outputDefinitions.map(output => ({
                                ...output,
                                valueType: output.type // Map type to valueType for plugin compatibility
                            }))
                        }));

                        step.inputValues.set('availablePlugins', {
                            inputName: 'availablePlugins',
                            value: transformedManifests,
                            valueType: PluginParameterType.ARRAY,
                            args: {}
                        });

                        // Pass the full inputValues Map to validation (it expects InputValue objects, not raw values)
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
                    } else if (manifest.language === 'internal') {
                        console.log(`[${trace_id}] ${source_component}: Internal verb '${step.actionVerb}' detected. Signaling agent for internal handling.`);
                        res.status(200).send(MapSerializer.transformForSerialization([
                            {
                                success: true,
                                name: 'internalVerbExecution',
                                resultType: PluginParameterType.OBJECT,
                                result: {
                                    actionVerb: step.actionVerb,
                                    inputValues: MapSerializer.transformForSerialization(step.inputValues),
                                    outputs: MapSerializer.transformForSerialization(step.outputs)
                                },
                                resultDescription: `Internal verb '${step.actionVerb}' to be handled by agent.`,
                                mimeType: 'application/json'
                            }
                        ]));
                        return;
                    } else {
                        console.warn(`[${trace_id}] ${source_component}: Unknown handler language/type '${manifest.language}' for verb '${step.actionVerb}'. Falling back.`);
                    }
                } else if (type === 'cachedPlan') {
                    console.log(`[${trace_id}] ${source_component}: Found cached plan for '${step.actionVerb}'. Returning plan.`);
                    // The handler is the cached plan itself (an array of PluginOutput)
                    res.status(200).send(MapSerializer.transformForSerialization(handler));
                    return;
                }
            }

            // If no handler (plugin or cached plan) is found, handle as unknown verb
            const resultUnknownVerb = await this.handleUnknownVerb(step, trace_id);
            if (opId) {
                await this.commitTransaction(opId);
            }
            res.status(200).send(MapSerializer.transformForSerialization(resultUnknownVerb.map(r => this.normalizePluginOutput(r))));
        } catch (error: any) {
            // Ensure the error is a StructuredError
            const sError = error.error_id && error.trace_id ? error : generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.ERROR,
                message: `Unhandled error during ${step.actionVerb} execution.`, 
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });

            switch (sError.error_code) {
                case GlobalErrorCodes.INPUT_VALIDATION_FAILED:
                    console.error(`[${trace_id}] ${source_component}: Input validation error for ${step.actionVerb}:`, sError.message_human_readable);
                    res.status(400).json(createPluginOutputError(sError));
                    return;

                case GlobalErrorCodes.AUTHENTICATION_ERROR:
                    console.error(`[${trace_id}] ${source_component}: Authentication error for ${step.actionVerb}:`, sError.message_human_readable);
                    res.status(401).json(createPluginOutputError(sError));
                    return;

                case GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED:
                case GlobalErrorCodes.ACCOMPLISH_PLUGIN_EXECUTION_FAILED:
                    console.error(`[${trace_id}] ${source_component}: Plugin execution error for ${step.actionVerb}:`, sError.message_human_readable);
                    res.status(500).json(createPluginOutputError(sError));
                    return;

                case GlobalErrorCodes.BRAIN_QUERY_FAILED:
                case GlobalErrorCodes.LLM_RESPONSE_PARSE_FAILED:
                case GlobalErrorCodes.INVALID_BRAIN_RESPONSE_FORMAT:
                    console.error(`[${trace_id}] ${source_component}: Brain/LLM interaction error for ${step.actionVerb}:`, sError.message_human_readable);
                    res.status(500).json(createPluginOutputError(sError));
                    return;

                default:
                    console.error(`[${trace_id}] ${source_component}: Generic execution error for ${step.actionVerb}:`, sError.message_human_readable);
                    res.status(500).json(createPluginOutputError(sError));
                    return;
            }
        }
    }

    /**
     * Classify error types to determine appropriate handling strategy
     */


    /**
     * Find the best handler (plugin or plan template) for an actionVerb.
     * Returns an object: { type: 'plugin' | 'planTemplate', handler: PluginDefinition | PlanTemplate }
     */
    private async getHandlerForActionVerb(actionVerb: string, trace_id: string): Promise<{ type: string, handler: any } | null> {
        const source_component = "CapabilitiesManager.getHandlerForActionVerb";
        try {
            // 1. Try to find a registered plugin (code-based, OpenAPI, MCP)
            const plugin = await this.pluginRegistry.fetchOneByVerb(actionVerb);
            if (plugin) {
                // The 'type' here is generic 'plugin', specific type (openapi, mcp) determined by language later in executeActionVerb.
                return { type: 'plugin', handler: plugin };
            }

            // 2. If no plugin, try to find a cached plan template in Librarian
            // const cachedPlan = await this.checkCachedPlan(actionVerb);
            // if (cachedPlan) {
            //     return { type: 'cachedPlan', handler: cachedPlan };
            // }

            return null;
        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error resolving handler for actionVerb '${actionVerb}':`, error.message);
            // Do not rethrow, return null to indicate no handler found
            return null;
        }
    }


    private async handleUnknownVerb(step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.handleUnknownVerb";

        try {
            console.log(`[${trace_id}] ${source_component}: Starting handleUnknownVerb for ${step.actionVerb}`);
            console.log(`[${trace_id}] ${source_component}: step.outputs type:`, typeof step.outputs, step.outputs);

            // Track this operation as using the ACCOMPLISH plugin
            const resourceId = `accomplish-plugin-${Date.now()}`;
            this.resourceUsage.set(resourceId, { inUse: true, lastAccessed: Date.now() });
            
            // Create a concise goal for the ACCOMPLISH plugin, focusing on the novel verb.
            const novelVerbGoal = `Handle the novel action verb '${step.actionVerb}'. The step's description is: '${step.description}'. Available inputs: ${JSON.stringify(Array.from(step.inputValues?.keys() || []))}. Expected outputs: ${JSON.stringify(step.outputs)}. Your task is to generate a plan of sub-steps to achieve this.`;

            const accomplishInputs = new Map<string, InputValue>();
            accomplishInputs.set('goal', {
                inputName: 'goal',
                value: novelVerbGoal,
                valueType: PluginParameterType.STRING,
                args: {}
            });
            // Pass missionId for context, instead of the full mission text.
            accomplishInputs.set('missionId', {
                inputName: 'missionId',
                value: step.missionId || '', // Ensure it's an empty string if null/undefined
                valueType: PluginParameterType.STRING,
                args: {}
            });
            accomplishInputs.set('novel_actionVerb', {
                inputName: 'novel_actionVerb',
                value: step.actionVerb,
                valueType: PluginParameterType.STRING,
                args: {}
            });
            accomplishInputs.set('step_description', {
                inputName: 'step_description',
                value: step.description || '',
                valueType: PluginParameterType.STRING,
                args: {}
            });
            accomplishInputs.set('step_inputValues', {
                inputName: 'step_inputValues',
                value: step.inputValues ? MapSerializer.transformForSerialization(step.inputValues) : {},
                valueType: PluginParameterType.OBJECT,
                args: {}
            });
            accomplishInputs.set('step_outputs', {
                inputName: 'step_outputs',
                value: step.outputs ? MapSerializer.transformForSerialization(step.outputs) : {},
                valueType: PluginParameterType.OBJECT,
                args: {}
            });

            // Fetch available plugins to provide context to ACCOMPLISH
            const allPlugins = await this.pluginRegistry.list();
            const manifestPromises = allPlugins.map(p => {
                // Ensure repository property exists and has type
                const repositoryType = p.repository?.type;
                if (!repositoryType) {
                    console.warn(`[${trace_id}] Plugin ${p.id} missing repository.type, skipping`);
                    return Promise.resolve(null);
                }
                return this.pluginRegistry.fetchOne(p.id, p.version, repositoryType)
                    .catch(e => {
                        console.warn(`[${trace_id}] Failed to fetch manifest for ${p.id} v${p.version}: ${e.message}`);
                        return null;
                    });
            });
            const manifests = (await Promise.all(manifestPromises)).filter((m): m is PluginManifest => m !== null);

            // Transform manifests to the format expected by ACCOMPLISH plugin (verb -> actionVerb, type -> valueType)
            const transformedManifests = manifests.map(manifest => ({
                ...manifest,
                actionVerb: manifest.verb, // Add actionVerb property for ACCOMPLISH plugin compatibility
                inputDefinitions: manifest.inputDefinitions.map(input => ({
                    ...input,
                    valueType: input.type // Map type to valueType for plugin compatibility
                })),
                outputDefinitions: manifest.outputDefinitions.map(output => ({
                    ...output,
                    valueType: output.type // Map type to valueType for plugin compatibility
                }))
            }));

            accomplishInputs.set('availablePlugins', {
                inputName: 'availablePlugins',
                value: transformedManifests,
                valueType: PluginParameterType.ARRAY,
                args: {}
            });

            // Call the general ACCOMPLISH plugin execution method
            const accomplishResultArray = await this.executeAccomplishPlugin(accomplishInputs, trace_id);
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

                // Cache the newly generated plan
                this.planCache.set(step.actionVerb, newPlanSteps);

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
                // For other result types, return the first element of the array
                return [accomplishResult];
            }
        } catch (error: any) {
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_UNKNOWN_VERB_HANDLING_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Error while handling unknown verb '${step.actionVerb}'.`,
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
            return createPluginOutputError(sError);
        }
    }

    private async executeAccomplishPlugin(inputs: Map<string, InputValue>, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeAccomplishPlugin";
        try {            
            // Fetch detailed plugin manifests to provide a schema to the Brain
            const allPlugins = await this.pluginRegistry.list();
            const manifestPromises = allPlugins.map(p => {
                // Ensure repository property exists and has type
                const repositoryType = p.repository?.type;
                if (!repositoryType) {
                    console.warn(`[${trace_id}] Plugin ${p.id} missing repository.type, skipping`);
                    return Promise.resolve(null);
                }
                return this.pluginRegistry.fetchOne(p.id, p.version, repositoryType)
                    .catch(e => {
                        console.warn(`[${trace_id}] Failed to fetch manifest for ${p.id} v${p.version}: ${e.message}`);
                        return null; // Return null on failure to not break Promise.all
                    });
            });
            const manifests = (await Promise.all(manifestPromises)).filter((m): m is PluginManifest => m !== null);

            // Transform manifests to the format expected by ACCOMPLISH plugin (verb -> actionVerb, type -> valueType)
            const transformedManifests = manifests.map(manifest => ({
                ...manifest,
                actionVerb: manifest.verb, // Add actionVerb property for ACCOMPLISH plugin compatibility
                inputDefinitions: manifest.inputDefinitions.map(input => ({
                    ...input,
                    valueType: input.type // Map type to valueType for ACCOMPLISH plugin compatibility
                })),
                outputDefinitions: manifest.outputDefinitions.map(output => ({
                    ...output,
                    valueType: output.type // Map type to valueType for ACCOMPLISH plugin compatibility
                }))
            }));

            const accomplishInputs : Map<string, InputValue> = new Map(inputs); // Start with all provided inputs
            accomplishInputs.set('availablePlugins', { inputName: 'availablePlugins', value: transformedManifests, valueType: PluginParameterType.ARRAY, args: {} });

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
            const result = await this.pluginExecutor.execute(effectiveManifest, accomplishInputs, pluginRootPath, trace_id);
            if (!Array.isArray(result)) {
                return [result];
            }
            return result;
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
                trace_id_param: trace_id
            });
        }
    }


    /**
     * Cleanup stale resources periodically
     */
    private cleanupStaleResources(): void {
        const trace_id = `cleanup-stale-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.cleanupStaleResources";
        const now = Date.now();
        const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes

        try {
            // Cleanup stale operations
            for (const [opId, operation] of this.activeOperations.entries()) {
                if (now - operation.startTime > STALE_THRESHOLD) {
                    // Release any resources held by this operation
                    operation.resources.forEach(resourceId => {
                        const resource = this.resourceUsage.get(resourceId);
                        if (resource) {
                            resource.inUse = false;
                            resource.lastAccessed = now;
                        }
                    });
                    this.activeOperations.delete(opId);
                }
            }

            // Cleanup unused resources
            for (const [resourceId, resource] of this.resourceUsage.entries()) {
                if (!resource.inUse && now - resource.lastAccessed > STALE_THRESHOLD) {
                    this.resourceUsage.delete(resourceId);
                }
            }
        } catch (error: any) {
            generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.ERROR,
                message: "Error during cleanup of stale resources.",
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
        }
    }

    /**
     * Cleanup method for graceful shutdown
     */
    async cleanup(): Promise<void> {
        const trace_id = `cleanup-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.cleanup";

        try {
            // Clean up active operations
            this.activeOperations.clear();
            this.resourceUsage.clear();

            if (this.containerManager) {
                await this.containerManager.cleanup(trace_id);
            }
            console.log(`[${trace_id}] ${source_component}: Cleanup completed`);
        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error during cleanup:`, error);
            throw generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.CRITICAL,
                message: "Failed to cleanup CapabilitiesManager.",
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
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