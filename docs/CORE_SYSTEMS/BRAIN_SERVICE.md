# Brain Service Documentation

## Introduction

The Brain service is a core component responsible for intelligent LLM model selection, dynamic configuration management, resilient execution, and performance tracking. It provides a robust and flexible platform for integrating and managing various Language Model providers, enabling dynamic adaptation to changing model availability, performance, and cost.

This document consolidates comprehensive information regarding the Brain service's architecture, implementation, usage, and future development, drawing from several detailed analyses and reports.

## Architectural Overview

The Brain service has undergone significant refactoring to support dynamic management of LLM models, services, and interfaces. This architectural evolution decouples model definitions from source code, enabling greater operational agility and easier integration of new LLM capabilities.

### Core Components

*   **`ServiceHealthChecker`**: Responsible for proactive validation of model credentials and continuous health monitoring of integrated LLM providers. It ensures that only genuinely available and authenticated models are considered for requests, significantly reducing latency and failed attempts.
*   **`ModelConfigService`**: Manages the lifecycle of model, service, and interface configurations. It handles CRUD operations, persistence (via Librarian), and caching, ensuring that configuration data is always up-to-date and consistently available across Brain instances.
*   **`seedDataLoader`**: A utility for loading and transforming centralized `seedData.json` configurations at runtime. It hydrates the database on first startup, ensuring a consistent baseline of models, services, and interfaces.

### Data Architecture

The architecture now adheres to a clear separation of concerns for models, services, and interfaces:

*   **Models**: Define the LLM instances (e.g., GPT-4 Turbo, Claude 3 Sonnet), their token limits, cost, supported conversation types, health status, and rollout percentages.
*   **Services**: Represent LLM providers (e.g., OpenAI, Anthropic), including their API base URLs, credential management (e.g., AWS Secrets Manager reference), and health check configurations.
*   **Interfaces**: Define the protocol adapters for services (e.g., OpenAI API v1), specifying supported conversation types and capabilities (e.g., chat, vision, function_calling).

This structure enables a `Service (One) ──────────┐` relationship model, where one Service can have one or more Interfaces, and each Interface can be used by Many Models.

### Startup Flow

The Brain service initialization now includes an intelligent hydration and validation process:

1.  **Constructor**: Connects to Redis and initializes the model manager.
2.  **`initializeModels()`**: Called during application startup (`app.listen()` callback).
    *   **`configService.hydrate()`**:
        *   Loads seed data from `seedData.json`.
        *   Checks if models, services, and interfaces already exist in the database.
        *   If the database is empty, it populates them from the seed data.
    *   Loads active models from the `ModelConfigService` (querying the database or Redis cache).
    *   **`ServiceHealthChecker.validateAllModels()`**: Validates credentials for all models and performs initial health checks, caching their status in Redis.
3.  **Server Ready**: Once initialized, the Brain service is ready to handle requests, selecting models based on their real-time health and availability.

## Key Features & Benefits

The Brain service has been enhanced with several key features to improve reliability, agility, and maintainability:

### Proactive Credential Validation

**Problem Solved**: Eliminates the previous "fail-then-exclude" pattern where unavailable models (due to missing/invalid API keys) would consume 20-30 seconds of latency across multiple retries before being blacklisted.

**Solution**: The `ServiceHealthChecker` proactively validates model credentials at startup and through periodic health checks. Models with invalid or missing credentials are immediately marked as `UNAVAILABLE` and are never attempted for requests.

**Benefits**:
*   **Near-instant fallback**: Latency for unavailable models reduced from 20-30 seconds to less than 100ms.
*   **Zero wasted requests**: No attempts are made on models guaranteed to fail.
*   **Early detection**: Credential issues are identified before impacting users.
*   **Safe credential rotation**: Enables zero-downtime API key rotation.

### Hydration System

**Problem Solved**: Cold starts with an empty database previously required manual setup.

**Solution**: The `ModelConfigService.hydrate()` method automatically populates the database with default models, services, and interfaces from `seedData.json` on the first startup if no configurations exist. This process is idempotent and non-destructive, ensuring consistency.

### Dynamic Model Selection

**Problem Solved**: Previously, model selection could attempt unavailable models, and any changes to model definitions required code modifications and redeployments.

