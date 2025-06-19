import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Step, MapSerializer, BaseEntity, ServiceTokenManager } from '@cktmcs/shared';
import { PluginInput, PluginOutput, PluginDefinition, PluginParameterType, environmentType, PluginManifest, PluginLocator, PluginRepositoryType } from '@cktmcs/shared';
import { PlanTemplate, PlanTemplateCreateRequest, PlanTemplateUpdateRequest, PlanExecutionRequest, ExecutionContext as PlanExecutionContext, StepExecution, PlanExecutionStatus, StepExecutionStatus, OpenAPITool, OpenAPIExecutionRequest, OpenAPIExecutionResult } from '@cktmcs/shared';
import { executePluginInSandbox } from '@cktmcs/shared';
import { verifyPluginSignature } from '@cktmcs/shared';
import { validatePluginPermissions, hasDangerousPermissions } from '@cktmcs/shared';
import { compareVersions } from '@cktmcs/shared';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
const execAsync = promisify(execCallback);
import { generateStructuredError, ErrorSeverity, GlobalErrorCodes, StructuredError } from './utils/errorReporter';
import { ConfigManager } from './utils/configManager.js';
import { PluginRegistry } from './utils/pluginRegistry.js';
import { validateAndStandardizeInputs } from './utils/validator.js';
import { requestPluginFromEngineer } from './utils/engineer.js';
import { ContainerManager } from './utils/containerManager.js';
import { ContainerInstance, ContainerExecutionRequest, ContainerPluginManifest } from './types/containerTypes.js';
import { PluginPackager, PackageMetadata } from './utils/pluginPackager';
import { PluginRepositoryManager, RepositoryConfig } from './utils/pluginRepositoryManager';
import githubRoutes from './routes/githubRoutes';

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
    inputs: Map<string, PluginInput>;
    environment: environmentType;
    pluginDefinition: PluginDefinition;
    pluginRootPath: string;
    trace_id: string;
}

export class CapabilitiesManager extends BaseEntity {
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private server: any;
    private configManager!: ConfigManager;
    private pluginRegistry: PluginRegistry;
    private pluginPackager: PluginPackager;
    private repositoryManager?: PluginRepositoryManager;
    private containerManager: ContainerManager;
    private serviceId = 'CapabilitiesManager';

    constructor() {
        super('CapabilitiesManager', 'CapabilitiesManager', `capabilitiesmanager`, process.env.PORT || '5060');
        const trace_id = `${this.serviceId}-constructor-${uuidv4().substring(0,8)}`;
        console.log(`[${trace_id}] Starting CapabilitiesManager initialization...`);
        
        this.pluginRegistry = new PluginRegistry();
        this.pluginPackager = new PluginPackager();
        this.containerManager = new ContainerManager();

        // Initialize repository manager if GitHub config is available
        if (process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME && process.env.GITHUB_TOKEN) {
            const repoConfig: RepositoryConfig = {
                owner: process.env.GITHUB_REPO_OWNER,
                repo: process.env.GITHUB_REPO_NAME,
                token: process.env.GITHUB_TOKEN,
                branch: process.env.GITHUB_BRANCH || 'main'
            };
            this.repositoryManager = new PluginRepositoryManager(repoConfig, this.pluginPackager);
            console.log(`[${trace_id}] Plugin repository manager initialized for ${repoConfig.owner}/${repoConfig.repo}`);
        } else {
            console.log(`[${trace_id}] Plugin repository manager not initialized - missing GitHub configuration`);
        }

        this.initialize(trace_id).catch(error => {
            const initError = error instanceof Error ? error : new Error(String(error));
            const message = (initError as any).message_human_readable || initError.message;
            console.error(`[${trace_id}] INIT_FAILURE: ${message}`, (initError as any).contextual_info || initError.stack);
            process.exit(1);
        });
    }

    private async initialize(trace_id: string) {
        const source_component = "CapabilitiesManager.initialize";
        try {
            this.configManager = await ConfigManager.initialize(this.librarianUrl);
            console.log(`[${trace_id}] ${source_component}: ConfigManager initialized.`);

            await this.start(trace_id);

            if (!this.registeredWithPostOffice) {
                console.log(`[${trace_id}] ${source_component}: Registering with PostOffice...`);
                await this.registerWithPostOffice(15, 2000);
                if (this.registeredWithPostOffice) {
                    console.log(`[${trace_id}] ${source_component}: Successfully registered with PostOffice.`);
                } else {
                    generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.CRITICAL,
                        message: "CRITICAL - Failed to register with PostOffice after multiple attempts.",
                        source_component,
                        trace_id_param: trace_id
                    });
                }
            } else {
                console.log(`[${trace_id}] ${source_component}: Already registered with PostOffice.`);
            }

            console.log(`[${trace_id}] ${source_component}: Initialization complete.`);
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

                app.use((req: express.Request, _res, next) => {
                    const trace_id = `${trace_id_parent}-${uuidv4().substring(0,8)}`;
                    (req as any).trace_id = trace_id;
                    console.log(`[${trace_id}] ${new Date().toISOString()} - CM - ${req.method} ${req.path}`);
                    next();
                });

