import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CRMTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CRMTool',
      description: 'Integrates with customer relationship management systems for comprehensive customer context.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the CRM tool.',
            enum: ['getCustomerContext', 'getPurchaseHistory', 'getSupportHistory', 'updateCustomerRecord'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific CRM action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async getCustomerContext(
    customerId: string,
    conversationId: string,
    options?: {
      includeLifetimeValue?: boolean;
      includeSegmentation?: boolean;
      includePreferences?: boolean;
      includeCommunicationHistory?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'getCustomerContext',
        payload: {
          customerId,
          include_lifetime_value: options?.includeLifetimeValue,
          include_segmentation: options?.includeSegmentation,
          include_preferences: options?.includePreferences,
          include_communication_history: options?.includeCommunicationHistory,
        },
      },
      conversationId
    );
  }

  public async getPurchaseHistory(
    customerId: string,
    conversationId: string,
    options?: {
      limit?: number;
      includeReturns?: boolean;
      sortBy?: 'date' | 'amount' | 'product';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'getPurchaseHistory',
        payload: {
          customerId,
          limit: options?.limit,
          include_returns: options?.includeReturns,
          sort_by: options?.sortBy,
        },
      },
      conversationId
    );
  }

  public async getSupportHistory(
    customerId: string,
    conversationId: string,
    options?: {
      includeResolved?: boolean;
      includeClosed?: boolean;
      sortBy?: 'date' | 'priority' | 'status';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'getSupportHistory',
        payload: {
          customerId,
          include_resolved: options?.includeResolved,
          include_closed: options?.includeClosed,
          sort_by: options?.sortBy,
        },
      },
      conversationId
    );
  }

  public async updateCustomerRecord(
    customerData: any,
    conversationId: string,
    options?: {
      updateSegmentation?: boolean;
      notifyCustomer?: boolean;
      auditLog?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'updateCustomerRecord',
        payload: {
          customerData,
          update_segmentation: options?.updateSegmentation,
          notify_customer: options?.notifyCustomer,
          audit_log: options?.auditLog,
        },
      },
      conversationId
    );
  }
}