**Solution**: Model configurations are now loaded dynamically from a centralized source (`seedData.json` persisted in Librarian). The model selection logic filters out models marked as `UNAVAILABLE` by the `ServiceHealthChecker`, ensuring only healthy and authenticated models are considered.

**Benefits**:
*   **No code changes for model updates**: Models can be added, updated, or retired without modifying Brain service code.
*   **Immediate fallback**: Ensures prompt switching to working models upon any failure or unavailability.
*   **Consistent across instances**: Model availability and selection are synchronized via Redis caching.

### Health Check Scheduling

**Solution**: Automated health checks run periodically (default 5 minutes) for all active and beta models. These checks use provider-specific endpoints to verify service responsiveness and credential validity. The status is cached in Redis for distributed access and local in-memory for L2 fallback.

## Retry Architecture Refactor

The Brain service's retry mechanism has been refactored for improved robustness and maintainability, moving from complex, duplicated error handling to a unified retry loop pattern.

### Unified Retry Loop Pattern

Both `/chat` and `/generate` endpoints now implement a consistent `while (attempt < maxRetries)` loop. This structure centralizes error handling:

1.  **Attempt 1**: Selects the initially requested or best available model.
2.  **Subsequent Attempts**: If an attempt fails, it logs the error, tracks the failure, and selects the *next best available model* for the subsequent retry.

### Benefits of the Refactor

*   **Clean Architecture**: Eliminates duplicated LLM call logic and simplifies the overall code structure.
*   **Uniform Error Handling**: All types of errors (timeout, JSON parsing, network, authentication) are handled consistently within the retry loop.
*   **Improved Reliability**: Up to 3 attempts per request, with automatic model fallback ensuring higher success rates.
*   **Maintainability**: Easier to modify retry behavior and integrate new error handling logic.
*   **Performance**: Faster fallback due to simplified error analysis and efficient model selection.

## REST API Endpoints

The Brain service exposes a comprehensive set of REST API endpoints for managing and querying model configurations, services, and interfaces, as well as accessing health status.

### Model Configuration Management

*   `GET /models/config`: Returns all active model configurations.
*   `GET /models/health`: Returns health status for all models.
*   `GET /models/{name}/health`: Gets health status for a specific model.
*   `POST /models/{name}/validate`: Manually triggers a health check for a model.
*   `PUT /models/{name}/rollout`: Updates the rollout percentage for gradual deployment.
*   `GET /models`: Returns only available models, filtered by health status.
*   `POST /performance/reset-blacklists`: Resets failure counters (distinct from health checks).
*   `POST /models`: Admin endpoint to create new model configurations.
*   `GET /models/{id}`: Gets a specific model configuration.
*   `PUT /models/{id}`: Admin endpoint to update a model configuration.
*   `DELETE /models/{id}`: Admin endpoint to retire/delete a model.
*   `POST /models/{id}/rollout`: Admin endpoint to update rollout percentage.
*   `GET /models/{id}/history`: Auditing endpoint to view model change history.
*   `POST /models/activate`: Admin endpoint to activate a model.
*   `POST /models/deactivate`: Admin endpoint to deactivate a model.
*   `GET /models/status`: Operational endpoint for current model availability.
*   `GET /models/by-interface/:name`: Retrieves models using a specific interface.

### Service Discovery

*   `GET /services`: Lists all configured services.
*   `GET /services/:provider`: Lists services by provider.

### Interface Discovery

*   `GET /interfaces`: Lists all configured interfaces.
*   `GET /interfaces/:serviceName`: Lists interfaces by service.

## Implementation Details

### Credential Loading Strategy

The Brain service supports multiple secure credential loading mechanisms:

1.  **AWS Secrets Manager (Recommended for Production)**: Configured via `keyVault: "AWS_SECRETS_MANAGER"`.
2.  **HashiCorp Vault**: Configured via `keyVault: "VAULT"`. Requires `VAULT_ADDR` and `VAULT_TOKEN` environment variables.
3.  **Environment Variables (Development)**: Configured via `keyVault: "ENV"`. Loads from `process.env[credentialName]`.

**Loading Priority**: Credentials are first attempted from the configured vault. If unsuccessful, the model is marked `UNAVAILABLE`.

### Environment Variables

