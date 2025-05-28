Stage7 Agent System: Refined Architecture for Enhanced Agency
Table of Contents:

1. Executive Summary & Analysis
2. Architectural Principles & Design Philosophy
3. Core Service Architecture
4. Implementation Strategy & Roadmap
5. Technical Specifications
6. Migration & Rollback Plan

1. Executive Summary & Analysis

1.1. Current State Assessment
After analyzing the develop branch changes and the original architecture, several key issues have been identified:

**Problems with Develop Branch Changes:**
- The concept of capabilitiesManager as a central orchestrator has been lost
- Introduction of pluginOrchestrator creates unnecessary complexity and architectural confusion
- Two separate git repository handlers were created, causing duplication
- The system has moved away from the clean separation of concerns in the original design
- Over-engineering of plugin execution with multiple abstraction layers

**What Should Be Preserved:**
- The core service architecture (PostOffice, Brain, Engineer, CapabilitiesManager, Marketplace)
- The clean plugin execution model from the original system
- The centralized message routing through PostOffice
- The authentication and security framework
- The modular service design with clear responsibilities

**What Should Be Enhanced:**
- External tool integration (OpenAPI support)
- Plugin management and versioning
- Plan reusability and template system
- User interaction capabilities
- Learning and experience capture

1.2. Architectural Vision
The refined architecture maintains the proven service-oriented design while adding strategic enhancements for agency, tool integration, and user collaboration. The focus is on evolution, not revolution - building upon the solid foundation while addressing specific capability gaps.

2. Architectural Principles & Design Philosophy

2.1. Core Principles
- **Service Autonomy**: Each service maintains its own domain and can operate independently
- **Capability-Centric Design**: Focus on what the system can do (capabilities) rather than how it does it (implementation details)
- **Progressive Enhancement**: Build upon existing proven components rather than replacing them
- **User-Centric Agency**: Enable meaningful human-AI collaboration through shared workspaces and transparent planning
- **Evolutionary Architecture**: Support continuous improvement and learning without breaking existing functionality

2.2. Design Philosophy
The Stage7 system should be:
- **Predictable**: Clear, consistent behavior that users and developers can rely on
- **Extensible**: Easy to add new capabilities without modifying core services
- **Resilient**: Graceful degradation when components fail or are unavailable
- **Transparent**: Users can understand what the system is doing and why
- **Collaborative**: Seamless integration between human expertise and AI capabilities

3. Core Service Architecture

3.1. Service Overview
The refined architecture maintains the existing proven services while enhancing their capabilities:

**Core Services (Existing - Enhanced):**
- **PostOffice**: Central message routing and service discovery
- **Brain**: LLM orchestration and model management
- **CapabilitiesManager**: Plugin and capability orchestration (restored to central role)
- **Engineer**: Tool and plugin creation
- **Marketplace**: Plugin discovery and management
- **Librarian**: Data persistence and retrieval
- **MissionControl**: Mission lifecycle management
- **TrafficManager**: Agent and container orchestration

**Enhanced Capabilities (New):**
- **Plan Templates**: Reusable, abstract plan definitions
- **Execution Context**: Stateful plan execution tracking
- **Tool Registry**: Unified registry for plugins, OpenAPI tools, and composed tools
- **User Workspace**: Shared file and collaboration space
- **Learning Engine**: Experience capture and pattern recognition

3.2. CapabilitiesManager - Restored Central Role
The CapabilitiesManager returns to its intended role as the central orchestrator for all system capabilities:

**Core Responsibilities:**
- Plugin discovery, loading, and execution
- Plan template management and instantiation
- Tool registry maintenance (plugins, OpenAPI tools, composed tools)
- Capability matching and selection
- Execution context management
- Integration with Engineer for dynamic tool creation

**Key Interfaces:**
- `/execute` - Execute a capability (plugin, plan template, or tool)
- `/capabilities` - List available capabilities
- `/plans` - Manage plan templates
- `/tools` - Manage tool registry
- `/learn` - Submit execution results for learning

3.3. Enhanced Engineer Service
The Engineer service is enhanced to support multiple tool creation strategies:

**Core Responsibilities:**
- Dynamic plugin creation based on capability gaps
- OpenAPI tool integration and registration
- Tool validation and testing
- Plugin packaging and deployment
- Integration with external tool repositories

