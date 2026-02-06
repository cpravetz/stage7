import { Tool, HttpCoreEngineClient, JsonSchema } from '../index';

interface IaCMonitoringData {
  total_resources: number;
  drift_detected: number;
  compliant_resources: number;
  non_compliant_resources: number;
  last_scan: string;
  tools: any;
  highest_risk_drifts: any[];
}

export class IaCMonitoringTool extends Tool {
  constructor(client: HttpCoreEngineClient) {
    super({
      name: 'IaCMonitoringTool',
      description: 'Infrastructure as Code monitoring. Detects Terraform and CloudFormation drift, policy compliance, and configuration drift.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform.',
            enum: ['scan_drift', 'get_compliance_status', 'identify_non_compliant_resources', 'get_drift_history'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific action.',
            properties: {
              tool: {
                type: 'string',
                description: 'IaC tool: terraform, cloudformation',
                enum: ['terraform', 'cloudformation', 'both'],
              },
              workspace: {
                type: 'string',
                description: 'Terraform workspace or CloudFormation stack name',
              },
              severity_threshold: {
                type: 'string',
                description: 'Filter by severity: critical, high, medium, low',
                enum: ['critical', 'high', 'medium', 'low'],
              },
            },
          },
        },
        required: ['action'],
      } as JsonSchema,
      coreEngineClient: client,
    });
  }

  public async scanDrift(
    tool: 'terraform' | 'cloudformation' | 'both',
    workspace?: string,
    conversationId?: string,
    options?: {
      environment?: string;
      autoRemediate?: boolean;
      includeNetworkChanges?: boolean;
    }
  ): Promise<any> {
    const payload: any = {
      tool,
      environment: options?.environment,
      auto_remediate: options?.autoRemediate,
      include_network_changes: options?.includeNetworkChanges,
    };
    if (workspace) payload.workspace = workspace;
    const result = await this.execute({ action: 'scan_drift', payload }, conversationId);
    return result.iac_status || {};
  }

  public async getComplianceStatus(
    tool: 'terraform' | 'cloudformation' | 'both',
    conversationId?: string,
    options?: {
      complianceFramework?: string;
      environment?: string;
    }
  ): Promise<any> {
    const result = await this.execute(
      {
        action: 'get_compliance_status',
        payload: {
          tool,
          compliance_framework: options?.complianceFramework,
          environment: options?.environment,
        },
      },
      conversationId
    );
    return result.compliance_status || {};
  }

  public async identifyNonCompliantResources(
    severity: string = 'high',
    conversationId?: string,
    options?: {
      resourceTypes?: string[];
      environment?: string;
    }
  ): Promise<any> {
    const result = await this.execute(
      {
        action: 'identify_non_compliant_resources',
        payload: {
          severity_threshold: severity,
          resource_types: options?.resourceTypes,
          environment: options?.environment,
        },
      },
      conversationId
    );
    return result.non_compliant || [];
  }

  public async getDriftHistory(
    tool: 'terraform' | 'cloudformation' | 'both',
    conversationId?: string,
    options?: {
      workspace?: string;
      daysBack?: number;
      environment?: string;
    }
  ): Promise<any> {
    const result = await this.execute(
      {
        action: 'get_drift_history',
        payload: {
          tool,
          workspace: options?.workspace,
          days_back: options?.daysBack,
          environment: options?.environment,
        },
      },
      conversationId
    );
    return result.drift_history || [];
  }

  public async execute(args: any, conversationId?: string): Promise<any> {
    console.warn(`IaCMonitoringTool executing action: ${args.action}`);
    return { iac_status: { total_resources: 0, drift_detected: 0 } };
  }
}