Specific environment variables are required depending on the chosen credential management solution:

*   **AWS Secrets Manager**: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
*   **HashiCorp Vault**: `VAULT_ADDR`, `VAULT_TOKEN`
*   **Environment Variable Credentials**: Model-specific API keys (e.g., `openai-api-key-prod`)

### Database Schema

The Brain service interacts with Librarian (MongoDB) and Redis for persistence and caching:

*   **MongoDB Collections**:
    *   `model_configs`: Stores `ModelConfiguration` objects.
    *   `service_configs`: Stores `ServiceConfig` objects.
    *   `interface_configs`: Stores `InterfaceConfig` objects.
    *   `model_config_changes`: Stores `ModelConfigChange` audit trail entries.
*   **Redis Keys**: Used for caching active models, individual model configurations, and `ServiceHealthStatus` to ensure distributed consistency and high performance.

### TypeScript Types

The implementation introduced several new TypeScript interfaces to strongly type the model management system, including `SeedData`, `ServiceConfig`, `InterfaceConfig`, and `RawModelData`, ensuring data integrity and developer clarity.

## Testing Scenarios & Troubleshooting

### Testing the System

*   **Startup Tests**: Verify `seedData.json` loads correctly, models are hydrated (or retrieved from persistence), and initial health checks run successfully.
*   **REST Endpoint Tests**: Use `curl` or `jq` to verify all API endpoints return expected data for models, services, interfaces, health status, and config updates.
*   **Credential Validation Tests**: Test scenarios with missing/invalid API keys and expected automatic model blacklisting.
*   **Database Verification**: Directly inspect MongoDB collections and Redis keys to confirm data persistence and caching.

### Troubleshooting Common Issues

*   **Models not loading**: Check `seedData.json` location and content, and look for TypeScript errors in the Brain service logs.
*   **Health checks failing**: Verify credential setup (AWS Secrets Manager, Vault, or environment variables) and confirm the Librarian service is running.
*   **Models not persisting**: Ensure Librarian and MongoDB services are healthy and reachable.

## Performance Impact

The new architecture introduces significant performance benefits and minimal overhead:

*   **Startup Time**: Initial load (parsing `seedData.json`, validating credentials) takes 10-20 seconds for multiple models. Subsequent "warm" starts with Redis caching are under 3 seconds.
*   **Request Latency**: Health check cache lookups are <5ms. Model selection, even with filtering, is <10ms. This results in **200-300x faster fallback** for unavailable models compared to the previous 20-30 second latency.
*   **Memory Usage**: Minimal overhead, typically less than 20KB for local model and health status caches.
*   **Network Overhead**: Health checks are performed periodically (every 5 minutes per model) and are asynchronous, having no direct impact on request path latency.

## Migration Guide

Existing code that directly accessed `SEED_MODELS` now uses a deprecated wrapper. New code should leverage `seedDataLoader` to access models, services, and interfaces. For adding new models, developers now edit `seedData.json` directly, eliminating the need for code changes, rebuilds, or redeployments.

## Future Roadmap and Recommendations

While the current implementation provides a robust foundation, several critical improvements have been identified to further enhance the Brain service's operational agility, reliability, and security.

### Critical Issues Identified (Before Refactoring)

1.  **Hardcoded Model Configuration**: Required redeployment for any model changes.
2.  **No Dynamic Model Registry**: Could not add/remove models at runtime.
3.  **Security Risk**: Every model change exposed the system to deployment errors.
4.  **Limited Observability**: Model failures were tracked locally but not easily queryable or actionable.
5.  **No Version Control for Model Configs**: Lacked audit trails and safe upgrade paths.
6.  **Synchronous Model Selection & No Gradual Rollout**: New models either received 0% or 100% traffic, increasing risk.
7.  **Performance Data Flow is One-Way**: Operational decisions (e.g., blacklisting) were not centralized.
8.  **No Model Metadata or Documentation**: Client applications lacked explicit model capabilities.
9.  **No Proactive Service/API Key Availability Checking**: Critical issue causing wasted requests on unavailable models.

### Recommended Solutions

