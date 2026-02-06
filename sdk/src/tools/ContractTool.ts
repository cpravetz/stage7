import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ContractTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ContractTool',
      description: 'Generates and manages vendor contracts and agreements.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the contract tool.',
            enum: ['generateAgreements', 'trackContractStatus', 'manageSignatures', 'archiveCompletedContracts'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific contract action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async generateAgreements(
    vendorDetails: any,
    conversationId: string,
    options?: {
      templateType?: string;
      includeNDA?: boolean;
      currency?: string;
      language?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateAgreements',
        payload: {
          vendorDetails,
          template_type: options?.templateType,
          include_nda: options?.includeNDA,
          currency: options?.currency,
          language: options?.language,
        },
      },
      conversationId
    );
  }

  public async trackContractStatus(
    contractIds: string[],
    conversationId: string,
    options?: {
      includePayments?: boolean;
      includeExpirations?: boolean;
      includeAmendments?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackContractStatus',
        payload: {
          contractIds,
          include_payments: options?.includePayments,
          include_expirations: options?.includeExpirations,
          include_amendments: options?.includeAmendments,
        },
      },
      conversationId
    );
  }

  public async manageSignatures(
    contractIds: string[],
    conversationId: string,
    options?: {
      sendForSignature?: boolean;
      signatureType?: string;
      reminderDays?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'manageSignatures',
        payload: {
          contractIds,
          send_for_signature: options?.sendForSignature,
          signature_type: options?.signatureType,
          reminder_days: options?.reminderDays,
        },
      },
      conversationId
    );
  }

  public async archiveCompletedContracts(
    conversationId: string,
    options?: {
      includeExpired?: boolean;
      retentionDays?: number;
      archiveLocation?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'archiveCompletedContracts',
        payload: {
          include_expired: options?.includeExpired,
          retention_days: options?.retentionDays,
          archive_location: options?.archiveLocation,
        },
      },
      conversationId
    );
  }
}
