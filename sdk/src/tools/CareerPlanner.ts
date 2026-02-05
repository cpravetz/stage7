import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CareerPlanner extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CareerPlanner',
      description: 'Evaluates career trajectories, identifies advancement opportunities, and creates strategic career development plans.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the career planner.',
            enum: ['assessTrajectory', 'identifyOpportunities', 'analyzeCareerPathways', 'generateCareerReport', 'modelCareerScenarios'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific career planning action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async assessTrajectory(
    careerData: any,
    conversationId: string,
    options?: {
      currentRole?: string;
      yearsOfExperience?: number;
      industry?: string;
      targetRole?: string;
      skills?: string[];
      education?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'assessTrajectory',
        payload: {
          careerData,
          currentRole: options?.currentRole,
          yearsOfExperience: options?.yearsOfExperience,
          industry: options?.industry,
          targetRole: options?.targetRole,
          skills: options?.skills,
          education: options?.education,
        },
      },
      conversationId
    );
  }

  public async identifyOpportunities(
    conversationId: string,
    options?: {
      currentRole?: string;
      industry?: string;
      skills?: string[];
      careerGoals?: string[];
      geography?: string;
      yearsOfExperience?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'identifyOpportunities',
        payload: {
          currentRole: options?.currentRole,
          industry: options?.industry,
          skills: options?.skills,
          careerGoals: options?.careerGoals,
          geography: options?.geography,
          yearsOfExperience: options?.yearsOfExperience,
        },
      },
      conversationId
    );
  }

  public async analyzeCareerPathways(
    conversationId: string,
    options?: {
      currentRole?: string;
      targetRole?: string;
      industry?: string;
      timeline?: string;
      skillDevelopmentPreferences?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeCareerPathways',
        payload: {
          currentRole: options?.currentRole,
          targetRole: options?.targetRole,
          industry: options?.industry,
          timeline: options?.timeline,
          skillDevelopmentPreferences: options?.skillDevelopmentPreferences,
        },
      },
      conversationId
    );
  }

  public async generateCareerReport(
    conversationId: string,
    options?: {
      currentRole?: string;
      targetRole?: string;
      industry?: string;
      includeMetrics?: string[];
      format?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateCareerReport',
        payload: {
          currentRole: options?.currentRole,
          targetRole: options?.targetRole,
          industry: options?.industry,
          includeMetrics: options?.includeMetrics,
          format: options?.format,
        },
      },
      conversationId
    );
  }

  public async modelCareerScenarios(
    conversationId: string,
    options?: {
      scenarios?: Array<{ name: string; parameters: any }>;
      currentRole?: string;
      targetRole?: string;
      timeframe?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'modelCareerScenarios',
        payload: {
          scenarios: options?.scenarios,
          currentRole: options?.currentRole,
          targetRole: options?.targetRole,
          timeframe: options?.timeframe,
        },
      },
      conversationId
    );
  }
}
