import { ServiceRegistry } from './serviceRegistryImpl';
import { ServiceProxy } from '../services/ServiceProxy';
import { WebSocketGateway } from '../services/WebSocketGateway';

export const gatewayRegistry = new ServiceRegistry();
export const gatewayProxy = new ServiceProxy();

let wsGatewayInstance: WebSocketGateway | null = null;

export function setWsGateway(gateway: WebSocketGateway): void {
  wsGatewayInstance = gateway;
}

export function getWsGateway(): WebSocketGateway | null {
  return wsGatewayInstance;
}
