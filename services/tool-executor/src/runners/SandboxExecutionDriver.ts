import type {
  CodeExecutionOptions,
  CodeExecutionResult,
  CodeExecutorCredentials,
} from '../executors/CodeExecutor';

export interface SandboxExecutionDriver {
  execute(
    options: CodeExecutionOptions,
    credentials?: CodeExecutorCredentials | Record<string, string | undefined>,
  ): Promise<CodeExecutionResult>;
}
