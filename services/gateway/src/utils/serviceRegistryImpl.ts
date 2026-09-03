import { ServiceDefinition, ServiceHealth } from './serviceRegistry';

export type { ServiceDefinition, ServiceHealth };

export class ServiceRegistry {
  private services: Map<string, ServiceDefinition> = new Map();

  register(service: ServiceDefinition): void {
    this.services.set(service.id, service);
  }

  unregister(id: string): boolean {
    return this.services.delete(id);
  }

  get(id: string): ServiceDefinition | undefined {
    return this.services.get(id);
  }

  list(): ServiceDefinition[] {
    return Array.from(this.services.values());
  }
}
