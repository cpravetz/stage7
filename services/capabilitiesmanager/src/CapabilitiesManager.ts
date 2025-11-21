import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import { Step, MapSerializer, BaseEntity } from '@cktmcs/shared';
import { InputValue, PluginOutput, PluginDefinition, PluginParameterType, PluginManifest, PluginLocator, PluginRepositoryType, PluginParameter, DefinitionManifest, DefinitionType, OpenAPITool, MCPTool, MCPActionMapping, MCPAuthentication, MCPServiceTarget, OpenAPIExecutionRequest, OpenAPIExecutionResult, PluginStatus } from '@cktmcs/shared'; // Added DefinitionManifest, DefinitionType, PluginStatus
import { generateStructuredError, ErrorSeverity, GlobalErrorCodes } from './utils/errorReporter';
import { createPluginOutputError } from './utils/errorHelper';
import { ConfigManager } from './utils/configManager';
import { PluginRegistry } from './utils/pluginRegistry';
import { PluginContextManager } from './utils/PluginContextManager';
import { validateAndStandardizeInputs } from './utils/validator';
import { ContainerManager } from './utils/containerManager';
import { PluginExecutor } from './utils/pluginExecutor';
import axios, { AxiosInstance } from 'axios';

const rawLibrarianUrl = process.env.LIBRARIAN_URL || 'librarian:5040';
const correctedLibrarianUrl = rawLibrarianUrl.startsWith('http') ? rawLibrarianUrl : `http://${rawLibrarianUrl}`;

const librarianApi = axios.create({
    baseURL: correctedLibrarianUrl,
    headers: {
        'Content-Type': 'application/json',
    },
});

export class CapabilitiesManager extends BaseEntity {
    private librarianUrl: string = correctedLibrarianUrl;
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
    private authenticatedLibrarianApi!: AxiosInstance;

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
                const authenticatedLibrarianApi = this.authenticatedApi.api;
        authenticatedLibrarianApi.defaults.baseURL = this.librarianUrl;
        this.authenticatedLibrarianApi = authenticatedLibrarianApi;
        this.pluginRegistry = new PluginRegistry(authenticatedLibrarianApi);
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

            const missionControlUrl = await this.getServiceUrl('MissionControl') || process.env.MISSIONCONTROL_URL || 'missioncontrol:5030';
            // Initialize PluginExecutor after ConfigManager is available
            this.pluginExecutor = new PluginExecutor(this.configManager, this.containerManager, this.librarianUrl, this.securityManagerUrl, missionControlUrl);
            console.log(`[${trace_id}] ${source_component}: PluginExecutor initialized.`);

            await this.start(trace_id);
            this.startHealthCheckWorker(); // Re-enabled

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
                app.post('/executeAction', (req: Request, res: Response) => this.executeActionVerb(req, res));

                // Health check endpoints
                app.get('/health', (req: Request, res: Response) => {
                    res.json({
                        status: 'ok',
                        service: 'CapabilitiesManager',
                        initialization: this.initializationStatus
                    });
                });

                app.get('/ready', (req: Request, res: Response) => {
                    const isReady = this.initializationStatus.overall;
                    res.status(isReady ? 200 : 503).json({
                        ready: isReady,
                        service: 'CapabilitiesManager',
                        initialization: this.initializationStatus
                    });
                });

