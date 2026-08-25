import express from 'express';

/**
 * HealthCheckManager class handles health check endpoints
 */
export class HealthCheckManager {
  private app: express.Express;
  private mqClient: any;
  private serviceDiscovery: any;
  private components: Map<string, any>;
  private componentsByType: Map<string, Set<string>>;
  private componentType: string;

  constructor(
    app: express.Express,
    mqClient: any,
    serviceDiscovery: any,
    components: Map<string, any>,
    componentsByType: Map<string, Set<string>>,
    componentType: string
  ) {
    this.app = app;
    this.mqClient = mqClient;
    this.serviceDiscovery = serviceDiscovery;
    this.components = components;
    this.componentsByType = componentsByType;
    this.componentType = componentType;
  }

  /**
   * Set up health check endpoints
   */
  setupHealthCheck(): void {
    // Simple health endpoint that always responds with 200 (liveness check)
    this.app.get('/healthy', (_req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'PostOffice service is running'
      });
    });

    // Readiness check endpoint - returns 200 only if RabbitMQ is connected
    this.app.get('/ready', async (req, res) => {
      try {
        // Check if detailed information is requested
        const detail = req.query.detail === 'full';

        // Check if RabbitMQ is connected
        const rabbitMQConnected = this.mqClient && this.mqClient.isConnected();

        // If we have a connection, perform an active test to verify it's working properly
        let rabbitMQWorking = false;
        if (rabbitMQConnected) {
          try {
            rabbitMQWorking = await this.mqClient.testConnection();
          } catch (error) {
            console.error('Error testing RabbitMQ connection:', error instanceof Error ? error.message : 'Unknown error');
          }
        }

        const consulRegistered = this.serviceDiscovery?.isRegistered(this.componentType) || false;

        // For PostOffice, we consider it ready if either:
        // 1. RabbitMQ is fully connected and working
        // 2. We're in a special case where we need to allow services to register even without RabbitMQ

        // Check if we should allow readiness even without RabbitMQ (for bootstrapping)
        const allowReadyWithoutRabbitMQ = process.env.ALLOW_READY_WITHOUT_RABBITMQ === 'true';

        // Prepare the response based on the current state
        let statusCode: number;
        let responseBody: any;

        if (rabbitMQConnected && rabbitMQWorking) {
          // Normal case - RabbitMQ is connected and working
          statusCode = 200;
          responseBody = {
            ready: true,
            rabbitMQ: 'connected and working',
            serviceDiscovery: consulRegistered ? 'registered' : 'not registered',
            message: 'PostOffice is fully operational'
          };
        } else if (allowReadyWithoutRabbitMQ) {
          // Special case - allow readiness for bootstrapping
          console.warn('PostOffice reporting ready despite RabbitMQ issues (ALLOW_READY_WITHOUT_RABBITMQ=true)');
          statusCode = 200;
          responseBody = {
            ready: true,
            rabbitMQ: rabbitMQConnected ? 'connected but not working' : 'disconnected',
            serviceDiscovery: consulRegistered ? 'registered' : 'not registered',
            message: 'PostOffice is ready in limited mode (RabbitMQ issues detected)'
          };
        } else {
          // Not ready - RabbitMQ is not connected or not working
          const reason = !rabbitMQConnected ? 'disconnected' : 'connected but not working properly';
          statusCode = 503;
          responseBody = {
            ready: false,
            rabbitMQ: reason,
            serviceDiscovery: consulRegistered ? 'registered' : 'not registered',
            message: `PostOffice is not ready - RabbitMQ is ${reason}`
          };
        }

        // Add detailed information if requested
        if (detail) {
          // Count registered services by type
          const servicesByType: Record<string, number> = {};
          for (const [type, ids] of this.componentsByType.entries()) {
            servicesByType[type] = ids.size;
          }

          responseBody.details = {
            timestamp: new Date().toISOString(),
            status: (rabbitMQConnected && rabbitMQWorking) ? 'healthy' : 'degraded',
            services: {
              rabbitMQ: rabbitMQConnected ? (rabbitMQWorking ? 'connected and working' : 'connected but not working') : 'disconnected',
              serviceDiscovery: consulRegistered ? 'registered' : 'not registered',
              registeredComponents: this.components.size,
              servicesByType
            }
          };
        }

        res.status(statusCode).json(responseBody);
      } catch (error) {
        // In case of unexpected errors, log them but don't report as ready
        console.error('Error in readiness check:', error instanceof Error ? error.message : 'Unknown error');
        res.status(503).json({
          ready: false,
          message: 'PostOffice encountered an error during readiness check',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Redirect /health to /ready?detail=full for backward compatibility
    this.app.get('/health', (req, res) => {
      // Add detail=full query parameter and redirect to /ready
      const url = new URL(`http://${req.headers.host}/ready`);
      url.searchParams.append('detail', 'full');

      // Use a 307 Temporary Redirect to preserve the HTTP method
      res.redirect(307, url.pathname + url.search);
    });
  }
}
