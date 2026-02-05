import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class DataCleaningTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'DataCleaningTool',
      description: 'Cleans and prepares financial data for analysis.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the data cleaning tool.',
            enum: ['cleanData', 'validateData', 'normalizeData', 'handleMissingValues'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific data cleaning action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async cleanData(
    rawData: any,
    conversationId: string,
    options?: {
      cleaningMethods?: ('removeOutliers' | 'fillMissing' | 'deduplication' | 'standardization')[];
      reportIssuesFound?: boolean;
      preserveOriginal?: boolean;
      aggressiveCleaning?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'cleanData',
        payload: {
          rawData,
          cleaningMethods: options?.cleaningMethods,
          reportIssuesFound: options?.reportIssuesFound,
          preserveOriginal: options?.preserveOriginal,
          aggressiveCleaning: options?.aggressiveCleaning,
        },
      },
      conversationId
    );
  }

  public async validateData(
    data: any,
    conversationId: string,
    options?: {
      validationRules?: ('schema' | 'range' | 'format' | 'consistency' | 'referentialIntegrity')[];
      strictMode?: boolean;
      generateReport?: boolean;
      flagErrors?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'validateData',
        payload: {
          data,
          validationRules: options?.validationRules,
          strictMode: options?.strictMode,
          generateReport: options?.generateReport,
          flagErrors: options?.flagErrors,
        },
      },
      conversationId
    );
  }

  public async normalizeData(
    data: any,
    conversationId: string,
    options?: {
      normalizationMethod?: 'minMax' | 'standardization' | 'percentileRank' | 'robust';
      targetScale?: 'zeroOne' | 'negOneOne' | 'custom';
      preserveOutliers?: boolean;
      generateScalingFactors?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'normalizeData',
        payload: {
          data,
          normalizationMethod: options?.normalizationMethod,
          targetScale: options?.targetScale,
          preserveOutliers: options?.preserveOutliers,
          generateScalingFactors: options?.generateScalingFactors,
        },
      },
      conversationId
    );
  }

  public async handleMissingValues(
    data: any,
    conversationId: string,
    options?: {
      strategy?: 'drop' | 'mean' | 'median' | 'interpolate' | 'forwardFill' | 'backFill';
      threshold?: number;
      reportRemovedRecords?: boolean;
      flagedImputationMethods?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'handleMissingValues',
        payload: {
          data,
          strategy: options?.strategy,
          threshold: options?.threshold,
          reportRemovedRecords: options?.reportRemovedRecords,
          flagedImputationMethods: options?.flagedImputationMethods,
        },
      },
      conversationId
    );
  }
}
