/**
 * Container-related types and interfaces for containerized plugin support
 */

export interface ContainerConfig {
    dockerfile: string;
    buildContext: string;
    image: string;
    ports: ContainerPort[];
    environment: { [key: string]: string };
    resources: ContainerResources;
    healthCheck: ContainerHealthCheck;
}

export interface ContainerPort {
    container: number;
    host: number;
}

export interface ContainerResources {
    memory: string;
    cpu: string;
}

export interface ContainerHealthCheck {
    path: string;
    interval: string;
    timeout: string;
    retries: number;
}

export interface ContainerPluginManifest {
    id: string;
    name: string;
    version: string;
    actionVerb: string;
    language: 'container';
    container: ContainerConfig;
    api: ContainerApiConfig;
    inputs?: any[];
    outputs?: any[];
    security?: any;
    metadata?: any;
}

export interface ContainerApiConfig {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    timeout: number;
}

export interface ContainerInstance {
    id: string;
    containerId: string;
    pluginId: string;
    image: string;
    port: number;
    status: ContainerStatus;
    createdAt: Date;
    lastHealthCheck?: Date;
    healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}

export type ContainerStatus = 'building' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface ContainerExecutionRequest {
    inputs: { [key: string]: any };
    context?: { [key: string]: any };
}

export interface ContainerExecutionResponse {
    success: boolean;
    outputs?: { [key: string]: any };
    error?: string;
    executionTime?: number;
}

export interface ContainerBuildOptions {
    dockerfile: string;
    context: string;
    tag: string;
    buildArgs?: { [key: string]: string };
}

export interface ContainerRunOptions {
    image: string;
    ports: { [containerPort: string]: number };
    environment: { [key: string]: string };
    memory?: string;
    cpu?: string;
    name?: string;
    detach?: boolean;
    autoRemove?: boolean;
}

export interface ContainerHealthCheckResult {
    status: 'healthy' | 'unhealthy' | 'unknown';
    message?: string;
    timestamp: Date;
    responseTime?: number;
}
