/**
 * Service Registry for managing service credentials and roles
 */

export interface ServiceCredential {
  id: string;
  secret: string;
  roles: string[];
}

// Define service types and their credentials
export const serviceRegistry: Record<string, ServiceCredential> = {
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
  'ErrorHandler': {
    id: 'ErrorHandler',
    secret: process.env.ERRORHANDLER_SECRET || 'stage7AuthSecret',
    roles: ['error:assess']
  },
  'SecurityManager': {
    id: 'SecurityManager',
    secret: process.env.SECURITYMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['user:manage', 'token:manage', 'auth:manage']
  },
  'TestClient': {
    id: 'TestClient',
    secret: 'stage7AuthSecret',
    roles: ['test:run']
  },
  'ServiceDiscovery': {
    id: 'ServiceDiscovery',
    secret: process.env.CAPABILITIESMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['service:discover']
  },
  'MarketplaceMongoRepository': {
    id: 'MarketplaceMongoRepository',
    secret: process.env.CAPABILITIESMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['data:read', 'data:write']
  },
  'LibrarianDefinitionRepository': {
    id: 'LibrarianDefinitionRepository',
    secret: process.env.LIBRARIAN_SECRET || 'stage7AuthSecret',
    roles: ['data:read', 'data:write']
  },
  'CapabilitiesManagerConfig': {
    id: 'CapabilitiesManagerConfig',
    secret: process.env.CAPABILITIESMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['service:basic']
  },
  'assistant': {
    id: 'assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'career-assistant': {
    id: 'career-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'content-creator-assistant': {
    id: 'content-creator-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'cto-assistant': {
    id: 'cto-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'education-assistant': {
    id: 'education-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'event-assistant': {
    id: 'event-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'executive-assistant': {
    id: 'executive-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'finance-assistant': {
    id: 'finance-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'healthcare-assistant': {
    id: 'healthcare-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'hotel-ops-assistant': {
    id: 'hotel-ops-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'hr-assistant': {
    id: 'hr-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'legal-assistant': {
    id: 'legal-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'marketing-assistant': {
    id: 'marketing-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'performance-analytics': {
    id: 'performance-analytics',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'pm-assistant': {
    id: 'pm-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'restaurant-ops-assistant': {
    id: 'restaurant-ops-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'sales-assistant': {
    id: 'sales-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'scriptwriter-assistant': {
    id: 'scriptwriter-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'songwriter-assistant': {
    id: 'songwriter-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'sports-wager-advisor': {
    id: 'sports-wager-advisor',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'support-assistant': {
    id: 'support-assistant',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  },
  'pm-assistant-api': {
    id: 'pm-assistant-api',
    secret: 'stage7AuthSecret',
    roles: ['assistant:execute']
  }
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
