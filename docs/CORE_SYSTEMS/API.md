### AgentSet

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the AgentSet service.
**Output:**
- 200: `{ "status": "healthy", "timestamp": "string", "message": "string", "agentCount": "number" }`

#### GET /ready
**Description:** Checks if the AgentSet service is ready to accept requests.
**Output:**
- 200: `{ "ready": "boolean", "timestamp": "string", "message": "string", "registeredWithPostOffice": "boolean" }`

#### POST /message
**Description:** Handles messages for the AgentSet or specific agents.
**Input:**
```json
{
  "forAgent?": "string",
  "content": {
    "missionId?": "string",
    "[other message properties]": "any"
  },
  "missionId?": "string"
}
```
**Output:**
- 200: `{ "status": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if message delivery fails)

#### POST /addAgent
**Description:** Adds a new agent to the set.
**Input:**
```json
{
  "agentId": "string",
  "actionVerb": "string",
  "inputs": "object",
  "missionId": "string",
  "missionContext": "string",
  "roleId?": "string",
  "roleCustomizations?": "any"
}
```
**Output:**
- 200: `{ "message": "string", "agentId": "string" }`

#### POST /createSpecializedAgent
**Description:** Creates a new specialized agent with a specific role.
**Input:**
```json
{
  "roleId": "string",
  "missionId": "string",
  "missionContext": "string"
}
```
**Output:**
- 200: `{ "agentId": "string" }`

#### POST /removeAgent
**Description:** Endpoint for agents to notify of their terminal state for removal from the AgentSet.
**Input:**
```json
{
  "agentId": "string",
  "status": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if agentId or status are missing)
- 500: `{ "error": "string" }` (if processing removal fails)

#### POST /agent/:agentId/message
**Description:** Sends a message to a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Input:**
- Body: `any` (message object)
**Output:**
- 200: `{ "status": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if message delivery fails)

#### GET /agent/:agentId
**Description:** Retrieves the state of a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `AgentState` object (detailed agent state)
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if fetching agent state fails)

#### GET /agent/:agentId/output
**Description:** Retrieves the final output of a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `{ "agentId": "string", "status": "string", "finalOutput?": "any", "message?": "string", "lastCompletedStepId?": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if fetching output fails)

