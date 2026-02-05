# Frontend Integration Guide: Models, Services, and Interfaces

## Overview

The Brain service now manages three distinct types of data, all loaded from `seedData.json` at runtime:

1. **Models** - LLM configurations (18+ models from OpenAI, Anthropic, Google, Groq, etc.)
2. **Services** - LLM provider integrations (10 services: OpenAI, Anthropic, Google, Groq, etc.)
3. **Interfaces** - Protocol adapters (10 interfaces for service communication)

## REST API Endpoints

### Model Management Endpoints

```typescript
// Get all active models with full configuration
GET /models/config
Response: {
    models: ModelConfiguration[],
    count: number
}

// Get model health status for all models
GET /models/health
Response: {
    models: ServiceHealthStatus[],
    timestamp: string
}

// Get health for specific model
GET /models/:name/health
Response: ServiceHealthStatus

// Manually trigger health check for a model
POST /models/:name/validate
Response: {
    valid: boolean,
    health: ServiceHealthStatus,
    timestamp: string
}

// Update model rollout percentage for gradual deployment
PUT /models/:name/rollout
Body: { percentage: number }
Response: { success: boolean, message: string, timestamp: string }

// Get models by interface name
GET /models/by-interface/:interfaceName
Response: {
    models: ModelConfiguration[],
    count: number
}
```

### Service Management Endpoints

```typescript
// Get all available services
GET /services
Response: {
    services: ServiceConfig[],
    count: number
}

// Get services by provider
GET /services/:provider
Response: {
    services: ServiceConfig[],
    count: number
}
```

### Interface Management Endpoints

```typescript
// Get all available interfaces
GET /interfaces
Response: {
    interfaces: InterfaceConfig[],
    count: number
}

// Get interfaces by service name
GET /interfaces/:serviceName
Response: {
    interfaces: InterfaceConfig[],
    count: number
}
```

## Data Structure Examples

### ModelConfiguration

```typescript
{
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    providerModelId: "gpt-4-turbo-2024-04-09",
    tokenLimit: 128000,
    costPer1kTokens: { input: 0.01, output: 0.03 },
    supportedConversationTypes: [
        "TextToText",
        "TextToCode",
        "TextToJSON"
    ],
    status: "active",
    rolloutPercentage: 100,
    availability: {
        status: "unknown" | "available" | "degraded" | "unavailable",
        reason: "Pending initial validation"
    },
    healthChecks: {
        endpoint: "https://api.openai.com/v1/models",
        method: "GET",
        timeout: 5000,
        frequency: 300000
    },
    sla: {
        successRateMinimum: 0.98,
        p99LatencyMs: 4000,
        availabilityPercentage: 0.99
    },
    metadata: {
        version: "1.0",
        releaseDate: "2024-04-09",
        knownLimitations: "Max 128k token context window",
        scores: {
            TextToText: { costScore: 60, accuracyScore: 95, ... },
            ...
        }
    }
}
```

### ServiceConfig

```typescript
{
    id: "openai-service",
    name: "OpenAI Service",
    serviceName: "OAService",
    provider: "openai",
    apiUrlBase: "https://api.openai.com/v1/",
    credentialName: "openai-api-key-prod",
    keyVault: "AWS_SECRETS_MANAGER",
    healthCheckEndpoint: "https://api.openai.com/v1/models",
    healthCheckMethod: "GET",
    status: "active",
    supportedInterfaces: ["openai"],
    metadata: {
        description: "OpenAI API service provider",
        documentation: "https://platform.openai.com/docs/api-reference",
        rateLimit: "3500 requests per minute",
        authentication: "Bearer token"
    }
}
```

### InterfaceConfig

```typescript
{
    id: "openai-interface",
    name: "OpenAI Interface",
    interfaceName: "openai",
    serviceName: "OAService",
    supportedConversationTypes: [
        "TextToText",
        "TextToCode",
        "CodeToText",
        "ImageToText",
        "TextToJSON",
        "TextToImage",
        "TextToAudio",
        "AudioToText",
        "ImageToImage"
    ],
    status: "active",
    metadata: {
        description: "OpenAI API interface for chat, code, image generation, and audio",
        models: ["gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
        capabilities: ["chat", "vision", "function_calling", "image_generation"]
    }
}
```

## Frontend UI Components Needed

### 1. Model Management Dashboard

```typescript
// Display all models with:
- Model name and provider
- Health status (available/degraded/unavailable)
- Token limit and cost information
- Rollout percentage with adjustment controls
- Supported conversation types
- Performance scores (cost, accuracy, creativity, speed)
```

### 2. Service Management Dashboard

```typescript
// Display all services with:
- Service name and provider
- API endpoint and authentication method
- Supported interfaces
- Health status
- Rate limit information
- Documentation links
```

### 3. Interface Management Dashboard

```typescript
// Display all interfaces with:
- Interface name
- Associated service
- Supported conversation types
- Associated models
- Capabilities list
```

### 4. Model Configuration UI

```typescript
// Allow users to:
- Create new model configurations (modal form)
- Update existing model settings
- Adjust rollout percentages with slider
- View/edit health check configurations
- Configure SLA targets
- View audit trail of changes
- Archive/retire models
```

### 5. Relationship Visualization

```typescript
// Show connections:
Service -> Interface -> Models
Example:
  OpenAI Service
    └─ OpenAI Interface
        ├─ GPT-4 Turbo
        ├─ GPT-4
        └─ GPT-3.5 Turbo
```

## Implementation Notes

### API Client Setup