1.  **External Model Configuration Service**: Move model definitions to a centralized, version-controlled service accessible via a REST API. This enables dynamic updates without code changes and robust audit trails.
    *   **Solution 1A: Proactive Service Health & Credential Validation**: Implement a scheduler for continuous service availability and API key validity checks, preventing attempts on known-unavailable services.

2.  **Distributed Model Configuration Cache**: Utilize Redis for caching model configurations, ensuring all Brain instances share consistent data and reducing redundant service calls.

3.  **Gradual Model Rollout with Weighted Selection**: Implement traffic weighting to allow new models to be introduced with a low percentage of traffic, gradually increasing as confidence grows. This enables safe A/B testing and canary deployments.

4.  **Centralized Model Failure Tracking & Alerting**: Integrate with a centralized monitoring system (e.g., Grafana, DataDog) to track model failures, generate actionable alerts, and provide comprehensive dashboards for operational visibility.

5.  **Model Performance SLA Enforcement**: Define Service Level Agreements (SLAs) for models (e.g., min success rate, max latency) and automatically enforce them through actions like degrading or blacklisting models that violate their SLAs.

6.  **Model Configuration Versioning & Audit Trail**: Implement full version control for model configurations, allowing for rollbacks and providing an immutable audit history of all changes.

7.  **Blue-Green Model Deployments**: Enable running two versions of a model side-by-side, allowing for seamless traffic switching between them for safer deployments and instant rollbacks.

8.  **Explicit Model Capability Declaration**: Define and validate explicit capabilities for each model (e.g., `supportsToolCalling`, `maxInputTokens`), preventing client misuse and improving API consistency.

### Additional Brain Service Improvements

*   **Streaming Response Support**: Implement Server-Sent Events (SSE) for streaming LLM responses, improving UX, reducing latency, and lowering memory usage for long outputs.
*   **Request Rate Limiting per Model**: Introduce throttling mechanisms per model and user to ensure fair access and prevent abuse.
*   **Request Batching & Parallel Processing**: Optimize throughput and reduce latency variance by processing multiple requests in parallel.
*   **Model Cost Tracking & Optimization**: Implement detailed cost tracking per request, per model, and per user, enabling cost visibility and optimization strategies.
*   **Observability & Request Tracing**: Enhance end-to-end request tracing with correlation IDs and integration with distributed tracing systems for faster debugging and performance analysis.

## Security Considerations

Security is paramount in the Brain service. Key considerations and mitigations include:

*   **Model Configuration Tampering**: Mitigated by HMAC signing of configurations, TLS-only communication, separation of API keys (referencing vault keys), role-based access control, and encryption at rest.
*   **Privilege Escalation**: Enforced through Role-Based Access Control (RBAC) for API endpoints, token validation, and rate limiting on configuration changes.
*   **DoS via Model Config**: Prevented by robust configuration validation, provider connectivity checks, safe defaults (e.g., 1% default rollout), and configurable retry limits.

## Success Metrics

Success of these improvements will be measured by:

*   **Model Deployment Time**: Target <15 minutes from config change to 100% traffic.
*   **MTTR (Mean Time to Recovery)**: Target <5 minutes from model failure to traffic rerouted.
*   **Model Availability**: Target >99.5% uptime per model.
*   **Rollback Capability**: Target <1 minute to revert model versions.
*   **Cost Visibility**: 100% visibility into cost per model, user, and conversation type.
*   **Audit Trail Completeness**: All config changes logged and reversible.

## UI/Frontend Requirements for Model Management

The existing model performance pages should be extended into a comprehensive **Model Management Hub**. This hub will feature:

*   **Model Availability Panel**: Real-time display of model health (available/degraded/unavailable) with performance metrics and quick action buttons.
*   **Model Configuration Form**: A UI for editing model configurations, including rollout percentages, provider settings, SLAs, and health checks.
*   **Gradual Rollout Manager**: An interactive panel to manage and visualize traffic distribution during gradual rollouts, with historical data and quick action buttons for adjustments.
*   **Enhanced Metrics View**: Detailed performance comparisons, latency trends, and cost efficiency metrics.
*   **Admin Actions & Quick Controls**: Buttons for credential rotation, testing models, promoting to production, setting alert thresholds, and initiating rollbacks.

Frontend should implement **role-based access control** for different levels of permissions (Viewer, Operator, Admin, DevOps) and ensure all changes are logged.
