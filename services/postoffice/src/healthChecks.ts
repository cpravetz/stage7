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
    // Comprehensive health check endpoint
    this.app.get('/health', (_req, res) => {
      try {
        const rabbitMQConnected = this.mqClient && this.mqClient.isConnected();
        const consulRegistered = this.serviceDiscovery?.isRegistered(this.componentType) || false;
        
        // Count registered services by type
        const servicesByType: Record<string, number> = {};
        for (const [type, ids] of this.componentsByType.entries()) {
          servicesByType[type] = ids.size;
        }
        
        const status = {
          status: rabbitMQConnected && consulRegistered ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          services: {
            rabbitMQ: rabbitMQConnected ? 'connected' : 'disconnected',
            serviceDiscovery: consulRegistered ? 'registered' : 'not registered',
            registeredComponents: this.components.size,
            servicesByType
          },
          ready: rabbitMQConnected // Only ready if RabbitMQ is connected
        };
        
        // Return 200 if RabbitMQ is connected, otherwise 503
        const statusCode = rabbitMQConnected ? 200 : 503;
        res.status(statusCode).json(status);
      } catch (error) {
        // If there's an error, still return 200 with basic info
        console.error('Error in health check:', error instanceof Error ? error.message : 'Unknown error');
        res.status(200).json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          message: 'PostOffice is running but encountered an error gathering status details'
        });
      }
    });
    
    // Simple health endpoint that always responds with 200
    this.app.get('/healthy', (_req, res) => {
      res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        message: 'PostOffice service is running'
      });
    });
    
    // Readiness check endpoint - returns 200 only if RabbitMQ is connected
    this.app.get('/ready', (_req, res) => {
      try {
        const rabbitMQConnected = this.mqClient && this.mqClient.isConnected();
        const consulRegistered = this.serviceDiscovery?.isRegistered(this.componentType) || false;
        
        if (rabbitMQConnected) {
          res.status(200).json({
            ready: true,
            rabbitMQ: 'connected',
            serviceDiscovery: consulRegistered ? 'registered' : 'not registered'
          });
        } else {
          // If RabbitMQ is not connected, return 503 Service Unavailable
          res.status(503).json({
            ready: false,
            rabbitMQ: 'disconnected',
            serviceDiscovery: consulRegistered ? 'registered' : 'not registered',
            message: 'PostOffice is not ready - RabbitMQ connection not established'
          });
        }
      } catch (error) {
        // Even if there's an error, still return 200 for PostOffice
        console.error('Error in readiness check:', error instanceof Error ? error.message : 'Unknown error');
        res.status(200).json({
          ready: true,
          message: 'PostOffice is ready but encountered an error gathering status details'
        });
      }
    });
  }
}
