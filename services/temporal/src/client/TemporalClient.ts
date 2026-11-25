/**
 * Thin wrapper over the Temporal workflow connection.
 *
 * This class owns exactly the four workflow primitives — start, query, signal,
 * cancel — and nothing else. Mission lifecycle, persistence, and recovery live
 * in MissionClient, which composes these primitives; the boundary here means
 * the mission machinery never touches the Temporal connection directly.
 *
 * The connection is optional: this deployment runs workflows in-process
 * ("artifacts-backed-direct"), so when no Temporal connection is wired the
 * primitives resolve to null/undefined and callers fall back to their
 * in-process paths.
 */
export interface TemporalConnection {
  workflow: {
    start: (workflowType: string, options: Record<string, unknown>) => Promise<unknown>;
    query?: (handle: string, operation: string, ...args: unknown[]) => Promise<unknown>;
    signal?: (handle: string, signalName: string, ...args: unknown[]) => Promise<void>;
    cancel?: (handle: string) => Promise<void>;
  };
}

export class TemporalClient {
  /** Optional durable Temporal connection; unset in in-process deployments. */
  private client?: TemporalConnection;

  /**
   * Starts a workflow durably. Resolves to null when no Temporal connection is
   * wired — the caller's signal to use its in-process fallback — and to the
   * connection's own result (or rejection) otherwise.
   */
  async start(workflowType: string, options: Record<string, unknown>): Promise<unknown | null> {
    const start = this.client?.workflow?.start;
    if (typeof start !== 'function') return null;
    return start.call(this.client!.workflow, workflowType, options);
  }

  /** Queries a running workflow; undefined when no connection is wired. */
  async query(handle: string, operation: string, ...args: unknown[]): Promise<unknown | undefined> {
    const query = this.client?.workflow?.query;
    if (!query) return undefined;
    return query.call(this.client!.workflow, handle, operation, ...args);
  }

  /** Signals a running workflow; undefined when no connection is wired. */
  async signal(handle: string, signalName: string, ...args: unknown[]): Promise<void | undefined> {
    const signal = this.client?.workflow?.signal;
    if (!signal) return undefined;
    return signal.call(this.client!.workflow, handle, signalName, ...args);
  }

  /** Cancels a running workflow; undefined when no connection is wired. */
  async cancel(handle: string): Promise<void | undefined> {
    const cancel = this.client?.workflow?.cancel;
    if (!cancel) return undefined;
    return cancel.call(this.client!.workflow, handle);
  }
}
