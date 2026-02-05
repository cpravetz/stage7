import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class EventMonitorTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'EventMonitorTool',
      description: 'Real-time event monitoring and issue detection system.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the event monitor tool.',
            enum: ['trackVendorArrivals', 'monitorSetupProgress', 'detectPotentialIssues', 'generateStatusReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific event monitor action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async trackVendorArrivals(
    vendorList: any[],
    conversationId: string,
    options?: {
      updateFrequency?: 'realtime' | 'periodic' | 'on_demand';
      alertOnDelay?: boolean;
      delayThreshold?: number;
      notifyCoordinators?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackVendorArrivals',
        payload: {
          vendorList,
          updateFrequency: options?.updateFrequency,
          alertOnDelay: options?.alertOnDelay,
          delayThreshold: options?.delayThreshold,
          notifyCoordinators: options?.notifyCoordinators,
        },
      },
      conversationId
    );
  }

  public async monitorSetupProgress(
    timeline: any,
    conversationId: string,
    options?: {
      trackBy?: 'phase' | 'vendor' | 'station' | 'department';
      completionThreshold?: number;
      flagIssues?: boolean;
      includeProjections?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'monitorSetupProgress',
        payload: {
          timeline,
          trackBy: options?.trackBy,
          completionThreshold: options?.completionThreshold,
          flagIssues: options?.flagIssues,
          includeProjections: options?.includeProjections,
        },
      },
      conversationId
    );
  }

  public async detectPotentialIssues(
    conversationId: string,
    options?: {
      issueCategories?: ('timing' | 'resource' | 'coordination' | 'safety' | 'quality')[];
      severity?: 'critical' | 'high' | 'medium' | 'all';
      generateAlerts?: boolean;
      suggestActions?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'detectPotentialIssues',
        payload: {
          issueCategories: options?.issueCategories,
          severity: options?.severity,
          generateAlerts: options?.generateAlerts,
          suggestActions: options?.suggestActions,
        },
      },
      conversationId
    );
  }

  public async generateStatusReport(
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'executive' | 'operational';
      includeForecasts?: boolean;
      includeBudget?: boolean;
      includeSafety?: boolean;
      frequency?: 'hourly' | 'periodic' | 'on_demand';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateStatusReport',
        payload: {
          reportFormat: options?.reportFormat,
          includeForecasts: options?.includeForecasts,
          includeBudget: options?.includeBudget,
          includeSafety: options?.includeSafety,
          frequency: options?.frequency,
        },
      },
      conversationId
    );
  }
}