#### POST /pauseAgents
**Description:** Pauses all agents for a specific mission.
**Input:**
```json
{
  "missionId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if missionId is missing)
- 500: `{ "error": "string" }`

#### POST /abortAgents
**Description:** Signals all agents for a specific mission to abort.
**Input:**
```json
{
  "missionId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if missionId is missing)
- 500: `{ "error": "string" }`

#### POST /delegateTask
**Description:** Delegates a task to another agent.
**Input:**
```json
{
  "delegatorId": "string",
  "recipientId": "string",
  "request": {
    "taskId": "string",
    "taskType": "string",
    "description": "string",
    "inputs": "object",
    "deadline?": "string",
    "priority?": "string",
    "context?": "object"
  }
}
```
**Output:**
- 200: `{ "taskId": "string", "accepted": "boolean", "reason?": "string", "estimatedCompletion?": "string" }`
- 500: `{ "error": "string" }`

#### POST /taskUpdate
**Description:** Updates the status of a delegated task.
**Input:**
```json
{
  "taskId": "string",
  "status": "string",
  "result?": "any",
  "error?": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### POST /conflictVote
**Description:** Submits a vote for a conflict resolution.
**Input:**
```json
{
  "conflictId": "string",
  "agentId": "string",
  "vote": "any",
  "explanation?": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### POST /resolveConflict
**Description:** Resolves a conflict.
**Input:**
```json
{
  "conflictId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### GET /agent/:agentId/conflicts
**Description:** Retrieves conflicts involving a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `{ "conflicts": "array" }`
- 500: `{ "error": "string" }`

#### GET /conflicts/unresolved
**Description:** Retrieves all unresolved conflicts.
**Output:**
- 200: `{ "conflicts": "array" }`
- 500: `{ "error": "string" }`

#### POST /agent/:agentId/role
**Description:** Assigns a role to an agent.
**Parameters:**
- `agentId`: string (in URL)
**Input:**
```json
{
  "roleId": "string",
  "customizations?": "object"
}
```
**Output:**
- 200: `{ "specialization": "object" }`
- 500: `{ "error": "string" }`

#### GET /agent/:agentId/specialization
**Description:** Retrieves the specialization details for a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `{ "specialization": "object" }`
- 500: `{ "error": "string" }`

#### GET /role/:roleId/agents
**Description:** Retrieves agents assigned to a specific role.
**Parameters:**
- `roleId`: string (in URL)
**Output:**
- 200: `{ "agents": "array" }`
- 500: `{ "error": "string" }`

#### GET /roles
**Description:** Retrieves all available roles.
**Output:**
- 200: `{ "roles": "array" }`
- 500: `{ "error": "string" }`

#### POST /roles
**Description:** Creates a new role.
**Input:**
- Body: `AgentRole` object (excluding `id`)
**Output:**
- 200: `{ "role": "object" }`
- 500: `{ "error": "string" }`

#### POST /findBestAgent
**Description:** Finds the best agent for a given task based on role, knowledge domains, and mission.
**Input:**
```json
{
  "roleId": "string",
  "knowledgeDomains?": "string[]",
  "missionId?": "string"
}
```
**Output:**
- 200: `{ "agentId": "string" }`
- 500: `{ "error": "string" }`

#### POST /findAgentWithRole
**Description:** Finds an agent with a specific role within a mission.
**Input:**
```json
{
  "roleId": "string",
  "missionId?": "string"
}
```
**Output:**
- 200: `{ "agentId": "string" | null }`
- 500: `{ "error": "string" }`

#### POST /agent/:agentId/prompt
**Description:** Generates a specialized system prompt for an agent based on a task description.
**Parameters:**
- `agentId`: string (in URL)
**Input:**
```json
{
  "taskDescription": "string"
}
```
**Output:**
- 200: `{ "prompt": "string" }`
- 500: `{ "error": "string" }`

#### GET /knowledgeDomains
**Description:** Retrieves all available knowledge domains.
**Output:**
- 200: `{ "domains": "array" }`
- 500: `{ "error": "string" }`

#### POST /knowledgeDomains
**Description:** Creates a new knowledge domain.
**Input:**
- Body: `KnowledgeDomain` object (excluding `id`)
**Output:**
- 200: `{ "domain": "object" }`
- 500: `{ "error": "string" }`

#### POST /knowledgeItems
**Description:** Adds a new knowledge item to a domain.
**Input:**
- Body: `KnowledgeItem` object (excluding `id`, `createdAt`, `updatedAt`, `version`)
**Output:**
- 200: `{ "item": "object" }`
- 500: `{ "error": "string" }`

#### POST /knowledgeItems/query
**Description:** Queries knowledge items based on specified options.
**Input:**
```json
{
  "domains?": "string[]",
  "tags?": "string[]",
  "query?": "string",
  "limit?": "number",
  "offset?": "number"
}
```
**Output:**
- 200: `{ "items": "array" }`
- 500: `{ "error": "string" }`

#### POST /domainContext
**Description:** Generates domain-specific context for a task.
**Input:**
```json
{
  "domainIds": "string[]",
  "taskDescription": "string"
}
```
**Output:**
- 200: `{ "context": "string" }`
- 500: `{ "error": "string" }`

#### POST /importKnowledge
**Description:** Imports knowledge from an external source into a domain.
**Input:**
```json
{
  "domainId": "string",
  "source": "string",
  "format": "'url' | 'file' | 'api'"
}
```
**Output:**
- 200: `{ "items": "array" }`
- 500: `{ "error": "string" }`

#### POST /collaboration/message
**Description:** Handles collaboration messages from other agent sets.
**Input:**
- Body: `CollaborationMessage` object
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### POST /resumeAgents
**Description:** Resumes all agents for a specific mission.
**Input:**
```json
{
  "missionId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if missionId is missing)
- 500: `{ "error": "string" }`

#### POST /resumeAgent
**Description:** Resumes a specific agent.
**Input:**
```json
{
  "agentId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if agentId is missing)
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }`

#### POST /abortAgent
**Description:** Aborts a specific agent.
**Input:**
```json
{
  "agentId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if agentId is missing)
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }`

#### GET /statistics/:missionId
**Description:** Retrieves statistics for all agents in a mission.
**Parameters:**
- `missionId`: string (in URL)
**Output:**
- 200: `{ "agentsByStatus": "object", "agentsCount": "number", "memoryUsage": "object", "lastGC": "number", "totalSteps": "number" }`
- 400: `string` (if missionId is not provided)
- 500: `{ "error": "string" }`

#### POST /updateFromAgent
**Description:** Updates agent status and statistics from an agent.
**Input:**
```json
{
  "agentId": "string",
  "status": "string",
  "statistics?": "object"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }`

#### GET /agent/step/:stepId
**Description:** Retrieves details for a specific step.
**Parameters:**
- `stepId`: string (in URL)
**Output:**
- 200: `{ "verb": "string", "description": "string", "status": "string", "dependencies": "array", "inputReferences": "object", "inputValues": "object", "results": "any", "agentId": "string" }`
- 400: `{ "error": "string" }` (if stepId is missing)
- 404: `{ "error": "string" }` (if step not found)
- 500: `{ "error": "string" }`

#### POST /saveAgent
**Description:** Saves the current state of an agent to the persistence layer.
**Input:**
```json
{
  "agentId": "string"
}
```
**Output:**
- 200: `{ "message": "string", "agentId": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }`

### Brain

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the Brain service.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### POST /chat
**Description:** Processes a chat request using a suitable LLM model.
**Input:**
```json
{
  "exchanges": "ExchangeType[]",
  "optimization?": "OptimizationType",
  "optionals?": "Record<string, any>",
  "conversationType?": "LLMConversationType"
}
```
**Output:**
- 200: `{ "result": "string", "confidence": "number", "model": "string", "requestId": "string" }`
- 500: `{ "error": "string" }`

#### POST /generate
**Description:** Generates content using a specified or automatically selected LLM model.
**Input:**
```json
{
  "modelName?": "string",
  "optimization?": "OptimizationType",
  "conversationType": "LLMConversationType",
  "convertParams": {
    "max_length?": "number",
    "[other conversion parameters]": "any"
  }
}
```
**Output:**
- 200: `{ "result": "string", "mimeType": "string" }`
- 500: `{ "error": "string" }`

#### GET /getLLMCalls
**Description:** Retrieves the total number of LLM calls made.
**Output:**
- 200: `{ "llmCalls": "number" }`

#### GET /models
**Description:** Retrieves a list of all available LLM models.
**Output:**
- 200: `{ "models": "string[]" }`

#### POST /performance/reset-blacklists
**Description:** Resets all blacklisted models, making them available for selection again.
**Input:** None
**Output:**
- 200: `{ "success": "boolean", "message": "string" }`
- 500: `{ "error": "string" }`

#### POST /feedback
**Description:** Processes feedback related to model performance or plan generation.
**Input:**
```json
{
  "type": "string",
  "success": "boolean",
  "quality_score?": "number",
  "plan_steps?": "any",
  "attempt_number?": "number",
  "error_type?": "string",
  "feedback_scores?": "object"
}
```
**Output:**
- 200: `{ "success": "boolean", "message": "string", "feedback_type": "string", "feedback_success": "boolean" }`
- 400: `{ "error": "string" }` (if unknown feedback type)
- 500: `{ "error": "string" }`

### CapabilitiesManager

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### POST /executeAction
**Description:** Executes a specific action verb (plugin, OpenAPI tool, or MCP tool).
**Input:**
```json
{
  "actionVerb": "string",
  "inputValues": "object",
  "outputs?": "object"
}
```
**Output:**
- 200: `PluginOutput[]` (serialized array of plugin output objects)
- 400: `{ "success": false, "name": "error", "resultType": "PluginParameterType.ERROR", "result": "Error", "error": "string" }` (for invalid actionVerb or input validation errors)
- 401: `{ "success": false, "name": "error", "resultType": "PluginParameterType.ERROR", "result": "Error", "error": "string" }` (for authentication errors)
- 500: `{ "success": false, "name": "error", "resultType": "PluginParameterType.ERROR", "result": "Error", "error": "string" }` (for internal errors or plugin execution failures)

#### GET /health
**Description:** Checks the health status of the CapabilitiesManager service.
**Output:**
- 200: `{ "status": "string", "service": "string", "initialization": "object" }`

#### GET /ready
**Description:** Checks if the CapabilitiesManager service is ready to accept requests.
**Output:**
- 200: `{ "ready": "boolean", "service": "string", "initialization": "object" }` (if ready)
- 503: `{ "ready": "boolean", "service": "string", "initialization": "object" }` (if not ready)

#### GET /plugins
**Description:** Retrieves a list of all registered plugins.
**Query Parameters:**
- `repository?`: `string` (e.g., "local", "github", "librarian-definition")
**Output:**
- 200: `{ "plugins": "PluginLocator[]" }`

#### GET /plugins/:id
**Description:** Retrieves a specific plugin by its ID.
**Parameters:**
- `id`: string (in URL)
**Query Parameters:**
- `repository?`: `string`
**Output:**
- 200: `{ "plugin": "PluginManifest" | "DefinitionManifest" }`
- 404: `{ "error": "string" }`

#### POST /plugins
**Description:** Stores a new plugin or updates an existing one.
**Input:**
- Body: `PluginManifest` or `DefinitionManifest` object
**Output:**
- 201: `{ "success": "boolean" }` (for new plugin)
- 200: `{ "success": "boolean" }` (for update)
- 400: `{ "error": "string", "details": "string" }`

#### PUT /plugins/:id
**Description:** Updates an existing plugin by its ID.
**Parameters:**
- `id`: string (in URL)
**Input:**
- Body: `PluginManifest` or `DefinitionManifest` object
**Output:**
- 200: `{ "success": "boolean" }`
- 400: `{ "error": "string", "details": "string" }`

#### DELETE /plugins/:id
**Description:** Deletes a plugin by its ID.
**Parameters:**
- `id`: string (in URL)
**Query Parameters:**
- `repository?`: `string` (e.g., "librarian-definition")
**Output:**
- 200: `{ "success": "boolean" }`
- 400: `{ "error": "string", "details": "string" }`

#### GET /pluginRepositories
**Description:** Retrieves a list of active plugin repositories.
**Output:**
- 200: `{ "repositories": "object[]" }`

#### POST /message
**Description:** Handles incoming messages for the CapabilitiesManager.
**Input:**
- Body: `Message` object (structure depends on the message type)
**Output:**
- 200: `{ "status": "string" }`
- 500: `{ "error": "object" }` (structured error object)

#### GET /availablePlugins
**Description:** Retrieves a list of all available plugins (code plugins, OpenAPI tools, and MCP tools).
**Output:**
- 200: `PluginLocator[]` (array of plugin locator objects)
- 500: `{ "error": "object" }` (structured error object)

#### POST /generatePluginContext
**Description:** Generates intelligent plugin context based on a goal and constraints.
**Input:**
```json
{
  "goal": "string",
  "constraints?": "object"
}
```
**Output:**
- 200: `object` (generated context)
- 400: `{ "error": "string" }` (if goal is missing or invalid)
- 500: `{ "error": "object" }` (structured error object)

### Engineer

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the Engineer service.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### GET /ready
**Description:** Checks if the Engineer service is ready to accept requests.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### POST /createPlugin
**Description:** Creates a new plugin based on the provided verb, context, guidance, and optional language.
**Input:**
```json
{
  "verb": "string",
  "context": "object",
  "guidance": "string",
  "language?": "string"
}
```
**Output:**
- 200: `PluginDefinition` object or empty object `{}`
- 500: `{ "error": "string" }`

#### POST /tools/openapi
**Description:** Registers a new OpenAPI tool.
**Input:**
```json
{
  "name": "string",
  "description?": "string",
  "specUrl": "string",
  "authentication?": "object",
  "metadata?": "object",
  "baseUrl?": "string"
}
```
**Output:**
- 200: `{ "success": "boolean", "tool?": "OpenAPITool", "errors?": "string[]", "warnings?": "string[]", "discoveredOperations?": "array" }`
- 500: `{ "error": "string" }`

#### GET /tools/openapi/:id
**Description:** Retrieves a specific OpenAPI tool by its ID.
**Parameters:**
- `id`: string (in URL)
**Output:**
- 200: `OpenAPITool` object
- 404: `{ "error": "string" }` (if tool not found)
- 500: `{ "error": "string" }`

#### POST /validate
**Description:** Validates a plugin manifest and optionally its code.
**Input:**
```json
{
  "manifest": "object",
  "code?": "string"
}
```
**Output:**
- 200: `{ "valid": "boolean", "issues": "string[]" }`
- 500: `{ "error": "string" }`

#### POST /message
**Description:** Handles incoming messages for the Engineer.
**Input:**
- Body: `Message` object (structure depends on the message type)
**Output:**
- 200: `{ "status": "string" }`

#### GET /statistics
**Description:** Retrieves statistics about newly created plugins.
**Output:**
- 200: `{ "newPlugins": "string[]" }`

### Librarian

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the Librarian service.
**Output:**
- 200: `{ "status": "healthy", "timestamp": "string", "message": "string" }`

#### POST /assets/:collection/:id
**Description:** Stores a large asset (e.g., file, binary data) in a specified collection.
**Parameters:**
- `collection`: string (in URL)
- `id`: string (in URL)
**Input:** Raw binary data or file stream in the request body. `Content-Type` header should be set.
**Output:**
- 201: `{ "message": "string", "id": "string", "size": "number" }`
- 500: `{ "error": "string" }`

#### GET /assets/:collection/:id
**Description:** Retrieves a large asset from a specified collection.
**Parameters:**
- `collection`: string (in URL)
- `id`: string (in URL)
**Output:**
- 200: Raw binary data or file stream. `Content-Type` header will be set based on stored metadata.
- 404: `{ "error": "string" }` (if asset not found)
- 500: `{ "error": "string" }`

#### POST /storeData
**Description:** Stores data in either MongoDB or Redis.
**Input:**
```json
{
  "id?": "string",
  "data": "any",
  "storageType": "'mongo' | 'redis'",
  "collection?": "string"
}
```
**Output:**
- 200: `{ "status": "string", "id": "string" }`
- 400: `{ "error": "string" }` (if data is missing or if storage type is invalid)
- 500: `{ "error": "string", "details": "string" }`

#### GET /loadData/:id
**Description:** Loads data from either MongoDB or Redis by ID.
**Parameters:**
- `id`: string (in URL)
**Query:**
- `storageType`: "'mongo' | 'redis'" (default: "'mongo'")
- `collection`: `string` (default: "'mcsdata'")
**Output:**
- 200: `{ "data": "any" }`
- 400: `{ "error": "string" }` (if ID is missing or storage type is invalid)
- 404: `{ "error": "string" }` (if data is not found)
- 500: `{ "error": "string", "details": "string" }`

#### GET /loadData
**Description:** Loads data from MongoDB by query parameters. This endpoint is used for specific collections that allow loading all items without an explicit ID.
**Query:**
- `storageType`: "'mongo'" (only mongo supported for this endpoint)
- `collection`: `string` (e.g., "'domain_knowledge'", "'knowledge_domains'", "'agent_specializations'", "'agents'")
**Output:**
- 200: `any[]` (array of data objects)
- 400: `{ "error": "string" }` (if collection or storageType is invalid)
- 500: `{ "error": "string", "details": "string" }`

#### POST /queryData
**Description:** Queries data from MongoDB.
**Input:**
```json
{
  "collection": "string",
  "query": "object",
  "limit?": "number"
}
```
**Output:**
- 200: `{ "data": "any[]" }`
- 400: `{ "error": "string" }` (if collection or query is missing)
- 500: `{ "error": "string", "details": "string" }`

#### GET /getDataHistory/:id
**Description:** Retrieves the version history of data.
**Parameters:**
- `id`: string (in URL)
**Output:**
- 200: `{ "history": "DataVersion[]" }`
- 400: `{ "error": "string" }` (if ID is missing)
- 500: `{ "error": "string", "details": "string" }`

#### POST /searchData
**Description:** Searches data in MongoDB with advanced options.
**Input:**
```json
{
  "collection": "string",
  "query?": "object",
  "options?": "object"
}
```
**Output:**
- 200: `{ "data": "any[]" }`
- 400: `{ "error": "string" }` (if collection is missing)
- 500: `{ "error": "string" }`

#### DELETE /deleteData/:id
**Description:** Deletes data from both MongoDB and Redis.
**Parameters:**
- `id`: string (in URL)
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if ID is missing)
- 500: `{ "error": "string" }`

#### POST /storeWorkProduct
**Description:** Stores a work product in MongoDB.
**Input:**
```json
{
  "agentId": "string",
  "stepId": "string",
  "data": "any"
}
```
**Output:**
- 200: `{ "status": "string", "id": "string" }`
- 400: `{ "error": "string" }` (if agentId or stepId is missing)
- 500: `{ "error": "string", "details": "string" }`

#### GET /loadWorkProduct/:stepId
**Description:** Loads a work product from MongoDB.
**Parameters:**
- `stepId`: string (in URL)
**Output:**
- 200: `{ "data": "WorkProduct" }`
- 400: `{ "error": "string" }` (if stepId is missing)
- 404: `{ "error": "string" }` (if work product is not found)
- 500: `{ "error": "string", "details": "string" }`

#### GET /loadAllWorkProducts/:agentId
**Description:** Loads all work products for a specific agent from MongoDB.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `WorkProduct[]` (array of work product objects)
- 400: `{ "error": "string" }` (if agentId is missing)
- 500: `{ "error": "string" }`

#### GET /getSavedMissions
**Description:** Retrieves saved missions for a user.
**Input:**
```json
{
  "userId": "string"
}
```
**Output:**
- 200: `{ "id": "string", "name": "string" }[]`
- 500: `{ "error": "string", "details": "string" }`

#### DELETE /deleteCollection
**Description:** Deletes an entire collection from MongoDB.
**Query:**
- `collection`: string (in query, name of the collection to delete)
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if collection is missing)
- 500: `{ "error": "string" }`

### MissionControl

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### POST /message
**Description:** Handles various types of messages for mission control operations.
**Input:**
```json
{
  "type": "MessageType",
  "sender": "string",
  "content": "any",
  "clientId": "string",
  "missionId?": "string",
  "userId?": "string",
  "missionName?": "string"
}
```
**Output:**
- 200: `{ "message": "string", "missionId?": "string", "status?": "string", "name?": "string", "result?": "any", "mission?": "object" }`
- 500: `{ "error": "string", "message": "string" }`

**Message Types and their corresponding actions (handled internally by `processMessage`):**

*   **MessageType.CREATE_MISSION**
    *   Creates a new mission.
    *   Required `content`: `{ "goal": "string", "name?": "string", "missionContext?": "string" }`
    *   Returns: `{ "missionId": "string", "status": "string" }`
*   **MessageType.PAUSE**
    *   Pauses an existing mission.
    *   Required: `missionId` in the request body.
    *   Returns: `{ "missionId": "string", "status": "string" }`
*   **MessageType.RESUME**
    *   Resumes a paused mission.
    *   Required: `missionId` in the request body.
    *   Returns: `{ "missionId": "string", "status": "string" }`
*   **MessageType.ABORT**
    *   Aborts an existing mission.
    *   Required: `missionId` in the request body.
    *   Returns: `{ "missionId": "string", "status": "string" }`
*   **MessageType.SAVE**
    *   Saves the current state of a mission.
    *   Required: `missionId` in the request body.
    *   Optional: `missionName` in the request body.
    *   Returns: `{ "missionId": "string", "status": "string", "name": "string" }`
*   **MessageType.LOAD**
    *   Loads a previously saved mission.
    *   Required: `missionId` in the request body.
    *   Returns: `{ "missionId": "string", "status": "string", "mission": "object" }`
*   **MessageType.USER_MESSAGE**
    *   Handles a user message for a specific mission.
    *   Required `content`: `{ "missionId": "string", "message": "string" }`
    *   Returns: `{ "missionId": "string", "status": "string" }`
*   **Other Message Types**
    *   Handled by the base class.
    *   Returns: `{ "status": "string" }`

#### POST /agentStatisticsUpdate
**Description:** Handles updates to agent statistics.
**Input:**
```json
{
  "agentId": "string",
  "missionId": "string",
  "statistics": "object",
  "timestamp": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if missionId is invalid)
- 500: `{ "error": "string" }`

#### POST /userInputResponse
**Description:** Handles responses to pending user input requests.
**Input:**
```json
{
  "requestId": "string",
  "response": "any"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 404: `{ "error": "string" }` (if no pending user input for requestId)
- 500: `{ "error": "string" }`

### PostOffice

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the PostOffice service.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### GET /ready
**Description:** Checks if the PostOffice service is ready to accept requests.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### POST /assets/:collection/:id
**Description:** Stores a large asset (e.g., file, binary data) via the FileUploadManager.
**Parameters:**
- `collection`: string (in URL)
- `id`: string (in URL)
**Input:** Raw binary data or file stream in the request body. `Content-Type` header should be set.
**Output:**
- 201: `{ "message": "string", "id": "string", "size": "number" }`
- 500: `{ "error": "string" }`

#### GET /assets/:collection/:id
**Description:** Retrieves a large asset via the FileUploadManager.
**Parameters:**
- `collection`: string (in URL)
- `id`: string (in URL)
**Output:**
- 200: Raw binary data or file stream. `Content-Type` header will be set based on stored metadata.
- 404: `{ "error": "string" }` (if asset not found)
- 500: `{ "error": "string" }`

#### POST /registerComponent
**Description:** Registers a new component with the PostOffice.
**Input:**
```json
{
  "id": "string",
  "type": "string",
  "url": "string"
}
```
**Output:**
- 200: `{ "status": "string" }`
- 400: `{ "error": "string" }` (if missing fields)
- 500: `{ "error": "string" }`

#### POST /message
**Description:** Handles incoming messages for routing to other components.
**Input:**
- Body: `Message` object (structure depends on the message type)
**Output:**
- 200: `{ "status": "string" }`

#### POST /sendMessage
**Description:** Handles incoming messages from clients for routing.
**Input:**
- Body: `Message` object
**Output:**
- 200: `{ "status": "string" }`
- 404: `{ "error": "string" }` (if recipient not found)
- 500: `{ "error": "string" }`

#### POST /securityManager/*
**Description:** Routes security-related requests to the SecurityManager.
**Input:** Varies based on the specific security request
**Output:** Depends on the SecurityManager's response

#### GET /requestComponent
**Description:** Requests information about registered components.
**Query Parameters:**
- `id?`: string (component ID)
- `type?`: string (component type)
**Output:**
- 200: `{ "component": "Component" }` (if ID provided) or `{ "components": "Component[]" }` (if type provided)
- 400: `{ "error": "string" }` (if neither ID nor type provided)
- 404: `{ "error": "string" }` (if component not found)

#### GET /getServices
**Description:** Retrieves URLs of registered services.
**Output:**
- 200: `{ "[serviceName: string]": "string" }`

#### POST /submitUserInput
**Description:** Submits user input for a specific request, optionally including files.
**Input:**
```json
{
  "requestId": "string",
  "response": "any"
}
```
**Files (multipart/form-data):**
- `file`: `Express.Multer.File[]` (if `answerType` is 'file')
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if files missing for 'file' answerType)
- 404: `{ "error": "string" }` (if user input request not found)
- 500: `{ "error": "string" }`

#### POST /sendUserInputRequest
**Description:** Sends a user input request to connected clients.
**Input:**
```json
{
  "question": "string",
  "answerType?": "string",
  "choices?": "string[]"
}
```
**Output:**
- 200: `{ "request_id": "string" }`
- 500: `{ "error": "string" }`

#### POST /createMission
**Description:** Creates a new mission by forwarding the request to MissionControl.
**Input:**
```json
{
  "goal": "string",
  "clientId": "string"
}
```
**Headers:**
- `Authorization`: `string` (JWT token)
**Output:**
- 200: Response from MissionControl
- 401: `{ "error": "string" }`
- 504: `{ "error": "string" }` (if MissionControl is unavailable)

#### POST /loadMission
**Description:** Loads a previously saved mission by forwarding the request to MissionControl.
**Input:**
```json
{
  "missionId": "string",
  "clientId": "string"
}
```
**Output:**
- 200: Response from MissionControl
- 500: `{ "error": "string" }`

#### GET /librarian/retrieve/:id
**Description:** Retrieves a work product from the Librarian.
**Parameters:**
- `id`: string (in URL)
**Output:**
- 200: Work product data
- 404: `{ "error": "string" }`
- 500: `{ "error": "string" }`

#### GET /getSavedMissions
**Description:** Retrieves saved missions for the authenticated user.
**Headers:**
- `Authorization`: `string` (JWT token)
**Output:**
- 200: Array of saved mission objects
- 401: `{ "error": "string" }`
- 500: `{ "error": "string" }`

#### GET /step/:stepId
**Description:** Retrieves details for a specific step by forwarding the request to AgentSet.
**Parameters:**
- `stepId`: string (in URL)
**Output:**
- 200: Step details object
- 400: `{ "error": "string" }`
- 404: `{ "error": "string" }`
- 500: `{ "error": "string" }`

#### GET /brain/performance
**Description:** Retrieves model performance data from the Brain service.
**Output:**
- 200: `{ "success": "boolean", "performanceData": "array" }`
- 404: `{ "error": "string" }` (if Brain service not available)
- 500: `{ "error": "string" }`

#### GET /brain/performance/rankings
**Description:** Retrieves model rankings based on conversation type and metric from the Brain service.
**Query Parameters:**
- `conversationType?`: `string` (e.g., "TextToText", "TextToCode")
- `metric?`: `string` (e.g., "overall", "successRate", "averageLatency")
**Output:**
- 200: `{ "success": "boolean", "rankings": "array" }`
- 404: `{ "error": "string" }` (if Brain service not available)
- 500: `{ "error": "string" }`

#### POST /brain/evaluations
**Description:** Submits model evaluation data to the Brain service.
**Input:**
```json
{
  "modelName": "string",
  "conversationType": "string",
  "requestId": "string",
  "prompt": "string",
  "response": "string",
  "scores": "object"
}
```
**Output:**
- 200: `{ "success": "boolean" }`
- 500: `{ "error": "string" }`

#### Plugin Management Endpoints (handled by PluginManager)
*   **POST /plugins**
*   **GET /plugins**
*   **GET /plugins/:id**
*   **PUT /plugins/:id**
*   **DELETE /plugins/:id**
(Refer to CapabilitiesManager API documentation for details on these endpoints, as they are proxied through PostOffice)

### SecurityManager

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the SecurityManager service.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### GET /public-key
**Description:** Retrieves the public key used for JWT verification.
**Output:**
- 200: `string` (Public key in PEM format)
- 500: `{ "error": "string" }`

#### POST /register
**Description:** Registers a new user.
**Input:**
```json
{
  "email": "string",
  "password": "string",
  "firstName?": "string",
  "lastName?": "string",
  "username?": "string",
  "name?": "string"
}
```
**Output:**
- 201: `{ "message": "string", "accessToken": "string", "refreshToken": "string", "user": "object" }`
- 400: `{ "message": "string" }` (if email/password missing or email already registered)
- 500: `{ "message": "string" }`

#### POST /login
**Description:** Authenticates a user and returns JWT tokens.
**Input:**
```json
{
  "email": "string",
  "password": "string"
}
```
**Output:**
- 200: `{ "message": "string", "accessToken": "string", "refreshToken": "string", "user": "object", "requireMfa?": "boolean", "userId?": "string", "tempToken?": "string" }`
- 400: `{ "message": "string" }` (if email/password missing)
- 401: `{ "message": "string" }` (if authentication fails)
- 403: `{ "message": "string" }` (if account locked)
- 500: `{ "message": "string" }`

#### POST /logout
**Description:** Logs out a user by revoking their tokens.
**Input:**
```json
{
  "revokeAll?": "boolean"
}
```
**Headers:**
- `Authorization`: `Bearer [accessToken]`
**Output:**
- 200: `{ "message": "string" }`
- 401: `{ "message": "string" }` (if authentication required)
- 500: `{ "message": "string" }`

#### POST /auth/refresh-token
**Description:** Refreshes an expired access token using a refresh token.
**Input:**
```json
{
  "refreshToken": "string"
}
```
**Output:**
- 200: `{ "message": "string", "accessToken": "string" }`
- 400: `{ "message": "string" }` (if refresh token missing)
- 401: `{ "message": "string" }` (if refresh token is invalid or expired)
- 500: `{ "message": "string" }`

#### POST /verify
**Description:** Verifies a JWT token.
**Input:**
- Body: `{ "token?": "string" }` (optional, token can also be in Authorization header)
**Headers:**
- `Authorization`: `Bearer [token]`
**Output:**
- 200: `{ "valid": "boolean", "user": "object" }`
- 400: `{ "valid": "boolean", "error": "string" }` (if no token provided or invalid format)
- 401: `{ "valid": "boolean", "error": "string" }` (if token is invalid, expired, or revoked)
- 500: `{ "valid": "boolean", "error": "string" }`

#### POST /auth/service
**Description:** Authenticates a service component and issues a JWT token.
**Input:**
```json
{
  "componentType": "string",
  "clientSecret": "string"
}
```
**Output:**
- 200: `{ "authenticated": "boolean", "token": "string" }`
- 401: `{ "authenticated": "boolean", "error": "string" }` (if authentication fails)
- 500: `{ "error": "string" }`

#### POST /verifyMfaToken
**Description:** Verifies an MFA token during login.
**Input:**
```json
{
  "userId": "string",
  "token": "string"
}
```
**Output:**
- 200: `{ "message": "string", "accessToken": "string", "refreshToken": "string", "user": "object" }`
- 400: `{ "message": "string" }` (if userId or token missing)
- 401: `{ "message": "string" }` (if invalid MFA token)
- 500: `{ "message": "string" }`

#### POST /verifyEmail
**Description:** Verifies a user's email address using a verification token.
**Input:**
```json
{
  "token": "string"
}
```
**Output:**
- 200: `{ "message": "string", "user": "object" }`
- 400: `{ "message": "string" }` (if token missing)
- 401: `{ "message": "string" }` (if invalid or expired token)
- 500: `{ "message": "string" }`

#### POST /requestPasswordReset
**Description:** Requests a password reset email for a user.
**Input:**
```json
{
  "email": "string"
}
```
**Output:**
- 200: `{ "message": "string" }` (always returns success to prevent email enumeration)
- 400: `{ "message": "string" }` (if email missing)

#### POST /resetPassword
**Description:** Resets a user's password using a reset token.
**Input:**
```json
{
  "token": "string",
  "newPassword": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "message": "string" }` (if token or newPassword missing)
- 401: `{ "message": "string" }` (if invalid or expired token)
- 500: `{ "message": "string" }`

#### POST /changePassword
**Description:** Changes the authenticated user's password.
**Input:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```
**Headers:**
- `Authorization`: `Bearer [accessToken]`
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "message": "string" }` (if passwords missing)
- 401: `{ "message": "string" }` (if authentication required or current password incorrect)
- 500: `{ "message": "string" }`

#### POST /enableMfa
**Description:** Initiates the MFA setup process for the authenticated user.
**Input:** None
**Headers:**
- `Authorization`: `Bearer [accessToken]`
**Output:**
- 200: `{ "message": "string", "mfaSecret": "string", "qrCodeUrl": "string" }`
- 401: `{ "message": "string" }` (if authentication required)
- 500: `{ "message": "string" }`

#### POST /verifyMfaSetup
**Description:** Verifies the MFA setup for the authenticated user.
**Input:**
```json
{
  "token": "string"
}
```
**Headers:**
- `Authorization`: `Bearer [accessToken]`
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "message": "string" }` (if token missing)
- 401: `{ "message": "string" }` (if authentication required or invalid MFA token)
- 500: `{ "message": "string" }`

#### POST /disableMfa
**Description:** Disables MFA for the authenticated user.
**Input:**
```json
{
  "token": "string"
}
```
**Headers:**
- `Authorization`: `Bearer [accessToken]`
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "message": "string" }` (if token missing)
- 401: `{ "message": "string" }` (if authentication required or invalid MFA token)
- 500: `{ "message": "string" }`
