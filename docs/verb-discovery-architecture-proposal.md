# Verb Discovery Architecture Proposal

## Executive Summary

This document proposes a Chroma-powered verb discovery system to solve the scalability problem of static verb manifests in the ACCOMPLISH plugin. The solution leverages the existing knowledge graph infrastructure to create a dynamic, semantic verb discovery capability.

## Problem Analysis

### Current Limitations

1. **Static Verb Manifests**: ACCOMPLISH plugin includes verb manifests directly in prompts via `_create_detailed_plugin_guidance()`
2. **Token Limit Constraints**: As MCP Tools and plugins grow, static lists hit LLM context window limits
3. **Discovery Problem**: LLMs cannot discover verbs that exist but aren't included in static lists
4. **Redundant Verb Creation**: System creates novel verbs when existing ones could accomplish the task

### Current Infrastructure Analysis

The system already has sophisticated Chroma-based knowledge graph capabilities:

- **ChromaDB Integration**: Fully operational instance with semantic search
- **KnowledgeStore**: `services/librarian/src/knowledgeStore/index.ts` handles vector database interactions
- **Embedding Function**: Uses `Xenova/all-MiniLM-L6-v2` sentence-transformer model
- **REST API**: Librarian exposes `/knowledge/query` and `/knowledge/save` endpoints
- **QUERY_KNOWLEDGE_BASE Plugin**: Existing semantic search capability for knowledge domains

## Proposed Solution Architecture

### Core Strategy: Extend Existing Knowledge Graph

Instead of creating separate infrastructure, **extend the current knowledge graph** to include verb manifests:

