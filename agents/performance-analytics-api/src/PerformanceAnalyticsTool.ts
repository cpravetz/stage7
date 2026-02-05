import {
  Tool,
  ICoreEngineClient,
  JsonSchema,
} from '@cktmcs/sdk';
import axios from 'axios';
import { ServiceTokenManager } from '@cktmcs/shared';

export class PerformanceAnalyticsTool extends Tool {
  private tokenManager: ServiceTokenManager;

  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'performance_analytics',
      description: 'A tool for accessing and analyzing performance data across different business domains.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            description: 'The business domain to query (e.g., "executive", "hr", "marketing", "sales").',
            enum: ['executive', 'hr', 'marketing', 'sales'],
          },
          dataType: {
            type: 'string',
            description: 'The type of data to retrieve.',
            enum: ['items', 'metrics', 'programs'],
          },
        },
        required: ['domain', 'dataType'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
              },
            },
          },
        },
      },
      coreEngineClient,
    });

    const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';
    const serviceId = 'performance-analytics-api';
    const clientSecret = process.env.PERFORMANCE_ANALYTICS_SECRET || 'stage7AuthSecret';
    this.tokenManager = ServiceTokenManager.getInstance(securityManagerUrl, serviceId, clientSecret);
  }

  private async getPerformanceData(domain: string, dataType: 'items' | 'metrics' | 'programs'): Promise<any[]> {
    try {
      const librarianUrl = process.env.LIBRARIAN_URL || 'librarian:5040';
      const response = await axios.post(
        `http://${librarianUrl}/queryData`,
        {
          collection: `performance-${domain}-${dataType}`,
          query: { domain },
          limit: 100
        },
        {
          headers: {
            'Authorization': `Bearer ${await this.tokenManager.getToken()}`
          }
        }
      );
      return response.data.data || [];
    } catch (error) {
      console.error(`Error fetching ${dataType} for domain ${domain}:`, error);
      return [];
    }
  }

  public async execute(args: { domain: string; dataType: 'items' | 'metrics' | 'programs' }, conversationId: string): Promise<any> {
    const { domain, dataType } = args;

    if (!domain || typeof domain !== 'string' || !dataType || typeof dataType !== 'string') {
      return {
        success: false,
        output: 'The "domain" and "dataType" parameters are required and must be strings.',
      };
    }

    const data = await this.getPerformanceData(domain, dataType);

    return {
      success: true,
      output: JSON.stringify(data),
    };
  }
}
