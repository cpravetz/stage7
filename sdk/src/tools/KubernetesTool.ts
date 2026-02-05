import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface PodStatus {
  name: string;
  namespace: string;
  phase: string;
  ready: string;
  restartCount: number;
  age: string;
  containers: Array<{
    name: string;
    image: string;
    resources?: any;
  }>;
  conditions?: any[];
}

interface VulnerabilityReport {
  image: string;
  scanned_at: string;
  vulnerability_count: number;
  severity_breakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  vulnerabilities: Array<{
    id: string;
    severity: string;
    package: string;
    version: string;
  }>;
  recommendation: string;
}

interface ClusterHealth {
  timestamp: string;
  total_nodes: number;
  healthy_nodes: number;
  unhealthy_nodes: number;
  health_score: number;
  status: string;
  nodes: any[];
}

export class KubernetesTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'KubernetesTool',
      description: 'Kubernetes cluster monitoring and orchestration. Monitors pod health, container image vulnerabilities, resource utilization, and cluster diagnostics.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The Kubernetes monitoring action to perform.',
            enum: [
              'get_pod_status',
              'scan_image_vulnerabilities',
              'get_resource_utilization',
              'get_cluster_health',
              'identify_at_risk_pods',
              'get_namespace_summary'
            ],
          },
          namespace: {
            type: 'string',
            description: 'Kubernetes namespace to query. Defaults to "default".',
          },
          pod_name: {
            type: 'string',
            description: 'Specific pod name to query.',
          },
          image: {
            type: 'string',
            description: 'Container image URI to scan (format: registry/image:tag).',
          },
          severity_threshold: {
            type: 'string',
            description: 'Minimum vulnerability severity to report: low, medium, high, critical.',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          resource_threshold_percent: {
            type: 'number',
            description: 'Percentage threshold for resource alerts (0-100). Defaults to 80.',
          },
        },
        required: ['action'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
   * Get status of pods in a namespace.
   */
  public async getPodStatus(
    namespace: string = 'default',
    podName?: string,
    conversationId?: string,
    options?: {
      clusterName?: string;
      region?: string;
      environment?: string;
      deploymentName?: string;
    }
  ): Promise<PodStatus[] & { toolType: 'kubernetes' }> {
    const result = await this.execute(
      {
        action: 'get_pod_status',
        payload: {
          namespace,
          pod_name: podName,
          cluster_name: options?.clusterName,
          region: options?.region,
          environment: options?.environment,
          deployment_name: options?.deploymentName,
        },
      },
      conversationId || ''
    );
    return Array.isArray(result)
      ? (result.map((r: any) => ({ ...r, toolType: 'kubernetes' })) as any)
      : ({ ...result, toolType: 'kubernetes' } as any);
  }

  /**
   * Scan container image for vulnerabilities.
   */
  public async scanImageVulnerabilities(
    image: string,
    severityThreshold: string = 'high',
    conversationId?: string,
    options?: {
      registryType?: string;
      scanPolicy?: string;
      includeOS?: boolean;
    }
  ): Promise<VulnerabilityReport & { toolType: 'kubernetes' }> {
    const result = await this.execute(
      {
        action: 'scan_image_vulnerabilities',
        payload: {
          image,
          severity_threshold: severityThreshold,
          registry_type: options?.registryType,
          scan_policy: options?.scanPolicy,
          include_os: options?.includeOS,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'kubernetes' };
  }

  /**
   * Get resource utilization across cluster or namespace.
   */
  public async getResourceUtilization(
    namespace?: string,
    thresholdPercent: number = 80,
    conversationId?: string,
    options?: {
      clusterName?: string;
      resourceType?: string;
      includeProjectedUsage?: boolean;
    }
  ): Promise<any & { toolType: 'kubernetes' }> {
    const result = await this.execute(
      {
        action: 'get_resource_utilization',
        payload: {
          namespace,
          resource_threshold_percent: thresholdPercent,
          cluster_name: options?.clusterName,
          resource_type: options?.resourceType,
          include_projected_usage: options?.includeProjectedUsage,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'kubernetes' };
  }

  /**
   * Get overall cluster health status.
   */
  public async getClusterHealth(
    conversationId?: string,
    options?: {
      clusterName?: string;
      includeNodeStatus?: boolean;
      includeNetworkStatus?: boolean;
      includePersistentVolumes?: boolean;
    }
  ): Promise<ClusterHealth & { toolType: 'kubernetes' }> {
    const result = await this.execute(
      {
        action: 'get_cluster_health',
        payload: {
          cluster_name: options?.clusterName,
          include_node_status: options?.includeNodeStatus,
          include_network_status: options?.includeNetworkStatus,
          include_persistent_volumes: options?.includePersistentVolumes,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'kubernetes' };
  }

  /**
   * Identify pods at risk due to resource constraints or pending states.
   */
  public async identifyAtRiskPods(
    namespace: string = 'default',
    conversationId?: string,
    options?: {
      clusterName?: string;
      riskLevel?: 'low' | 'medium' | 'high' | 'critical';
      includeSchedulingIssues?: boolean;
    }
  ): Promise<any[] & { toolType: 'kubernetes' }> {
    const result = await this.execute(
      {
        action: 'identify_at_risk_pods',
        payload: {
          namespace,
          cluster_name: options?.clusterName,
          risk_level: options?.riskLevel,
          include_scheduling_issues: options?.includeSchedulingIssues,
        },
      },
      conversationId || ''
    );
    return Array.isArray(result)
      ? (result.map((r: any) => ({ ...r, toolType: 'kubernetes' })) as any)
      : (result as any);
  }

  /**
   * Get aggregated metrics for a namespace.
   */
  public async getNamespaceSummary(
    namespace: string = 'default',
    conversationId?: string,
    options?: {
      clusterName?: string;
      environment?: string;
      includeWorkloads?: boolean;
    }
  ): Promise<any & { toolType: 'kubernetes' }> {
    const result = await this.execute(
      {
        action: 'get_namespace_summary',
        payload: {
          namespace,
          cluster_name: options?.clusterName,
          environment: options?.environment,
          include_workloads: options?.includeWorkloads,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'kubernetes' };
  }
}
