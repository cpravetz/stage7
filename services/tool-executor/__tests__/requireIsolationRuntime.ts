import fs from 'fs';

/**
 * Plugin isolation tests execute generated plugins through the bwrap sandbox
 * (see `isolatedCommand` in ../src/executors/CodeExecutor.ts). CodeExecutor
 * fails closed when that runtime is absent, but PluginGenerator converts the
 * throw into a bare `result.success === false`, which surfaces only as opaque
 * assertion failures deep inside plugin tests. Suites that exercise the real
 * isolation path call this from `beforeAll` so a missing runtime fails the
 * suite immediately, naming the dependency — loudly, not as a silent skip.
 */
export function requireIsolationRuntime(): void {
  if (process.platform !== 'linux') {
    throw new Error(
      'Plugin isolation tests require Linux: CodeExecutor sandboxes generated plugins with bubblewrap and prlimit.',
    );
  }
  const missing = ['/usr/bin/bwrap', '/usr/bin/prlimit'].filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(
      `Plugin isolation tests require the sandbox runtime, which is missing: ${missing.join(', ')}. `
        + 'Install bubblewrap (Debian/Ubuntu: sudo apt-get install bubblewrap; Fedora: sudo dnf install bubblewrap). '
        + 'CodeExecutor refuses plugin execution without it, so these tests cannot pass.',
    );
  }
}