**Enhanced Capabilities:**
- **Multi-language Support**: Python-first with containerized polyglot support
- **OpenAPI Integration**: Automatic tool discovery and registration from OpenAPI specs
- **Tool Composition**: Create composite tools from existing capabilities
- **Validation Pipeline**: Automated testing and validation of created tools
- **Version Management**: Handle tool versioning and compatibility

3.4. Enhanced Marketplace Service
The Marketplace service becomes the central hub for tool discovery and management:

**Core Responsibilities:**
- Plugin and tool discovery across multiple repositories
- Version management and compatibility checking
- Tool metadata and documentation management
- Integration with external tool marketplaces
- Security scanning and trust verification

**Repository Support:**
- **Local Repository**: Built-in plugins and tools
- **Git Repository**: Version-controlled plugin development
- **OpenAPI Registry**: External API tool discovery
- **Package Repositories**: NPM, PyPI, Docker Hub integration
- **Marketplace APIs**: Integration with external tool marketplaces

3.5. Plan Templates and Execution Context
A key enhancement is the separation of plan definitions from execution instances:

**Plan Templates (Abstract Definitions):**
- Reusable blueprints for common workflows
- Define sequence of abstract steps and control flow
- Parameterized inputs and expected outputs
- Version controlled and shareable
- Can be composed from other templates

**Execution Context (Live Instances):**
- Stateful execution of a plan template
- Tracks step progress and intermediate results
- Manages data flow between steps
- Handles error recovery and user intervention
- Persists execution history for learning

**Example Plan Template Structure:**
```yaml
id: "web-research-and-summarize"
version: "1.0.0"
description: "Research a topic online and create a summary"
inputs:
  - name: "topic"
    type: "string"
    description: "Research topic"
  - name: "max_sources"
    type: "number"
    default: 5
tasks:
  - id: "search"
    actionVerb: "WEB_SEARCH"
    inputs:
      query: "{{inputs.topic}}"
      max_results: "{{inputs.max_sources}}"
    outputs:
      - name: "results"
        type: "array"
        description: "Search results from web"
      - name: "source_count"
        type: "number"
        description: "Number of sources found"
  - id: "summarize"
    actionVerb: "SUMMARIZE"
    inputs:
      content: "{{tasks.search.outputs.results}}"
    outputs:
      - name: "summary"
        type: "string"
        description: "Generated summary text"
      - name: "key_points"
        type: "array"
        description: "List of key points extracted"
    depends_on: ["search"]
outputs:
  - name: "summary"
    source: "tasks.summarize.outputs.summary"
  - name: "key_points"
    source: "tasks.summarize.outputs.key_points"
```

3.6. User Workspace and Collaboration
A new capability for seamless human-AI collaboration:

**Shared File Space:**
- Browser-accessible file system for users and agents
- Version controlled document collaboration
- Real-time file sharing and editing
- Integration with agent workflows

**Interactive Planning:**
- Visual plan template editor
- Real-time execution monitoring
- User intervention points in workflows
- Collaborative plan refinement

**Communication Channels:**
- WebSocket-based real-time updates
- Structured agent-to-user messaging
- Context-aware notifications
- Progress tracking and reporting

4. Implementation Strategy & Roadmap

4.1. Phase 1: Core Architecture Restoration (Weeks 1-2)
**Objective**: Restore the clean service architecture and remove problematic develop branch changes

**Tasks:**
1. **Revert Problematic Changes**
   - Remove pluginOrchestrator complexity
   - Restore capabilitiesManager to central role
   - Consolidate duplicate git repository handlers
   - Simplify plugin execution pipeline

2. **Enhance Core Services**
   - Upgrade capabilitiesManager with tool registry
   - Add plan template support to capabilitiesManager
   - Enhance marketplace with version management
   - Add OpenAPI tool discovery to engineer

3. **Preserve Valuable Additions**
   - Keep improved error handling and structured errors
   - Maintain enhanced security and authentication
   - Preserve plugin versioning and compatibility checking
   - Keep improved package dependency management

4.2. Phase 2: Enhanced Capabilities (Weeks 3-4)
**Objective**: Add new capabilities while maintaining system stability

