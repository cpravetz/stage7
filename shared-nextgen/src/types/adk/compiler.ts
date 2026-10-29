export type SkillCategory =
  | 'analytics'
  | 'career'
  | 'content'
  | 'cto'
  | 'education'
  | 'event'
  | 'executive'
  | 'finance'
  | 'general'
  | 'healthcare'
  | 'hotel'
  | 'hr'
  | 'investment'
  | 'legal'
  | 'marketing'
  | 'product'
  | 'restaurant'
  | 'sales'
  | 'scriptwriting'
  | 'songwriting'
  | 'sports'
  | 'support';

export type TrajectoryAgentRole =
  | 'Coordinator'
  | 'Researcher'
  | 'Creative'
  | 'Critic'
  | 'Executor'
  | 'Domain Expert'
  | 'Coder'
  | 'Analyst'
  | 'Product Manager';

export interface TrajectoryStep {
  stepId: string;
  agentRole: TrajectoryAgentRole;
  toolName: string;
  inputParameters: Record<string, unknown>;
  outputResult: Record<string, unknown>;
  executionDurationMs: number;
  status: 'SUCCESS' | 'FAILED';
}

export interface MissionTrajectoryLog {
  missionId: string;
  assistantId: string;
  goalDescription: string;
  steps: TrajectoryStep[];
  finalDeliverableSummary: string;
  totalTokensUsed: number;
}

export interface SkillCompilationRequest {
  trajectory: MissionTrajectoryLog;
  targetSkillName: string;
  targetCategory: SkillCategory;
  description: string;
  authorAssistantId: string;
  enforceStrictSchemas: boolean;
}

export interface CompiledADKSkillModule {
  skillId: string;
  skillName: string;
  typescriptSourceCode: string;
  inputSchemaZodRaw: string;
  outputSchemaZodRaw: string;
  environmentVariables: string[];
  timeoutMs: number;
  compilationTimestamp: string;
}
