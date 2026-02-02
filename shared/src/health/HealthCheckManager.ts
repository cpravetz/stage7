import express from 'express';

export interface HealthCheckDependency {
  name: string;
  isConnected: () => boolean | Promise<boolean>;
  test?: () => Promise<boolean>;
}

/**
 * Unified HealthCheckManager class for all services
 * Provides consistent health check endpoints across the system
 */
export class HealthCheckManager {
  private app: express.Express;
  private componentType: string;
  private dependencies: Map<string, HealthCheckDependency> = new Map();
  private customReadinessCheck?: () => Promise<boolean>;

  constructor(app: express.Express, componentType: string) {
    this.app = app;
    this.componentType = componentType;
  }

  /**
   * Register a dependency to check during readiness probe
   */
  registerDependency(dependency: HealthCheckDependency): void {
    this.dependencies.set(dependency.name, dependency);
  }

  /**
   * Set a custom readiness check function
   */
  setCustomReadinessCheck(check: () => Promise<boolean>): void {
    this.customReadinessCheck = check;
  }

  /**
   * Set up all health check endpoints
   */
  setupHealthCheck(): void {
    // Liveness check - always returns 200 if process is running
    this.app.get('/healthy', (_req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: `${this.componentType} service is running`
      });
    });

    // Readiness check - returns 200 only if service is ready
    this.app.get('/ready', async (req, res) => {
      try {
        const detail = req.query.detail === 'full';
        const dependencyStatus: Record<string, any> = {};
        let allDependenciesReady = true;

        // Check all registered dependencies
        for (const [name, dependency] of this.dependencies.entries()) {
          try {
            const isConnected = dependency.isConnected();
            const connected = isConnected instanceof Promise ? await isConnected : isConnected;

            let working = connected;
            if (connected && dependency.test) {
              try {
                working = await dependency.test();
              } catch (error) {
                console.error(`Error testing ${name}:`, error instanceof Error ? error.message : 'Unknown error');
                working = false;
              }
            }

            dependencyStatus[name] = working ? 'ok' : 'failed';
            if (!working) {
              allDependenciesReady = false;
            }
          } catch (error) {
            console.error(`Error checking dependency ${name}:`, error);
            dependencyStatus[name] = 'error';
            allDependenciesReady = false;
          }
        }

        // Check custom readiness condition if provided
        let customReady = true;
        if (this.customReadinessCheck) {
          try {
            customReady = await this.customReadinessCheck();
          } catch (error) {
            console.error('Error in custom readiness check:', error);
            customReady = false;
          }
        }

        const isReady = allDependenciesReady && customReady;
        const statusCode = isReady ? 200 : 503;

        const responseBody: any = {
          ready: isReady,
          timestamp: new Date().toISOString(),
          message: isReady 
            ? `${this.componentType} is ready` 
            : `${this.componentType} is not ready`
        };

        // Add dependency status in detail mode
        if (detail || !isReady) {
          responseBody.dependencies = dependencyStatus;
          if (!isReady) {
            const failedDeps = Object.entries(dependencyStatus)
              .filter(([_, status]) => status !== 'ok')
              .map(([name]) => name);
            responseBody.failedDependencies = failedDeps;
          }
        }

        res.status(statusCode).json(responseBody);
      } catch (error) {
        console.error('Error in readiness check:', error instanceof Error ? error.message : 'Unknown error');
        res.status(503).json({
          ready: false,
          message: `${this.componentType} encountered an error during readiness check`,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Status endpoint - same as /ready for compatibility
    this.app.get('/status', async (req, res) => {
      // Redirect to /ready with detail=full
      const url = new URL(`http://${req.headers.host}/ready`);
      url.searchParams.append('detail', 'full');
      res.redirect(307, url.pathname + url.search);
    });

    // Legacy /health endpoint - redirects to /ready?detail=full
    this.app.get('/health', (req, res) => {
      const url = new URL(`http://${req.headers.host}/ready`);
      url.searchParams.append('detail', 'full');
      res.redirect(307, url.pathname + url.search);
    });
  }
}
