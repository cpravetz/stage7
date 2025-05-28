/**
 * ContainerManager - Manages Docker-based plugin execution
 * Provides container lifecycle management, health checking, and plugin communication
 */

import Docker from 'dockerode';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
    ContainerConfig,
    ContainerInstance,
    ContainerStatus,
    ContainerExecutionRequest,
    ContainerExecutionResponse,
    ContainerBuildOptions,
    ContainerRunOptions,
    ContainerHealthCheckResult,
    ContainerPluginManifest
} from '../types/containerTypes';
import { generateStructuredError, ErrorSeverity, GlobalErrorCodes } from './errorReporter';

export class ContainerManager {
    private docker: Docker;
    private containers: Map<string, ContainerInstance> = new Map();
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
    private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
    private readonly PORT_RANGE_START = 8080;
    private readonly PORT_RANGE_END = 8999;
    private usedPorts: Set<number> = new Set();

    constructor() {
        this.docker = new Docker();
        this.startHealthCheckMonitoring();
    }

    /**
     * Build a Docker image for a containerized plugin
     */
    async buildPluginImage(
        pluginManifest: ContainerPluginManifest,
        pluginPath: string,
        trace_id: string
    ): Promise<string> {
        const source_component = "ContainerManager.buildPluginImage";
        
        try {
            const buildOptions: ContainerBuildOptions = {
                dockerfile: pluginManifest.container.dockerfile,
                context: pluginPath,
                tag: pluginManifest.container.image,
                buildArgs: {
                    PLUGIN_ID: pluginManifest.id,
                    PLUGIN_VERSION: pluginManifest.version
                }
            };

            console.log(`[${trace_id}] ${source_component}: Building image ${buildOptions.tag} from ${buildOptions.context}`);

            // Check if Dockerfile exists
            const dockerfilePath = path.join(pluginPath, buildOptions.dockerfile);
            await fs.access(dockerfilePath);

            // Build the image
            const stream = await this.docker.buildImage(
                {
                    context: buildOptions.context,
                    src: ['.']
                },
                {
                    dockerfile: buildOptions.dockerfile,
                    t: buildOptions.tag,
                    buildargs: buildOptions.buildArgs
                }
            );

            // Wait for build to complete
            await new Promise((resolve, reject) => {
                this.docker.modem.followProgress(stream, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });

            console.log(`[${trace_id}] ${source_component}: Successfully built image ${buildOptions.tag}`);
            return buildOptions.tag;

        } catch (error: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.ERROR,
                message: `Failed to build container image for plugin ${pluginManifest.id}: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {
                    plugin_id: pluginManifest.id,
                    image: pluginManifest.container.image,
                    dockerfile: pluginManifest.container.dockerfile
                }
            });
        }
    }

    /**
     * Start a container instance for a plugin
     */
    async startPluginContainer(
        pluginManifest: ContainerPluginManifest,
        trace_id: string
    ): Promise<ContainerInstance> {
        const source_component = "ContainerManager.startPluginContainer";
        
        try {
            // Allocate a port for the container
            const hostPort = this.allocatePort();
            
            const runOptions: ContainerRunOptions = {
                image: pluginManifest.container.image,
                ports: {
                    [`${pluginManifest.container.ports[0]?.container || 8080}/tcp`]: hostPort
                },
                environment: pluginManifest.container.environment,
                memory: pluginManifest.container.resources.memory,
                cpu: pluginManifest.container.resources.cpu,
                name: `stage7-plugin-${pluginManifest.id}-${uuidv4().substring(0, 8)}`,
                detach: true,
                autoRemove: false
            };

            console.log(`[${trace_id}] ${source_component}: Starting container for plugin ${pluginManifest.id} on port ${hostPort}`);

            // Create and start the container
            const container = await this.docker.createContainer({
                Image: runOptions.image,
                ExposedPorts: {
                    [`${pluginManifest.container.ports[0]?.container || 8080}/tcp`]: {}
                },
                HostConfig: {
                    PortBindings: runOptions.ports,
                    Memory: this.parseMemoryLimit(runOptions.memory),
                    CpuShares: this.parseCpuShares(runOptions.cpu),
                    AutoRemove: runOptions.autoRemove
                },
                Env: Object.entries(runOptions.environment).map(([key, value]) => `${key}=${value}`),
                name: runOptions.name
            });

            await container.start();

            const containerInstance: ContainerInstance = {
                id: uuidv4(),
                containerId: container.id,
                pluginId: pluginManifest.id,
                image: pluginManifest.container.image,
                port: hostPort,
                status: 'starting',
                createdAt: new Date()
            };

            this.containers.set(containerInstance.id, containerInstance);
            
            // Wait for container to be ready
            await this.waitForContainerReady(containerInstance, pluginManifest, trace_id);
            
            console.log(`[${trace_id}] ${source_component}: Container ${containerInstance.id} started successfully`);
            return containerInstance;

        } catch (error: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.ERROR,
                message: `Failed to start container for plugin ${pluginManifest.id}: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {
                    plugin_id: pluginManifest.id,
                    image: pluginManifest.container.image
                }
            });
        }
    }

    /**
     * Execute a plugin in a container
     */
    async executePluginInContainer(
        containerInstance: ContainerInstance,
        pluginManifest: ContainerPluginManifest,
        request: ContainerExecutionRequest,
        trace_id: string
    ): Promise<ContainerExecutionResponse> {
        const source_component = "ContainerManager.executePluginInContainer";
        
        try {
            const startTime = Date.now();
            const url = `http://localhost:${containerInstance.port}${pluginManifest.api.endpoint}`;
            
            console.log(`[${trace_id}] ${source_component}: Executing plugin ${pluginManifest.id} at ${url}`);

            const response = await axios({
                method: pluginManifest.api.method,
                url,
                data: request,
                timeout: pluginManifest.api.timeout || this.DEFAULT_TIMEOUT,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const executionTime = Date.now() - startTime;
            
            console.log(`[${trace_id}] ${source_component}: Plugin execution completed in ${executionTime}ms`);

            return {
                success: true,
                outputs: response.data.outputs,
                executionTime
            };

        } catch (error: any) {
            const executionTime = Date.now() - Date.now();
            
            return {
                success: false,
                error: error.message,
                executionTime
            };
        }
    }

    /**
     * Stop and remove a container instance
     */
    async stopPluginContainer(containerInstanceId: string, trace_id: string): Promise<void> {
        const source_component = "ContainerManager.stopPluginContainer";
        
        try {
            const containerInstance = this.containers.get(containerInstanceId);
            if (!containerInstance) {
                throw new Error(`Container instance ${containerInstanceId} not found`);
            }

            console.log(`[${trace_id}] ${source_component}: Stopping container ${containerInstance.containerId}`);

            const container = this.docker.getContainer(containerInstance.containerId);
            
            // Stop the container
            await container.stop({ t: 10 }); // 10 second timeout
            
            // Remove the container
            await container.remove();
            
            // Release the port
            this.usedPorts.delete(containerInstance.port);
            
            // Remove from our tracking
            this.containers.delete(containerInstanceId);
            
            console.log(`[${trace_id}] ${source_component}: Container ${containerInstance.containerId} stopped and removed`);

        } catch (error: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.ERROR,
                message: `Failed to stop container ${containerInstanceId}: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
        }
    }

    /**
     * Perform health check on a container
     */
    async performHealthCheck(
        containerInstance: ContainerInstance,
        pluginManifest: ContainerPluginManifest,
        trace_id: string
    ): Promise<ContainerHealthCheckResult> {
        const source_component = "ContainerManager.performHealthCheck";
        
        try {
            const startTime = Date.now();
            const url = `http://localhost:${containerInstance.port}${pluginManifest.container.healthCheck.path}`;
            
            const response = await axios.get(url, {
                timeout: parseInt(pluginManifest.container.healthCheck.timeout.replace('s', '')) * 1000
            });

            const responseTime = Date.now() - startTime;
            
            if (response.status === 200 && response.data.status === 'healthy') {
                return {
                    status: 'healthy',
                    timestamp: new Date(),
                    responseTime
                };
            } else {
                return {
                    status: 'unhealthy',
                    message: `Unexpected response: ${response.status}`,
                    timestamp: new Date(),
                    responseTime
                };
            }

        } catch (error: any) {
            return {
                status: 'unhealthy',
                message: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Get all active container instances
     */
    getActiveContainers(): ContainerInstance[] {
        return Array.from(this.containers.values());
    }

    /**
     * Cleanup all containers
     */
    async cleanup(trace_id: string): Promise<void> {
        const source_component = "ContainerManager.cleanup";
        
        try {
            console.log(`[${trace_id}] ${source_component}: Cleaning up ${this.containers.size} containers`);
            
            const cleanupPromises = Array.from(this.containers.keys()).map(id => 
                this.stopPluginContainer(id, trace_id).catch(error => 
                    console.error(`[${trace_id}] Failed to stop container ${id}: ${error.message}`)
                )
            );
            
            await Promise.all(cleanupPromises);
            
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            
            console.log(`[${trace_id}] ${source_component}: Cleanup completed`);

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Cleanup failed: ${error.message}`);
        }
    }

    // Private helper methods

    private allocatePort(): number {
        for (let port = this.PORT_RANGE_START; port <= this.PORT_RANGE_END; port++) {
            if (!this.usedPorts.has(port)) {
                this.usedPorts.add(port);
                return port;
            }
        }
        throw new Error('No available ports in range');
    }

    private parseMemoryLimit(memory?: string): number | undefined {
        if (!memory) return undefined;
        const match = memory.match(/^(\d+)([kmg]?)$/i);
        if (!match) return undefined;
        
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        switch (unit) {
            case 'k': return value * 1024;
            case 'm': return value * 1024 * 1024;
            case 'g': return value * 1024 * 1024 * 1024;
            default: return value;
        }
    }

    private parseCpuShares(cpu?: string): number | undefined {
        if (!cpu) return undefined;
        const value = parseFloat(cpu);
        return Math.floor(value * 1024); // Docker CPU shares
    }

    private async waitForContainerReady(
        containerInstance: ContainerInstance,
        pluginManifest: ContainerPluginManifest,
        trace_id: string
    ): Promise<void> {
        const maxAttempts = 30;
        const delayMs = 1000;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const healthResult = await this.performHealthCheck(containerInstance, pluginManifest, trace_id);
                if (healthResult.status === 'healthy') {
                    containerInstance.status = 'running';
                    containerInstance.healthStatus = 'healthy';
                    containerInstance.lastHealthCheck = new Date();
                    return;
                }
            } catch (error) {
                // Continue trying
            }
            
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        
        containerInstance.status = 'error';
        throw new Error(`Container failed to become ready after ${maxAttempts} attempts`);
    }

    private startHealthCheckMonitoring(): void {
        this.healthCheckInterval = setInterval(async () => {
            // Health check monitoring will be implemented in the next iteration
            // For now, just log that monitoring is active
            if (this.containers.size > 0) {
                console.log(`ContainerManager: Monitoring ${this.containers.size} containers`);
            }
        }, this.HEALTH_CHECK_INTERVAL);
    }
}
