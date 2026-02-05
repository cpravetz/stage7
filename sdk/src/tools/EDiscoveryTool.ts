import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class EDiscoveryTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'EDiscoveryTool',
      description: 'Assists with electronic discovery processes for litigation support.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the e-discovery tool.',
            enum: ['processDocuments', 'identifyRelevantContent', 'generatePrivilegeLog', 'exportDiscoveryResults'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific e-discovery action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async processDocuments(
    dataset: any,
    conversationId: string,
    options?: {
      processingLevel?: 'basic' | 'intermediate' | 'advanced' | 'forensic';
      flagRelevantTerms?: boolean;
      detectPII?: boolean;
      extractMetadata?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'processDocuments',
        payload: {
          dataset,
          processingLevel: options?.processingLevel,
          flagRelevantTerms: options?.flagRelevantTerms,
          detectPII: options?.detectPII,
          extractMetadata: options?.extractMetadata,
        },
      },
      conversationId
    );
  }

  public async identifyRelevantContent(
    criteria: any,
    conversationId: string,
    options?: {
      searchMethod?: 'keyword' | 'semantic' | 'conceptual' | 'machinelearning';
      relevanceThreshold?: number;
      rankResults?: boolean;
      generateSummary?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'identifyRelevantContent',
        payload: {
          criteria,
          searchMethod: options?.searchMethod,
          relevanceThreshold: options?.relevanceThreshold,
          rankResults: options?.rankResults,
          generateSummary: options?.generateSummary,
        },
      },
      conversationId
    );
  }

  public async generatePrivilegeLog(
    conversationId: string,
    options?: {
      privilegeType?: 'attorneyClient' | 'workProduct' | 'medicalPatient' | 'all';
      includeWaiverAnalysis?: boolean;
      generateClaims?: boolean;
      formatForCourt?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generatePrivilegeLog',
        payload: {
          privilegeType: options?.privilegeType,
          includeWaiverAnalysis: options?.includeWaiverAnalysis,
          generateClaims: options?.generateClaims,
          formatForCourt: options?.formatForCourt,
        },
      },
      conversationId
    );
  }

  public async exportDiscoveryResults(
    format: string,
    conversationId: string,
    options?: {
      includeMetadata?: boolean;
      includeNativeFormats?: boolean;
      includeLOAD?: boolean;
      compressionLevel?: 'none' | 'standard' | 'maximum';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'exportDiscoveryResults',
        payload: {
          format,
          includeMetadata: options?.includeMetadata,
          includeNativeFormats: options?.includeNativeFormats,
          includeLOAD: options?.includeLOAD,
          compressionLevel: options?.compressionLevel,
        },
      },
      conversationId
    );
  }
}
