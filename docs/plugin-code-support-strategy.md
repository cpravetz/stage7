Stage7 Capability Support Strategy
Table of Contents:

Introduction: Capabilities in the Stage7 Architecture

Internal Plugin Development Strategy

2.1. Python as the Preferred Language

2.2. Polyglot Support via Containerization

2.3. Manifest for Internal & Containerized Plugins

JavaScript Capability Support Strategy

3.1. Legacy JavaScript Execution

3.2. Migration and Containerization Path

3.3. Recommendation for JavaScript

External Tool Integration via OpenAPI

4.1. OpenAPI Tools as First-Class Capabilities

4.2. OpenAPI Tool Definition and Registration

4.3. Execution by the Tool Manager

4.4. Discovery of OpenAPI-Defined Tools

4.5. Authentication for External APIs

Role of the Planning Engine and ACCOMPLISH-like Logic

Conclusion

1. Introduction: Capabilities in the Stage7 Architecture
This document outlines the strategy for supporting various types of capabilities within the Stage7 agent system, aligning with the architecture defined in "Stage7 Agent System: Enhanced Architecture for Agency." The central component for managing these is the Tool Manager & Capability Registry (referred to as "Tool Manager" henceforth).

Capabilities can include:

Internal Plugins: Custom code developed for specific functionalities, ideally in Python or containerized if in other languages.

External Tools: Third-party services integrated via their APIs, with a primary focus on OpenAPI specifications.

Agent-Composed Tools: Reusable sub-plans learned or defined by agents and registered with the Tool Manager (as described in the core architecture).

This strategy focuses on the development, registration, and execution support for internal plugins and external tools.

2. Internal Plugin Development Strategy
Internal plugins are custom-coded components that provide specific functionalities within the Stage7 ecosystem.

2.1. Python as the Preferred Language
To ensure consistency, maintainability, and leverage a rich ecosystem, Python is the preferred language for developing new internal plugins that run directly within the agent system's environment (if not containerized).

Recommendation for Engineer & Operations Interface:

Any tools or AI assistance (e.g., an "Engineer" service) provided through this interface for generating new plugin code should prioritize Python.

If a capability can be reasonably implemented in Python, it should be the default target for non-containerized internal plugins.

Recommendation for Documentation and Examples:

All new plugin development documentation, tutorials, and code examples for non-containerized plugins should primarily feature Python.

Benefits:

Simplified development and a common language.

Code reusability across plugins.

Strong AI/ML ecosystem alignment.

Mature tooling.