```
┌───────────────────────────────────────────────────────┐
│                Verb Discovery Architecture            │
├───────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌───────────────────────────────┐  │
│  │  ACCOMPLISH  │    │      NovelVerbHandler         │  │
│  │   Plugin     │    │                               │  │
│  └──────┬───────┘    └───────────┬───────────────────┘  │
│         │                        │                     │
│         ▼                        ▼                     │
└─────────┼────────────────────────┼─────────────────────┘
          │                        │
          │                        │
┌─────────▼────────────────────────▼─────────────────────┐
│           Discovery Service Layer                  │
│  ┌─────────────────────┐    ┌───────────────────────┐  │
│  │  Librarian API      │    │  KnowledgeStore        │  │
│  │  /verbs/discover     │    │  (Extended)            │  │
│  │  /verbs/register     │    │                        │  │
│  └──────────┬─────────┘    └──────────┬─────────────┘  │
│             │                        │               │
│             │                        │               │
└─────────────┼────────────────────────┼───────────────────┘
              │                        │
              │                        │
┌─────────────▼────────────────────────▼───────────────────┐
│           Chroma Vector Database Layer               │
│  ┌─────────────────────┐    ┌───────────────────────┐  │
│  │   "verbs"           │    │   "tools"              │  │
│  │   Collection        │    │   Collection           │  │
│  │  - Verb manifests   │    │  - Tool manifests      │  │
│  │  - Semantic vectors │    │  - Semantic vectors    │  │
│  └─────────────────────┘    └───────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

## Detailed Implementation Plan

### 1. Chroma Verb Collection Structure

**Collection: "verbs"**
- **Documents**: Verb manifests in JSON format
- **Metadata Schema**:
  ```json
  {
    "verb": "SEARCH",
    "description": "Search the web for information",
    "capabilities": ["web_search", "information_retrieval"],
    "category": "data_retrieval",
    "examples": ["Find competitor websites", "Research market trends"],
    "inputDefinitions": [...],
    "outputDefinitions": [...]
  }
  ```
- **Embeddings**: Semantic vectors generated from combined text fields

### 2. KnowledgeStore Extension

Add verb-specific methods to `services/librarian/src/knowledgeStore/index.ts`:

```typescript
public async registerVerb(verbManifest: any): Promise<void> {
    try {
        const collection = await this.getOrCreateCollection('verbs');
        const id = verbManifest.verb;

        // Sanitize and prepare metadata
        const metadata = {
            verb: verbManifest.verb,
            description: verbManifest.description,
            capabilities: verbManifest.capabilities || [],
            category: verbManifest.category || 'other',
            examples: verbManifest.examples || []
        };

        await collection.upsert({
            ids: [id],
            documents: [JSON.stringify(verbManifest)],
            metadatas: [metadata],
        });

        console.log(`Registered verb ${id} in knowledge base`);
    } catch (error) {
        console.error(`Failed to register verb:`, error);
        throw new Error(`Failed to register verb: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

public async discoverVerbs(capabilityDescription: string, maxResults: number = 5): Promise<any[]> {
    try {
        const collection = await this.getOrCreateCollection('verbs');

        const results = await collection.query({
            nResults: maxResults,
            queryTexts: [capabilityDescription],
        });

        if (!results.distances) {
            console.warn('Warning: results.distances is null or undefined.');
            return [];
        }

        console.log(`Discovered ${results.ids[0].length} verbs for capability: "${capabilityDescription}"`);

        return results.ids[0].map((id, index) => ({
            id,
            document: results.documents[0][index],
            metadata: results.metadatas[0][index],
            distance: results.distances ? results.distances[0][index] : null,
        }));

    } catch (error) {
        console.error(`Failed to discover verbs:`, error);
        throw new Error(`Failed to discover verbs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
```

### 3. Librarian API Extension

Add verb discovery endpoints to `services/librarian/src/Librarian.ts`:

```typescript
private async discoverVerbs(req: express.Request, res: express.Response) {
    const { capabilityDescription, maxResults = 5 } = req.body;

    if (!capabilityDescription) {
        return res.status(400).send({ error: 'capabilityDescription is required' });
    }

    try {
        const results = await knowledgeStore.discoverVerbs(capabilityDescription, maxResults);
        res.status(200).send({ data: results });
    } catch (error) {
        console.error('Error in discoverVerbs:', error instanceof Error ? error.message : error);
        res.status(500).send({ error: 'Failed to discover verbs', details: error instanceof Error ? error.message : String(error) });
    }
}

private async registerVerb(req: express.Request, res: express.Response) {
    const { verbManifest } = req.body;

    if (!verbManifest || !verbManifest.verb) {
        return res.status(400).send({ error: 'verbManifest with verb property is required' });
    }

    try {
        await knowledgeStore.registerVerb(verbManifest);
        res.status(200).send({ status: 'Verb registered successfully' });
    } catch (error) {
        console.error('Error in registerVerb:', error instanceof Error ? error.message : error);
        res.status(500).send({ error: 'Failed to register verb', details: error instanceof Error ? error.message : String(error) });
    }
}
```

### 4. ACCOMPLISH Plugin Integration

Modify `services/capabilitiesmanager/src/plugins/ACCOMPLISH/main.py`:

```python
def _create_detailed_plugin_guidance(inputs: Dict[str, Any]) -> str:
    """Create plugin guidance with dynamic verb discovery section"""
    available_plugins_input = inputs.get('availablePlugins', {})
    available_plugins = available_plugins_input.get('value', []) if isinstance(available_plugins_input, dict) else available_plugins

    guidance_lines = ["\n--- AVAILABLE PLUGINS ---"]

    if available_plugins:
        for plugin in available_plugins:
            if isinstance(plugin, dict):
                action_verb = plugin.get('verb', 'UNKNOWN')
                description = plugin.get('description', 'No description available.')
                guidance_lines.append(f"- {action_verb}: {description}")
    else:
        guidance_lines.append("No static plugins available - using dynamic discovery")

    guidance_lines.append("--------------------")

    # Add dynamic verb discovery protocol
    guidance_lines.append("\n--- DYNAMIC VERB DISCOVERY PROTOCOL ---")
    guidance_lines.append("When you need capabilities not listed above:")
    guidance_lines.append("1. Describe the capability you need in natural language")
    guidance_lines.append("2. The system will automatically discover existing verbs that match")
    guidance_lines.append("3. Use discovered verbs instead of creating new ones")
    guidance_lines.append("4. Only create novel verbs if no suitable existing verbs are found")
    guidance_lines.append("Example: Need to 'create visual content' → discovers GENERATE, DRAW, CREATE_IMAGE verbs")
    guidance_lines.append("--------------------")

    return "\n".join(guidance_lines)
```

### 5. NovelVerbHandler Enhancement

Add dynamic discovery to the novel verb handling process:

```python
def _ask_brain_for_verb_handling(self, verb_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
    """Ask Brain how to handle the novel verb with dynamic discovery"""
    verb = verb_info['verb']
    description = verb_info.get('description', 'No description provided')
    context = verb_info.get('context', description)
    schema_json = json.dumps(PLAN_ARRAY_SCHEMA, indent=2)
    plugin_guidance = _create_detailed_plugin_guidance(inputs)

    # Add dynamic verb discovery section
    discovery_section = """
**DYNAMIC VERB DISCOVERY:**
Before creating a novel verb, attempt to discover existing verbs that can accomplish similar goals.

**DISCOVERY PROTOCOL:**
1. Analyze what capability the novel verb '{verb}' is trying to accomplish
2. The system will automatically query the verb discovery service
3. Use any discovered verbs instead of creating new ones
4. Only create novel verbs if discovery returns no suitable matches

**EXAMPLES:**
- Need: "Find information about companies" → Discovers: SEARCH, SCRAPE, QUERY_KNOWLEDGE_BASE
- Need: "Create a visual representation" → Discovers: GENERATE, DRAW, CREATE_IMAGE
- Need: "Process a list of items" → Discovers: FOREACH, ITERATE, PROCESS_LIST
""".format(verb=verb)

    prompt = f"""You are an expert system analyst. A user wants to use a novel action verb "{verb}" that is not currently supported.

VERB: {verb}
DESCRIPTION: {description}
CONTEXT: {context}

{discovery_section}

**CRITICAL CONSTRAINTS:**
- You MUST NOT use the novel verb "{verb}" in your plan - use available plugins instead
- First attempt verb discovery to find existing verbs that match the capability
- Use existing action verbs from the available plugins listed below
- Only create novel verbs if discovery returns no suitable matches
- Break down the task into granular, atomic steps using available tools

{plugin_guidance}"""
```

## Implementation Roadmap

### Phase 1: Infrastructure Extension (2-3 days)
- ✅ Extend KnowledgeStore with verb-specific methods
- ✅ Add Librarian API endpoints for verb discovery
- ✅ Create verb registration pipeline
- ✅ Set up Chroma collection for verbs

### Phase 2: Integration Layer (3-4 days)
- ✅ Modify ACCOMPLISH plugin to use discovery API
- ✅ Update NovelVerbHandler with discovery logic
- ✅ Add fallback mechanisms for discovery failures
- ✅ Implement caching for performance optimization

### Phase 3: LLM Training (2 days)
- ✅ Enhance system prompts with discovery protocols
- ✅ Add examples of discovery usage patterns
- ✅ Implement verb selection guidance
- ✅ Update documentation and examples

### Phase 4: Testing & Optimization (3 days)
- ✅ Performance testing of discovery queries
- ✅ Failure mode testing and fallback verification
- ✅ Optimization of semantic search parameters
- ✅ Integration testing with existing workflows

## Key Benefits

1. **Unlimited Scalability**: No more token limit constraints
2. **Intelligent Discovery**: Semantic matching finds relevant verbs
3. **Resource Optimization**: Reduces redundant verb creation
4. **Architectural Consistency**: Leverages existing knowledge graph
5. **Proven Technology**: Uses working Chroma + sentence-transformers stack
6. **Maintainability**: Centralized knowledge management
7. **Performance**: Optimized vector search capabilities

## Success Metrics

- **Discovery Accuracy**: 90%+ of capability queries return relevant verbs
- **Performance**: <100ms average discovery query time
- **Adoption Rate**: 80%+ reduction in novel verb creation
- **System Stability**: Zero downtime during transition
- **User Satisfaction**: Improved plan quality metrics

## Risk Mitigation

1. **Fallback Mechanisms**: Graceful degradation if discovery fails
2. **Performance Monitoring**: Real-time query latency tracking
3. **Gradual Rollout**: Phased implementation with feature flags
4. **Comprehensive Testing**: Extensive unit and integration tests
5. **Documentation**: Complete API and usage documentation

This architecture proposal provides a robust, scalable solution that leverages the existing knowledge graph infrastructure while solving the core verb discovery problem.