**Tasks:**
1. **Plan Template System**
   - Design and implement plan template schema
   - Add template storage and retrieval to librarian
   - Implement template execution engine in capabilitiesManager
   - Create basic template library (common workflows)

2. **OpenAPI Tool Integration**
   - Implement OpenAPI spec parsing and validation
   - Add automatic tool registration from OpenAPI specs
   - Create tool execution engine for external APIs
   - Add authentication and security for external tools

3. **Enhanced Plugin Management**
   - Implement Python-first plugin development
   - Add containerized plugin support
   - Create plugin validation and testing pipeline
   - Enhance plugin versioning and compatibility

4.3. Phase 3: User Collaboration (Weeks 5-6)
**Objective**: Enable seamless human-AI collaboration

**Tasks:**
1. **User Workspace**
   - Implement shared file system with browser access
   - Add real-time file collaboration features
   - Create integration with agent workflows
   - Add version control for collaborative documents

2. **Interactive Planning**
   - Create visual plan template editor
   - Implement real-time execution monitoring
   - Add user intervention points in workflows
   - Create collaborative plan refinement tools

3. **Communication Enhancement**
   - Upgrade WebSocket infrastructure for real-time updates
   - Implement structured agent-to-user messaging
   - Add context-aware notifications
   - Create comprehensive progress tracking

4.4. Phase 4: Learning and Optimization (Weeks 7-8)
**Objective**: Add learning capabilities and system optimization

**Tasks:**
1. **Learning Engine**
   - Implement execution history capture and analysis
   - Add pattern recognition for common workflows
   - Create automatic plan template generation from successful executions
   - Implement tool performance tracking and optimization

2. **System Optimization**
   - Add comprehensive monitoring and metrics
   - Implement performance optimization based on usage patterns
   - Create automated testing and validation pipelines
   - Add system health monitoring and alerting

3. **Advanced Features**
   - Implement tool composition from existing capabilities
   - Add semantic search for tools and templates
   - Create recommendation engine for tools and workflows
   - Add advanced error recovery and self-healing capabilities

5. Technical Specifications

5.1. Plugin and Tool Architecture
**Plugin Types:**
- **Internal Plugins**: Python-first, with TypeScript legacy support
- **Containerized Plugins**: Multi-language support via Docker
- **OpenAPI Tools**: External API integration
- **Composed Tools**: Combinations of existing tools
- **Plan Templates**: Reusable workflow definitions

**Plugin Manifest Schema:**
```json
{
  "id": "unique-plugin-id",
  "name": "Human Readable Name",
  "version": "1.0.0",
  "actionVerb": "PLUGIN_ACTION",
  "description": "Plugin description",
  "language": "python|javascript|container|openapi|template",
  "entryPoint": {
    "main": "main.py",
    "function": "execute"
  },
  "inputs": [
    {
      "name": "input_name",
      "type": "string|number|boolean|object|array",
      "required": true,
      "description": "Input description"
    }
  ],
  "outputs": [
    {
      "name": "output_name",
      "type": "string|number|boolean|object|array",
      "description": "Output description"
    }
  ],
  "security": {
    "permissions": ["file_read", "network_access"],
    "sandbox": true
  },
  "metadata": {
    "author": "Author Name",
    "tags": ["tag1", "tag2"],
    "category": "utility|analysis|communication"
  }
}
```

5.2. API Specifications
**CapabilitiesManager API:**
```
POST /execute
  - Execute a capability (plugin, plan template, or tool)
  - Body: { actionVerb, inputs, context }
  - Response: { success, outputs, executionId }

GET /capabilities
  - List available capabilities
  - Query params: category, search, type
  - Response: { capabilities: [...] }

POST /plans
  - Create or update plan template
  - Body: { template definition }
  - Response: { templateId, version }

GET /plans/{id}
  - Get plan template by ID
  - Response: { template definition }

POST /tools/register
  - Register new tool (plugin, OpenAPI, etc.)
  - Body: { manifest, source }
  - Response: { toolId, status }

GET /tools/{id}/versions
  - Get all versions of a tool
  - Response: { versions: [...] }
```

