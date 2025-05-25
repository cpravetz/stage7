import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; // IMPORTED FOR TRACE_ID GENERATION

import { Step, MapSerializer, BaseEntity, ServiceTokenManager } from '@cktmcs/shared';
import { PluginInput, PluginOutput, PluginDefinition, PluginParameterType, environmentType, PluginManifest, PluginLocator, PluginRepositoryType } from '@cktmcs/shared';
import { executePluginInSandbox } from '@cktmcs/shared';
import { verifyPluginSignature } from '@cktmcs/shared';
import { validatePluginPermissions, hasDangerousPermissions } from '@cktmcs/shared';
import { checkPluginCompatibility } from '@cktmcs/shared';
import { compareVersions } from '@cktmcs/shared';
import { promisify } from 'util'; // For executePythonPlugin
import { exec as execCallback } from 'child_process'; // For executePythonPlugin
const execAsync = promisify(execCallback); // For executePythonPlugin


import { generateStructuredError, ErrorSeverity, GlobalErrorCodes, StructuredError } from './utils/errorReporter'; 
import { ConfigManager } from './utils/configManager.js';
import { PluginRegistry } from './utils/pluginRegistry.js';
import { validateAndStandardizeInputs } from './utils/validator.js';
import { requestPluginFromEngineer } from './utils/engineer.js';
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
    private serviceId = 'CapabilitiesManager';

    constructor() {
        super('CapabilitiesManager', 'CapabilitiesManager', `capabilitiesmanager`, process.env.PORT || '5060');
        const trace_id = `${this.serviceId}-constructor-${uuidv4().substring(0,8)}`; 
        console.log(`[${trace_id}] Starting CapabilitiesManager initialization...`);
        this.pluginRegistry = new PluginRegistry(); 

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
                source_component, original_error: error, trace_id_param: trace_id
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
                    const trace_id = `${trace_id_parent}-${uuidv4().substring(0,8)}`; // Use imported uuidv4
                    (req as any).trace_id = trace_id; 
                    console.log(`[${trace_id}] ${new Date().toISOString()} - CM - ${req.method} ${req.path}`);
                    next();
                });

                app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
                    if (req.path === '/health' || req.path === '/ready') return next();
                    this.verifyToken(req, res, next); 
                });

                app.post('/executeAction', (req, res) => this.executeActionVerb(req, res));
                
                app.post('/message', async (req, res) => { 
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-msg-${uuidv4().substring(0,8)}`;
                    try {
                        await super.handleBaseMessage(req.body); 
                        res.status(200).send({ status: 'Message received and processed' });
                    } catch (error: any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                            severity: ErrorSeverity.ERROR, message: "Error handling message.",
                            source_component: `${source_component}.handleMessage`, original_error: error, trace_id_param: trace_id
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
                            severity: ErrorSeverity.ERROR, message: "Failed to list available plugins.",
                            source_component: `${source_component}.availablePlugins`, original_error: error, trace_id_param: trace_id
                        });
                        res.status(500).json(sError);
                    }
                });

                app.post('/storeNewPlugin', (req, res) => {this.storeNewPlugin(req, res)});
                app.use('/github', githubRoutes); 

                app.get('/plugins', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-getplugins-${uuidv4().substring(0,8)}`;
                    const source_comp_plugins = `${source_component}.getPluginsRoute`;
                    try {
                        const repositoryType = req.query.repository as string || this.pluginRegistry.getPluginMarketplace().defaultRepository;
                        if (repositoryType === 'github' && process.env.ENABLE_GITHUB !== 'true') {
                             res.status(403).json(generateStructuredError({
                                error_code: GlobalErrorCodes.GITHUB_CONFIG_ERROR, 
                                severity: ErrorSeverity.WARNING, message: 'GitHub access is disabled by configuration.',
                                source_component: source_comp_plugins, trace_id_param: trace_id
                            }));
                        }
                        const repository = this.pluginRegistry.getPluginMarketplace().getRepositories().get(repositoryType);
                        if (!repository) {
                            res.status(404).json(generateStructuredError({
                                error_code: GlobalErrorCodes.PLUGIN_NOT_FOUND, 
                                severity: ErrorSeverity.ERROR, message: `Repository type '${repositoryType}' not found.`,
                                contextual_info: { availableRepositories: Array.from(this.pluginRegistry.getPluginMarketplace().getRepositories().keys()) },
                                source_component: source_comp_plugins, trace_id_param: trace_id
                            }));
                        } else {
                            const plugins = await repository.list(); 
                            res.json({ plugins, repository: repositoryType });
                        }
                    } catch (error:any) {
                        const sError = generateStructuredError({
                            error_code: error.code || GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED,
                            severity: ErrorSeverity.ERROR, message: `Failed to list plugins from repository '${req.query.repository || 'default'}'. ${error.message}`,
                            source_component: source_comp_plugins, original_error: error, trace_id_param: trace_id
                        });
                        const httpStatus = error.originalError?.response?.status || (error.code && typeof error.code === 'string' && (error.code.startsWith("G") || error.code.startsWith("PR")) ? 400 : 500);
                        res.status(httpStatus || 500).json(sError);
                    }
                });

                app.get('/plugins/:id/:version?', async (req, res) => { 
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-getplugin-${uuidv4().substring(0,8)}`;
                    const source_comp_plugin_id = `${source_component}.getPluginByIdRoute`;
                    try {
                        const { id, version } = req.params; 
                        const repositoryType = req.query.repository as string || this.pluginRegistry.getPluginMarketplace().defaultRepository;

                         if (repositoryType === 'github' && process.env.ENABLE_GITHUB !== 'true') {
                            res.status(403).json(generateStructuredError({
                                error_code: GlobalErrorCodes.GITHUB_CONFIG_ERROR, severity: ErrorSeverity.WARNING,
                                message: 'GitHub access is disabled by configuration.', source_component: source_comp_plugin_id, trace_id_param: trace_id
                            }));
                        }
                        const repository = this.pluginRegistry.getPluginMarketplace().getRepositories().get(repositoryType);
                        if (!repository) {
                             res.status(404).json(generateStructuredError({
                                error_code: GlobalErrorCodes.PLUGIN_NOT_FOUND, severity: ErrorSeverity.ERROR,
                                message: `Repository type '${repositoryType}' not found for plugin '${id}'.`, source_component: source_comp_plugin_id, trace_id_param: trace_id
                            }));
                        } else {
                            const plugin = await repository.fetch(id, version); 
                            if (!plugin) {
                                res.status(404).json(generateStructuredError({
                                    error_code: GlobalErrorCodes.PLUGIN_VERSION_NOT_FOUND, severity: ErrorSeverity.ERROR,
                                    message: `Plugin with ID '${id}' ${version ? `version '${version}'` : ''} not found in '${repositoryType}' repository.`,
                                    source_component: source_comp_plugin_id, trace_id_param: trace_id, contextual_info: {plugin_id: id, version: version, repository: repositoryType}
                                }));
                            }
                        }
                        res.json({ plugin, repository: repositoryType });
                    } catch (error:any) {
                         const sError = generateStructuredError({
                            error_code: error.code || GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED,
                            severity: ErrorSeverity.ERROR, message: `Failed to get plugin '${req.params.id}' ${req.params.version ? `version '${req.params.version}'` : ''}. ${error.message}`,
                            source_component: source_comp_plugin_id, original_error: error, trace_id_param: trace_id
                        });
                        const httpStatus = error.originalError?.response?.status || (error.code && typeof error.code === 'string' && (error.code.startsWith("G") || error.code.startsWith("PR")) ? 400 : 500);
                        res.status(httpStatus || 500).json(sError);
                    }
                });
                
                app.delete('/plugins/:id/:version?', async (req, res) => { 
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-delplugin-${uuidv4().substring(0,8)}`;
                    const source_comp_del_plugin = `${source_component}.deletePluginRoute`;
                    try {
                        const { id, version } = req.params;
                        const repositoryType = req.query.repository as string || this.pluginRegistry.getPluginMarketplace().defaultRepository;
                        const repository = this.pluginRegistry.getPluginMarketplace().getRepositories().get(repositoryType);

                        if (!repository) {
                             res.status(404).json(generateStructuredError({
                                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED, 
                                severity: ErrorSeverity.ERROR, message: `Repository type '${repositoryType}' not found for deleting plugin '${id}'.`,
                                source_component: source_comp_del_plugin, trace_id_param: trace_id
                            }));
                        } else {
                            await repository.delete(id, version); 
                        }
                        res.json({ success: true, message: `Plugin ${id} ${version ? `version ${version}` : ''} deleted successfully from ${repositoryType}` });
                    } catch (error:any) {
                        const sError = generateStructuredError({
                            error_code: error.code || GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED,
                            severity: ErrorSeverity.ERROR, message: `Failed to delete plugin '${req.params.id}' ${req.params.version ? `version '${req.params.version}'` : ''}. ${error.message}`,
                            source_component: source_comp_del_plugin, original_error: error, trace_id_param: trace_id
                        });
                        const httpStatus = error.originalError?.response?.status || (error.code && typeof error.code === 'string' && (error.code.startsWith("G") || error.code.startsWith("PR")) ? 400 : 500);
                        res.status(httpStatus || 500).json(sError);
                    }
                });

                app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-fallback-${uuidv4().substring(0,8)}`;
                    console.error(`[${trace_id}] CapabilitiesManager Express Fallback Error Handler:`, err);
                    const sError = generateStructuredError({
                        error_code: (err as any).code || GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.ERROR, message: err.message || 'An unexpected error occurred in the server.',
                        source_component: `${source_component}.expressFallback`, original_error: err, trace_id_param: trace_id
                    });
                    res.status((err as any).status || 500).json(sError);
                });

                this.server = app.listen(this.port, () => {
                    console.log(`[${trace_id_parent}] CapabilitiesManager server listening on port ${this.port}`);
                    resolve();
                });
                this.server.on('error', (error: Error) => {
                     const sError = generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.CRITICAL,
                        message: "CapabilitiesManager server startup error.", source_component, original_error: error, trace_id_param: trace_id_parent
                    });
                    reject(sError); 
                });

            } catch (error) {
                 const sError = generateStructuredError({
                    error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.CRITICAL,
                    message: "Error in CapabilitiesManager server setup.", source_component, original_error: error as Error, trace_id_param: trace_id_parent
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
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.CRITICAL,
                message: `Failed to start CapabilitiesManager: ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id
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
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.WARNING,
                        message: "Error verifying registration with PostOffice.",
                        source_component, original_error: error, trace_id_param: trace_id
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
                    severity: ErrorSeverity.ERROR, message: "Plugin manifest validation failed: Missing id, name, version, or language.",
                    contextual_info: { plugin_id: newPlugin.id, name: newPlugin.verb, version: newPlugin.version, language: newPlugin.language }, trace_id_param: trace_id, source_component
                }));
            }
            if (newPlugin.language !== 'openapi' && (!newPlugin.entryPoint || !newPlugin.entryPoint.main)) {
                 res.status(400).json(generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_MANIFEST_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR, message: "Plugin manifest validation failed: Missing entryPoint.main for non-openapi plugin.",
                    contextual_info: { plugin_id: newPlugin.id, language: newPlugin.language }, trace_id_param: trace_id, source_component
                }));
            }
            
            // Assuming pluginRegistry.fetchOne is version-aware: pluginRegistry.fetchOne(id, version, repoType)
            const existingPlugin = await this.pluginRegistry.fetchOne(newPlugin.id, newPlugin.version, newPlugin.repository?.type);

            if (existingPlugin) { 
                 console.warn(`[${trace_id}] ${source_component}: Plugin ${newPlugin.id} version ${newPlugin.version} already exists. Assuming store handles update/overwrite.`);
            }
            
            if (!newPlugin.security?.trust?.signature) {
                 res.status(400).json(generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED, severity: ErrorSeverity.ERROR,
                    message: 'Plugin submission requires a signature.', contextual_info: { plugin_id: newPlugin.id }, trace_id_param: trace_id, source_component
                }));
            }
            if (!await verifyPluginSignature(newPlugin as PluginDefinition)) {
                 res.status(400).json(generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED, severity: ErrorSeverity.ERROR,
                    message: 'Plugin signature is invalid.', contextual_info: { plugin_id: newPlugin.id }, trace_id_param: trace_id, source_component
                }));
            }
            
            const permissionErrors = validatePluginPermissions(newPlugin);
            if (permissionErrors.length > 0) {
                 res.status(400).json(generateStructuredError({
                    error_code: GlobalErrorCodes.PLUGIN_PERMISSION_VALIDATION_FAILED, severity: ErrorSeverity.ERROR,
                    message: `Plugin permission validation failed: ${permissionErrors.join(', ')}`, contextual_info: { plugin_id: newPlugin.id }, trace_id_param: trace_id, source_component
                }));
            }

            await this.pluginRegistry.store(newPlugin); 

            console.log(`[${trace_id}] ${source_component}: Plugin registered/updated: ${newPlugin.id} v${newPlugin.version}`);
            res.status(200).json({ message: 'Plugin registered successfully', pluginId: newPlugin.id, version: newPlugin.version, isUpdate: !!existingPlugin });

        } catch (error:any) {
            const sError = generateStructuredError({
                error_code: error.code || GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED,
                severity: ErrorSeverity.ERROR, message: `Failed to store plugin '${req.body?.id || 'unknown'}'. ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id
            });
            const httpStatus = error.originalError?.response?.status || (error.code && typeof error.code === 'string' && (error.code.startsWith("G") || error.code.startsWith("PR")) ? 400 : 500);
            res.status(httpStatus).json(sError);
        }
    }

    private async executeActionVerb(req: express.Request, res: express.Response) {
        const trace_id = (req as any).trace_id || uuidv4();
        const source_component = "CapabilitiesManager.executeActionVerb";
        const step = { ...req.body, inputs: MapSerializer.transformFromSerialization(req.body.inputs) } as Step; 

        if (!step.actionVerb || typeof step.actionVerb !== 'string') {
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_INVALID_REQUEST_GENERIC, severity: ErrorSeverity.ERROR,
                message: 'Invalid or missing actionVerb in request.', source_component, trace_id_param: trace_id
            });
            res.status(400).json(createPluginOutputError(sError));
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
                        severity: ErrorSeverity.ERROR, message: `Plugin '${pluginDetails.plugin_id}' version '${pluginDetails.plugin_version}' not found.`,
                        source_component, trace_id_param: trace_id, contextual_info: {plugin_id: pluginDetails.plugin_id, version: pluginDetails.plugin_version}
                    });
                }
            } else { 
                 plugin = await this.pluginRegistry.fetchOneByVerb(step.actionVerb); 
            }

            if (!plugin) { 
                console.log(`[${trace_id}] ${source_component}: Plugin for action '${step.actionVerb}' (ID: ${pluginIdToFetch}, Version: ${pluginVersionToFetch || 'any'}) not found. Checking cache or handling as unknown.`);
                const cachedPlanArray = await this.checkCachedPlan(step.actionVerb); 
                if (cachedPlanArray && cachedPlanArray.length > 0) {
                    console.log(`[${trace_id}] ${source_component}: Using cached plan for verb: ${step.actionVerb}`);
                    res.status(200).send(MapSerializer.transformForSerialization(cachedPlanArray)); 
                }
                console.log(`[${trace_id}] ${source_component}: No cached plan. Handling unknown verb '${step.actionVerb}'.`);
                const resultUnknownVerb = await this.handleUnknownVerb(step, trace_id); 
                res.status(200).send(MapSerializer.transformForSerialization(resultUnknownVerb));
            }
        } catch (error: any) {
            const errorCode = error.error_code || // If already structured (e.g. PLUGIN_VERSION_NOT_FOUND)
                              (error.originalError as any)?.code || // If wrapped from underlying service
                              error.code || // If error has a direct code
                              GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED;
            const sError = generateStructuredError({
                error_code: errorCode,
                severity: ErrorSeverity.ERROR, message: `Failed to fetch plugin for action '${step.actionVerb}'. ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id, contextual_info: {actionVerb: step.actionVerb, plugin_id: pluginIdToFetch, plugin_version: pluginVersionToFetch}
            });
            const httpStatus = error.error_code === GlobalErrorCodes.PLUGIN_VERSION_NOT_FOUND ? 404 : (error.originalError?.response?.status || 500);
            res.status(httpStatus).json(createPluginOutputError(sError));
        }
        
        // Proceed with execution if plugin is found
        try {
            const validatedInputs = await validateAndStandardizeInputs(plugin, step.inputs);
            if (!validatedInputs.success) {
                 throw generateStructuredError({
                    error_code: GlobalErrorCodes.INPUT_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR, message: validatedInputs.error || "Input validation failed for plugin.",
                    source_component, contextual_info: { plugin_id: plugin.id, version: plugin.version, verb: plugin.verb }, trace_id_param: trace_id
                });
            }

            const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(plugin); // This can throw errors with codes like PRxxx or Gxxx
            const result = await this.executePlugin(effectiveManifest, validatedInputs.inputs || new Map<string, PluginInput>(), pluginRootPath, trace_id );
            res.status(200).send(MapSerializer.transformForSerialization(result));

        } catch (error:any) {
            console.error(`[${trace_id}] ${source_component}: Error during execution pipeline for ${plugin.verb} v${plugin.version}: ${error.message}`, error.stack);
            const errorCode = error.code || GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED; // Use error.code if available (e.g. from preparePluginForExecution)
            const sError = generateStructuredError({
                error_code: errorCode,
                severity: ErrorSeverity.CRITICAL,
                message: `Execution pipeline failed for plugin '${plugin.verb}' v'${plugin.version || 'unknown'}'. ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id,
                contextual_info: { plugin_id: plugin.id, verb: plugin.verb, version: plugin.version, actionVerb: step.actionVerb }
            });
            const httpStatus = error.originalError?.response?.status || (error.code && typeof error.code === 'string' && (error.code.startsWith("G") || error.code.startsWith("PR") || error.code === GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_PREPARATION_FAILED ) ? 400 : 500) ;
            res.status(httpStatus).json(createPluginOutputError(sError));
        }
    }

    protected async executePlugin(
        pluginToExecute: PluginDefinition,
        inputsForPlugin: Map<string, PluginInput>,
        actualPluginRootPath: string,
        trace_id: string 
    ): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executePlugin";
        console.log(`[${trace_id}] ${source_component}: Executing plugin ${pluginToExecute.id} v${pluginToExecute.version} (${pluginToExecute.verb}) at ${actualPluginRootPath}`);
        try {
            const permissionErrors = validatePluginPermissions(pluginToExecute);
            if (permissionErrors.length > 0) {
                throw generateStructuredError({ 
                    error_code: GlobalErrorCodes.PLUGIN_PERMISSION_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR, message: `Plugin permission validation failed: ${permissionErrors.join(', ')}`,
                    contextual_info: {plugin_id: pluginToExecute.id, version: pluginToExecute.version}, trace_id_param: trace_id, source_component
                });
            }
            
            if (hasDangerousPermissions(pluginToExecute)) {
                console.warn(`[${trace_id}] ${source_component}: Plugin ${pluginToExecute.id} v${pluginToExecute.version} has dangerous permissions.`);
            }
            const configSet = await this.configManager.getPluginConfig(pluginToExecute.id);
            await this.configManager.recordPluginUsage(pluginToExecute.id);
            
            let token = null; let brainToken = null;
            const tokenManager = this.getTokenManager(); 
            token = await tokenManager.getToken();

            if (pluginToExecute.verb === 'ACCOMPLISH') { 
                const brainTokenManager = new ServiceTokenManager(`http://${this.securityManagerUrl}`, 'Brain', process.env.CLIENT_SECRET || 'stage7AuthSecret');
                brainToken = await brainTokenManager.getToken();
            }
            const currentEnv = { ...process.env };
            if (token) currentEnv.CM_AUTH_TOKEN = token;
            if (brainToken) currentEnv.BRAIN_AUTH_TOKEN = brainToken;
            const environment: environmentType = { env: currentEnv, credentials: configSet ?? [] };
            const executionInputs = new Map(inputsForPlugin);
            if (token) executionInputs.set('__auth_token', { inputName: '__auth_token', inputValue: token, args: { token } });
            if (brainToken) {
                 executionInputs.set('__brain_auth_token', { inputName: '__brain_auth_token', inputValue: brainToken, args: { token: brainToken } });
                 executionInputs.set('token', { inputName: 'token', inputValue: brainToken, args: { token: brainToken } });
            }
            const executionContext: ExecutionContext = { inputs: executionInputs, environment, pluginDefinition: pluginToExecute, pluginRootPath: actualPluginRootPath, trace_id };

            if (pluginToExecute.language === 'javascript') {
                try {
                    return await executePluginInSandbox(executionContext.pluginDefinition, Array.from(executionContext.inputs.values()), executionContext.environment);
                } catch (sandboxError: any) {
                    console.error(`[${trace_id}] ${source_component}: Sandbox execution failed for ${pluginToExecute.id} v${pluginToExecute.version}, falling back to direct: ${sandboxError.message}`);
                    sandboxError.trace_id = trace_id; 
                    throw sandboxError; 
                }
            } else if (pluginToExecute.language === 'python') {
                return this.executePythonPlugin(executionContext); 
            }
            throw generateStructuredError({ error_code: GlobalErrorCodes.UNSUPPORTED_LANGUAGE, severity: ErrorSeverity.ERROR, message: `Unsupported plugin language: ${pluginToExecute.language}`, contextual_info: {plugin_id: pluginToExecute.id, version: pluginToExecute.version}, trace_id_param: trace_id, source_component});

        } catch (error: any) {
            if (error.error_id && error.trace_id) { 
                 return createPluginOutputError(error);
            }
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Execution failed for plugin ${pluginToExecute?.id || 'unknown'} v${pluginToExecute?.version || 'unknown'}: ${error.message}`,
                source_component, original_error: error,
                contextual_info: { plugin_id: pluginToExecute?.id, verb: pluginToExecute?.verb, version: pluginToExecute?.version },
                trace_id_param: trace_id
            });
            return createPluginOutputError(sError);
        }
    }
    
    private async executeJavaScriptPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputs, environment, pluginRootPath, trace_id } = executionContext;
        const source_component = "CapabilitiesManager.executeJavaScriptPlugin";
        console.warn(`[${trace_id}] ${source_component}: WARNING - Executing JS plugin ${pluginDefinition.id} v${pluginDefinition.version} via deprecated direct method.`);
        const mainFilePath = path.join(pluginRootPath, pluginDefinition.entryPoint!.main);
        try {
            const pluginModule = await import(mainFilePath);
            if (typeof pluginModule.execute !== 'function') {
                 throw new Error(`Plugin ${pluginDefinition.verb} does not export an execute function`);
            }
            return await pluginModule.execute(inputs, environment);
        } catch (error: any) {
            throw generateStructuredError({ 
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED, severity: ErrorSeverity.ERROR,
                message: `Fallback JS execution error for ${pluginDefinition.verb} v${pluginDefinition.version}: ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id,
                contextual_info: { plugin_id: pluginDefinition.id, version: pluginDefinition.version, method: "direct_javascript_execution" }
            });
        }
    }

    private async executePythonPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputs, environment, pluginRootPath, trace_id } = executionContext;
        const source_component = "CapabilitiesManager.executePythonPlugin";
        const mainFilePath = path.join(pluginRootPath, pluginDefinition.entryPoint!.main);
        console.log(`[${trace_id}] ${source_component}: Python execution - Main file path: ${mainFilePath}, Root path: ${pluginRootPath}`);
        try {
            const inputsObject: { [key: string]: PluginInput } = {};
            inputs.forEach((value, key) => { inputsObject[key] = value; });
            const inputsJsonString = JSON.stringify(inputsObject);
            const command = `echo '${inputsJsonString.replace(/'/g, "'\\''")}' | python3 "${mainFilePath}" "${pluginRootPath}"`;
            
            const { stdout, stderr } = await execAsync(command, { 
                cwd: pluginRootPath, 
                env: { ...environment.env, PYTHONPATH: pluginRootPath }
            });

            if (stderr) {
                console.warn(`[${trace_id}] ${source_component}: Python plugin ${pluginDefinition.verb} v${pluginDefinition.version} stderr:\n${stderr}`);
            }
            return JSON.parse(stdout);
        } catch (error: any) {
             throw generateStructuredError({ 
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED, severity: ErrorSeverity.ERROR,
                message: `Python plugin ${pluginDefinition.verb} v${pluginDefinition.version} execution failed: ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id,
                contextual_info: { plugin_id: pluginDefinition.id, version: pluginDefinition.version, command_executed: "python3", stderr: (error as any).stderr }
            });
        }
    }

    private async handleUnknownVerb(step: Step, trace_id: string): Promise<PluginOutput[]> { 
        const source_component = "CapabilitiesManager.handleUnknownVerb";
        try {
            const context = ` ${step.description || ''} with inputs ${MapSerializer.transformForSerialization(step.inputs)}`;
            const goal = `Handle the action verb "${step.actionVerb}" in our plan with the following context: ${context} by defining a plan, generating an answer from the inputs, or recommending a new plugin for handling the actionVerb. Respond with a plan, a plugin request, or a literal result.  Avoid using this action verb, ${step.actionVerb}, in the plan.`;
            
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
                    const engineerResult = await requestPluginFromEngineer(this, step, JSON.stringify(accomplishResult.result), trace_id);
                    if (!engineerResult.success) return [engineerResult];
                    
                    const pluginDef = await this.pluginRegistry.fetchOneByVerb(step.actionVerb);
                    if (!pluginDef) {
                        throw generateStructuredError({ error_code: GlobalErrorCodes.PLUGIN_NOT_FOUND, severity: ErrorSeverity.ERROR, message: `Newly created plugin for verb '${step.actionVerb}' not found after engineer request.`, source_component, trace_id_param: trace_id});
                    }
                    return [{ success: true, name: 'plugin_created', resultType: PluginParameterType.PLUGIN, result: pluginDef, resultDescription: `CM: Created new plugin for ${step.actionVerb}` }];
                default:
                    throw generateStructuredError({ error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.ERROR, message: `Unexpected result type '${accomplishResult.resultType}' from ACCOMPLISH plugin.`, source_component, trace_id_param: trace_id});
            }
        } catch (error: any) {
            if (error.error_id && error.trace_id) { throw error; } 
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_UNKNOWN_VERB_HANDLING_FAILED,
                severity: ErrorSeverity.ERROR, message: `Failed to handle unknown verb '${step.actionVerb}': ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id, contextual_info: {actionVerb: step.actionVerb}
            });
        }
    }

    private async executeAccomplishPlugin(goal: string, verbToAvoid: string, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeAccomplishPlugin";
        try {
            const accomplishInputs = new Map<string, PluginInput>([
                ['goal', { inputName: 'goal', inputValue: goal, args: {} }],
                ['verbToAvoid', { inputName: 'verbToAvoid', inputValue: verbToAvoid, args: {} }]
            ]);
            const accomplishPluginManifest = await this.pluginRegistry.fetchOneByVerb('ACCOMPLISH'); 
            if (!accomplishPluginManifest) {
                 throw generateStructuredError({error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_MANIFEST_NOT_FOUND, severity: ErrorSeverity.CRITICAL, message: "ACCOMPLISH plugin manifest not found.", trace_id_param: trace_id, source_component});
            }
            const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(accomplishPluginManifest);
            return await this.executePlugin(effectiveManifest, accomplishInputs, pluginRootPath, trace_id);
        } catch (error:any) {
            if (error.error_id && error.trace_id) { throw error; } 
            throw generateStructuredError({ 
                error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR, message: `Core ACCOMPLISH plugin execution failed: ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id, contextual_info: {goal_length: goal.length}
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
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.WARNING,
                message: `Could not check cached plan for verb '${actionVerb}'. ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id
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
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.WARNING,
                message: `Could not cache plan for verb '${actionVerb}'. ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id
            });
        }
    }
}

export const capabilitiesManager = new CapabilitiesManager();
export default CapabilitiesManager;