                // --- Plugin CRUD API ---
                app.get('/plugins', async (req: Request, res: Response) => {
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
                app.get('/plugins/:id', async (req: Request, res: Response) => {
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
                app.post('/plugins', async (req: Request, res: Response) => {
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
                app.put('/plugins/:id', async (req: Request, res: Response) => {
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
                app.delete('/plugins/:id', async (req: Request, res: Response) => {
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
                app.get('/pluginRepositories', (req: Request, res: Response) => {
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

                app.post('/message', async (req: Request, res: Response) => {
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

                app.get('/availablePlugins', async (req: Request, res: Response) => {
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
                app.post('/generatePluginContext', async (req: Request, res: Response) => {
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


    private async _getAvailablePluginManifests(): Promise<PluginManifest[]> {
        const allPlugins = await this.pluginRegistry.list();
        // Filter out plugins that are explicitly marked as disabled or stopped
        const activePlugins = allPlugins.filter(p => 
            p.metadata?.status !== PluginStatus.DISABLED && 
            p.metadata?.status !== PluginStatus.STOPPED &&
            p.metadata?.status !== PluginStatus.ERROR
        );
        return activePlugins;
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
            outputs: MapSerializer.transformFromSerialization(req.body.outputs || {}) instanceof Map ? MapSerializer.transformFromSerialization(req.body.outputs || {}) : new Map(Object.entries(MapSerializer.transformFromSerialization(req.body.outputs || {}))),
            missionId: req.body.missionId || uuidv4() // Ensure missionId is always present
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
                console.log(`[${trace_id}] ${source_component}: Result from executeAccomplishPlugin - typeof: ${typeof result}, isArray: ${Array.isArray(result)}`);
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
                    if (!manifest) { // Add null check here
                        console.warn(`[${trace_id}] ${source_component}: Plugin handler for '${step.actionVerb}' is undefined. Skipping execution.`);
                        // Fallback to handleUnknownVerb or return an error
                        const resultUnknownVerb = await this.handleUnknownVerb(step, trace_id);
                        if (opId) {
                            await this.commitTransaction(opId);
                        }
                        res.status(200).send(MapSerializer.transformForSerialization(resultUnknownVerb.map(r => this.normalizePluginOutput(r))));
                        return;
                    }
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
                        console.log(`[${trace_id}] ${source_component}: Input values before validation for ${step.actionVerb}:`, JSON.stringify(Array.from(step.inputValues.entries())));



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
                        // Add available plugins to the inputs for the plugin
                        const availablePlugins = await this._getAvailablePluginManifests();
                        validatedInputs.inputs.set('availablePlugins', {
                            inputName: 'availablePlugins',
                            value: availablePlugins,
                            valueType: PluginParameterType.ARRAY, // Assuming it's an array of plugin manifests
                            args: {}
                        });

                        const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(manifest);
                        const result = await this.pluginExecutor.execute(effectiveManifest, validatedInputs.inputs, pluginRootPath, trace_id);
                        res.status(200).send(MapSerializer.transformForSerialization(result));
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
        const SEARCH_CONFIDENCE_THRESHOLD = 0.5; // Lower is better match

        // Phase 1: Reactive Tool Discovery
        try {
            console.log(`[${trace_id}] ${source_component}: Novel verb \'${step.actionVerb}\'. Searching for a matching tool...`);
            const searchQuery = `${step.actionVerb}: ${step.description || ''}`;
            console.log(`[${trace_id}] ${source_component}: Attempting tool search with Librarian at ${librarianApi.defaults.baseURL}/tools/search for query: ${searchQuery}`);
            const response = await this.authenticatedLibrarianApi.post('/tools/search', { queryText: searchQuery, maxResults: 1 });
            
            const searchResults = response.data.data;

            if (searchResults && searchResults.length > 0) {
                const topMatch = searchResults[0];
                console.log(`[${trace_id}] ${source_component}: Found potential match: \'${topMatch.metadata.verb}\' with distance ${topMatch.distance}`);

                if (topMatch.distance < SEARCH_CONFIDENCE_THRESHOLD) {
                    console.log(`[${trace_id}] ${source_component}: Match confidence is high. Substituting \'${step.actionVerb}\' with \'${topMatch.metadata.verb}\' and re-executing.`);
                    
                    const substitutedStep: Step = {
                        ...step,
                        actionVerb: topMatch.metadata.verb,
                    };

                    const fakeReq = { body: substitutedStep, trace_id: trace_id } as any;
                    let resultSent = false;
                    const fakeRes = {
                        status: (code: number) => {
                            return {
                                send: (body: any) => {
                                    if (!resultSent) {
                                        resultSent = true;
                                        return body;
                                    }
                                }
                            }
                        },
                        json: (body: any) => {
                             if (!resultSent) {
                                resultSent = true;
                                return body;
                            }
                        }
                    } as any;

                    await this.executeActionVerb(fakeReq, fakeRes);
                    return [];
                }
            }
            console.log(`[${trace_id}] ${source_component}: No high-confidence tool found for \'${step.actionVerb}\'. Proceeding to generate a plan.`);
            throw new Error("No suitable tool found, fallback to ACCOMPLISH");

        } catch (searchError: any) {
            if (searchError.message !== "No suitable tool found, fallback to ACCOMPLISH") {
                 console.warn(`[${trace_id}] ${source_component}: Tool search failed with error: ${searchError.message}. Falling back to ACCOMPLISH.`);
            }
           
            try {
                const novelVerbGoal = `Handle the novel action verb \'${step.actionVerb}\'. The step's description is: \'${step.description}\'. Available inputs: ${JSON.stringify(Array.from(step.inputValues?.keys() || []))}. Expected outputs: ${JSON.stringify(step.outputs)}. Your task is to generate a plan of sub-steps to achieve this.`;

                const accomplishInputs = new Map<string, InputValue>();
                accomplishInputs.set('goal', {
                    inputName: 'goal',
                    value: novelVerbGoal,
                    valueType: PluginParameterType.STRING,
                    args: {}
                });
                accomplishInputs.set('missionId', {
                    inputName: 'missionId',
                    value: step.missionId || '',
                    valueType: PluginParameterType.STRING,
                    args: {}
                });

                // Add available plugins to the inputs for ACCOMPLISH
                const availablePlugins = await this._getAvailablePluginManifests();
                accomplishInputs.set('availablePlugins', {
                    inputName: 'availablePlugins',
                    value: availablePlugins,
                    valueType: PluginParameterType.ARRAY,
                    args: {}
                });

                const accomplishResultArray = await this.executeAccomplishPlugin(accomplishInputs, trace_id);
                
                if (!accomplishResultArray[0].success) {
                    return accomplishResultArray;
                }

                const accomplishResult = accomplishResultArray[0];
                if (accomplishResult.resultType === PluginParameterType.PLAN) {
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
                    return [{
                        success: true,
                        name: 'plan',
                        resultType: PluginParameterType.PLAN,
                        resultDescription: `A plan to accomplish the original step \'${step.actionVerb}\'`,
                        result: newPlanSteps,
                        mimeType: 'application/json'
                    }];
                } else {
                    return [accomplishResult];
                }
            } catch (error: any) {
                const sError = generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_UNKNOWN_VERB_HANDLING_FAILED,
                    severity: ErrorSeverity.ERROR,
                    message: `Error while handling unknown verb \'${step.actionVerb}\'.`,
                    source_component,
                    original_error: error,
                    trace_id_param: trace_id
                });
                return createPluginOutputError(sError);
            }
        }
    }

    private async executeAccomplishPlugin(inputs: Map<string, InputValue>, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeAccomplishPlugin";
        try {            


            const accomplishInputs : Map<string, InputValue> = new Map(inputs); // Start with all provided inputs

            // Add available plugins to the inputs for ACCOMPLISH
            const availablePlugins = await this._getAvailablePluginManifests();
            accomplishInputs.set('availablePlugins', {
                inputName: 'availablePlugins',
                value: availablePlugins,
                valueType: PluginParameterType.ARRAY,
                args: {}
            });

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
            if (!effectiveManifest) { // Add null check here
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_EXECUTION_FAILED,
                    severity: ErrorSeverity.CRITICAL,
                    message: "Effective manifest for ACCOMPLISH plugin is undefined after preparation.",
                    trace_id_param: trace_id,
                    source_component
                });
            }
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

    private healthCheckStatus: Map<string, { consecutiveFailures: number, lastChecked: number, lastStatus: boolean, latency: number[] }> = new Map();
    private static readonly HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Every 1 minute
    private static readonly MAX_CONSECUTIVE_FAILURES = 3;

    private startHealthCheckWorker() {
        console.log(`Starting health check worker with interval: ${CapabilitiesManager.HEALTH_CHECK_INTERVAL_MS}ms`);
        setInterval(() => this.runHealthChecks(), CapabilitiesManager.HEALTH_CHECK_INTERVAL_MS);
    }

    private async runHealthChecks() {
        const trace_id = `health-check-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.runHealthChecks";

        try {
            const externalPlugins = await this.pluginRegistry.list(undefined, PluginStatus.RUNNING);

            for (const plugin of externalPlugins) {
                const pluginId = plugin.id;
                const currentStatus = plugin.metadata?.status;
                const healthCheckUrl = plugin.metadata?.healthCheckUrl; // HealthCheckUrl should be in metadata

                // Pre-check Plugin State (redundant now, but kept for clarity/safety)
                if (currentStatus !== PluginStatus.RUNNING) {
                    //console.log(`[${trace_id}] Plugin ${pluginId} is external and not currently running (status: ${currentStatus || 'undefined'}). Skipping health check.`);
                    continue;
                }

                if (!healthCheckUrl) {
                    //console.log(`[${trace_id}] Plugin ${pluginId} is external and running, but has no healthCheckUrl configured. Skipping health check.`);
                    continue;
                }

                let healthCheckState = this.healthCheckStatus.get(pluginId) || { consecutiveFailures: 0, lastChecked: 0, lastStatus: true, latency: [] };
                const startTime = Date.now();
                let isHealthy = false;

                try {
                    const response = await axios.get(healthCheckUrl, { timeout: 5000 }); // 5 second timeout
                    isHealthy = response.status >= 200 && response.status < 300;
                } catch (error) {
                    console.error(`[${trace_id}] Health check failed for plugin ${pluginId} at ${healthCheckUrl}:`, error instanceof Error ? error.message : error);
                    isHealthy = false;
                }

                const latency = Date.now() - startTime;
                healthCheckState.latency.push(latency);
                if (healthCheckState.latency.length > 10) healthCheckState.latency.shift(); // Keep last 10 latencies

                if (isHealthy) {
                    healthCheckState.consecutiveFailures = 0;
                    healthCheckState.lastStatus = true;
                    console.log(`[${trace_id}] Plugin ${pluginId} is healthy. Latency: ${latency}ms`);
                } else {
                    healthCheckState.consecutiveFailures++;
                    healthCheckState.lastStatus = false;
                    console.warn(`[${trace_id}] Plugin ${pluginId} is unhealthy. Consecutive failures: ${healthCheckState.consecutiveFailures}`);

                    if (healthCheckState.consecutiveFailures >= CapabilitiesManager.MAX_CONSECUTIVE_FAILURES) {
                        console.error(`[${trace_id}] Plugin ${pluginId} has consistently failed health checks. Disabling it.`);
                        await this.disablePlugin(pluginId, trace_id); // Use the new disablePlugin logic
                    }
                }
                healthCheckState.lastChecked = Date.now();
                this.healthCheckStatus.set(pluginId, healthCheckState);
            }
        } catch (error: any) {
            generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.ERROR,
                message: "Error during external plugin health checks.",
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
        }
    }

    private async disablePlugin(pluginId: string, trace_id: string): Promise<void> {
        const source_component = "CapabilitiesManager.disablePlugin";
        console.log(`[${trace_id}] Attempting to disable plugin ${pluginId}...`);
        try {
            await this.pluginRegistry.updatePluginStatus(pluginId, PluginStatus.DISABLED);
            console.log(`[${trace_id}] Plugin ${pluginId} marked as DISABLED in PluginRegistry.`);

            // Notify Librarian to update its record of the tool
            try {
                await this.authenticatedLibrarianApi.put(`/tools/${pluginId}/status`, { status: PluginStatus.DISABLED, reason: 'health_check_failure' });
                console.log(`[${trace_id}] Librarian notified about disabled plugin ${pluginId}.`);
            } catch (librarianError) {
                console.error(`[${trace_id}] Failed to notify Librarian about disabled plugin ${pluginId}:`, librarianError instanceof Error ? librarianError.message : librarianError);
            }

            generateStructuredError({
                error_code: GlobalErrorCodes.EXTERNAL_PLUGIN_DISABLED,
                severity: ErrorSeverity.WARNING,
                message: `External plugin ${pluginId} has been disabled due to repeated health check failures.`,
                source_component,
                trace_id_param: trace_id
            });
        } catch (error: any) {
            generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.ERROR,
                message: `Failed to disable plugin ${pluginId}.`,
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