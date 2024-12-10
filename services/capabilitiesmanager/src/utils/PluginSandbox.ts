import iVM from 'isolated-vm';
import { MapSerializer, Plugin, PluginInput, PluginOutput, PluginParameterType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { createVerify, createHash } from 'crypto';


export class PluginSandbox {
    private isolate: iVM.Isolate;
    private context: iVM.Context;
    private jail: iVM.Reference;
    private plugin: Plugin;
    private initialized: boolean = false;
    private disposed: boolean = false;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.validateSecurity(plugin);
        
        this.isolate = new iVM.Isolate({
            memoryLimit: plugin.security.sandboxOptions.memory || 128 * 1024 * 1024,
        });
        this.context = this.isolate.createContextSync();
        this.jail = this.context.global;
    }

    private async initialize() {
        if (this.initialized) return;
        
        try {
            // Create references that need to be cleaned up
            const references: iVM.Reference[] = [];
            
            // Setup fetch
            const fetchRef = new iVM.Reference(async (url: string, options: any) => {
                // ... fetch implementation
            });
            references.push(fetchRef);
            
            await this.jail.set('fetch', fetchRef);
            
            // Store references for cleanup
            (this as any)._references = references;
            
            this.initialized = true;
        } catch (error) {
            // Clean up any created references on error
            await this.cleanupReferences();
            throw error;
        }
    }

    private async cleanupReferences() {
        const references = (this as any)._references || [];
        for (const ref of references) {
            try {
                if (ref && typeof ref.release === 'function') {
                    ref.release();
                }
            } catch (error) {
                // Ignore release errors for already released references
                if (!String(error).includes('has been released')) {
                    console.error('Error releasing reference:', error);
                }
            }
        }
        (this as any)._references = [];
    }

    private async setupSandbox(plugin: Plugin) {
        if (!this.context || !this.jail) {
            throw new Error('Context or jail not initialized');
        }

        // Set up basic globals
        const consoleLog = new iVM.Reference((...args: any[]) => console.log(`[Plugin ${plugin.id}]:`, ...args));
        const consoleError = new iVM.Reference((...args: any[]) => console.error(`[Plugin ${plugin.id}]:`, ...args));
        const consoleWarn = new iVM.Reference((...args: any[]) => console.warn(`[Plugin ${plugin.id}]:`, ...args));
        const consoleInfo = new iVM.Reference((...args: any[]) => console.info(`[Plugin ${plugin.id}]:`, ...args));

        try {
            await this.context.evalClosure(`
                globalThis.setTimeout = (callback, ms) => {
                    if (ms > ${plugin.security.sandboxOptions.timeout}) {
                        throw new Error('Timeout exceeds maximum allowed value');
                    }
                    return setTimeout(callback, ms);
                };
                
                globalThis.console = {
                    log: (...args) => { $0.applySync(undefined, args); },
                    error: (...args) => { $1.applySync(undefined, args); },
                    warn: (...args) => { $2.applySync(undefined, args); },
                    info: (...args) => { $3.applySync(undefined, args); }
                };
            `, [consoleLog, consoleError, consoleWarn, consoleInfo], { timeout: plugin.security.sandboxOptions.timeout });
        } finally {
            // Clean up references after they're no longer needed
            consoleLog.release();
            consoleError.release();
            consoleWarn.release();
            consoleInfo.release();
        }
    }

    private async setupFileSystem(plugin: Plugin) {
        const fsRef = await this.context.evalClosure(`
            ({
                readFile: (path) => {
                    return $0.applySync(undefined, [path]);
                }
                ${plugin.security.permissions.includes('fs.write') ? `,
                writeFile: (path, data) => {
                    return $1.applySync(undefined, [path, data]);
                }` : ''}
            })
        `, [
            new iVM.Reference((path: string) => {
                if (!this.isAllowedPath(path)) {
                    throw new Error('Access to path is not allowed');
                }
                // Implement secure file reading
                return '';  // Placeholder
            }),
            plugin.security.permissions.includes('fs.write') ? 
                new iVM.Reference((path: string, data: string) => {
                    if (!this.isAllowedPath(path)) {
                        throw new Error('Access to path is not allowed');
                    }
                    // Implement secure file writing
                }) : undefined
        ]);

        await this.jail.set('fs', fsRef);
    }

    private async setupFetch(plugin: Plugin) {
        const fetchRef = await this.context.evalClosure(`
            async (url, options) => {
                return await $0.apply(undefined, [url, options]);
            }
        `, [
            new iVM.Reference(async (url: string, options: any) => {
                const domain = new URL(url).hostname;
                if (!this.isAllowedDomain(domain, plugin.security.sandboxOptions.allowedAPIs)) {
                    throw new Error(`Access to domain ${domain} is not allowed`);
                }

                try {
                    const response = await fetch(url, options);
                    const responseData = await response.text();
                    return {
                        status: response.status,
                        statusText: response.statusText,
                        headers: Object.fromEntries(response.headers),
                        data: responseData
                    };
                } catch (error) {
                    analyzeError(error as Error);
                    throw new Error(`Fetch error: ${error instanceof Error ? error.message : String(error)}`);
                }
            })
        ]);

        await this.jail.set('fetch', fetchRef);
    }    

    private isAllowedPath(path: string): boolean {
        try {
            // Normalize the path to prevent directory traversal attacks
            const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
            
            // Block any path containing suspicious patterns
            const suspiciousPatterns = [
                '../', // Directory traversal
                '..\\', // Windows directory traversal
                '/./', // Current directory reference
                '\\.\\', // Windows current directory reference
                '//', // Double slash
                '\\\\', // Windows UNC paths
                ':', // Drive letter prefix
                '~', // Home directory reference
                'proc', // Linux proc filesystem
                'dev', // Device files
                'etc', // System configuration
                'sys', // System files
                'tmp', // Temporary files
                'root' // Root directory
            ];

            if (suspiciousPatterns.some(pattern => normalizedPath.includes(pattern))) {
                return false;
            }

            // Only allow specific file extensions
            const allowedExtensions = [
                '.txt', '.json', '.csv', '.xml', '.yaml', '.yml',
                '.md', '.log', '.data', '.conf'
            ];
            
            if (!allowedExtensions.some(ext => normalizedPath.endsWith(ext))) {
                return false;
            }

            // Only allow access to specific directories (customize based on your needs)
            const allowedPrefixes = [
                'data/',
                'workspace/',
                'plugins/data/',
                'output/'
            ];

            return allowedPrefixes.some(prefix => normalizedPath.startsWith(prefix));

        } catch (error) {
            analyzeError(error as Error);
            console.error('Path validation error:', error);
            return false;
        }
    }

    private isAllowedDomain(domain: string, allowedAPIs: string[]): boolean {
        return allowedAPIs.some(api => domain.endsWith(api));
    }

    private validateSecurity(plugin: Plugin) {
        if (!plugin.security?.trust?.signature) {
            throw new Error('Plugin must be signed');
        }
        if (!this.verifySignature(plugin)) {
            throw new Error('Invalid plugin signature');
        }
    }

    
    private verifySignature(plugin: Plugin): boolean {
        try {
            if (!plugin.security?.trust?.signature) {
                console.error('Plugin missing signature information');
                return false;
            }
    
            // Special handling for built-in system plugins
            if (plugin.security.trust.publisher === 'system') {
                const content = JSON.stringify({
                    id: plugin.id,
                    verb: plugin.verb,
                    entryPoint: plugin.entryPoint,
                    security: {
                        permissions: plugin.security.permissions,
                        sandboxOptions: plugin.security.sandboxOptions
                    }
                });
    
                const expectedSignature = createHash('sha256').update(content).digest('hex');
                return expectedSignature === plugin.security.trust.signature;
            }
    
            // Regular plugin verification logic for non-system plugins
            const publicKey = this.getPublisherPublicKey(plugin.security.trust.publisher || '');
            if (!publicKey) {
                console.error(`No public key found for publisher: ${plugin.security.trust.publisher}`);
                return false;
            }
    
            const pluginData = this.getPluginSignatureData(plugin);
            const verifier = createVerify('SHA256');
            verifier.update(pluginData);
    
            return verifier.verify(
                publicKey,
                Buffer.from(plugin.security.trust.signature, 'base64')
            );
        } catch (error) {
            analyzeError(error as Error);
            console.error('Signature verification error:', error);
            return false;
        }
    }
    
    private getPluginSignatureData(plugin: Plugin): string {
        // Create a deterministic string representation of critical plugin properties
        const criticalProperties = {
            id: plugin.id,
            verb: plugin.verb,
            entryPoint: plugin.entryPoint,
            security: {
                permissions: plugin.security.permissions,
                sandboxOptions: plugin.security.sandboxOptions
            }
        };
    
        return JSON.stringify(criticalProperties, Object.keys(criticalProperties).sort());
    }
    
    private getPublisherPublicKey(publisher: string): string | null {
        // This should be implemented to retrieve the public key from a secure key store
        // Example implementation using environment variables:
        const publicKeyMap: Record<string, string> = {
            'system-generated': process.env.SYSTEM_PUBLIC_KEY || '',
            'trusted-publisher': process.env.TRUSTED_PUBLISHER_KEY || '',
            // Add more trusted publishers as needed
        };
    
        return publicKeyMap[publisher] || null;
    }
    
    private verifyCertificateHash(publisher: string, certificateHash: string): boolean {
        try {
            // This should be implemented to verify the certificate hash against a trusted certificate authority
            // Example implementation:
            const trustedCertificates: Record<string, string> = {
                'system-generated': process.env.SYSTEM_CERT_HASH || '',
                'trusted-publisher': process.env.TRUSTED_CERT_HASH || '',
                // Add more trusted certificate hashes as needed
            };
    
            return trustedCertificates[publisher] === certificateHash;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Certificate hash verification error:', error);
            return false;
        }
    }

    async executePlugin(inputs: Map<string, PluginInput>, environment: Record<string, any>): Promise<PluginOutput[]> {
        if (this.disposed) {
            throw new Error('Sandbox has been disposed');
        }
    
        const timeoutMs = this.plugin.security?.sandboxOptions?.timeout || 30000;
        let timeoutId: NodeJS.Timeout | null = null;
    
        try {
            await this.initialize();
            console.log('sandbox inputs: ', inputs);
            const serializedInputs = MapSerializer.transformForSerialization(inputs);
            console.log('serializedInputs: ', serializedInputs);
            const serializedEnv = JSON.parse(JSON.stringify(environment)); // Ensure environment is serializable
    
            // Create a promise that will reject on timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`Plugin execution timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            });
    
            console.log('sandbox. timeoutPromise created. serializedEnv: ', serializedEnv);
            // Create the execution promise
            const executionPromise = (async () => {
                const pluginCode = await this.getPluginCode();
                
                const executionContext = await this.context.eval(`
                    (function(serializedInputs, serializedEnv, pluginCode) {
                        return async function() {
                            try {
                                const inputs = new Map(serializedInputs._type === 'Map' ? 
                                    serializedInputs.entries : 
                                    Object.entries(serializedInputs));
                                const module = { exports: {} };
                                const exports = module.exports;
                                
                                eval(pluginCode);
                                
                                const execute = module.exports.execute || exports.execute;
                                if (typeof execute !== 'function') {
                                    throw new Error('Plugin does not export an execute function');
                                }
                                
                                // Ensure we await the execute result and stringify it immediately
                                const executeResult = await execute(inputs);
                                // Handle both array and single result cases
                                const result = Array.isArray(executeResult) ? executeResult : [executeResult];
                                // Stringify immediately within the sandbox
                                return JSON.stringify(result);
                            } catch (error) {
                                throw new Error(error.stack || error.message || String(error));
                            }
                        };
                    })
                `);
    
                console.log('sandbox executionContext created');
                
                const executionFunction = await executionContext.apply(undefined, [
                    serializedInputs,
                    serializedEnv,
                    pluginCode
                ]);
    
                const resultJson = await executionFunction();
                console.log('sandbox resultJson: ', resultJson);
                return resultJson;
            })();
    
            // Race between timeout and execution
            const resultJson = await Promise.race([executionPromise, timeoutPromise]);
    
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
    
            try {
                const result = JSON.parse(resultJson as string);
                return this.validateOutput(Array.isArray(result) ? result : [result]);
            } catch (parseError) {
                throw new Error(`Failed to parse plugin output: ${parseError instanceof Error ? parseError.message : parseError}`);
            }
    
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Plugin execution failed',
                result: null,
                error: errorMessage
            }];
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            await this.dispose();
        }
    }
    
    private validateOutput(output: any[]): PluginOutput[] {
        if (!Array.isArray(output)) {
            throw new Error('Plugin must return an array of outputs');
        }
    
        return output.map((item, index) => {
            if (!item || typeof item !== 'object') {
                return {
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: `Invalid output format at index ${index}`,
                    result: null,
                    error: 'Output must be an object'
                };
            }
    
            return {
                success: item.success ?? false,
                name: item.name ?? 'unknown',
                resultType: item.resultType ?? PluginParameterType.ERROR,
                resultDescription: item.resultDescription ?? 'No description provided',
                result: item.result ?? null,
                error: item.error ?? (item.success ? undefined : 'Unknown error occurred')
            };
        });
    }

    private async getPluginCode(): Promise<string> {
        if (!this.plugin.entryPoint?.files) {
            console.error('Plugin entry point files not found');
            throw new Error('Plugin entry point files not found');
        }
    
        // Case-insensitive search for the main file
        const mainFileName = this.plugin.entryPoint.main?.toLowerCase();
        const mainFile = this.plugin.entryPoint.files.find(file => 
            Object.keys(file)[0].toLowerCase() === mainFileName
        );
    
        if (!mainFile) {
            console.error(`Plugin main file ${this.plugin.entryPoint.main} not found in entry point files`);
            console.error('Available files:', this.plugin.entryPoint.files.map(f => Object.keys(f)[0]));
            throw new Error('Plugin main file not found');
        }
    
        const code = Object.values(mainFile)[0];
        if (typeof code !== 'string') {
            throw new Error('Invalid plugin code format');
        }
    
        return code;
    }

    public async dispose(): Promise<void> {
        if (this.disposed) {
            return;
        }
    
        try {
            this.disposed = true;
            
            // Cleanup references first
            await this.cleanupReferences();
            
            // Then dispose of context and isolate
            if (this.jail) {
                try {
                    this.jail.release();
                } catch (e) {
                    // Ignore release errors for already released references
                    if (!String(e).includes('has been released')) {
                        console.error('Error releasing jail:', e);
                    }
                }
                this.jail = null as any;
            }
            
            if (this.context) {
                try {
                    this.context.release();
                } catch (e) {
                    // Ignore release errors for already released references
                    if (!String(e).includes('has been released')) {
                        console.error('Error releasing context:', e);
                    }
                }
                this.context = null as any;
            }
            
            if (this.isolate && !this.isolate.isDisposed) {
                try {
                    this.isolate.dispose();
                } catch (e) {
                    console.error('Error disposing isolate:', e);
                }
                this.isolate = null as any;
            }
            
            this.initialized = false;
        } catch (error) {
            console.error('Error during sandbox disposal:', error);
        }
    }

}