**Engineer API:**
```
POST /createPlugin
  - Create new plugin from specification
  - Body: { verb, context, guidance }
  - Response: { plugin definition }

POST /tools/openapi
  - Register OpenAPI tool
  - Body: { spec_url, auth_config }
  - Response: { tool_id, capabilities }

POST /validate
  - Validate plugin or tool
  - Body: { manifest, code }
  - Response: { valid, issues }
```

5.3. Data Models
**Plan Template:**
```typescript
interface PlanTemplate {
  id: string;
  version: string;
  name: string;
  description: string;
  inputs: ParameterDefinition[];
  outputs: ParameterDefinition[];
  tasks: PlanTask[];
  metadata: {
    author: string;
    created: Date;
    tags: string[];
    category: string;
  };
}

interface PlanTask {
  id: string;
  actionVerb: string;
  inputs: { [key: string]: string | ParameterReference };
  outputs: ParameterDefinition[];
  dependsOn: string[];
  condition?: string;
  retry?: RetryPolicy;
}
```

**Execution Context:**
```typescript
interface ExecutionContext {
  id: string;
  planTemplateId: string;
  planTemplateVersion: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  inputs: { [key: string]: any };
  steps: StepExecution[];
  outputs: { [key: string]: any };
  metadata: {
    startTime: Date;
    endTime?: Date;
    userId: string;
    parentExecutionId?: string;
  };
}

interface StepExecution {
  taskId: string;  // References the task ID from the plan template
  stepId: string;  // Unique execution instance ID
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  inputs: { [key: string]: any };
  outputs: { [key: string]: any };
  startTime?: Date;
  endTime?: Date;
  error?: string;
  retryCount: number;
}
```

6. Migration & Rollback Plan

6.1. Rollback Strategy
**Immediate Actions (Week 1):**
1. **Create Rollback Branch**: Preserve current develop branch state
2. **Identify Valuable Changes**: Extract useful improvements from develop branch
3. **Revert to Main**: Start from stable main branch as baseline
4. **Selective Integration**: Carefully integrate valuable changes

**Rollback Criteria:**
- Remove pluginOrchestrator and related complexity
- Restore capabilitiesManager as central orchestrator
- Consolidate duplicate repository handlers
- Simplify plugin execution pipeline
- Preserve error handling improvements
- Keep security and authentication enhancements

6.2. Migration Path

**Phase 1: Core Architecture Restoration (COMPLETED)**
✅ **Rollback Branch Created**: `develop-rollback` branch preserves original develop state
✅ **CapabilitiesManager Restored**: Reverted to clean, focused service architecture
✅ **PluginOrchestrator Removed**: Eliminated unnecessary complexity and abstraction layers
✅ **Service Consolidation**: Removed duplicate orchestration and services directories
✅ **Build Verification**: All TypeScript compilation issues resolved
✅ **Import Fixes**: Corrected marketplace integration and type compatibility
✅ **Core Functionality**: Plugin execution, unknown verb handling, and engineer integration working

**Current State (End of Phase 1):**
- CapabilitiesManager restored as central orchestrator
- Clean service architecture with proper separation of concerns
- All existing plugin execution functionality preserved
- Build system working correctly
- Ready for Phase 2 enhancements

**Detailed Phase 1 Accomplishments:**

*Architecture Restoration:*
- Reverted `services/capabilitiesmanager/src/index.ts` to clean singleton export pattern
- Restored `CapabilitiesManager.ts` as the main service class with proper BaseEntity inheritance
- Removed complex `PluginOrchestrator` abstraction layer that obscured core functionality
- Eliminated redundant `ApiRouterService`, `PluginExecutionService`, and `UnknownVerbWorkflowService`
- Consolidated all plugin execution logic back into the main CapabilitiesManager class

*Build System Fixes:*
- Resolved TypeScript compilation errors related to method signature mismatches
- Fixed import paths for error handling utilities
- Corrected PluginMarketplace.fetchOne method calls with proper parameter signatures
- Rebuilt marketplace package to ensure type compatibility
- Verified successful compilation of the entire capabilitiesmanager service

*Type System Corrections:*
- Fixed PluginDefinition vs PluginManifest type mismatches in execution pipeline
- Added proper type conversions for plugin preparation and execution
- Corrected engineer service integration with proper parameter counts
- Ensured compatibility between shared package types and service implementations