                // Authentication middleware - skip for health checks
                app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
                    if (req.path === '/health' || req.path === '/ready') return next();
                    this.verifyToken(req, res, next);
                });

                // Core routes
                app.post('/executeAction', (req, res) => this.executeActionVerb(req, res));

                // Plan template routes
                app.post('/plans', (req, res) => this.createPlanTemplate(req, res));
                app.get('/plans/:id', (req, res) => this.getPlanTemplate(req, res));
                app.get('/plans', (req, res) => this.listPlanTemplates(req, res));
                app.put('/plans/:id', (req, res) => this.updatePlanTemplate(req, res));
                app.delete('/plans/:id', (req, res) => this.deletePlanTemplate(req, res));
                app.post('/plans/:id/execute', (req, res) => this.executePlanTemplate(req, res));
                app.get('/executions/:id', (req, res) => this.getExecutionContext(req, res));
                app.get('/executions', (req, res) => this.listExecutions(req, res));

                // OpenAPI tool routes
                app.get('/tools/openapi', (req, res) => this.listOpenAPITools(req, res));
                app.get('/tools/openapi/:id', (req, res) => this.getOpenAPITool(req, res));
                app.post('/tools/openapi/:id/execute', (req, res) => this.executeOpenAPITool(req, res));
                app.get('/capabilities', (req, res) => this.listCapabilities(req, res));

                // Plugin packaging and repository routes
                app.post('/plugins/package', (req, res) => this.packagePlugin(req, res));
                app.post('/plugins/publish', (req, res) => this.publishPlugin(req, res));
                app.post('/plugins/install', (req, res) => this.installPlugin(req, res));
                app.get('/plugins/repository', (req, res) => this.listRepositoryPlugins(req, res));
                app.get('/plugins/repository/search', (req, res) => this.searchRepositoryPlugins(req, res));
                app.get('/plugins/repository/:id', (req, res) => this.getRepositoryPluginInfo(req, res));
                app.get('/plugins/updates', (req, res) => this.checkPluginUpdates(req, res));

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
                        const plugins: PluginLocator[] = await this.pluginRegistry.list();
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

                app.post('/storeNewPlugin', (req, res) => {this.storeNewPlugin(req, res)});
                app.use('/github', githubRoutes);

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

    private async storeNewPlugin(req: express.Request, res: express.Response) {
        const trace_id = (req as any).trace_id || uuidv4();
        const source_component = "CapabilitiesManager.storeNewPlugin";
        try {
            const newPlugin = req.body as PluginManifest;

            if (!newPlugin.id || !newPlugin.verb || !newPlugin.version || !newPlugin.language ) {
                res.status(400).json(generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_MANIFEST_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR,
                    message: "Plugin manifest validation failed: Missing id, name, version, or language.",
                    contextual_info: {
                        plugin_id: newPlugin.id,
                        name: newPlugin.verb,
                        version: newPlugin.version,
                        language: newPlugin.language
                    },
                    trace_id_param: trace_id,
                    source_component
                }));
                return;
            }

            if (newPlugin.language !== 'openapi' && (!newPlugin.entryPoint || !newPlugin.entryPoint.main)) {
                res.status(400).json(generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_MANIFEST_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR,
                    message: "Plugin manifest validation failed: Missing entryPoint.main for non-openapi plugin.",
                    contextual_info: {
                        plugin_id: newPlugin.id,
                        language: newPlugin.language
                    },
                    trace_id_param: trace_id,
                    source_component
                }));
                return;
            }

            const existingPlugin = await this.pluginRegistry.fetchOne(newPlugin.id, newPlugin.version, newPlugin.repository?.type);
            if (existingPlugin) {
                console.warn(`[${trace_id}] ${source_component}: Plugin ${newPlugin.id} version ${newPlugin.version} already exists. Assuming store handles update/overwrite.`);
            }

            if (!newPlugin.security?.trust?.signature) {
                res.status(400).json(generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED,
                    severity: ErrorSeverity.ERROR,
                    message: 'Plugin submission requires a signature.',
                    contextual_info: { plugin_id: newPlugin.id },
                    trace_id_param: trace_id,
                    source_component
                }));
                return;
            }

            if (!await verifyPluginSignature(newPlugin as PluginDefinition)) {
                res.status(400).json(generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED,
                    severity: ErrorSeverity.ERROR,
                    message: 'Plugin signature is invalid.',
                    contextual_info: { plugin_id: newPlugin.id },
                    trace_id_param: trace_id,
                    source_component
                }));
                return;
            }

            const permissionErrors = validatePluginPermissions(newPlugin);
            if (permissionErrors.length > 0) {
                res.status(400).json(generateStructuredError({
                    error_code: GlobalErrorCodes.PLUGIN_PERMISSION_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR,
                    message: `Plugin permission validation failed: ${permissionErrors.join(', ')}`,
                    contextual_info: { plugin_id: newPlugin.id },
                    trace_id_param: trace_id,
                    source_component
                }));
                return;
            }

            await this.pluginRegistry.store(newPlugin);
            console.log(`[${trace_id}] ${source_component}: Plugin registered/updated: ${newPlugin.id} v${newPlugin.version}`);

            res.status(200).json({
                message: 'Plugin registered successfully',
                pluginId: newPlugin.id,
                version: newPlugin.version,
                isUpdate: !!existingPlugin
            });
        } catch (error:any) {
            const sError = generateStructuredError({
                error_code: error.code || GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Failed to store plugin '${req.body?.id || 'unknown'}'. ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
            const httpStatus = error.originalError?.response?.status ||
                (error.code && typeof error.code === 'string' && (error.code.startsWith("G") || error.code.startsWith("PR")) ? 400 : 500);
            res.status(httpStatus).json(sError);
        }
    }

    private async executeActionVerb(req: express.Request, res: express.Response) {
        const trace_id = (req as any).trace_id || uuidv4();
        const source_component = "CapabilitiesManager.executeActionVerb";
        const step = { ...req.body, inputs: MapSerializer.transformFromSerialization(req.body.inputs) } as Step;

        if (step.actionVerb === 'SEARCH') {
            console.log(`[${trace_id}] ${source_component}: Inputs for SEARCH after deserialization:`, MapSerializer.transformForSerialization(step.inputs));
        }

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

        const pluginDetails = (step as any).plugin_details;
        const pluginIdToFetch = pluginDetails?.plugin_id || step.actionVerb;
        const pluginVersionToFetch = pluginDetails?.plugin_version;

        console.log(`[${trace_id}] ${source_component}: Executing action: ${step.actionVerb}, PluginID: ${pluginIdToFetch}, Version: ${pluginVersionToFetch || 'default/latest'}`);

        let plugin: PluginDefinition | undefined;
        try {
            if (pluginDetails && pluginDetails.plugin_id && pluginDetails.plugin_version) {
                plugin = await this.pluginRegistry.fetchOne(pluginDetails.plugin_id, pluginDetails.plugin_version);
                if (!plugin) {
                    throw generateStructuredError({
                        error_code: GlobalErrorCodes.PLUGIN_VERSION_NOT_FOUND,
                        severity: ErrorSeverity.ERROR,
                        message: `Plugin '${pluginDetails.plugin_id}' version '${pluginDetails.plugin_version}' not found.`,
                        source_component,
                        trace_id_param: trace_id,
                        contextual_info: {plugin_id: pluginDetails.plugin_id, version: pluginDetails.plugin_version}
                    });
                }
            } else {
                plugin = await this.pluginRegistry.fetchOneByVerb(step.actionVerb);
            }

            if (!plugin) {
                console.log(`[${trace_id}] ${source_component}: Plugin for action '${step.actionVerb}' not found. Handling as unknown verb.`);
                const cachedPlanArray = await this.checkCachedPlan(step.actionVerb);
                if (cachedPlanArray && cachedPlanArray.length > 0) {
                    console.log(`[${trace_id}] ${source_component}: Using cached plan for verb: ${step.actionVerb}`);
                    res.status(200).send(MapSerializer.transformForSerialization(cachedPlanArray));
                    return;
                }

                console.log(`[${trace_id}] ${source_component}: No cached plan. Handling unknown verb '${step.actionVerb}'.`);
                const resultUnknownVerb = await this.handleUnknownVerb(step, trace_id);
                res.status(200).send(MapSerializer.transformForSerialization(resultUnknownVerb));
                return;
            }
        } catch (error: any) {
            const errorCode = error.error_code ||
                (error.originalError as any)?.code ||
                error.code ||
                GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED;

            const sError = generateStructuredError({
                error_code: errorCode,
                severity: ErrorSeverity.ERROR,
                message: `Failed to fetch plugin for action '${step.actionVerb}'. ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {actionVerb: step.actionVerb, plugin_id: pluginIdToFetch, plugin_version: pluginVersionToFetch}
            });
            const httpStatus = error.error_code === GlobalErrorCodes.PLUGIN_VERSION_NOT_FOUND ? 404 :
                (error.originalError?.response?.status || 500);
            res.status(httpStatus).json(createPluginOutputError(sError));
            return;
        }

        // Proceed with execution if plugin is found
        try {
            const validatedInputs = await validateAndStandardizeInputs(plugin, step.inputs);
            if (!validatedInputs.success) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.INPUT_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR,
                    message: validatedInputs.error || "Input validation failed for plugin.",
                    source_component,
                    contextual_info: {
                        plugin_id: plugin.id,
                        version: plugin.version,
                        verb: plugin.verb
                    },
                    trace_id_param: trace_id
                });
            }

            // Convert PluginDefinition to PluginManifest for execution
            const manifestForExecution: PluginManifest = {
                ...plugin,
                repository: {
                    type: 'local' as any,
                    url: '',
                    dependencies: {}
                }
            };

            const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(manifestForExecution);
            const result = await this.executePlugin(effectiveManifest, validatedInputs.inputs || new Map(), pluginRootPath, trace_id);

            res.status(200).send(MapSerializer.transformForSerialization(result));
        } catch (error:any) {
            console.error(`[${trace_id}] ${source_component}: Error during execution pipeline for ${plugin.verb} v${plugin.version}: ${error.message}`, error.stack);
            const errorCode = error.code || GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED;

            const sError = generateStructuredError({
                error_code: errorCode,
                severity: ErrorSeverity.CRITICAL,
                message: `Execution pipeline failed for plugin '${plugin.verb}' v'${plugin.version || 'unknown'}'. ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {
                    plugin_id: plugin.id,
                    verb: plugin.verb,
                    version: plugin.version,
                    actionVerb: step.actionVerb
                }
            });
            const httpStatus = error.originalError?.response?.status ||
                (error.code && typeof error.code === 'string' &&
                 (error.code.startsWith("G") || error.code.startsWith("PR") ||
                  error.code === GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_PREPARATION_FAILED) ? 400 : 500);
            res.status(httpStatus).json(createPluginOutputError(sError));
        }
    }

    protected async executePlugin(
        pluginToExecute: PluginDefinition,
        inputsForPlugin: Map<string, PluginInput>,
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

            const executionInputs = new Map(inputsForPlugin);
            if (token) executionInputs.set('__auth_token', {
                inputName: '__auth_token',
                inputValue: token,
                args: { token }
            });

            if (brainToken) {
                executionInputs.set('__brain_auth_token', {
                    inputName: '__brain_auth_token',
                    inputValue: brainToken,
                    args: { token: brainToken }
                });
                executionInputs.set('token', {
                    inputName: 'token',
                    inputValue: brainToken,
                    args: { token: brainToken }
                });
            }

            const executionContext: ExecutionContext = {
                inputs: executionInputs,
                environment,
                pluginDefinition: pluginToExecute,
                pluginRootPath: actualPluginRootPath,
                trace_id
            };

            if (pluginToExecute.language === 'javascript') {
                try {
                    return await executePluginInSandbox(
                        executionContext.pluginDefinition,
                        Array.from(executionContext.inputs.values()),
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
        const { pluginDefinition, inputs, environment, pluginRootPath, trace_id } = executionContext;
        const source_component = "CapabilitiesManager.executePythonPlugin";
        const mainFilePath = path.join(pluginRootPath, pluginDefinition.entryPoint!.main);

        console.log(`[${trace_id}] ${source_component}: Python execution - Main file path: ${mainFilePath}, Root path: ${pluginRootPath}`);

        try {
            // Check if plugin has dependencies and install them if needed
            await this.ensurePythonDependencies(pluginRootPath, trace_id);

            // Convert Map to array of [key, value] pairs for Python plugin compatibility
            const inputsArray: [string, PluginInput][] = Array.from(inputs.entries());

            const inputsJsonString = JSON.stringify(inputsArray);

            // Debug: Log the inputs being passed to Python plugin
            // console.log(`[${trace_id}] ${source_component}: Inputs array for Python plugin:`, inputsArray); // Already logged if verb is SEARCH
            // console.log(`[${trace_id}] ${source_component}: JSON string being passed:`, inputsJsonString); // Logged below before exec

            // Use enhanced Python execution with better error handling and security
            const pythonCommand = await this.buildPythonCommand(mainFilePath, pluginRootPath, inputsJsonString, pluginDefinition);

            console.log(`[${trace_id}] ${source_component}: Executing Python command: ${pythonCommand}`);
            console.log(`[${trace_id}] ${source_component}: Piping inputsJsonString to Python plugin: ${inputsJsonString}`);

            const { stdout, stderr } = await execAsync(pythonCommand, {
                cwd: pluginRootPath,
                env: {
                    ...environment.env,
                    PYTHONPATH: pluginRootPath,
                    PYTHONUNBUFFERED: '1',  // Ensure immediate output
                    PYTHONDONTWRITEBYTECODE: '1'  // Prevent .pyc files
                },
                timeout: pluginDefinition.security?.sandboxOptions?.timeout || 30000
            });

            console.log(`[${trace_id}] ${source_component}: Raw stdout from Python plugin ${pluginDefinition.verb} v${pluginDefinition.version}:\n${stdout}`);
            if (stderr) {
                console.warn(`[${trace_id}] ${source_component}: Raw stderr from Python plugin ${pluginDefinition.verb} v${pluginDefinition.version}:\n${stderr}`);
            }

            // Validate and parse output
            const result = this.validatePythonOutput(stdout, pluginDefinition, trace_id);
            return result;

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
                trace_id_param: trace_id,
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
        const { pluginDefinition, inputs, pluginRootPath, trace_id } = executionContext;
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
                inputs.forEach((value, key) => {
                    inputsObject[key] = value;
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

        // Check if requirements.txt exists
        if (!fs.existsSync(requirementsPath)) {
            console.log(`[${trace_id}] ${source_component}: No requirements.txt found, skipping dependency installation`);
            return;
        }

        try {
            // Check if dependencies are already installed by looking for a .dependencies_installed marker
            const markerPath = path.join(pluginRootPath, '.dependencies_installed');
            const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
            const requirementsHash = require('crypto').createHash('md5').update(requirementsContent).digest('hex');

            if (fs.existsSync(markerPath)) {
                const existingHash = fs.readFileSync(markerPath, 'utf8').trim();
                if (existingHash === requirementsHash) {
                    console.log(`[${trace_id}] ${source_component}: Dependencies already installed and up to date`);
                    return;
                }
            }

            const venvPath = path.join(pluginRootPath, 'venv');
            const venvPipPath = path.join(venvPath, 'bin', 'pip'); // Assuming Linux/macOS structure

            console.log(`[${trace_id}] ${source_component}: Preparing for Python dependency installation using venv at ${venvPath}`);

            let installCommand: string;
            if (fs.existsSync(venvPath)) {
                console.log(`[${trace_id}] ${source_component}: Virtual environment already exists at ${venvPath}. Installing dependencies using its pip.`);
                installCommand = `"${venvPipPath}" install -r "${requirementsPath}"`;
            } else {
                console.log(`[${trace_id}] ${source_component}: Creating virtual environment at ${venvPath} and installing dependencies.`);
                installCommand = `python3 -m venv "${venvPath}" && "${venvPipPath}" install -r "${requirementsPath}"`;
            }

            console.log(`[${trace_id}] ${source_component}: Install command: ${installCommand}`);

            const { stdout, stderr } = await execAsync(installCommand, {
                cwd: pluginRootPath, // Execute in the plugin's root directory
                timeout: 120000  // 2 minutes timeout for dependency installation
            });

            if (stderr && !stderr.includes('Successfully installed') && !stderr.includes('Requirement already satisfied')) {
                 // Some warnings might not include "Successfully installed" but are not critical errors.
                 // e.g. deprecation warnings. We log them but don't necessarily fail.
                console.warn(`[${trace_id}] ${source_component}: Python dependency installation stderr: ${stderr}`);
            }
            if (stdout) { // stdout might also contain useful info or confirmation
                console.log(`[${trace_id}] ${source_component}: Python dependency installation stdout: ${stdout}`);
            }


            // Create marker file with requirements hash
            fs.writeFileSync(markerPath, requirementsHash);
            console.log(`[${trace_id}] ${source_component}: Python dependencies processed successfully for ${pluginRootPath}. Marker file updated.`);

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Failed to install Python dependencies for ${pluginRootPath}: ${error.message}`);
            // Log specific error details if available
            if (error.stderr) {
                console.error(`[${trace_id}] ${source_component}: Stderr from failed command: ${error.stderr}`);
            }
            if (error.stdout) {
                console.error(`[${trace_id}] ${source_component}: Stdout from failed command: ${error.stdout}`);
            }
            // Don't throw error - allow plugin to run without dependencies if it can,
            // or let the plugin execution fail if dependencies were critical.
            // The current behavior is to not throw, so we maintain that.
        }
    }

    private async buildPythonCommand(mainFilePath: string, pluginRootPath: string, inputsJson: string, pluginDefinition: PluginDefinition): Promise<string> {
        const venvPythonPath = path.join(pluginRootPath, 'venv', 'bin', 'python');
        const pythonExecutable = fs.existsSync(venvPythonPath) ? `"${venvPythonPath}"` : 'python3';

        // Use a more reliable approach to pass JSON to Python
        // Instead of shell escaping, we'll use base64 encoding to avoid shell interpretation issues
        const base64Input = Buffer.from(inputsJson).toString('base64');

        // Build the command with base64 encoded input
        // The plugin's main script is executed with the python from its venv (if available) or system python3.
        // The pluginRootPath is passed as an argument to the script, useful if the script needs to know its own location.
        const command = `echo "${base64Input}" | base64 -d | ${pythonExecutable} "${mainFilePath}" "${pluginRootPath}"`;

        return command;
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

                // Validate field types
                if (typeof output.success !== 'boolean') {
                    throw new Error("Field 'success' must be a boolean");
                }
                if (typeof output.name !== 'string') {
                    throw new Error("Field 'name' must be a string");
                }
                if (typeof output.resultType !== 'string') {
                    throw new Error("Field 'resultType' must be a string");
                }
                if (typeof output.resultDescription !== 'string') {
                    throw new Error("Field 'resultDescription' must be a string");
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
            const context = ` ${step.description || ''} with inputs ${MapSerializer.transformForSerialization(step.inputs)}`;
            const goal = `Handle the action verb "${step.actionVerb}" in our plan with the following context: ${context} by defining a plan, generating an answer from the inputs, or recommending a new plugin for handling the actionVerb. Respond with a plan, a plugin request, or a literal result. Avoid using this action verb, ${step.actionVerb}, in the plan.`;

            const accomplishResultArray = await this.executeAccomplishPlugin(goal, step.actionVerb, trace_id);
            if (!accomplishResultArray[0].success) {
                return accomplishResultArray;
            }

            const accomplishResult = accomplishResultArray[0];
            switch (accomplishResult.resultType) {
                case PluginParameterType.PLAN:
                case PluginParameterType.STRING:
                case PluginParameterType.NUMBER:
                case PluginParameterType.BOOLEAN:
                    return accomplishResultArray;

                case PluginParameterType.PLUGIN:
                    const engineerResult = await requestPluginFromEngineer(this, step, JSON.stringify(accomplishResult.result));
                    if (!engineerResult.success) return [engineerResult];

                    const pluginDef = await this.pluginRegistry.fetchOneByVerb(step.actionVerb);
                    if (!pluginDef) {
                        throw generateStructuredError({
                            error_code: GlobalErrorCodes.PLUGIN_NOT_FOUND,
                            severity: ErrorSeverity.ERROR,
                            message: `Newly created plugin for verb '${step.actionVerb}' not found after engineer request.`,
                            source_component,
                            trace_id_param: trace_id
                        });
                    }

                    return [{
                        success: true,
                        name: 'plugin_created',
                        resultType: PluginParameterType.PLUGIN,
                        result: pluginDef,
                        resultDescription: `CM: Created new plugin for ${step.actionVerb}`
                    }];

                default:
                    throw generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.ERROR,
                        message: `Unexpected result type '${accomplishResult.resultType}' from ACCOMPLISH plugin.`,
                        source_component,
                        trace_id_param: trace_id
                    });
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

    private async executeAccomplishPlugin(goal: string, verbToAvoid: string, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeAccomplishPlugin";
        try {
            const accomplishInputs = new Map([
                ['goal', { inputName: 'goal', inputValue: goal, args: {} }],
                ['verbToAvoid', { inputName: 'verbToAvoid', inputValue: verbToAvoid, args: {} }]
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

    private async checkCachedPlan(actionVerb: string): Promise<PluginOutput[] | null> {
        const trace_id = uuidv4();
        const source_component = "CapabilitiesManager.checkCachedPlan";
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData`, {
                params: { collection: 'actionPlans', id: actionVerb }
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

    private async cachePlan(actionVerb: string, planOutput: PluginOutput): Promise<void> {
        const trace_id = uuidv4();
        const source_component = "CapabilitiesManager.cachePlan";
        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'actionPlans',
                id: actionVerb,
                data: [planOutput]
            });
            console.log(`[${trace_id}] ${source_component}: Cached plan for verb: ${actionVerb}`);
        } catch (error:any) {
            generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.WARNING,
                message: `Could not cache plan for verb '${actionVerb}'. ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
        }
    }

    // Plan Template Management Methods

    private async createPlanTemplate(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `createPlanTemplate-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.createPlanTemplate";

        try {
            const createRequest: PlanTemplateCreateRequest = req.body;

            // Validate the plan template
            const validationResult = this.validatePlanTemplate(createRequest.template);
            if (!validationResult.valid) {
                res.status(400).json({
                    error: 'Plan template validation failed',
                    details: validationResult.errors
                });
                return;
            }

            // Create the complete plan template with metadata
            const planTemplate: PlanTemplate = {
                ...createRequest.template,
                metadata: {
                    ...createRequest.metadata,
                    created: new Date(),
                    version: '1.0.0'
                }
            };

            // Store in Librarian
            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'planTemplates',
                id: planTemplate.id,
                data: planTemplate,
                storageType: 'mongo'
            });

            console.log(`[${trace_id}] ${source_component}: Created plan template: ${planTemplate.id}`);
            res.status(201).json({
                templateId: planTemplate.id,
                version: planTemplate.metadata.version,
                message: 'Plan template created successfully'
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error creating plan template:`, error);
            res.status(500).json({
                error: 'Failed to create plan template',
                details: error.message
            });
        }
    }

    private async getPlanTemplate(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `getPlanTemplate-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.getPlanTemplate";

        try {
            const { id } = req.params;
            const { version } = req.query;

            let templateId = id;
            if (version) {
                templateId = `${id}:${version}`;
            }

            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${templateId}`, {
                params: {
                    collection: 'planTemplates',
                    storageType: 'mongo'
                }
            });

            if (!response.data?.data) {
                res.status(404).json({
                    error: 'Plan template not found',
                    templateId: id,
                    version: version || 'latest'
                });
                return;
            }

            console.log(`[${trace_id}] ${source_component}: Retrieved plan template: ${id}`);
            res.status(200).json(response.data.data);

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error retrieving plan template:`, error);
            res.status(500).json({
                error: 'Failed to retrieve plan template',
                details: error.message
            });
        }
    }

    private async listPlanTemplates(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `listPlanTemplates-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.listPlanTemplates";

        try {
            const { category, tags, author, search } = req.query;

            // Build query based on filters
            let query: any = {};
            if (category) query['metadata.category'] = category;
            if (author) query['metadata.author'] = author;
            if (tags) {
                const tagArray = Array.isArray(tags) ? tags : [tags];
                query['metadata.tags'] = { $in: tagArray };
            }
            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }

            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/queryData`, {
                collection: 'planTemplates',
                query: query,
                limit: 100
            });

            console.log(`[${trace_id}] ${source_component}: Listed plan templates with filters:`, { category, tags, author, search });
            res.status(200).json({
                templates: response.data?.data || [],
                count: response.data?.data?.length || 0
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error listing plan templates:`, error);
            res.status(500).json({
                error: 'Failed to list plan templates',
                details: error.message
            });
        }
    }

    private async updatePlanTemplate(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `updatePlanTemplate-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.updatePlanTemplate";

        try {
            const { id } = req.params;
            const updateRequest: PlanTemplateUpdateRequest = req.body;

            // Get existing template
            const existingResponse = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${id}`, {
                params: {
                    collection: 'planTemplates',
                    storageType: 'mongo'
                }
            });

            if (!existingResponse.data?.data) {
                res.status(404).json({
                    error: 'Plan template not found',
                    templateId: id
                });
                return;
            }

            const existingTemplate: PlanTemplate = existingResponse.data.data;

            // Merge updates
            const updatedTemplate: PlanTemplate = {
                ...existingTemplate,
                ...updateRequest.template,
                metadata: {
                    ...existingTemplate.metadata,
                    ...updateRequest.template.metadata,
                    updated: new Date()
                }
            };

            // Bump version if requested
            if (updateRequest.versionBump) {
                updatedTemplate.metadata.version = this.bumpVersion(
                    existingTemplate.metadata.version,
                    updateRequest.versionBump
                );
            }

            // Validate updated template
            const validationResult = this.validatePlanTemplate(updatedTemplate);
            if (!validationResult.valid) {
                res.status(400).json({
                    error: 'Updated plan template validation failed',
                    details: validationResult.errors
                });
                return;
            }

            // Store updated template
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'planTemplates',
                id: updatedTemplate.id,
                data: updatedTemplate,
                storageType: 'mongo'
            });

            console.log(`[${trace_id}] ${source_component}: Updated plan template: ${id}`);
            res.status(200).json({
                templateId: updatedTemplate.id,
                version: updatedTemplate.metadata.version,
                message: 'Plan template updated successfully'
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error updating plan template:`, error);
            res.status(500).json({
                error: 'Failed to update plan template',
                details: error.message
            });
        }
    }

    private async deletePlanTemplate(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `deletePlanTemplate-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.deletePlanTemplate";

        try {
            const { id } = req.params;

            const response = await this.authenticatedApi.delete(`http://${this.librarianUrl}/deleteData/${id}`, {
                params: {
                    collection: 'planTemplates',
                    storageType: 'mongo'
                }
            });

            console.log(`[${trace_id}] ${source_component}: Deleted plan template: ${id}`);
            res.status(200).json({
                message: 'Plan template deleted successfully',
                templateId: id
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error deleting plan template:`, error);
            res.status(500).json({
                error: 'Failed to delete plan template',
                details: error.message
            });
        }
    }

    private async executePlanTemplate(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `executePlanTemplate-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.executePlanTemplate";

        try {
            const { id } = req.params;
            const executionRequest: PlanExecutionRequest = req.body;

            // Get the plan template
            const templateResponse = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${id}`, {
                params: {
                    collection: 'planTemplates',
                    storageType: 'mongo'
                }
            });

            if (!templateResponse.data?.data) {
                res.status(404).json({
                    error: 'Plan template not found',
                    templateId: id
                });
                return;
            }

            const template: PlanTemplate = templateResponse.data.data;

            // Create execution context
            const executionContext: PlanExecutionContext = {
                id: uuidv4(),
                planTemplateId: template.id,
                planTemplateVersion: template.metadata.version,
                status: 'pending' as PlanExecutionStatus,
                inputs: executionRequest.inputs,
                steps: [],
                outputs: {},
                metadata: {
                    startTime: new Date(),
                    userId: executionRequest.userId,
                    parentExecutionId: executionRequest.parentExecutionId,
                    executionMode: executionRequest.executionMode || 'automatic'
                }
            };

            // Store initial execution context
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'executionContexts',
                id: executionContext.id,
                data: executionContext,
                storageType: 'mongo'
            });

            // Start execution (async)
            this.executeTemplate(template, executionContext, trace_id).catch(error => {
                console.error(`[${trace_id}] ${source_component}: Template execution failed:`, error);
            });

            console.log(`[${trace_id}] ${source_component}: Started execution of template: ${id}`);
            res.status(202).json({
                executionId: executionContext.id,
                status: 'started',
                message: 'Plan template execution started'
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error starting plan template execution:`, error);
            res.status(500).json({
                error: 'Failed to start plan template execution',
                details: error.message
            });
        }
    }

    private async getExecutionContext(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `getExecutionContext-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.getExecutionContext";

        try {
            const { id } = req.params;

            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${id}`, {
                params: {
                    collection: 'executionContexts',
                    storageType: 'mongo'
                }
            });

            if (!response.data?.data) {
                res.status(404).json({
                    error: 'Execution context not found',
                    executionId: id
                });
                return;
            }

            console.log(`[${trace_id}] ${source_component}: Retrieved execution context: ${id}`);
            res.status(200).json(response.data.data);

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error retrieving execution context:`, error);
            res.status(500).json({
                error: 'Failed to retrieve execution context',
                details: error.message
            });
        }
    }

    private async listExecutions(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `listExecutions-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.listExecutions";

        try {
            const { userId, status, templateId } = req.query;

            // Build query based on filters
            let query: any = {};
            if (userId) query['metadata.userId'] = userId;
            if (status) query.status = status;
            if (templateId) query.planTemplateId = templateId;

            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/queryData`, {
                collection: 'executionContexts',
                query: query,
                limit: 100
            });

            console.log(`[${trace_id}] ${source_component}: Listed executions with filters:`, { userId, status, templateId });
            res.status(200).json({
                executions: response.data?.data || [],
                count: response.data?.data?.length || 0
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error listing executions:`, error);
            res.status(500).json({
                error: 'Failed to list executions',
                details: error.message
            });
        }
    }

    // Plan Template Utility Methods

    private validatePlanTemplate(template: Partial<PlanTemplate>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!template.id) errors.push('Template ID is required');
        if (!template.name) errors.push('Template name is required');
        if (!template.description) errors.push('Template description is required');
        if (!template.tasks || template.tasks.length === 0) errors.push('Template must have at least one task');

        // Validate tasks
        if (template.tasks) {
            const taskIds = new Set<string>();
            for (const task of template.tasks) {
                if (!task.id) errors.push('Task ID is required');
                if (!task.actionVerb) errors.push(`Task ${task.id}: actionVerb is required`);

                if (taskIds.has(task.id)) {
                    errors.push(`Duplicate task ID: ${task.id}`);
                }
                taskIds.add(task.id);

                // Validate dependencies
                if (task.dependsOn) {
                    for (const depId of task.dependsOn) {
                        if (!taskIds.has(depId)) {
                            errors.push(`Task ${task.id}: dependency ${depId} not found`);
                        }
                    }
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    private bumpVersion(currentVersion: string, bump: 'major' | 'minor' | 'patch'): string {
        const parts = currentVersion.split('.').map(Number);
        if (parts.length !== 3) return '1.0.0';

        switch (bump) {
            case 'major':
                return `${parts[0] + 1}.0.0`;
            case 'minor':
                return `${parts[0]}.${parts[1] + 1}.0`;
            case 'patch':
                return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
            default:
                return currentVersion;
        }
    }

    private async executeTemplate(template: PlanTemplate, context: PlanExecutionContext, trace_id: string): Promise<void> {
        const source_component = "CapabilitiesManager.executeTemplate";

        try {
            context.status = 'running';
            await this.updateExecutionContext(context);

            // Build dependency graph
            const dependencyGraph = this.buildDependencyGraph(template.tasks);

            // Execute tasks in dependency order
            for (const taskId of dependencyGraph) {
                const task = template.tasks.find(t => t.id === taskId);
                if (!task) continue;

                const stepExecution: StepExecution = {
                    taskId: task.id,
                    stepId: uuidv4(),
                    status: 'pending',
                    inputs: {},
                    outputs: {},
                    retryCount: 0
                };

                context.steps.push(stepExecution);
                await this.executeStep(template, task, stepExecution, context, trace_id);
            }

            // Extract final outputs
            context.outputs = this.extractOutputs(template, context);
            context.status = 'completed';
            context.metadata.endTime = new Date();

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Template execution failed:`, error);
            context.status = 'failed';
            context.metadata.endTime = new Date();
        } finally {
            await this.updateExecutionContext(context);
        }
    }

    private buildDependencyGraph(tasks: any[]): string[] {
        // Simple topological sort for task dependencies
        const graph = new Map<string, string[]>();
        const inDegree = new Map<string, number>();

        // Initialize graph
        for (const task of tasks) {
            graph.set(task.id, task.dependsOn || []);
            inDegree.set(task.id, 0);
        }

        // Calculate in-degrees
        for (const [taskId, deps] of graph) {
            for (const dep of deps) {
                inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
            }
        }

        // Topological sort
        const result: string[] = [];
        const queue: string[] = [];

        for (const [taskId, degree] of inDegree) {
            if (degree === 0) queue.push(taskId);
        }

        while (queue.length > 0) {
            const current = queue.shift()!;
            result.push(current);

            const deps = graph.get(current) || [];
            for (const dep of deps) {
                const newDegree = (inDegree.get(dep) || 0) - 1;
                inDegree.set(dep, newDegree);
                if (newDegree === 0) queue.push(dep);
            }
        }

        return result;
    }

    private async executeStep(template: PlanTemplate, task: any, stepExecution: StepExecution, context: PlanExecutionContext, trace_id: string): Promise<void> {
        const source_component = "CapabilitiesManager.executeStep";

        try {
            stepExecution.status = 'running';
            stepExecution.startTime = new Date();

            // Resolve inputs
            stepExecution.inputs = this.resolveStepInputs(task, context);

            // Create Step object for execution
            const step: Step = {
                id: stepExecution.stepId,
                stepNo: context.steps.length,
                actionVerb: task.actionVerb,
                description: task.description,
                inputs: new Map(Object.entries(stepExecution.inputs).map(([k, v]) => [k, { inputName: k, inputValue: v, args: {} }])),
                dependencies: [],
                status: 'pending'
            };

            // Execute the step
            const result = await this.executeActionVerbInternal(step, trace_id);

            stepExecution.outputs = this.extractStepOutputs(result);
            stepExecution.status = 'completed';
            stepExecution.endTime = new Date();

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Step execution failed:`, error);
            stepExecution.status = 'failed';
            stepExecution.error = error.message;
            stepExecution.endTime = new Date();
        } finally {
            await this.updateExecutionContext(context);
        }
    }

    private resolveStepInputs(task: any, context: PlanExecutionContext): { [key: string]: any } {
        const resolvedInputs: { [key: string]: any } = {};

        for (const [inputName, inputValue] of Object.entries(task.inputs)) {
            if (typeof inputValue === 'string') {
                // Handle template references like {{inputs.topic}} or {{tasks.search.outputs.results}}
                if (inputValue.startsWith('{{') && inputValue.endsWith('}}')) {
                    const reference = inputValue.slice(2, -2).trim();
                    resolvedInputs[inputName] = this.resolveReference(reference, context);
                } else {
                    resolvedInputs[inputName] = inputValue;
                }
            } else {
                resolvedInputs[inputName] = inputValue;
            }
        }

        return resolvedInputs;
    }

    private resolveReference(reference: string, context: PlanExecutionContext): any {
        const parts = reference.split('.');

        if (parts[0] === 'inputs') {
            // Reference to execution inputs
            return this.getNestedValue(context.inputs, parts.slice(1));
        } else if (parts[0] === 'tasks') {
            // Reference to task outputs
            const taskId = parts[1];
            const step = context.steps.find(s => s.taskId === taskId);
            if (step && parts[2] === 'outputs') {
                return this.getNestedValue(step.outputs, parts.slice(3));
            }
        }

        return null;
    }

    private getNestedValue(obj: any, path: string[]): any {
        let current = obj;
        for (const key of path) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return null;
            }
        }
        return current;
    }

    private extractStepOutputs(result: PluginOutput[]): { [key: string]: any } {
        const outputs: { [key: string]: any } = {};

        for (const output of result) {
            if (output.success) {
                outputs[output.name] = output.result;
            }
        }

        return outputs;
    }

    private extractOutputs(template: PlanTemplate, context: PlanExecutionContext): { [key: string]: any } {
        const outputs: { [key: string]: any } = {};

        for (const outputDef of template.outputs) {
            if (outputDef.name) {
                // For plan templates, we need to check if there's a source reference
                // If not, try to find the output in the last step or by name
                let value = null;

                // Try to find the output in the completed steps
                for (const step of context.steps) {
                    if (step.outputs && step.outputs[outputDef.name]) {
                        value = step.outputs[outputDef.name];
                        break;
                    }
                }

                outputs[outputDef.name] = value;
            }
        }

        return outputs;
    }

    private async updateExecutionContext(context: PlanExecutionContext): Promise<void> {
        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'executionContexts',
                id: context.id,
                data: context,
                storageType: 'mongo'
            });
        } catch (error: any) {
            console.error('Failed to update execution context:', error);
        }
    }

    private async executeActionVerbInternal(step: Step, trace_id: string): Promise<PluginOutput[]> {
        // Handle special internal action verbs first
        if (step.actionVerb === 'EXECUTE_PLAN_TEMPLATE_INTERNAL') {
            return await this.handleExecutePlanTemplateInternal(step, trace_id);
        }

        // First try to find a plugin
        const plugin = await this.pluginRegistry.fetchOneByVerb(step.actionVerb);

        if (plugin) {
            // Execute plugin
            const validatedInputs = await validateAndStandardizeInputs(plugin, step.inputs);
            if (!validatedInputs.success) {
                throw new Error(validatedInputs.error || "Input validation failed");
            }

            const manifestForExecution: PluginManifest = {
                ...plugin,
                repository: {
                    type: 'local' as any,
                    url: '',
                    dependencies: {}
                }
            };

            const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(manifestForExecution);
            return await this.executePlugin(effectiveManifest, validatedInputs.inputs!, pluginRootPath, trace_id);
        }

        // If no plugin found, try OpenAPI tools
        const openApiTool = await this.findOpenAPIToolByActionVerb(step.actionVerb);
        if (openApiTool) {
            return await this.executeOpenAPIToolInternal(openApiTool, step, trace_id);
        }

        // If neither plugin nor OpenAPI tool found, handle as unknown verb
        return await this.handleUnknownVerb(step, trace_id);
    }

    // OpenAPI Tool Management Methods

    private async listOpenAPITools(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `listOpenAPITools-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.listOpenAPITools";

        try {
            const { category, tags, search } = req.query;

            // Build query based on filters
            let query: any = {};
            if (category) query['metadata.category'] = category;
            if (tags) {
                const tagArray = Array.isArray(tags) ? tags : [tags];
                query['metadata.tags'] = { $in: tagArray };
            }
            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }

            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/queryData`, {
                collection: 'openApiTools',
                query: query,
                limit: 100
            });

            console.log(`[${trace_id}] ${source_component}: Listed OpenAPI tools with filters:`, { category, tags, search });
            res.status(200).json({
                tools: response.data?.data || [],
                count: response.data?.data?.length || 0
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error listing OpenAPI tools:`, error);
            res.status(500).json({
                error: 'Failed to list OpenAPI tools',
                details: error.message
            });
        }
    }

    private async getOpenAPITool(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `getOpenAPITool-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.getOpenAPITool";

        try {
            const { id } = req.params;

            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${id}`, {
                params: {
                    collection: 'openApiTools',
                    storageType: 'mongo'
                }
            });

            if (!response.data?.data) {
                res.status(404).json({
                    error: 'OpenAPI tool not found',
                    toolId: id
                });
                return;
            }

            console.log(`[${trace_id}] ${source_component}: Retrieved OpenAPI tool: ${id}`);
            res.status(200).json(response.data.data);

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error retrieving OpenAPI tool:`, error);
            res.status(500).json({
                error: 'Failed to retrieve OpenAPI tool',
                details: error.message
            });
        }
    }

    private async executeOpenAPITool(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `executeOpenAPITool-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.executeOpenAPITool";

        try {
            const { id } = req.params;
            const executionRequest: OpenAPIExecutionRequest = req.body;

            // Get the OpenAPI tool
            const toolResponse = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${id}`, {
                params: {
                    collection: 'openApiTools',
                    storageType: 'mongo'
                }
            });

            if (!toolResponse.data?.data) {
                res.status(404).json({
                    error: 'OpenAPI tool not found',
                    toolId: id
                });
                return;
            }

            const tool: OpenAPITool = toolResponse.data.data;

            // Create a Step object for internal execution
            const step: Step = {
                id: uuidv4(),
                stepNo: 1,
                actionVerb: executionRequest.actionVerb,
                inputs: new Map(Object.entries(executionRequest.inputs).map(([k, v]) => [k, { inputName: k, inputValue: v, args: {} }])),
                dependencies: [],
                status: 'pending'
            };

            const result = await this.executeOpenAPIToolInternal(tool, step, trace_id);

            console.log(`[${trace_id}] ${source_component}: Executed OpenAPI tool: ${id}`);
            res.status(200).json({
                success: true,
                outputs: result,
                toolId: id,
                actionVerb: executionRequest.actionVerb
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error executing OpenAPI tool:`, error);
            res.status(500).json({
                error: 'Failed to execute OpenAPI tool',
                details: error.message
            });
        }
    }

    private async listCapabilities(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `listCapabilities-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.listCapabilities";

        try {
            const { category, search, type } = req.query;

            // Get plugin locators first
            const pluginLocators = await this.pluginRegistry.list();

            // Get OpenAPI tools
            let openApiQuery: any = {};
            if (category) openApiQuery['metadata.category'] = category;
            if (search) {
                openApiQuery.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }

            const openApiResponse = await this.authenticatedApi.post(`http://${this.librarianUrl}/queryData`, {
                collection: 'openApiTools',
                query: openApiQuery,
                limit: 100
            });

            const openApiTools = openApiResponse.data?.data || [];

            // Get plan templates
            let templateQuery: any = {};
            if (category) templateQuery['metadata.category'] = category;
            if (search) {
                templateQuery.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }

            const templateResponse = await this.authenticatedApi.post(`http://${this.librarianUrl}/queryData`, {
                collection: 'planTemplates',
                query: templateQuery,
                limit: 100
            });

            const planTemplates = templateResponse.data?.data || [];

            // Combine and format capabilities
            const capabilities = [];

            // Add plugins - fetch full manifests for complete information
            if (!type || type === 'plugin') {
                for (const locator of pluginLocators) {
                    try {
                        const plugin = await this.pluginRegistry.fetchOne(locator.id, locator.version);
                        if (plugin) {
                            capabilities.push({
                                id: plugin.id,
                                name: plugin.verb,
                                description: plugin.description,
                                type: 'plugin',
                                actionVerb: plugin.verb,
                                category: plugin.metadata?.category || 'plugin',
                                tags: plugin.metadata?.tags || []
                            });
                        }
                    } catch (error) {
                        // If we can't fetch the full manifest, use basic info from locator
                        capabilities.push({
                            id: locator.id,
                            name: locator.verb,
                            description: `Plugin: ${locator.verb}`,
                            type: 'plugin',
                            actionVerb: locator.verb,
                            category: 'plugin',
                            tags: []
                        });
                    }
                }
            }

            // Add OpenAPI tools
            if (!type || type === 'openapi') {
                for (const tool of openApiTools) {
                    for (const mapping of tool.actionMappings || []) {
                        capabilities.push({
                            id: `${tool.id}-${mapping.actionVerb}`,
                            name: mapping.actionVerb,
                            description: mapping.description || tool.description,
                            type: 'openapi',
                            actionVerb: mapping.actionVerb,
                            category: tool.metadata?.category || 'external-api',
                            tags: tool.metadata?.tags || [],
                            toolId: tool.id,
                            method: mapping.method,
                            path: mapping.path
                        });
                    }
                }
            }

            // Add plan templates
            if (!type || type === 'template') {
                for (const template of planTemplates) {
                    capabilities.push({
                        id: template.id,
                        name: template.name,
                        description: template.description,
                        type: 'template',
                        actionVerb: `EXECUTE_TEMPLATE_${template.id.toUpperCase()}`,
                        category: template.metadata?.category || 'template',
                        tags: template.metadata?.tags || []
                    });
                }
            }

            console.log(`[${trace_id}] ${source_component}: Listed ${capabilities.length} capabilities`);
            res.status(200).json({
                capabilities,
                count: capabilities.length,
                breakdown: {
                    plugins: pluginLocators.length,
                    openApiTools: openApiTools.length,
                    planTemplates: planTemplates.length
                }
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error listing capabilities:`, error);
            res.status(500).json({
                error: 'Failed to list capabilities',
                details: error.message
            });
        }
    }

    private async findOpenAPIToolByActionVerb(actionVerb: string): Promise<OpenAPITool | null> {
        try {
            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/queryData`, {
                collection: 'openApiTools',
                query: {
                    'actionMappings.actionVerb': actionVerb
                },
                limit: 1
            });

            const tools = response.data?.data || [];
            return tools.length > 0 ? tools[0] : null;
        } catch (error: any) {
            console.error('Error finding OpenAPI tool by action verb:', error);
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
            const inputValue = step.inputs.get(inputMapping.name)?.inputValue;

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

    private async handleExecutePlanTemplateInternal(step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.handleExecutePlanTemplateInternal";

        try {
            const templateId = step.inputs.get('templateId')?.inputValue as string;
            const inputs = step.inputs.get('inputs')?.inputValue || {};
            const userId = step.inputs.get('userId')?.inputValue as string || 'agent-user';
            const executionMode = step.inputs.get('executionMode')?.inputValue as string || 'automatic';

            if (!templateId) {
                throw new Error('Template ID is required for plan template execution');
            }

            // Get the plan template
            const templateResponse = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${templateId}`, {
                params: {
                    collection: 'planTemplates',
                    storageType: 'mongo'
                }
            });

            if (!templateResponse.data?.data) {
                throw new Error(`Plan template not found: ${templateId}`);
            }

            const template: PlanTemplate = templateResponse.data.data;

            // Create execution context
            const executionContext: PlanExecutionContext = {
                id: uuidv4(),
                planTemplateId: template.id,
                planTemplateVersion: template.metadata.version,
                status: 'pending' as PlanExecutionStatus,
                inputs: inputs,
                steps: [],
                outputs: {},
                metadata: {
                    startTime: new Date(),
                    userId: userId,
                    executionMode: executionMode as any
                }
            };

            // Store initial execution context
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'executionContexts',
                id: executionContext.id,
                data: executionContext,
                storageType: 'mongo'
            });

            // Start execution (async)
            this.executeTemplate(template, executionContext, trace_id).catch(error => {
                console.error(`[${trace_id}] ${source_component}: Template execution failed:`, error);
            });

            console.log(`[${trace_id}] ${source_component}: Started execution of template: ${templateId}`);

            return [{
                success: true,
                name: 'executionId',
                resultType: PluginParameterType.STRING,
                result: executionContext.id,
                resultDescription: 'Plan template execution started'
            }, {
                success: true,
                name: 'templateId',
                resultType: PluginParameterType.STRING,
                result: templateId,
                resultDescription: 'Template ID being executed'
            }, {
                success: true,
                name: 'status',
                resultType: PluginParameterType.STRING,
                result: 'started',
                resultDescription: 'Execution status'
            }];

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error executing plan template:`, error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: null,
                resultDescription: `Plan template execution failed: ${error.message}`,
                error: error.message
            }];
        }
    }

    // Plugin Packaging and Repository Management Methods

    private async packagePlugin(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `packagePlugin-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.packagePlugin";

        try {
            const { pluginId, version, metadata } = req.body;

            if (!pluginId || !version || !metadata) {
                res.status(400).json({
                    error: 'Missing required fields: pluginId, version, metadata'
                });
                return;
            }

            // Get plugin from registry
            const plugin = await this.pluginRegistry.fetchOne(pluginId, version);
            if (!plugin) {
                res.status(404).json({
                    error: `Plugin not found: ${pluginId} v${version}`
                });
                return;
            }

            // Get plugin path
            const { pluginRootPath } = await this.pluginRegistry.preparePluginForExecution(plugin as PluginManifest);

            // Package the plugin
            const packageMetadata: PackageMetadata = {
                packageVersion: '1.0.0',
                stage7Version: process.env.STAGE7_VERSION || '1.0.0',
                compatibility: metadata.compatibility || ['1.0.0'],
                tags: metadata.tags || [],
                category: metadata.category || 'utility',
                license: metadata.license || 'MIT'
            };

            const pluginPackage = await this.pluginPackager.packagePlugin(
                pluginRootPath,
                plugin as PluginManifest,
                packageMetadata
            );

            console.log(`[${trace_id}] ${source_component}: Plugin packaged successfully: ${pluginId} v${version}`);
            res.status(200).json({
                message: 'Plugin packaged successfully',
                package: {
                    id: pluginPackage.id,
                    name: pluginPackage.name,
                    version: pluginPackage.version,
                    packageHash: pluginPackage.packageHash,
                    createdAt: pluginPackage.createdAt
                }
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error packaging plugin:`, error);
            res.status(500).json({
                error: 'Failed to package plugin',
                details: error.message
            });
        }
    }

    private async publishPlugin(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `publishPlugin-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.publishPlugin";

        try {
            if (!this.repositoryManager) {
                res.status(503).json({
                    error: 'Plugin repository not configured'
                });
                return;
            }

            const { pluginId, version, metadata } = req.body;

            if (!pluginId || !version || !metadata) {
                res.status(400).json({
                    error: 'Missing required fields: pluginId, version, metadata'
                });
                return;
            }

            // Get plugin from registry
            const plugin = await this.pluginRegistry.fetchOne(pluginId, version);
            if (!plugin) {
                res.status(404).json({
                    error: `Plugin not found: ${pluginId} v${version}`
                });
                return;
            }

            // Get plugin path
            const { pluginRootPath } = await this.pluginRegistry.preparePluginForExecution(plugin as PluginManifest);

            // Package metadata
            const packageMetadata: PackageMetadata = {
                packageVersion: '1.0.0',
                stage7Version: process.env.STAGE7_VERSION || '1.0.0',
                compatibility: metadata.compatibility || ['1.0.0'],
                tags: metadata.tags || [],
                category: metadata.category || 'utility',
                license: metadata.license || 'MIT'
            };

            // Publish to repository
            const registryEntry = await this.repositoryManager.publishPlugin(
                pluginRootPath,
                plugin as PluginManifest,
                packageMetadata
            );

            console.log(`[${trace_id}] ${source_component}: Plugin published successfully: ${pluginId} v${version}`);
            res.status(200).json({
                message: 'Plugin published successfully',
                entry: registryEntry
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error publishing plugin:`, error);
            res.status(500).json({
                error: 'Failed to publish plugin',
                details: error.message
            });
        }
    }

    private async installPlugin(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `installPlugin-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.installPlugin";

        try {
            if (!this.repositoryManager) {
                res.status(503).json({
                    error: 'Plugin repository not configured'
                });
                return;
            }

            const { pluginId, version, targetDir } = req.body;

            if (!pluginId) {
                res.status(400).json({
                    error: 'Missing required field: pluginId'
                });
                return;
            }

            // Install plugin from repository
            const manifest = await this.repositoryManager.installPlugin(pluginId, version, targetDir);

            // Register plugin in local registry
            await this.pluginRegistry.store(manifest);

            console.log(`[${trace_id}] ${source_component}: Plugin installed successfully: ${pluginId} v${manifest.version}`);
            res.status(200).json({
                message: 'Plugin installed successfully',
                plugin: {
                    id: manifest.id,
                    name: manifest.id,
                    version: manifest.version,
                    verb: manifest.verb
                }
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error installing plugin:`, error);
            res.status(500).json({
                error: 'Failed to install plugin',
                details: error.message
            });
        }
    }

    private async listRepositoryPlugins(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `listRepositoryPlugins-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.listRepositoryPlugins";

        try {
            if (!this.repositoryManager) {
                res.status(503).json({
                    error: 'Plugin repository not configured'
                });
                return;
            }

            const { category, tags } = req.query;
            const tagArray = tags ? (tags as string).split(',') : undefined;

            const plugins = await this.repositoryManager.listPlugins(category as string, tagArray);

            console.log(`[${trace_id}] ${source_component}: Listed ${plugins.length} repository plugins`);
            res.status(200).json({
                plugins,
                count: plugins.length
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error listing repository plugins:`, error);
            res.status(500).json({
                error: 'Failed to list repository plugins',
                details: error.message
            });
        }
    }

    private async searchRepositoryPlugins(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `searchRepositoryPlugins-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.searchRepositoryPlugins";

        try {
            if (!this.repositoryManager) {
                res.status(503).json({
                    error: 'Plugin repository not configured'
                });
                return;
            }

            const { q: query } = req.query;

            if (!query) {
                res.status(400).json({
                    error: 'Missing required query parameter: q'
                });
                return;
            }

            const plugins = await this.repositoryManager.searchPlugins(query as string);

            console.log(`[${trace_id}] ${source_component}: Found ${plugins.length} plugins for query: ${query}`);
            res.status(200).json({
                plugins,
                count: plugins.length,
                query
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error searching repository plugins:`, error);
            res.status(500).json({
                error: 'Failed to search repository plugins',
                details: error.message
            });
        }
    }

    private async getRepositoryPluginInfo(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `getRepositoryPluginInfo-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.getRepositoryPluginInfo";

        try {
            if (!this.repositoryManager) {
                res.status(503).json({
                    error: 'Plugin repository not configured'
                });
                return;
            }

            const { id } = req.params;
            const { version } = req.query;

            const pluginInfo = await this.repositoryManager.getPluginInfo(id, version as string);

            if (!pluginInfo) {
                res.status(404).json({
                    error: `Plugin not found: ${id}${version ? ` v${version}` : ''}`
                });
                return;
            }

            console.log(`[${trace_id}] ${source_component}: Retrieved plugin info: ${id} v${pluginInfo.version}`);
            res.status(200).json(pluginInfo);

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error getting repository plugin info:`, error);
            res.status(500).json({
                error: 'Failed to get repository plugin info',
                details: error.message
            });
        }
    }

    private async checkPluginUpdates(req: express.Request, res: express.Response): Promise<void> {
        const trace_id = (req as any).trace_id || `checkPluginUpdates-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.checkPluginUpdates";

        try {
            if (!this.repositoryManager) {
                res.status(503).json({
                    error: 'Plugin repository not configured'
                });
                return;
            }

            // Get installed plugins
            const installedPlugins = await this.pluginRegistry.list();
            const pluginVersions = installedPlugins
                .filter(plugin => plugin.version) // Filter out plugins without version
                .map(plugin => ({
                    id: plugin.id,
                    version: plugin.version!
                }));

            // Check for updates
            const updates = await this.repositoryManager.checkForUpdates(pluginVersions);

            console.log(`[${trace_id}] ${source_component}: Checked updates for ${pluginVersions.length} plugins`);
            res.status(200).json({
                updates,
                count: updates.filter(u => u.updateAvailable).length
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error checking plugin updates:`, error);
            res.status(500).json({
                error: 'Failed to check plugin updates',
                details: error.message
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
