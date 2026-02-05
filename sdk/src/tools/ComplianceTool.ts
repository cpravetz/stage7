import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ComplianceTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ComplianceTool',
      description: 'Ensures hiring process compliance with regulations and company policies.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the compliance tool.',
            enum: ['checkCompliance', 'auditHiringProcess', 'generateComplianceReports', 'flagPotentialIssues'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific compliance action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async checkCompliance(
    jobData: any,
    conversationId: string,
    options?: {
      regulationTypes?: ('eeoc' | 'ada' | 'gdpr' | 'complianceLocal' | 'companyPolicy')[];
      flagIssues?: boolean;
      provideRecommendations?: boolean;
      jurisdictionSpecific?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'checkCompliance',
        payload: {
          jobData,
          regulationTypes: options?.regulationTypes,
          flagIssues: options?.flagIssues,
          provideRecommendations: options?.provideRecommendations,
          jurisdictionSpecific: options?.jurisdictionSpecific,
        },
      },
      conversationId
    );
  }

  public async auditHiringProcess(
    jobId: string,
    conversationId: string,
    options?: {
      auditScope?: 'full' | 'focused' | 'quickCheck';
      includeDocumentation?: boolean;
      identifyGaps?: boolean;
      generateReport?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'auditHiringProcess',
        payload: {
          jobId,
          auditScope: options?.auditScope,
          includeDocumentation: options?.includeDocumentation,
          identifyGaps: options?.identifyGaps,
          generateReport: options?.generateReport,
        },
      },
      conversationId
    );
  }

  public async generateComplianceReports(
    timeRange: any,
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'executive';
      includeHistorical?: boolean;
      compareToRegulations?: boolean;
      includeRecommendations?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateComplianceReports',
        payload: {
          timeRange,
          reportFormat: options?.reportFormat,
          includeHistorical: options?.includeHistorical,
          compareToRegulations: options?.compareToRegulations,
          includeRecommendations: options?.includeRecommendations,
        },
      },
      conversationId
    );
  }

  public async flagPotentialIssues(
    candidateData: any,
    conversationId: string,
    options?: {
      issueCategories?: ('discrimination' | 'fairness' | 'documentation' | 'timing' | 'policy')[];
      severityThreshold?: 'low' | 'medium' | 'high';
      suggestRemediations?: boolean;
      flagForReview?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'flagPotentialIssues',
        payload: {
          candidateData,
          issueCategories: options?.issueCategories,
          severityThreshold: options?.severityThreshold,
          suggestRemediations: options?.suggestRemediations,
          flagForReview: options?.flagForReview,
        },
      },
      conversationId
    );
  }
}
