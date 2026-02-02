# Project Task List

This list outlines the tasks to address the identified gaps in the plugin configuration and documentation system.

### Implementation Tasks

- **[META] Unify and complete the plugin configuration and secrets management system.**
  - **Status:** pending

- **[Implementation] Modify the PluginExecutor to correctly pass database-retrieved 'credentials' to Python plugins, likely by serializing them into a dedicated environment variable.**
  - **Status:** pending

- **[Implementation] Modify the PluginExecutor and ContainerManager to support injecting dynamic configuration (from ConfigManager) and secrets into Container plugins at runtime, likely via Docker's '--env-file' or '--env' flags.**
  - **Status:** pending

### Documentation Tasks

- **[Documentation] Create a new comprehensive guide: 'Plugin Configuration & Secrets Management'.**
  - **Status:** pending

- **[Documentation] In the new guide, document the end-to-end process for developers to access secrets and configuration within JavaScript plugins.**
  - **Status:** pending

- **[Documentation] In the new guide, document the corrected end-to-end process for developers to access secrets and configuration within Python plugins.**
  - **Status:** pending

- **[Documentation] In the new guide, document the corrected end-to-end process for developers to access secrets and configuration within Container plugins.**
  - **Status:** pending

- **[Documentation] In the new guide, document the 'credentialSource' pattern for providing secrets to OpenAPI and MCP tools.**
  - **Status:** pending
