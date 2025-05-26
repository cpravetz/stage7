import express, { Express, Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import { PluginOrchestrator } from '../orchestration/pluginOrchestrator';
import { PluginRegistry } from '../utils/pluginRegistry';
import { generateStructuredError, ErrorSeverity, GlobalErrorCodes, StructuredError } from '../utils/errorReporter';
import { PluginLocator } from '@cktmcs/shared';
import githubRoutes from '../routes/githubRoutes'; // Assuming this path is correct after refactor
import { BaseEntity } from '@cktmcs/shared'; // For verifyToken

// Helper to create PluginOutput error from a StructuredError - Duplicating temporarily, ideally from a shared util
function createPluginOutputError(structuredError: StructuredError): any[] { // Return type might need adjustment
    return [{
        success: false,
        name: structuredError.error_code || GlobalErrorCodes.UNKNOWN_ERROR,
        resultType: 'ERROR', // Simplified, adjust as per actual PluginParameterType.ERROR
        resultDescription: structuredError.message_human_readable,
        result: structuredError,
        error: structuredError.message_human_readable
    }];
}


export class ApiRouterService {
    private app: Express;
    private pluginOrchestrator: PluginOrchestrator;
    private pluginRegistry: PluginRegistry; // For direct registry interactions if any
    private server: any;

    constructor(pluginOrchestrator: PluginOrchestrator, pluginRegistry: PluginRegistry) {
        this.pluginOrchestrator = pluginOrchestrator;
        this.pluginRegistry = pluginRegistry;
        this.app = express();
        console.log("ApiRouterService initialized");
    }

    public async startServer(port: string | number, trace_id_parent: string): Promise<void> {
        const source_component = "ApiRouterService.startServer";
        return new Promise((resolve, reject) => {
            try {
                this.app.use(bodyParser.json());

                this.app.use((req: Request, _res: Response, next: NextFunction) => {
                    const trace_id = `${trace_id_parent}-${uuidv4().substring(0, 8)}`;
                    (req as any).trace_id = trace_id;
                    console.log(`[${trace_id}] ${new Date().toISOString()} - API - ${req.method} ${req.path}`);
                    next();
                });

                this.app.use((req: Request, res: Response, next: NextFunction) => {
                    if (req.path === '/health' || req.path === '/ready' || req.path === '/api/v1/health' || req.path === '/api/v1/ready') return next();
                    // Assuming PluginOrchestrator inherits from BaseEntity and provides verifyToken or a handler
                    if (typeof (this.pluginOrchestrator as any).verifyToken === 'function') {
                         (this.pluginOrchestrator as any).verifyToken(req, res, next);
                    } else {
                        // Fallback or error if verifyToken is not available
                        console.error(`[${(req as any).trace_id}] ${source_component}: verifyToken function not available on PluginOrchestrator.`);
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                            severity: ErrorSeverity.CRITICAL, message: "Authentication mechanism is not available.",
                            source_component, trace_id_param: (req as any).trace_id
                        });
                        res.status(500).json(createPluginOutputError(sError));
                    }
                });
                
                // Health check routes
                this.app.get('/health', (req, res) => (this.pluginOrchestrator as any).healthCheckHandler(req, res));
                this.app.get('/ready', (req, res) => (this.pluginOrchestrator as any).readinessCheckHandler(req, res));
                // Adding namespaced versions as well
                this.app.get('/api/v1/health', (req, res) => (this.pluginOrchestrator as any).healthCheckHandler(req, res));
                this.app.get('/api/v1/ready', (req, res) => (this.pluginOrchestrator as any).readinessCheckHandler(req, res));


                this.app.post('/api/v1/executeAction', (req, res) => this.pluginOrchestrator.executeActionVerbHandler(req, res));
                
                this.app.post('/api/v1/message', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-msg-${uuidv4().substring(0,8)}`;
                    try {
                        // Assuming PluginOrchestrator inherits from BaseEntity and provides handleBaseMessage
                        await (this.pluginOrchestrator as any).handleBaseMessageHandler(req.body, trace_id);
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

                this.app.get('/api/v1/availablePlugins', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-avail-${uuidv4().substring(0,8)}`;
                    try {
                        // Directly using pluginRegistry here as it's about listing
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

                this.app.post('/api/v1/storeNewPlugin', (req, res) => {this.pluginOrchestrator.storeNewPluginHandler(req, res)});
                
                // Assuming githubRoutes is an Express Router
                this.app.use('/api/v1/github', githubRoutes); 

                this.app.get('/api/v1/plugins', async (req, res) => {
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
                            return;
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

                this.app.get('/api/v1/plugins/:id/:version?', async (req, res) => { 
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
                            return;
                        }
                        const repository = this.pluginRegistry.getPluginMarketplace().getRepositories().get(repositoryType);
                        if (!repository) {
                             res.status(404).json(generateStructuredError({
                                error_code: GlobalErrorCodes.PLUGIN_NOT_FOUND, severity: ErrorSeverity.ERROR,
                                message: `Repository type '${repositoryType}' not found for plugin '${id}'.`, source_component: source_comp_plugin_id, trace_id_param: trace_id
                            }));
                        } else {
                            // Assuming repository.fetch can handle an optional version
                            const plugin = await repository.fetch(id, version); 
                            if (!plugin) {
                                res.status(404).json(generateStructuredError({
                                    error_code: GlobalErrorCodes.PLUGIN_VERSION_NOT_FOUND, severity: ErrorSeverity.ERROR,
                                    message: `Plugin with ID '${id}' ${version ? `version '${version}'` : ''} not found in '${repositoryType}' repository.`,
                                    source_component: source_comp_plugin_id, trace_id_param: trace_id, contextual_info: {plugin_id: id, version: version, repository: repositoryType}
                                }));
                            } else {
                                res.json({ plugin, repository: repositoryType });
                            }
                        }
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
                
                this.app.delete('/api/v1/plugins/:id/:version?', async (req, res) => { 
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
                            // Assuming repository.delete can handle an optional version
                            await repository.delete(id, version); 
                            res.json({ success: true, message: `Plugin ${id} ${version ? `version ${version}` : ''} deleted successfully from ${repositoryType}` });
                        }
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

                // Fallback error handler
                this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => { // eslint-disable-line @typescript-eslint/no-unused-vars
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-fallback-${uuidv4().substring(0,8)}`;
                    console.error(`[${trace_id}] ApiRouterService Express Fallback Error Handler:`, err);
                    const sError = generateStructuredError({
                        error_code: (err as any).code || GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.ERROR, message: err.message || 'An unexpected error occurred in the server.',
                        source_component: `${source_component}.expressFallback`, original_error: err, trace_id_param: trace_id
                    });
                    res.status((err as any).status || 500).json(sError);
                });

                this.server = this.app.listen(port, () => {
                    console.log(`[${trace_id_parent}] ApiRouterService server listening on port ${port}`);
                    resolve();
                });

                this.server.on('error', (error: Error) => {
                     const sError = generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.CRITICAL,
                        message: "ApiRouterService server startup error.", source_component, original_error: error, trace_id_param: trace_id_parent
                    });
                    reject(sError); 
                });

            } catch (error) {
                 const sError = generateStructuredError({
                    error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.CRITICAL,
                    message: "Error in ApiRouterService server setup.", source_component, original_error: error as Error, trace_id_param: trace_id_parent
                });
                reject(sError);
            }
        });
    }

    public getServerInstance(): any {
        return this.server;
    }
}
