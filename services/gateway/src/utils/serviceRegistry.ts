export interface ServiceDefinition {
  id: string;
  name: string;
  baseUrl: string;
  healthPath?: string;
  timeoutMs?: number;
}

export interface ServiceHealth {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastChecked: number;
}
