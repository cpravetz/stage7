import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CarePlanTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CarePlanTool',
      description: 'Creates and manages comprehensive patient care plans across multiple providers and treatment modalities.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the care plan tool.',
            enum: ['generatePlan', 'updateCarePlan', 'coordinateProviders', 'trackPlanProgress', 'generateCareSummary'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific care plan action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async generatePlan(
    diagnosis: string,
    treatmentGoals: any,
    conversationId: string,
    options?: {
      planType?: 'diagnosis_specific' | 'preventive' | 'chronic_management' | 'post_acute';
      duration?: '7days' | '30days' | '90days' | 'ongoing';
      stakeholders?: ('patient' | 'caregiver' | 'provider' | 'insurance')[];
      inclusionItems?: ('medications' | 'appointments' | 'tests' | 'lifestyle' | 'monitoring')[];
      riskLevel?: 'low' | 'moderate' | 'high';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generatePlan',
        payload: {
          diagnosis,
          treatmentGoals,
          planType: options?.planType,
          duration: options?.duration,
          stakeholders: options?.stakeholders,
          inclusionItems: options?.inclusionItems,
          riskLevel: options?.riskLevel,
        },
      },
      conversationId
    );
  }

  public async updateCarePlan(
    newData: any,
    conversationId: string,
    options?: {
      updateType?: 'clinical_data' | 'goals' | 'timeline' | 'medications' | 'appointments';
      notifyStakeholders?: boolean;
      reviewRequired?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'updateCarePlan',
        payload: {
          newData,
          updateType: options?.updateType,
          notifyStakeholders: options?.notifyStakeholders,
          reviewRequired: options?.reviewRequired,
        },
      },
      conversationId
    );
  }

  public async coordinateProviders(
    careTeam: string[],
    conversationId: string,
    options?: {
      communicationMethods?: ('email' | 'fax' | 'api' | 'message')[];
      includeScheduling?: boolean;
      includeBilling?: boolean;
      coordinationType?: 'consultation' | 'shared_management' | 'co_treatment';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'coordinateProviders',
        payload: {
          careTeam,
          communicationMethods: options?.communicationMethods,
          includeScheduling: options?.includeScheduling,
          includeBilling: options?.includeBilling,
          coordinationType: options?.coordinationType,
        },
      },
      conversationId
    );
  }

  public async trackPlanProgress(
    patientId: string,
    conversationId: string,
    options?: {
      timeWindow?: '7days' | '30days' | '90days' | 'quarter';
      metricsToTrack?: ('adherence' | 'outcomes' | 'safety' | 'satisfaction')[];
      generateReport?: boolean;
      alertOnDeviation?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackPlanProgress',
        payload: {
          patientId,
          timeWindow: options?.timeWindow,
          metricsToTrack: options?.metricsToTrack,
          generateReport: options?.generateReport,
          alertOnDeviation: options?.alertOnDeviation,
        },
      },
      conversationId
    );
  }

  public async generateCareSummary(
    conversationId: string,
    options?: {
      summaryType?: 'for_patient' | 'for_provider' | 'for_insurance' | 'comprehensive';
      includeHistory?: boolean;
      includePredictions?: boolean;
      format?: 'narrative' | 'structured' | 'checklist';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateCareSummary',
        payload: {
          summaryType: options?.summaryType,
          includeHistory: options?.includeHistory,
          includePredictions: options?.includePredictions,
          format: options?.format,
        },
      },
      conversationId
    );
  }
}
