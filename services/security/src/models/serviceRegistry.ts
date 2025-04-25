/**
 * Service Registry for managing service credentials and roles
 */

export interface ServiceCredential {
  id: string;
  secret: string;
  roles: string[];
}

// Define service types and their credentials
const serviceRegistry: Record<string, ServiceCredential> = {
  'ConfigService': {
    id: 'ConfigService',
    secret: process.env.CONFIG_SERVICE_SECRET || 'stage7AuthSecret',
    roles: ['config:read', 'config:write']
  },
  'PostOffice': {
    id: 'PostOffice',
    secret: process.env.POSTOFFICE_SECRET || 'stage7AuthSecret',
    roles: ['message:send', 'message:receive', 'service:discover']
  },
  'MissionControl': {
    id: 'MissionControl',
    secret: process.env.MISSIONCONTROL_SECRET || 'stage7AuthSecret',
    roles: ['mission:manage', 'agent:control']
  },
  'Brain': {
    id: 'Brain',
    secret: process.env.BRAIN_SECRET || 'stage7AuthSecret',
    roles: ['llm:invoke']
  },
  'Librarian': {
    id: 'Librarian',
    secret: process.env.LIBRARIAN_SECRET || 'stage7AuthSecret',
    roles: ['data:read', 'data:write']
  },
  'Engineer': {
    id: 'Engineer',
    secret: process.env.ENGINEER_SECRET || 'stage7AuthSecret',
    roles: ['plugin:execute']
  },
  'TrafficManager': {
    id: 'TrafficManager',
    secret: process.env.TRAFFICMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['traffic:manage']
  },
  'CapabilitiesManager': {
    id: 'CapabilitiesManager',
    secret: process.env.CAPABILITIESMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['capability:manage']
  },
  'AgentSet': {
    id: 'AgentSet',
    secret: process.env.AGENTSET_SECRET || 'stage7AuthSecret',
    roles: ['agent:manage']
  },
  'Agent': {
    id: 'Agent',
    secret: process.env.AGENT_SECRET || 'stage7AuthSecret',
    roles: ['agent:execute', 'agent:communicate']
  },
  // Add other services as needed
};

/**
 * Verify component credentials against the service registry
 * @param componentType The type of component to verify
 * @param clientSecret The client secret provided by the component
 * @returns True if credentials are valid, false otherwise
 */
export async function verifyComponentCredentials(componentType: string, clientSecret: string): Promise<boolean> {
  const service = serviceRegistry[componentType];
  if (!service) {
    console.error(`Unknown service type: ${componentType}`);
    return false;
  }

  if (service.secret === clientSecret) {
    return true;
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`Development mode: accepting any client secret for ${componentType}`);
    return true;
  }

  return false;
}

/**
 * Get roles for a service
 * @param componentType The type of component
 * @returns Array of roles or empty array if service not found
 */
export function getServiceRoles(componentType: string): string[] {
  const service = serviceRegistry[componentType];
  if (!service) {
    return [];
  }
  return service.roles;
}

/**
 * Check if a service exists in the registry
 * @param componentType The type of component
 * @returns True if service exists, false otherwise
 */
export function serviceExists(componentType: string): boolean {
  return !!serviceRegistry[componentType];
}

/**
 * Get all registered services
 * @returns Array of service IDs
 */
export function getAllServices(): string[] {
  return Object.keys(serviceRegistry);
}