*Preserved Valuable Features:*
- Maintained enhanced error handling with structured error reporting
- Kept improved authentication and security framework
- Preserved plugin versioning and compatibility checking
- Retained robust plugin validation and permission checking

**Issues Resolved:**
1. **Architectural Complexity**: Removed unnecessary abstraction layers that made the system harder to understand and maintain
2. **Duplicate Functionality**: Consolidated multiple git repository handlers into single implementation
3. **Type Mismatches**: Fixed all TypeScript compilation errors and type compatibility issues
4. **Build Failures**: Resolved all build system issues and verified successful compilation
5. **Service Confusion**: Restored clear separation of concerns with CapabilitiesManager as central orchestrator

**Readiness for Phase 2:**
The system is now ready to proceed with Phase 2 enhancements. The clean architecture provides a solid foundation for:
- Adding plan template functionality without architectural conflicts
- Integrating OpenAPI tools through the restored CapabilitiesManager
- Implementing user collaboration features on proven service patterns
- Building learning capabilities on the existing execution pipeline

**Commit Status:**
- All changes committed to develop branch with backup in `develop-rollback`
- Build system verified and working
- No breaking changes to existing API contracts
- Ready for incremental Phase 2 development

**Phase 2: Enhanced Capabilities (NEXT - Weeks 3-4)**
- Design and implement plan template schema
- Add template storage and retrieval to librarian
- Implement template execution engine in capabilitiesManager
- Create basic template library (common workflows)
- Implement OpenAPI spec parsing and validation
- Add automatic tool registration from OpenAPI specs
- Create tool execution engine for external APIs
- Add authentication and security for external tools

**Phase 3: User Collaboration (Weeks 5-6)**
- Implement shared file system with browser access
- Add real-time file collaboration features
- Create integration with agent workflows
- Add version control for collaborative documents
- Create visual plan template editor
- Implement real-time execution monitoring
- Add user intervention points in workflows
- Create collaborative plan refinement tools

**Phase 4: Learning and Optimization (Weeks 7-8)**
- Implement execution history capture and analysis
- Add pattern recognition for common workflows
- Create automatic plan template generation from successful executions
- Implement tool performance tracking and optimization
- Add comprehensive monitoring and metrics
- Implement performance optimization based on usage patterns
- Create automated testing and validation pipelines
- Add system health monitoring and alerting

6.3. Risk Mitigation
**Technical Risks:**
- **Service Integration Issues**: Comprehensive testing at each phase
- **Data Migration Problems**: Backup and rollback procedures for all data
- **Performance Degradation**: Monitoring and optimization at each step
- **Security Vulnerabilities**: Security review at each phase

**Operational Risks:**
- **User Disruption**: Phased rollout with user communication
- **Development Delays**: Buffer time and scope flexibility
- **Resource Constraints**: Clear prioritization and resource allocation

**Success Metrics:**
- All existing functionality preserved and working
- New capabilities delivered on schedule
- Performance maintained or improved
- User satisfaction with new features
- Developer productivity improvements

7. Conclusion

This refined architecture for the Stage7 agent system provides a clear path forward that:

**Preserves Proven Architecture:**
- Maintains the successful service-oriented design
- Keeps the clean separation of concerns
- Preserves the robust authentication and security framework
- Maintains the proven plugin execution model

**Addresses Current Issues:**
- Removes unnecessary complexity from the develop branch
- Restores the capabilitiesManager to its central orchestrator role
- Consolidates duplicate functionality
- Simplifies the plugin execution pipeline

**Enables Enhanced Agency:**
- Adds plan template system for reusable workflows
- Integrates external tools via OpenAPI specifications
- Provides user workspace for human-AI collaboration
- Implements learning capabilities for continuous improvement

**Supports Future Growth:**
- Extensible architecture for new tool types
- Scalable execution engine for complex workflows
- Flexible plugin system supporting multiple languages
- Comprehensive monitoring and optimization capabilities

The implementation strategy provides a clear 8-week roadmap that minimizes risk while delivering significant value. By starting with architectural restoration and building incrementally, we ensure system stability while adding powerful new capabilities.

This approach transforms Stage7 from a plugin execution system into a true agent collaboration platform, enabling seamless integration between human expertise and AI capabilities while maintaining the reliability and performance that users depend on.