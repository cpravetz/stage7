import { CodeExecutor } from '../executors/CodeExecutor';
import type {
  CodeExecutionOptions,
  CodeExecutionResult,
  CodeExecutorCredentials,
} from '../executors/CodeExecutor';
import type { SandboxExecutionDriver } from './SandboxExecutionDriver';

/** Uses the sandboxed process runner inside the tool-executor Docker container. */
export class DockerLocalDriver implements SandboxExecutionDriver {
  constructor(private readonly executor = new CodeExecutor()) {}

  execute(
    options: CodeExecutionOptions,
    credentials?: CodeExecutorCredentials | Record<string, string | undefined>,
  ): Promise<CodeExecutionResult> {
    return this.executor.execute(options, credentials);
  }
}
