# Stage7 Plugin Ecosystem: Comprehensive Guide

## 1. Introduction: Capabilities in the Stage7 Architecture
The Stage7 agent system leverages a robust capability framework managed by the **Tool Manager & Capability Registry**. This framework supports various types of capabilities to expand agent functionalities:
*   **Internal Plugins**: Custom code developed for specific functionalities, primarily in Python or containerized for other languages.
*   **External Tools**: Third-party services integrated via their APIs, with a strong focus on OpenAPI specifications.
*   **Agent-Composed Tools**: Reusable sub-plans learned or defined by agents and registered with the Tool Manager.

This guide details the development, management, security, and integration aspects of these capabilities.

## 2. Plugin Types and Supported Languages

### 2.1. Python Plugins (Preferred)
Python is the **preferred language** for developing new internal plugins that run directly within the agent system's environment (non-containerized).
*   **Benefits**: Ensures consistency, maintainability, leverages a rich AI/ML ecosystem, and benefits from mature tooling.
*   **Recommendation for Engineer & Operations Interface**: Tools and AI assistance (e.g., the "Engineer" service) for generating new plugin code should prioritize Python. If a capability can be reasonably implemented in Python, it should be the default target for non-containerized internal plugins.
*   **Documentation and Examples**: All new plugin development documentation, tutorials, and code examples for non-containerized plugins primarily feature Python.