2.2. Polyglot Support via Containerization
To support plugins written in languages other than Python (including JavaScript, Java, Node.js, Go, C#, etc.), or to provide stronger isolation for Python plugins, Docker containerization is the recommended approach, as outlined in Section 3.1 of the core architecture.

Tool Manager Responsibility: The Tool Manager will be responsible for managing container images, running plugin containers when needed, and communicating with them via a standardized interface (e.g., HTTP API exposed by the container, gRPC).

Benefits of Containerization:

Language flexibility.

Strong isolation between plugins and the host system.

Dependency management specific to each plugin.

Scalability and portability.

2.3. Manifest for Internal & Containerized Plugins
All internal plugins, whether Python-based (non-containerized) or containerized (any language), must be accompanied by a manifest file (e.g., plugin_manifest.yaml or .json). This manifest is crucial for the Tool Manager to register and manage the plugin.

The manifest should declare:

name: A unique name for the plugin.

description: Human-readable description.

languageType: e.g., "python", "container".

actionVerb (or actionVerbs): The capability/capabilities this plugin provides.

inputParameterSchemas: Detailed definitions (e.g., using JSON Schema) for all input parameters.

outputParameterSchemas: Detailed definitions for all output parameters.

For Python (non-containerized):

entryPoint: e.g., module and function name (my_plugin.main_function).

For Containerized Plugins:

imageName: The Docker image name and tag.

invocationDetails: How to communicate with the service inside the container (e.g., port, endpoint, protocol).

resourceRequirements (optional).

Engineers will use the Engineer & Operations Interface to develop/register these plugins and their manifests with the Tool Manager.

3. JavaScript Capability Support Strategy
This section addresses the approach for existing and future JavaScript-based capabilities, aligning with the containerization strategy.

3.1. Legacy JavaScript Execution
It's assumed that some existing JavaScript plugins might be executed directly via Node.js or within an in-process sandbox (e.g., vm2).

Security Concern: Direct Node.js execution outside a robust sandbox or container poses significant security risks. In-process sandboxes can also be complex to maintain securely.

Recommendation:

Conduct a security audit of any existing JavaScript sandboxing environments.

Flag any JavaScript plugins executing directly via Node.js for immediate action.

3.2. Migration and Containerization Path
The long-term strategy for JavaScript capabilities is to move away from direct execution and in-process sandboxes.

Option 1 (Preferred): Migrate to Python.

If feasible, migrate the logic of existing useful JavaScript plugins to Python, making them standard internal Python plugins.

Option 2: Containerize JavaScript Plugins.

For JavaScript plugins that are critical and cannot be easily migrated to Python, or for new development where JavaScript offers a distinct advantage (and Python is not suitable), package them as Docker containers.

These containerized JavaScript plugins will be managed by the Tool Manager like any other containerized plugin (see Section 2.2 and 2.3). They will require a manifest detailing how to run and interact with the container.

Deprecation:

Announce a timeline for phasing out support for non-containerized JavaScript plugins and in-process sandboxes.

Provide resources to assist developers in migrating to Python or containerizing their JS plugins.

3.3. Recommendation for JavaScript
Primary Recommendation: Migrate to Python or Containerize.

For platform simplification, enhanced security, and focused development, JavaScript capabilities should either be migrated to Python or encapsulated within Docker containers. This aligns with the core architecture's push for Python as the primary internal plugin language and containerization for polyglot support. Maintaining a separate, in-process JavaScript sandbox is discouraged long-term due to complexity and security overhead.

4. External Tool Integration via OpenAPI
Integrating external tools via their OpenAPI specifications is a key strategy for expanding agent capabilities, as supported by the Tool Manager.

4.1. OpenAPI Tools as First-Class Capabilities
External tools defined by OpenAPI specifications are treated as first-class capabilities, registered and managed by the Tool Manager.

4.2. OpenAPI Tool Definition and Registration
An OpenAPI specification (v2 Swagger or v3 OpenAPI) serves as the core definition for an external tool. Engineers will use the Engineer & Operations Interface to register these tools with the Tool Manager. Registration involves providing:

A unique name for the tool (e.g., PublicHolidayAPI).

A description.

The OpenAPI specification itself (e.g., by URL or direct upload).

languageType: A specific type, e.g., "openapi".

Authentication configuration details (see Section 4.5).

Optionally, explicit mappings from OpenAPI operationIds to system actionVerbs if not directly inferable or if a more abstract verb is desired. The Tool Manager can also derive available actions, their inputs, and outputs directly from the spec.

Conceptual Registration Information (managed by Tool Manager):

{
  "name": "PublicHolidayAPI",
  "description": "Provides access to public holiday data for various countries.",
  "capabilityType": "openapi_tool", // Differentiator
  "sourceSpecificationUrl": "https_api.publicapis.org/openapi.yaml",
  "authentication": {
    "type": "apiKey", // e.g., apiKey, oauth2_client_credentials
    "in": "header",   // if apiKey
    "name": "X-Api-Key", // if apiKey
    "credentialSource": "platformSecretsManagerKey:public_holiday_api_key" // Pointer to secret
  },
  "actionMappings": [ // Optional: Tool Manager can derive these
    {
      "actionVerb": "getHolidaysForYearAndCountry",
      "openapiOperationId": "getHolidays",
      // Input/output schemas are derived from the OpenAPI spec
    }
  ]
}

4.3. Execution by the Tool Manager
OpenAPI Execution Module: The Tool Manager will include or utilize a specialized module for executing calls to OpenAPI-defined tools.

When the Execution Engine requests an action fulfilled by an OpenAPI tool, the Tool Manager's executor will:

Retrieve the tool's definition and parsed OpenAPI specification.

Identify the correct API operation based on the requested actionVerb.

Validate provided inputs against the operation's schema.

Construct the HTTP request (URL, method, headers, body).

Handle authentication securely using configured credentials.

Execute the API call.

Process the response, validate it against the schema (optional), and return the structured output.

4.4. Discovery of OpenAPI-Defined Tools
Manual Registration: Primary method via the Engineer & Operations Interface.

Automated Discovery (Advanced): The Tool Manager's Tool Discovery Engine (Section 2.4 of core architecture) can be configured to scan specified OpenAPI registries or URLs to identify and propose new external tools for registration. Human oversight is recommended for discovered tools.

4.5. Authentication for External APIs
This is critical for security and functionality:

The registration information for an OpenAPI tool in the Tool Manager must define the authentication mechanism (e.g., API Key, OAuth2, Basic Auth) as specified in its OpenAPI document or supplementary configuration.

The Tool Manager's OpenAPI execution module must integrate with a secure platform secrets management system (e.g., HashiCorp Vault, AWS Secrets Manager) to retrieve credentials at runtime.

No secrets should be stored directly in the tool definitions or manifests. The definition should contain pointers or references to where the secrets are managed.

5. Role of the Planning Engine and ACCOMPLISH-like Logic
The Planning Engine (Section 2.2 of the core architecture) is responsible for creating plans to achieve agent goals. It queries the Tool Manager to find suitable capabilities (internal plugins, containerized plugins, OpenAPI tools, agent-composed tools) that match the required actionVerbs or sub-goals in its plan.

Logic previously associated with a specific ACCOMPLISH plugin would now be part of the sophisticated planning capabilities of the Planning Engine or implemented as advanced, reusable Plan Templates.

The Planning Engine must be able to understand the different types of capabilities and how their parameters are defined (via their manifests/schemas stored by the Tool Manager).

The Execution Engine then takes the generated Plan Instance and, for each Step Instance, interacts with the Tool Manager to invoke the chosen tool/plugin.

6. Conclusion
This updated Capability Support Strategy aligns with the Stage7 enhanced architecture by:

Centralizing capability management under the Tool Manager & Capability Registry.

Prioritizing Python for new, non-containerized internal plugins for simplicity and robustness.

Establishing Docker containerization as the standard for polyglot plugin support (including JavaScript) and enhanced isolation.

Providing a clear path for managing and migrating legacy JavaScript capabilities.

Detailing a robust mechanism for integrating External Tools via OpenAPI specifications.

This approach promotes flexibility, security, and extensibility, allowing the Stage7 agent platform to leverage a diverse range of internal and external capabilities effectively.