```typescript
// In your frontend service/api client:

const brainApi = {
    // Models
    getAllModels: () => fetch('/api/brain/models/config').then(r => r.json()),
    getModelHealth: (name: string) => 
        fetch(`/api/brain/models/${name}/health`).then(r => r.json()),
    validateModel: (name: string) => 
        fetch(`/api/brain/models/${name}/validate`, { method: 'POST' }).then(r => r.json()),
    updateRollout: (name: string, percentage: number) =>
        fetch(`/api/brain/models/${name}/rollout`, {
            method: 'PUT',
            body: JSON.stringify({ percentage })
        }).then(r => r.json()),

    // Services
    getAllServices: () => fetch('/api/brain/services').then(r => r.json()),
    getServicesByProvider: (provider: string) =>
        fetch(`/api/brain/services/${provider}`).then(r => r.json()),

    // Interfaces
    getAllInterfaces: () => fetch('/api/brain/interfaces').then(r => r.json()),
    getInterfacesByService: (serviceName: string) =>
        fetch(`/api/brain/interfaces/${serviceName}`).then(r => r.json()),
    getModelsByInterface: (interfaceName: string) =>
        fetch(`/api/brain/models/by-interface/${interfaceName}`).then(r => r.json())
};
```

### State Management (React Example)

```typescript
// Use context or state management to fetch and cache:
const [models, setModels] = useState<ModelConfiguration[]>([]);
const [services, setServices] = useState<ServiceConfig[]>([]);
const [interfaces, setInterfaces] = useState<InterfaceConfig[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
    Promise.all([
        brainApi.getAllModels().then(d => setModels(d.models)),
        brainApi.getAllServices().then(d => setServices(d.services)),
        brainApi.getAllInterfaces().then(d => setInterfaces(d.interfaces))
    ]).finally(() => setLoading(false));
}, []);
```

### Real-Time Updates

```typescript
// Poll for health status updates (every 30 seconds):
const pollHealthStatus = setInterval(async () => {
    const health = await fetch('/api/brain/models/health').then(r => r.json());
    updateModelHealthUI(health.models);
}, 30000);

// Or implement WebSocket support for real-time updates
```

## Dashboard Layout Suggestion

```
┌─────────────────────────────────────────────────────────────┐
│ Brain Service - Models, Services & Interfaces Management    │
├─────────────────────────────────────────────────────────────┤
│ [Models Tab] [Services Tab] [Interfaces Tab] [Relationships]│
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Models (18 total)                                            │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Model Name      │ Status  │ Health │ Rollout │ Actions │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ GPT-4 Turbo     │ Active  │ ✓      │ 100%    │ [Edit]  │ │
│ │ GPT-3.5 Turbo   │ Active  │ ✓      │ 100%    │ [Edit]  │ │
│ │ Claude Sonnet   │ Active  │ ?      │ 50%     │ [Edit]  │ │
│ │ Gemini Pro      │ Beta    │ ✗      │ 10%     │ [Edit]  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ Services (10 total)                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Service         │ Provider    │ Interfaces │ Status    │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ OpenAI Service  │ openai      │ 1          │ Active    │ │
│ │ Anthropic Serv. │ anthropic   │ 1          │ Active    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Notes on Data Organization

### Why Separate Arrays?

Previously, all model-specific data was embedded in model objects, causing redundancy:
- Each model repeated service/interface information
- Updates to service endpoints required updating all related models
- No single source of truth for service configuration

Now:
- **Models array**: Pure model-to-provider mappings, performance metrics
- **Services array**: Provider configurations, endpoints, credentials
- **Interfaces array**: Protocol implementations, capabilities
- **Relationships**: Defined by matching `serviceName` and `interfaceName` fields

### Data Flow

```
1. Frontend loads seedData.json (first request)
   ├─ 18 models loaded into model table
   ├─ 10 services loaded into service configuration
   └─ 10 interfaces loaded into protocol mapping

2. Frontend displays relationships:
   GPT-4 Turbo
   └─ Uses: OpenAI Service (openai-service)
      └─ Implements: OpenAI Interface (openai-interface)
         └─ Supports: 9 conversation types

3. On model update:
   - Update model configuration (cost, rollout %)
   - Service endpoints auto-resolved via relationship
   - No redundant data update needed
```

## Testing the Frontend Integration

```bash
# 1. Start Brain service
npm run dev

# 2. Test model endpoints
curl http://localhost:5070/models/config
curl http://localhost:5070/models/health
curl http://localhost:5070/services
curl http://localhost:5070/interfaces

# 3. Test specific model
curl http://localhost:5070/models/gpt-4-turbo/health

# 4. Test rollout update
curl -X PUT http://localhost:5070/models/gemini-pro/rollout \
  -H "Content-Type: application/json" \
  -d '{"percentage": 25}'

# 5. Test relationship queries
curl http://localhost:5070/models/by-interface/openai
curl http://localhost:5070/interfaces/OAService
curl http://localhost:5070/services/openai
```

## Next Steps for Frontend

1. ✅ **Phase 1**: Display models, services, interfaces (separate tabs)
2. ✅ **Phase 2**: Add health status visualization
3. ⏳ **Phase 3**: Implement model rollout controls with percentage slider
4. ⏳ **Phase 4**: Add service/interface configuration UI
5. ⏳ **Phase 5**: Implement real-time health monitoring dashboard
6. ⏳ **Phase 6**: Add audit trail viewer for model configuration changes
7. ⏳ **Phase 7**: Create relationship visualization (interactive graph)

