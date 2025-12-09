# Implementation Prompts for Architecture Enhancements

## Phase 1: Core Discovery Infrastructure

### Marketplace Enhancements

#### 1. Add `indexForDiscovery()` method to LibrarianDefinitionRepository

**Complexity**: Low
**Prompt**:
```markdown
## Task: Add indexForDiscovery() method to LibrarianDefinitionRepository

### Context:
The LibrarianDefinitionRepository needs to automatically index plugins and tools for discovery when they are stored or updated. This method will send plugin manifests to the Librarian service for indexing in the appropriate Chroma collections.

### Current Code Analysis:
- File: `marketplace/src/repositories/LibrarianDefinitionRepository.ts`
- Existing methods: `store()`, `list()`, `fetch()`, `fetchByVerb()`, `delete()`
- Current indexing: Manual indexing via PluginRegistry.indexPlugin()

### Requirements:
1. Add new method `indexForDiscovery(manifest: PluginManifest): Promise<void>`
2. Method should send manifest to Librarian's `/tools/index` endpoint
3. Handle both success and error cases with appropriate logging
4. Call this method from existing `store()` method
5. Ensure no duplicate indexing occurs

### Implementation Details:
- Use existing `authenticatedApi` instance
- Endpoint: `POST /tools/index` with `{ manifest }` body
- Add error handling and retry logic
- Log success/failure for debugging
- Maintain backward compatibility

### Example Implementation:
```typescript
private async indexForDiscovery(manifest: PluginManifest): Promise<void> {
    try {
        console.log(`Indexing plugin ${manifest.id} for discovery`);
        await this.authenticatedApi.post('/tools/index', { manifest });
        console.log(`Successfully indexed plugin ${manifest.id}`);
    } catch (error) {
        console.error(`Failed to index plugin ${manifest.id} for discovery:`, error);
        // Implement retry logic or error handling
        throw new Error(`Discovery indexing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
```

### Integration Points:
- Call from `store()` method after successful storage
- Ensure manifest has required discovery metadata
- Handle cases where Librarian service is unavailable

### Testing Requirements:
- Unit tests for success/failure scenarios
- Integration tests with mock Librarian service
- Verify no duplicate indexing occurs
```

#### 2. Extend PluginManifest with discovery metadata

**Complexity**: Medium
**Prompt**:
```markdown
## Task: Extend PluginManifest with Discovery Metadata

### Context:
Plugin manifests need additional metadata to support semantic discovery. This includes semantic descriptions, capability keywords, and usage examples that will be used for vector search.

### Current Code Analysis:
- Shared types in `@cktmcs/shared` package
- Current PluginManifest interface lacks discovery-specific fields
- Need to maintain backward compatibility

### Requirements:
1. Extend PluginManifest interface with discovery metadata:
   - `semanticDescription: string` - Detailed description for semantic search
   - `capabilityKeywords: string[]` - Keywords for capability matching
   - `usageExamples: string[]` - Example use cases
   - `discoveryMetadata?: DiscoveryMetadata` - Structured metadata

2. Create DiscoveryMetadata interface:
   - `domainEntities?: string[]` - Domain-specific entities
   - `relatedVerbs?: string[]` - Related action verbs
   - `confidenceScore?: number` - Discovery confidence (0-1)

3. Update all plugin manifest creation points

### Implementation Details:
```typescript
// In shared types package
export interface DiscoveryMetadata {
    domainEntities?: string[];
    relatedVerbs?: string[];
    confidenceScore?: number;
    contextKeywords?: string[];
}

export interface PluginManifest {
    // Existing fields...
    semanticDescription?: string;
    capabilityKeywords?: string[];
    usageExamples?: string[];
    discoveryMetadata?: DiscoveryMetadata;

    // Add to existing manifests
    [key: string]: any; // For backward compatibility
}
```

### Migration Strategy:
1. Make all new fields optional
2. Provide default values where appropriate
3. Update existing plugin manifests gradually
4. Add validation for new fields

### Integration Points:
- PluginMarketplace: Use metadata for indexing
- Librarian: Store metadata in Chroma collections
- CapabilitiesManager: Use metadata for discovery

### Testing Requirements:
- Validate new field types and constraints
- Test backward compatibility with existing manifests
- Verify metadata is properly indexed and searchable
```

### Librarian/Chroma Enhancements

#### 3. Create "verbs" and "tools" collections in KnowledgeStore

**Complexity**: Medium
**Prompt**:
```markdown
## Task: Create Dedicated Chroma Collections for Discovery

### Context:
Current KnowledgeStore uses generic collections. Need dedicated "verbs" and "tools" collections optimized for discovery with specific metadata schemas.

### Current Code Analysis:
- File: `services/librarian/src/knowledgeStore/index.ts`
- Current: Generic collection creation in `getOrCreateCollection()`
- Need: Specialized collections with discovery-optimized schemas

### Requirements:
1. Create "verbs" collection:
   - Store verb manifests with semantic vectors
   - Metadata schema: verb, description, capabilities, category, examples
   - Optimize for verb discovery queries

2. Create "tools" collection:
   - Store tool manifests with semantic vectors
   - Metadata schema: toolId, name, type, actionVerbs, capabilities, description
   - Optimize for tool discovery queries

3. Add collection initialization during KnowledgeStore setup

### Implementation Details:
```typescript
// Add to KnowledgeStore constructor
private async initializeDiscoveryCollections(): Promise<void> {
    try {
        // Create verbs collection
        const verbsCollection = await this.getOrCreateCollection('verbs');
        console.log('Initialized verbs collection for discovery');

        // Create tools collection
        const toolsCollection = await this.getOrCreateCollection('tools');
        console.log('Initialized tools collection for discovery');

    } catch (error) {
        console.error('Failed to initialize discovery collections:', error);
        throw new Error(`Discovery collection initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Modify getOrCreateCollection to handle discovery collections
private async getOrCreateCollection(name: string): Promise<Collection> {
    const embeddingFunction = await this.getEmbeddingFunction();

    // Special handling for discovery collections
    if (name === 'verbs' || name === 'tools') {
        try {
            return await this.client.getCollection({ name, embeddingFunction });
        } catch (error) {
            console.log(`Creating discovery collection: ${name}`);
            return await this.client.createCollection({ name, embeddingFunction });
        }
    }

    // Existing generic collection handling
    // ...
}
```

### Data Schema:
```typescript
// Verbs collection metadata schema
interface VerbMetadata {
    verb: string;
    description: string;
    capabilities: string[];
    category: string;
    examples: string[];
    inputDefinitions?: any[];
    outputDefinitions?: any[];
}

// Tools collection metadata schema
interface ToolMetadata {
    toolId: string;
    name: string;
    type: 'openapi' | 'mcp' | 'plugin';
    actionVerbs: string[];
    capabilities: string[];
    description: string;
    healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}
```

### Integration Points:
- PluginMarketplace: Index plugins to appropriate collections
- CapabilitiesManager: Query collections for discovery
- Engineer: Register new tools to collections

### Testing Requirements:
- Verify collection creation and persistence
- Test metadata schema validation
- Validate query performance on large datasets
- Test error handling and recovery
```

#### 4. Implement Discovery APIs in Librarian

**Complexity**: High
**Prompt**:
```markdown
## Task: Implement Discovery APIs in Librarian Service

### Context:
Need new REST endpoints for verb registration and discovery. These endpoints will interface with the Chroma collections and provide semantic search capabilities.

### Current Code Analysis:
- File: `services/librarian/src/Librarian.ts`
- Existing endpoints: Knowledge management endpoints
- Need: Discovery-specific endpoints with proper error handling

### Requirements:
1. Implement `POST /verbs/register`:
   - Register verb manifests in "verbs" collection
   - Validate input manifest structure
   - Generate semantic vectors using existing embedding function
   - Return success/failure with appropriate status codes

2. Implement `POST /verbs/discover`:
   - Semantic search on "verbs" collection
   - Accept query text and optional filters
   - Return ranked results with confidence scores
   - Support pagination and result limiting

3. Implement `POST /tools/search`:
   - Semantic search on "tools" collection
   - Support capability-based filtering
   - Return tool matches with metadata
   - Include health status filtering

4. Add circuit breaker and rate limiting

### Implementation Details:
```typescript
// Add to Librarian.ts
private async registerVerb(req: express.Request, res: express.Response) {
    const trace_id = uuidv4();
    try {
        const { manifest } = req.body;

        // Validate manifest structure
        if (!manifest || !manifest.verb) {
            return res.status(400).json({
                error: 'Invalid verb manifest: missing required fields',
                required_fields: ['verb', 'description', 'capabilities']
            });
        }

        // Generate semantic vector
        const embeddingFunction = knowledgeStore.getEmbeddingFunction();
        const content = this.generateVerbContent(manifest);
        const vector = await embeddingFunction.generate([content]);

        // Store in Chroma
        const verbsCollection = await knowledgeStore.getOrCreateCollection('verbs');
        await verbsCollection.upsert({
            ids: [manifest.verb],
            documents: [content],
            metadatas: [this.extractVerbMetadata(manifest)],
            embeddings: vector
        });

        console.log(`[${trace_id}] Registered verb ${manifest.verb} in discovery collection`);
        res.status(201).json({
            success: true,
            verb: manifest.verb,
            message: 'Verb registered successfully'
        });

    } catch (error) {
        console.error(`[${trace_id}] Verb registration failed:`, error);
        res.status(500).json({
            error: 'Verb registration failed',
            details: error instanceof Error ? error.message : String(error)
        });
    }
}

private async discoverVerbs(req: express.Request, res: express.Response) {
    const trace_id = uuidv4();
    try {
        const { queryText, maxResults = 5, filters = {} } = req.body;

        if (!queryText) {
            return res.status(400).json({ error: 'queryText is required' });
        }

        // Perform semantic search
        const verbsCollection = await knowledgeStore.getOrCreateCollection('verbs');
        const results = await verbsCollection.query({
            nResults: maxResults,
            queryTexts: [queryText],
            where: this.buildChromaFilter(filters)
        });

        // Format results
        const formattedResults = results.ids[0].map((id, index) => ({
            id,
            verb: id,
            document: results.documents[0][index],
            metadata: results.metadatas[0][index],
            distance: results.distances[0][index],
            confidence: 1 - results.distances[0][index] // Convert distance to confidence score
        }));

        res.status(200).json({
            success: true,
            results: formattedResults,
            count: formattedResults.length
        });

    } catch (error) {
        console.error(`[${trace_id}] Verb discovery failed:`, error);
        res.status(500).json({
            error: 'Verb discovery failed',
            details: error instanceof Error ? error.message : String(error)
        });
    }
}

private generateVerbContent(manifest: any): string {
    // Generate content for semantic embedding
    return `${manifest.verb}: ${manifest.description}. Capabilities: ${manifest.capabilities?.join(', ')}. Examples: ${manifest.examples?.join(', ')}`;
}

private extractVerbMetadata(manifest: any): any {
    // Extract and sanitize metadata for Chroma
    return {
        verb: manifest.verb,
        description: manifest.description,
        capabilities: manifest.capabilities || [],
        category: manifest.category || 'other',
        examples: manifest.examples || [],
        inputDefinitions: manifest.inputDefinitions || [],
        outputDefinitions: manifest.outputDefinitions || []
    };
}

private buildChromaFilter(filters: any): any {
    // Convert filters to Chroma query format
    const chromaFilter: any = {};
    if (filters.capabilities) chromaFilter.capabilities = { $contains: filters.capabilities };
    if (filters.category) chromaFilter.category = filters.category;
    return chromaFilter;
}
```

### API Specifications:
```yaml
# POST /verbs/register
request:
  body:
    manifest:
      verb: string
      description: string
      capabilities: string[]
      category?: string
      examples?: string[]
      inputDefinitions?: any[]
      outputDefinitions?: any[]

response:
  201:
    success: true
    verb: string
    message: string
  400:
    error: string
    required_fields?: string[]

# POST /verbs/discover
request:
  body:
    queryText: string
    maxResults?: number (default: 5)
    filters?:
      capabilities?: string[]
      category?: string

response:
  200:
    success: true
    results:
      - id: string
        verb: string
        document: string
        metadata: object
        distance: number
        confidence: number
    count: number
  400:
    error: string

# POST /tools/search
request:
  body:
    queryText: string
    maxResults?: number (default: 5)
    filters?:
      capabilities?: string[]
      type?: string
      healthStatus?: string

response:
  200:
    success: true
    results:
      - id: string
        toolId: string
        name: string
        type: string
        actionVerbs: string[]
        metadata: object
        distance: number
        confidence: number
    count: number
```

### Integration Points:
- PluginMarketplace: Calls register endpoints during plugin storage
- CapabilitiesManager: Calls discovery endpoints during NovelVerbHandler execution
- Engineer: Calls search endpoints during tool onboarding

### Testing Requirements:
- Unit tests for each endpoint
- Integration tests with Chroma
- Performance tests with large datasets
- Error handling and edge case testing
- Security validation (input sanitization, rate limiting)
```

### CapabilitiesManager Enhancements

#### 5. Enhance NovelVerbHandler with Semantic Search

**Complexity**: High
**Prompt**:
```markdown
## Task: Enhance NovelVerbHandler with Semantic Search Integration

### Context:
The NovelVerbHandler needs to integrate with the new discovery APIs to find existing tools/verbs before falling back to ACCOMPLISH plugin. This requires significant changes to the discovery workflow.

### Current Code Analysis:
- File: `services/capabilitiesmanager/src/CapabilitiesManager.ts`
- Current: Basic NovelVerbHandler with direct ACCOMPLISH fallback
- Need: Multi-phase discovery with semantic search integration

### Requirements:
1. Add discovery confidence threshold configuration
2. Implement semantic search for unknown verbs
3. Add verb substitution logic when high-confidence matches found
4. Enhance fallback mechanism with discovery context
5. Add comprehensive logging and monitoring

### Implementation Details:
```typescript
// Add to CapabilitiesManager class
private discoveryConfidenceThreshold: number = 0.7; // Configurable

private async handleUnknownVerb(step: Step, trace_id: string): Promise<PluginOutput[]> {
    const source_component = "CapabilitiesManager.handleUnknownVerb";
    const SEARCH_CONFIDENCE_THRESHOLD = this.discoveryConfidenceThreshold;

    // Phase 1: Reactive Tool Discovery via Semantic Search
    try {
        console.log(`[${trace_id}] ${source_component}: Novel verb '${step.actionVerb}'. Initiating semantic discovery...`);

        // 1. Search for verb matches
        const verbSearchQuery = `${step.actionVerb}: ${step.description || ''}`;
        const verbResults = await this.searchVerbs(verbSearchQuery, trace_id);

        // 2. Search for tool matches
        const toolResults = await this.searchTools(verbSearchQuery, trace_id);

        // 3. Combine and rank results
        const allResults = [...verbResults, ...toolResults];
        const topMatch = this.selectBestMatch(allResults);

        if (topMatch && topMatch.confidence >= SEARCH_CONFIDENCE_THRESHOLD) {
            console.log(`[${trace_id}] ${source_component}: High-confidence match found: '${topMatch.id}' (confidence: ${topMatch.confidence})`);

            // Substitute and re-execute with matched verb
            return this.executeWithSubstitution(step, topMatch, trace_id);
        } else {
            console.log(`[${trace_id}] ${source_component}: No high-confidence matches. Top result: ${topMatch?.id || 'none'} (confidence: ${topMatch?.confidence || 0})`);
        }
    } catch (searchError) {
        console.warn(`[${trace_id}] ${source_component}: Discovery search failed: ${searchError instanceof Error ? searchError.message : String(searchError)}`);
    }

    // Phase 2: Fallback to ACCOMPLISH with enhanced context
    return this.handleWithAccomplish(step, trace_id);
}

private async searchVerbs(query: string, trace_id: string): Promise<DiscoveryResult[]> {
    try {
        const response = await this.authenticatedLibrarianApi.post('/verbs/discover', {
            queryText: query,
            maxResults: 3
        });

        if (response.data.success && response.data.results) {
            return response.data.results.map((result: any) => ({
                ...result,
                type: 'verb',
                source: 'verb_collection'
            }));
        }
        return [];
    } catch (error) {
        console.error(`[${trace_id}] Verb search failed:`, error instanceof Error ? error.message : String(error));
        return [];
    }
}

private async searchTools(query: string, trace_id: string): Promise<DiscoveryResult[]> {
    try {
        const response = await this.authenticatedLibrarianApi.post('/tools/search', {
            queryText: query,
            maxResults: 3,
            filters: { healthStatus: 'healthy' } // Only healthy tools
        });

        if (response.data.success && response.data.results) {
            return response.data.results.map((result: any) => ({
                ...result,
                type: 'tool',
                source: 'tool_collection'
            }));
        }
        return [];
    } catch (error) {
        console.error(`[${trace_id}] Tool search failed:`, error instanceof Error ? error.message : String(error));
        return [];
    }
}

private selectBestMatch(results: DiscoveryResult[]): DiscoveryResult | null {
    if (!results || results.length === 0) return null;

    // Sort by confidence (descending)
    return results.sort((a, b) => b.confidence - a.confidence)[0];
}

private async executeWithSubstitution(step: Step, match: DiscoveryResult, trace_id: string): Promise<PluginOutput[]> {
    console.log(`[${trace_id}] Substituting '${step.actionVerb}' with discovered '${match.id}'`);

    // Create substituted step
    const substitutedStep = {
        ...step,
        actionVerb: match.type === 'verb' ? match.id : match.actionVerbs[0],
        discoveryContext: {
            originalVerb: step.actionVerb,
            discoveredVerb: match.id,
            confidence: match.confidence,
            source: match.source
        }
    };

    // Execute the substituted step
    const fakeReq = { body: substitutedStep, trace_id } as any;
    const fakeRes = { status: () => fakeRes, json: () => fakeRes } as any;
    let executionResult: any = null;

    try {
        await this.executeActionVerb(fakeReq, {
            status: (code: number) => ({
                send: (body: any) => { executionResult = body; return fakeRes; },
                json: (body: any) => { executionResult = body; return fakeRes; }
            }),
            json: (body: any) => { executionResult = body; return fakeRes; }
        } as any);

        // Convert execution result to PluginOutput format
        if (executionResult) {
            return [this.normalizeExecutionResult(executionResult)];
        }

        throw new Error('Substituted execution returned no result');

    } catch (executionError) {
        console.error(`[${trace_id}] Substituted execution failed:`, executionError instanceof Error ? executionError.message : String(executionError));
        throw generateStructuredError({
            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_DISCOVERY_SUBSTITUTION_FAILED,
            severity: ErrorSeverity.WARNING,
            message: `Discovered verb substitution failed: ${executionError instanceof Error ? executionError.message : String(executionError)}`,
            source_component: "CapabilitiesManager.executeWithSubstitution",
            trace_id_param: trace_id,
            contextual_info: {
                originalVerb: step.actionVerb,
                discoveredVerb: match.id,
                confidence: match.confidence
            }
        });
    }
}

private async handleWithAccomplish(step: Step, trace_id: string): Promise<PluginOutput[]> {
    // Enhanced ACCOMPLISH handling with discovery context
    const accomplishInputs = new Map<string, InputValue>();
    accomplishInputs.set('goal', {
        inputName: 'goal',
        value: `Handle the novel action verb '${step.actionVerb}'. ` +
               `Description: '${step.description || 'None provided'}'. ` +
               `Available inputs: ${Array.from(step.inputValues?.keys() || [])}. ` +
               `Expected outputs: ${JSON.stringify(Array.from(step.outputs?.values() || []))}. ` +
               `Discovery attempted but found no high-confidence matches. ` +
               `Generate a plan using available tools.`,
        valueType: PluginParameterType.STRING,
        args: {}
    });

    // Add discovery context to inputs
    accomplishInputs.set('discoveryContext', {
        inputName: 'discoveryContext',
        value: {
            originalVerb: step.actionVerb,
            discoveryAttempted: true,
            discoveryResults: 'no_high_confidence_matches',
            availableTools: await this.getAvailableToolSummary()
        },
        valueType: PluginParameterType.OBJECT,
        args: {}
    });

    return this.executeAccomplishPlugin(accomplishInputs, trace_id);
}

private async getAvailableToolSummary(): Promise<any[]> {
    try {
        const plugins = await this.pluginRegistry.list();
        return plugins.map(p => ({
            verb: p.verb,
            description: p.description,
            capabilities: p.metadata?.capabilities || [],
            healthStatus: p.metadata?.status || 'unknown'
        }));
    } catch (error) {
        console.warn('Failed to get available tools summary:', error);
        return [];
    }
}
```

### Integration Points:
- Librarian: Calls discovery APIs
- PluginRegistry: Gets available tools for context
- ACCOMPLISH: Enhanced input with discovery context
- Monitoring: Logs discovery attempts and outcomes

### Configuration:
```typescript
// Add to CapabilitiesManager constructor or config
this.discoveryConfidenceThreshold = parseFloat(process.env.DISCOVERY_CONFIDENCE_THRESHOLD || '0.7');
this.discoveryMaxResults = parseInt(process.env.DISCOVERY_MAX_RESULTS || '5');
this.discoveryTimeout = parseInt(process.env.DISCOVERY_TIMEOUT || '2000');
```

### Testing Requirements:
- Unit tests for search and matching logic
- Integration tests with mock Librarian service
- Performance tests for discovery workflow
- Error handling and fallback testing
- Configuration validation tests

### Monitoring and Logging:
```typescript
// Add discovery metrics tracking
private trackDiscoveryAttempt(verb: string, result: 'success' | 'fallback' | 'error', confidence?: number) {
    // Implement metrics tracking
    console.log(`Discovery attempt: ${verb} -> ${result} (confidence: ${confidence})`);
}

// Add to handleUnknownVerb
this.trackDiscoveryAttempt(step.actionVerb,
    topMatch ? 'success' : 'fallback',
    topMatch?.confidence);
```

### Ultra-Complex Areas:
1. **Substitution Execution Flow**: The `executeWithSubstitution` method requires careful handling of the execution context and result transformation. The current implementation uses a mock request/response pattern which may need refinement for production use.

2. **Confidence Threshold Tuning**: Determining the optimal confidence threshold (0.7 default) requires empirical testing with real-world data. This may need adjustment based on actual discovery accuracy metrics.

3. **Performance Optimization**: The sequential search (verbs then tools) may need optimization for production use, potentially using parallel requests or caching strategies.
```

## Implementation Strategy

### Ultra-Complex Areas Identified:

1. **Chroma Collection Optimization**: Creating efficient collections with proper indexing strategies
2. **Discovery API Performance**: Ensuring low-latency responses under load
3. **NovelVerbHandler Substitution Logic**: Complex execution flow with context preservation
4. **Health Monitoring Integration**: Real-time health status tracking across services

### Prompt Generation Approach:

1. **Atomic Tasks**: Each prompt focuses on a single, well-defined enhancement
2. **Context-Rich**: Includes current code analysis and specific requirements
3. **Implementation Details**: Provides code examples and integration points
4. **Testing Requirements**: Specifies validation and quality assurance needs
5. **Complexity Assessment**: Identifies ultra-complex areas needing special attention

### Execution Plan:

1. **Phase 1 (Hours 1-4)**: Core discovery infrastructure
   - Chroma collections setup
   - Discovery API implementation
   - Basic NovelVerbHandler integration

2. **Phase 2 (Hours 5-8)**: Reactive discovery and integration
   - Enhanced metadata handling
   - Health monitoring integration
   - Engineer tool onboarding basics

3. **Phase 3 (Hours 9-12)**: Advanced features and testing
   - Context-aware discovery
   - Comprehensive testing suite
   - Performance optimization

### Monitoring and Validation:

- Implement comprehensive logging for all discovery operations
- Add performance metrics tracking
- Create validation tests for each enhancement
- Monitor system stability during implementation

This approach ensures that the development team (Kilo, AugmentCode, Copilot, BlackBox, Gemini) can work efficiently on well-defined tasks while addressing the ultra-complex areas with appropriate attention to detail and testing.