### 2.2. Container Plugins (Polyglot Support)
Docker containerization is the recommended approach for supporting plugins written in languages other than Python (e.g., JavaScript, Java, Node.js, Go, C#) or for providing stronger isolation for Python plugins.
*   **Benefits**: Offers language flexibility, strong isolation between plugins and the host system, simplified dependency management specific to each plugin, and enhanced scalability and portability.
*   **Tool Manager Responsibility**: The Tool Manager is responsible for managing container images, running plugin containers when needed, and communicating with them via a standardized interface (e.g., HTTP API, gRPC).

### 2.3. JavaScript Plugins (Legacy & Migration Path)
Existing JavaScript plugins may have been executed directly via Node.js or within an in-process sandbox (`vm2`).
*   **Security Concern**: Direct Node.js execution outside a robust sandbox or container, or reliance on in-process sandboxes, poses significant security risks.
*   **Migration Options**: The long-term strategy is to move away from direct execution and in-process sandboxes:
    *   **Preferred**: Migrate the logic of existing useful JavaScript plugins to Python, making them standard internal Python plugins.
    *   **Alternative**: For critical JavaScript plugins that cannot be easily migrated to Python, or for new development where JavaScript offers a distinct advantage, package them as Docker containers. These containerized JavaScript plugins are managed by the Tool Manager like any other containerized plugin.
*   **Deprecation**: A timeline will be established for phasing out support for non-containerized JavaScript plugins and in-process sandboxes. Resources will be provided to assist developers in migrating to Python or containerizing their JS plugins.

## 3. Plugin Manifest and Metadata
All internal plugins (Python-based or containerized) must be accompanied by a manifest file (e.g., `plugin_manifest.json`). This manifest is crucial for the Tool Manager to register and manage the plugin.

This manifest should declare:
*   `id`: A unique identifier for the plugin (e.g., `plugin-MY_PLUGIN`).
*   `verb` (or `actionVerb`): The primary capability this plugin provides.
*   `description`: A human-readable brief description.
*   `explanation`: A detailed explanation of what the plugin does.
*   `language`: The language type (e.g., "python", "container").
*   `inputDefinitions`: Detailed definitions for all input parameters (name, required, type, description).
*   `outputDefinitions`: Detailed definitions for all output parameters (name, required, type, description).
*   `version`: Semantic versioning of the plugin (e.g., "1.0.0").
*   `repository`: Type of repository (e.g., "local").
*   `security`: Permissions, sandbox options, and trust information.
*   `distribution`: Downloads and rating.

**Specifics for Python (non-containerized) Plugins:**
*   `entryPoint`: Specifies the main file and package source (e.g., `{"main": "main.py", "packageSource": {"type": "local", "path": "./", "requirements": "requirements.txt"}}`).

**Specifics for Containerized Plugins:**
*   `container`: Docker-specific details (`dockerfile`, `buildContext`, `image`, `ports`, `environment`, `resources`, `healthCheck`).
*   `api`: Details for communicating with the service inside the container (`endpoint`, `method`, `timeout`).

**Example `manifest.json` structure (simplified):**
```json
{
  "id": "plugin-MY_PLUGIN",
  "verb": "MY_PLUGIN",
  "description": "Brief description of your plugin",
  "explanation": "Detailed explanation of what your plugin does",
  "inputDefinitions": [
    { "name": "input", "required": true, "type": "string", "description": "Input description" }
  ],
  "outputDefinitions": [
    { "name": "result", "required": true, "type": "string", "description": "Output description" }
  ],
  "language": "python",
  "entryPoint": {
    "main": "main.py",
    "packageSource": { "type": "local", "path": "./", "requirements": "requirements.txt" }
  },
  "repository": { "type": "local" },
  "security": { "permissions": [], "sandboxOptions": {}, "trust": { "signature": "" } },
  "distribution": { "downloads": 0, "rating": 0 },
  "version": "1.0.0"
}
```

## 4. Plugin Development Guide

### 4.1. Python Plugin Quick Start
1.  **Create Plugin Directory**: `mkdir services/capabilitiesmanager/src/plugins/MY_PLUGIN`
2.  **Create `main.py`**:
    ```python
    #!/usr/bin/env python3
    import json
    import sys
    from typing import Dict, List, Any

    class PluginParameterType:
        STRING = "string"
        NUMBER = "number"
        BOOLEAN = "boolean"
        ARRAY = "array"
        OBJECT = "object"
        ERROR = "ERROR"

    def execute(inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        try:
            input_value = None
            for key, value in inputs_map.items():
                if key == 'input':
                    if isinstance(value, dict) and 'inputValue' in value:
                        input_value = value['inputValue']
                    else:
                        input_value = value
                    break
            result = f"Processed: {input_value}"
            return [{
                "success": True,
                "name": "result",
                "resultType": PluginParameterType.STRING,
                "resultDescription": "Plugin execution result",
                "result": result,
                "mimeType": "text/plain"
            }]
        except Exception as e:
            return [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": "Plugin execution error",
                "result": None,
                "error": str(e)
            }]

    def main():
        try:
            inputs_str = sys.stdin.read().strip()
            if not inputs_str:
                raise ValueError("No input provided")
            inputs_list = json.loads(inputs_str)
            inputs_map = {item[0]: item[1] for item in inputs_list}
            results = execute(inputs_map)
            print(json.dumps(results))
        except Exception as e:
            error_result = [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": "Plugin execution error",
                "result": None,
                "error": str(e)
            }]
            print(json.dumps(error_result))

    if __name__ == "__main__":
        main()
    ```
3.  **Create `requirements.txt`**: `requests>=2.28.0` (add your dependencies here)
4.  **Create `manifest.json`**: (See example structure in Section 3)

**Best Practices for Python Plugins:**
*   **Error Handling**: Always wrap plugin logic in try-catch blocks.
*   **Input Validation**: Validate all inputs before processing.
*   **Authentication**: Use SecurityManager for service-to-service calls.
*   **Logging**: Use Python logging module for debugging.
*   **Dependencies**: Keep `requirements.txt` minimal and up-to-date.

### 4.2. Container Plugin Quick Start
1.  **Create Plugin Directory**: `mkdir container-plugins/my-plugin`
2.  **Create `app.py` (Flask application)**:
    ```python
    from flask import Flask, request, jsonify
    import logging

    app = Flask(__name__)
    logging.basicConfig(level=logging.INFO)

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({"status": "healthy"})

    @app.route('/execute', methods=['POST'])
    def execute():
        try:
            data = request.get_json()
            result = f"Processed: {data}"
            return jsonify({
                "success": True,
                "result": result
            })
        except Exception as e:
            return jsonify({
                "success": False,
                "error": str(e)
            }), 500

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=8080)
    ```
3.  **Create `Dockerfile`**:
    ```dockerfile
    FROM python:3.9-slim

    WORKDIR /app
    COPY requirements.txt .
    RUN pip install -r requirements.txt

    COPY app.py .
    EXPOSE 8080

    CMD ["python", "app.py"]
    ```
4.  **Create `requirements.txt`**: `flask>=2.0.0`
5.  **Create `manifest.json`**: (See example structure in Section 3, with `language: "container"` and `container` / `api` fields populated).

### 4.3. Testing Your Plugins
*   **Integration Test Suite**: Run `node scripts/test-plugin-ecosystem.js` for comprehensive testing.
*   **Manual Testing**:
    *   **Plugin Discovery**: `curl http://localhost:5060/plugins`
    *   **Plugin Execution**: `curl -X POST http://localhost:5060/execute -H "Content-Type: application/json" -d '{"actionVerb": "MY_PLUGIN", "inputs": {"input": "test"}}'`

### 4.4. Deployment
1.  **Build Services**: `docker compose build`
2.  **Start System**: `docker compose up -d`
3.  **Verify Plugin Availability**: `curl http://localhost:5020/plugins`

### 4.5. Development Tools
*   **Engineer Service**: Automates plugin creation. Example:
    ```bash
    curl -X POST http://localhost:5080/createPlugin \
      -H "Content-Type: application/json" \
      -d '{
        "verb": "NEW_PLUGIN",
        "context": {"goal": "Create a new plugin"},
        "guidance": "Plugin requirements",
        "language": "python"
      }'
    ```
*   **Marketplace Service**: For discovering and managing plugins. Example:
    *   List all plugins: `curl http://localhost:5050/plugins`
    *   Get specific plugin: `curl http://localhost:5050/plugins/plugin-MY_PLUGIN`

## 5. Plugin Creation and Generation (`Engineer` Service)
The `Engineer` service plays a crucial role in generating high-quality plugin code and manifests.

### 5.1. Prompt Refinement for `ACCOMPLISH.ts` (Planning & Suggestion)
The `ACCOMPLISH` service, responsible for mission planning, is guided to suggest appropriate plugins.
*   **Structured Input for Capabilities**: Encourage `ACCOMPLISH` to break down user goals into required capabilities with defined inputs, outputs, and descriptions.
*   **Contextual Awareness of Existing Plugins**: Provide `ACCOMPLISH` with an up-to-date summary of available plugins and their declared capabilities (verbs).
*   **Prioritization of Simpler/Verified Plugins**: Guide `ACCOMPLISH` to prefer simpler, well-tested, or officially verified plugins when multiple options exist.
*   **Structured Output for Plugin Plan**: Request a structured plan (e.g., JSON) clearly listing the sequence of plugins, specific verbs, and parameters. If a new plugin is needed, the output should state its requirements.

### 5.2. Prompt Refinement for `Engineer.ts` (Code Generation)
The `Engineer` service's LLM is prompted with detailed specifications for plugin generation.
*   **Detailed Functional Specification**: Provide clear and detailed plugin requirements, including `pluginName`, `language` (strongly preferring Python), `description`, `verbs` (with `name`, `description`, `inputs`, `outputs`), and `dependencies`.
*   **Emphasis on Python and Best Practices**: Explicitly state Python 3.9+ as preferred, adhere to PEP 8, include clear docstrings, and ensure modularity.
*   **Security Considerations**: Mandate secure coding practices: validate/sanitize all inputs, avoid unsafe functions (`eval`, direct OS commands), and handle secrets via environment variables or secure mechanisms (not hardcoded).
*   **Error Handling and Logging**: Require comprehensive error handling (try-except blocks for I/O, API calls) and informative logging.
*   **Test Generation**: Request generation of unit tests (using `unittest` or `pytest`) covering happy paths, edge cases, and error handling.
*   **Manifest File Generation**: Instruct the LLM to generate a complete `plugin-manifest.json` file accurately reflecting the plugin's capabilities.
*   **Iterative Refinement**: Structure interactions for iterative refinement if the LLM API supports it.

## 6. Plugin Validation Improvements
Before a plugin is signed and stored, it undergoes rigorous validation within the `Engineer` service or a dedicated validation pipeline.

### 6.1. Stricter Manifest Validation
*   **Proposal**: Implement validation of `plugin-manifest.json` against a predefined JSON schema.
*   **Details**: A comprehensive JSON schema specifies all required fields, their types, formats (e.g., semantic versioning), and allowed values. This catches structural and type errors early.

### 6.2. Static Code Analysis
*   **Proposal**: Integrate automated static analysis tools into the validation pipeline.
*   **Details**:
    *   **For Python**: Use `pylint` and `flake8` (configured with `flake8-bandit` for security vulnerabilities) with strict rulesets.
    *   **For JavaScript**: Use `eslint` with appropriate plugins (e.g., `eslint-plugin-security`) and a strict configuration.
    *   A high severity finding or a score below a certain threshold should fail the validation.

### 6.3. Test Execution (Advanced Validation)
*   **Proposal**: Execute the LLM-generated unit tests in a sandboxed environment.
*   **Details**: The `Engineer` service sets up a secure, isolated environment (e.g., Docker container), installs dependencies, runs the test suite, and captures results. A failing test suite or low test coverage can reject the plugin. This is an advanced step due to infrastructure complexity.

## 7. Plugin Signing and Verification
Cryptographic signing is essential to ensure plugin integrity and authenticity.

### 7.1. Single Point of Signing
Plugin signing occurs at a single, trusted point in the lifecycle, ideally the `Engineer` service (or a closely integrated signing service) *after* all validation steps are passed. This centralizes key management and ensures only validated plugins are signed.

### 7.2. Mandatory Signature Verification
*   **`CapabilitiesManager`**: Before loading or executing *any* plugin, `CapabilitiesManager` *must* cryptographically verify its signature against a trusted public key. Failure results in rejection and an alert.
*   **`PluginMarketplace` / `PluginProvider` Implementations**: When plugins are fetched from any repository, the fetching mechanism or marketplace service verifies the plugin's signature upon retrieval. Failure flags the plugin or prevents its return.

### 7.3. Removal of Temporary Bypasses
Any existing flags, environment variables, or code paths that allow bypassing signature verification (e.g., `TRUST_UNSIGNED_PLUGINS=true`) are removed entirely, as they create significant security vulnerabilities.

### 7.4. Key Management
*   **Recommendation**: Use strong asymmetric cryptography (e.g., RSA, ECDSA). Private signing keys must be securely managed (e.g., HSM, KMS) with strictly limited access. Public keys for verification are securely distributed.
*   **Rationale**: Proper key management is fundamental to the security of the signing process.

### 7.5. Future Considerations
*   **Certificate-Based Signing**: Evolve towards a PKI model for granular trust and revocation.
*   **Key Rotation**: Implement policies for regular rotation of signing keys.
*   **Transparency Logs**: Consider using transparency logs for auditable records of plugin signing activities.

## 8. Plugin Versioning and Compatibility
Plugin versioning allows for the safe evolution of plugins over time, using semantic versioning (SemVer) to track versions and ensure compatibility.

### 8.1. Semantic Versioning (SemVer)
Plugins follow the `MAJOR.MINOR.PATCH` format:
*   **MAJOR**: Incremented for incompatible API changes.
*   **MINOR**: Incremented for backward-compatible functionality additions.
*   **PATCH**: Incremented for backward-compatible bug fixes.

### 8.2. Version Compatibility Rules
The system checks for version compatibility when updating plugins:
*   **Major Version**: Different major versions are considered incompatible.
*   **Input Parameters**: Removing or changing the type of input parameters is a breaking change.
*   **Output Parameters**: Removing or changing the type of output parameters is a breaking change.
*   **Required Parameters**: Making an optional parameter required is a breaking change.
*   **Security Permissions**: Adding new permissions is flagged as a potential issue.

### 8.3. Implementation Details
*   `shared/src/versioning/semver.ts`: Semantic versioning utilities.
*   `shared/src/versioning/compatibilityChecker.ts`: Version compatibility checking.
These features are integrated into the CapabilitiesManager for plugin registration, execution, and updates.

### 8.4. Usage
When creating a plugin, specify the version and security settings in the manifest. When updating, increment the version number according to SemVer rules and ensure backward compatibility or increment the major version.

## 9. Plugin Management and Repositories
A consistent `PluginProvider` interface abstracts the underlying storage mechanisms for plugin artifacts (`plugin-manifest.json` and associated files).

### 9.1. Core Principle
The `PluginManifest.entryPoint.files` array contains relative paths to code/test files. When a component requests a plugin's file, the respective repository implementation fetches the content as a `Buffer` or `ReadableStream`.

### 9.2. Repository Types
*   **`GitHubRepository` / `GitRepository`**: Manifest and files are stored as regular files in a Git repository.
*   **`LocalRepository`**: Manifest and files are stored as regular files in the local filesystem.
*   **`MongoRepository`**: The `plugin-manifest.json` content is stored as a document in a MongoDB collection. For file storage, **GridFS is recommended** for scalability, handling files of any size by chunking them, and keeping the main manifest document smaller.

### 9.3. Consistency in `entryPoint.files` Presentation
Regardless of the backing store, `PluginManifest.entryPoint.files` always contains *relative paths*. Consumers of plugin data are decoupled from storage specifics.

## 10. Plugin Security Features
The plugin security system is enhanced to provide better isolation and protection against malicious plugins.

### 10.1. Permission System
Plugins declare the permissions they need in their `security.permissions` manifest field.
*   **Available Permissions**: `fs.read`, `fs.write`, `fs.delete` (File System); `net.fetch`, `net.listen` (Network); `process.exec`, `process.env` (Process); `env.read`, `env.write` (Environment); `db.read`, `db.write` (Database); `system.info`, `system.eval` (System).
*   Permissions are categorized by danger level, with some requiring explicit user approval.
*   **Implementation**: `shared/src/security/pluginPermissions.ts`.

### 10.2. Sandbox Environment
JavaScript plugins are executed in a secure sandbox environment using the `vm2` library.
*   **Features**: Resource Limits (Memory, CPU), Module Access Control (only allowed modules), API Restrictions (only allowed APIs), Timeout Protection (plugins terminated if they run too long).
*   **Implementation**: `shared/src/security/pluginSandbox.ts`.

### 10.3. Code Signing
Plugins are signed to verify their authenticity and ensure they haven't been tampered with.
*   **Process**: Signature Generation (hash of critical properties), Signature Verification, optional Trust Certificates for publisher verification.
*   **Implementation**: `shared/src/security/pluginSigning.ts`.

### 10.4. Security Validation
The system performs several security checks before executing plugins:
*   Permission Validation (ensures all requested permissions are valid).
*   Dangerous Permission Detection (flags plugins with dangerous permissions).
*   Sandbox Configuration Validation.
*   Signature Verification.

## 11. External Tool Integration via OpenAPI
Integrating external tools via their OpenAPI specifications is a key strategy for expanding agent capabilities.

### 11.1. First-Class Capabilities
External tools defined by OpenAPI specifications are treated as first-class capabilities, registered and managed by the Tool Manager.

### 11.2. Definition and Registration
An OpenAPI specification (v2 Swagger or v3 OpenAPI) serves as the core definition. Registration involves providing a unique name, description, the OpenAPI specification itself, `languageType: "openapi"`, and authentication configuration details. Optional explicit mappings from OpenAPI `operationIds` to system `actionVerbs` can be provided.

### 11.3. Execution by Tool Manager
The Tool Manager includes a specialized module for executing calls to OpenAPI-defined tools. It retrieves the tool's definition, identifies the correct API operation, validates inputs, constructs the HTTP request, handles authentication securely, executes the API call, and processes the response.

### 11.4. Discovery
*   **Manual Registration**: Primary method via the Engineer & Operations Interface.
*   **Automated Discovery (Advanced)**: The Tool Manager's Tool Discovery Engine can scan OpenAPI registries or URLs to propose new external tools for registration (with human oversight recommended).

### 11.5. Authentication
Authentication for external APIs is critical. Registration defines the mechanism (API Key, OAuth2, Basic Auth). The Tool Manager's OpenAPI execution module integrates with a secure platform secrets management system (e.g., HashiCorp Vault, AWS Secrets Manager) to retrieve credentials at runtime. **No secrets are stored directly in tool definitions or manifests.**

## 12. Role of the Planning Engine and ACCOMPLISH-like Logic
The Planning Engine is responsible for creating plans to achieve agent goals. It queries the Tool Manager to find suitable capabilities (internal plugins, containerized plugins, OpenAPI tools, agent-composed tools) that match the required `actionVerbs` or sub-goals.
Logic previously associated with a specific `ACCOMPLISH` plugin is now part of the sophisticated planning capabilities of the Planning Engine or implemented as advanced, reusable Plan Templates.
The Planning Engine understands different capability types and their parameters (via manifests/schemas). The Execution Engine then interacts with the Tool Manager to invoke the chosen tool/plugin.

## 13. Future Improvements
While significant improvements have been made, future enhancements include:
*   More Granular Permissions.
*   Better Isolation between plugins.
*   Performance Optimization of the sandbox.
*   A Plugin Marketplace with automatic updates.
*   Improved Plugin Dependencies management.
*   Implementation of Digital Signatures using proper asymmetric cryptography.
*   Interactive User Approval for dangerous permissions.
*   Comprehensive Audit Logging of all plugin executions for security auditing.
