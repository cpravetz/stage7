# Scalable Tool Discovery & Retrieval System
## Technical Specification v1.0

**Document Status:** Draft for Implementation  
**Date:** December 4, 2024  
**Authors:** Engineering Team  
**Systems:** Agentic Platform, Chroma Vector DB, MongoDB

---

## 1. Executive Summary

### 1.1 Problem Statement
The current approach of providing LLMs with complete manifests for all available actionVerbs (MCP Tools, Plugins, internal verbs) does not scale. As the tool library grows, the context window becomes saturated with unnecessary information, leading to:
- Reduced context space for actual user conversations
- Increased latency and token costs
- Difficulty for LLM to identify relevant tools
- Maintenance overhead when updating tool definitions

### 1.2 Solution Overview
Implement a hybrid retrieval system using Chroma (vector database) and MongoDB to intelligently surface only relevant tool information to the LLM based on user intent and conversation context.

**Key Metrics:**
- Target context reduction: 70-85% for typical queries
- Tool retrieval latency: <200ms p95
- Retrieval accuracy: >90% for top-5 relevant tools

---

## 2. System Architecture

### 2.1 High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                     LLM Agent Interface                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Tool Retrieval Orchestrator                     │
│  - Query Analysis                                            │
│  - Retrieval Strategy Selection                             │
│  - Context Assembly                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│   Chroma Vector Store     │   │      MongoDB Store        │
│   - Semantic Search       │   │   - Structured Metadata   │
│   - Tool Embeddings       │   │   - Full Manifests        │
│   - Usage Embeddings      │   │   - Analytics             │
└───────────────────────────┘   └───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Session Cache Layer                         │
│  - Recently Used Tools                                       │
│  - User-Specific Tool History                                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Component Descriptions

#### 2.2.1 Tool Retrieval Orchestrator
**Responsibilities:**
- Analyze incoming user queries
- Coordinate between vector and structured search
- Assemble context packages for LLM
- Manage retrieval strategies based on conversation phase

**Language:** Python 3.11+  
**Dependencies:** `langchain`, `chromadb`, `pymongo`, `sentence-transformers`

#### 2.2.2 Chroma Vector Store
**Purpose:** Semantic similarity search for tool discovery

**Storage Schema:**
```json
{
  "id": "string (toolId)",
  "embedding": "float[] (384-dim for all-MiniLM-L6-v2)",
  "document": "string (concatenated searchable text)",
  "metadata": {
    "toolId": "string",
    "verb": "string",
    "category": "string",
    "tags": "string[]",
    "description": "string (primary description)",
    "complexity": "enum[low, medium, high]",
    "permissionsRequired": "string[]",
    "frequencyScore": "float (0-1, usage frequency)",
    "lastUpdated": "ISO8601 timestamp"
  }
}
```

**Indexes Required:**
- Primary: Embedding vector (HNSW index)
- Filter indexes on: `category`, `permissionsRequired`, `complexity`

#### 2.2.3 MongoDB Store
**Purpose:** Structured storage for complete tool metadata and analytics

**Collections:**

**a) `tool_manifests` Collection:**
```json
{
  "_id": "ObjectId",
  "toolId": "string (indexed, unique)",
  "manifest": {
    "// Full manifest object as currently defined"
  },
  "searchableText": {
    "description": "string",
    "useCases": "string[]",
    "commonErrors": "string[]"
  },
  "relationships": {
    "dependencies": "string[] (required tools)",
    "commonPairings": [
      {
        "toolId": "string",
        "cooccurrenceScore": "float",
        "typicalSequence": "enum[before, after, parallel]"
      }
    ],
    "alternatives": "string[] (similar tools)"
  },
  "analytics": {
    "totalExecutions": "integer",
    "successRate": "float",
    "avgExecutionTimeMs": "integer",
    "lastUsed": "ISO8601 timestamp",
    "errorPatterns": [
      {
        "errorType": "string",
        "frequency": "integer",
        "commonResolution": "string"
      }
    ]
  },
  "examples": [
    {
      "scenario": "string",
      "inputExample": "object",
      "outputExample": "object",
      "explanation": "string"
    }
  ],
  "version": "string",
  "createdAt": "ISO8601 timestamp",
  "updatedAt": "ISO8601 timestamp"
}
```

**b) `tool_index_lightweight` Collection:**
```json
{
  "_id": "ObjectId",
  "toolId": "string (indexed, unique)",
  "verb": "string",
  "shortDescription": "string (max 100 chars)",
  "category": "string",
  "tags": "string[]",
  "requiredParams": "string[] (parameter names only)",
  "optionalParams": "string[] (parameter names only)",
  "complexity": "enum[low, medium, high]",
  "permissionsRequired": "string[]"
}
```

**c) `user_tool_sessions` Collection:**
```json
{
  "_id": "ObjectId",
  "userId": "string (indexed)",
  "sessionId": "string (indexed)",
  "toolHistory": [
    {
      "toolId": "string",
      "timestamp": "ISO8601",
      "success": "boolean",
      "executionTimeMs": "integer"
    }
  ],
  "preferredTools": "string[] (frequently used)",
  "createdAt": "ISO8601 timestamp",
  "expiresAt": "ISO8601 timestamp (TTL index)"
}
```

**Indexes Required:**
- `tool_manifests`: `toolId` (unique), `manifest.verb`, `manifest.metadata.category`, `manifest.metadata.tags`
- `tool_index_lightweight`: `toolId` (unique), `category`, `tags`
- `user_tool_sessions`: `userId`, `sessionId`, `expiresAt` (TTL)

---

## 3. Data Ingestion Pipeline

### 3.1 Tool Registration Workflow

```
New/Updated Tool Manifest
         │
         ▼
┌─────────────────────┐
│  Validation Layer   │
│  - Schema check     │
│  - Required fields  │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Text Extraction    │
│  - Description      │
│  - Use cases        │
│  - Examples         │
└─────────────────────┘
         │
         ├──────────────────────┬───────────────────────┐
         ▼                      ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Generate         │  │ Store Full       │  │ Create           │
│ Embeddings       │  │ Manifest         │  │ Lightweight      │
│ (Chroma)         │  │ (MongoDB)        │  │ Index (MongoDB)  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### 3.2 Embedding Generation

**Model:** `sentence-transformers/all-MiniLM-L6-v2`  
**Dimensions:** 384  
**Input Text Construction:**

```python
def construct_embedding_text(manifest: dict) -> str:
    """
    Construct searchable text from manifest for embedding.
    """
    components = [
        manifest.get('description', ''),
        manifest.get('explanation', ''),
        ' '.join(manifest.get('metadata', {}).get('tags', [])),
        manifest.get('inputGuidance', ''),
        # Add use case scenarios if available
        ' '.join([ex.get('scenario', '') for ex in manifest.get('examples', [])])
    ]
    
    return ' '.join(filter(None, components))
```

### 3.3 Ingestion Service Specification

**Service:** `tool-ingestion-service`

**Endpoints:**
- `POST /api/v1/tools/register` - Register new tool
- `PUT /api/v1/tools/{toolId}` - Update existing tool
- `DELETE /api/v1/tools/{toolId}` - Deprecate tool
- `POST /api/v1/tools/batch-register` - Bulk registration

**Request Schema (POST /api/v1/tools/register):**
```json
{
  "manifest": {
    "// Full manifest object"
  },
  "examples": [
    {
      "scenario": "string",
      "input": "object",
      "output": "object"
    }
  ],
  "useCases": ["string"],
  "forceReindex": "boolean (default: false)"
}
```

**Implementation Requirements:**
1. Validate manifest against JSON schema
2. Generate embedding within 100ms
3. Store atomically in both Chroma and MongoDB
4. Update lightweight index
5. Invalidate relevant caches
6. Return confirmation with indexing status

---

## 4. Retrieval Engine

### 4.1 Retrieval Orchestrator API

**Class:** `ToolRetrievalOrchestrator`

**Methods:**

```python
class ToolRetrievalOrchestrator:
    """
    Orchestrates tool retrieval using hybrid search strategy.
    """
    
    async def get_relevant_tools(
        self,
        user_query: str,
        session_context: SessionContext,
        max_tools: int = 5,
        retrieval_strategy: RetrievalStrategy = RetrievalStrategy.HYBRID
    ) -> ToolRetrievalResult:
        """
        Retrieve relevant tools for user query.
        
        Args:
            user_query: Raw user input or processed intent
            session_context: User session with history and permissions
            max_tools: Maximum number of detailed manifests to return
            retrieval_strategy: Search strategy to use
            
        Returns:
            ToolRetrievalResult containing lightweight index and detailed manifests
        """
        pass
    
    async def get_tool_manifest(
        self,
        tool_id: str,
        include_examples: bool = True,
        include_relationships: bool = True
    ) -> ToolManifest:
        """
        Retrieve full manifest for specific tool.
        """
        pass
    
    async def get_related_tools(
        self,
        tool_id: str,
        relationship_type: RelationshipType,
        max_results: int = 3
    ) -> List[ToolManifest]:
        """
        Get tools related to specified tool.
        
        Args:
            tool_id: Source tool identifier
            relationship_type: Type of relationship (dependencies, pairings, alternatives)
            max_results: Maximum tools to return
        """
        pass
```

### 4.2 Retrieval Strategies

#### 4.2.1 Strategy: HYBRID (Default)

**Description:** Combines semantic search with metadata filtering and user history.

**Algorithm:**
```python
async def hybrid_retrieval(query: str, context: SessionContext) -> List[str]:
    # Step 1: Semantic Search (Chroma)
    query_embedding = embed_text(query)
    semantic_results = await chroma_client.query(
        query_embeddings=[query_embedding],
        n_results=15,
        where={
            "permissionsRequired": {"$in": context.user_permissions}
        }
    )
    
    # Step 2: Keyword Search (MongoDB)
    keywords = extract_keywords(query)
    keyword_results = await mongodb_client.tool_manifests.find(
        {
            "$text": {"$search": " ".join(keywords)},
            "manifest.security.permissions": {
                "$not": {"$elemMatch": {"$nin": context.user_permissions}}
            }
        },
        {"score": {"$meta": "textScore"}}
    ).sort([("score", {"$meta": "textScore"})]).limit(10).to_list()
    
    # Step 3: User History Boost
    history_tools = get_recent_tools(context.session_id, limit=5)
    
    # Step 4: Merge and Rank
    candidates = merge_results(
        semantic_results,
        keyword_results,
        history_tools
    )
    
    ranked_tools = rank_candidates(
        candidates,
        query=query,
        context=context,
        weights={
            "semantic_similarity": 0.4,
            "keyword_match": 0.3,
            "user_history": 0.2,
            "success_rate": 0.1
        }
    )
    
    return [tool.tool_id for tool in ranked_tools[:max_tools]]
```

#### 4.2.2 Strategy: SEMANTIC_ONLY

**Use Case:** Exploratory queries, vague user intent

**Implementation:**
- Use only Chroma vector search
- Higher diversity in results
- No keyword filtering

#### 4.2.3 Strategy: CATEGORY_FILTERED

**Use Case:** User specifies tool category explicitly

**Implementation:**
- Filter by category first (MongoDB)
- Apply semantic search within category
- Useful for "use a file operation to..." queries

#### 4.2.4 Strategy: SESSION_AWARE

**Use Case:** Multi-turn conversations with established context

**Implementation:**
- Heavily weight tools used in current session
- Pre-load tools commonly paired with recently used tools
- Cache aggressively

### 4.3 Ranking Algorithm

**Scoring Function:**
```python
def calculate_tool_score(
    tool: Tool,
    query: str,
    context: SessionContext,
    weights: Dict[str, float]
) -> float:
    """
    Calculate relevance score for tool.
    """
    score = 0.0
    
    # Semantic similarity (from Chroma)
    score += weights["semantic_similarity"] * tool.similarity_score
    
    # Keyword match (from MongoDB text search)
    score += weights["keyword_match"] * tool.keyword_score
    
    # User history
    if tool.tool_id in context.recent_tools:
        recency_factor = calculate_recency(
            tool.tool_id,
            context.tool_history
        )
        score += weights["user_history"] * recency_factor
    
    # Tool quality metrics
    score += weights["success_rate"] * tool.analytics.success_rate
    
    # Complexity penalty (prefer simpler tools when equal)
    complexity_penalty = {
        "low": 0.0,
        "medium": -0.05,
        "high": -0.1
    }
    score += complexity_penalty.get(tool.complexity, 0)
    
    return score
```

### 4.4 Context Assembly

**Output Schema:**
```python
@dataclass
class ToolRetrievalResult:
    """Result package for LLM context."""
    
    # Always included - lightweight index of ALL tools
    tool_index: List[ToolIndexEntry]  # ~2-3K tokens
    
    # Retrieved based on query - detailed manifests
    detailed_tools: List[ToolManifest]  # ~5-10K tokens
    
    # Usage examples for top tools
    examples: List[ToolExample]  # ~2-3K tokens
    
    # Metadata
    retrieval_strategy: str
    retrieval_time_ms: int
    total_tools_available: int
    tools_retrieved: int
    
    def to_llm_context(self) -> str:
        """
        Format for LLM consumption.
        """
        pass
```

**LLM Context Format:**
```markdown
# Available Tools (Lightweight Index)
Total Tools: {total_tools_available}

{for each tool in tool_index}
- **{tool.toolId}** ({tool.verb}): {tool.shortDescription}
  Categories: {tool.category} | Tags: {tool.tags}
  Required: {tool.requiredParams} | Optional: {tool.optionalParams}

---

# Detailed Tool Manifests (Retrieved for this query)
Retrieved {tools_retrieved} relevant tools:

{for each tool in detailed_tools}
## {tool.toolId}
{full manifest JSON}

### Usage Examples
{tool.examples}

### Common Patterns
{tool.relationships.commonPairings}

---
```

---

## 5. Caching Strategy

### 5.1 Multi-Layer Cache

```
┌──────────────────────────────────┐
│     L1: In-Memory Cache          │
│  - Active session tools           │
│  - TTL: 5 minutes                 │
│  - Size: 50 tools per session     │
└──────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────┐
│     L2: Redis Cache              │
│  - Recently retrieved tools       │
│  - TTL: 1 hour                    │
│  - Size: 500 tools                │
└──────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────┐
│     L3: Database                 │
│  - All tools                      │
│  - Persistent                     │
└──────────────────────────────────┘
```

### 5.2 Cache Keys

**Format:** `tool:{strategy}:{query_hash}:{permission_hash}`

**Example:**
```
tool:hybrid:a3f9c2e1:user_basic_perms
```

### 5.3 Cache Invalidation

**Events triggering invalidation:**
- Tool manifest updated → Clear all caches for that tool
- New tool registered → Clear strategy-level caches
- User permissions changed → Clear user-specific caches
- Manual flush → Admin endpoint

**Implementation:**
```python
class CacheManager:
    async def invalidate_tool(self, tool_id: str):
        """Invalidate all caches containing specific tool."""
        
    async def invalidate_user_cache(self, user_id: str):
        """Clear user-specific caches."""
        
    async def invalidate_strategy(self, strategy: RetrievalStrategy):
        """Clear caches for specific retrieval strategy."""
```

---

## 6. Progressive Disclosure

### 6.1 Conversation Phases

**Phase 1: Initial Planning**
- **Context:** User submits initial query
- **Retrieval:** Lightweight index only (all tools)
- **Token Budget:** ~2-3K tokens
- **Purpose:** Allow LLM to understand available capabilities

**Phase 2: Tool Selection**
- **Context:** LLM identifies relevant tools
- **Retrieval:** Full manifests for selected tools (1-3)
- **Token Budget:** ~3-5K tokens
- **Purpose:** Provide detailed specifications for execution

**Phase 3: Execution Preparation**
- **Context:** LLM prepares to execute tool
- **Retrieval:** 
  - Related tools (dependencies, common pairings)
  - Error handlers
  - Validation tools
- **Token Budget:** ~2-4K tokens
- **Purpose:** Enable robust execution planning

**Phase 4: Error Recovery**
- **Context:** Tool execution failed
- **Retrieval:**
  - Error-specific debugging info
  - Alternative tools
  - Recovery patterns
- **Token Budget:** ~3-5K tokens
- **Purpose:** Enable self-correction

### 6.2 Implementation

```python
class ConversationPhaseManager:
    def determine_phase(
        self,
        conversation_history: List[Message],
        current_query: str
    ) -> ConversationPhase:
        """
        Analyze conversation to determine current phase.
        """
        pass
    
    def get_retrieval_config(
        self,
        phase: ConversationPhase
    ) -> RetrievalConfig:
        """
        Get retrieval configuration for phase.
        """
        configs = {
            ConversationPhase.INITIAL_PLANNING: RetrievalConfig(
                include_lightweight_index=True,
                include_detailed_manifests=False,
                max_tools=0
            ),
            ConversationPhase.TOOL_SELECTION: RetrievalConfig(
                include_lightweight_index=True,
                include_detailed_manifests=True,
                max_tools=3,
                include_examples=True
            ),
            ConversationPhase.EXECUTION_PREP: RetrievalConfig(
                include_lightweight_index=False,
                include_detailed_manifests=True,
                max_tools=5,
                include_relationships=True,
                include_error_patterns=False
            ),
            ConversationPhase.ERROR_RECOVERY: RetrievalConfig(
                include_lightweight_index=False,
                include_detailed_manifests=True,
                max_tools=3,
                include_error_patterns=True,
                include_alternatives=True
            )
        }
        return configs[phase]
```

---

## 7. Analytics & Learning

### 7.1 Telemetry Collection

**Events to Track:**
```python
@dataclass
class ToolRetrievalEvent:
    event_id: str
    timestamp: datetime
    user_id: str
    session_id: str
    query: str
    retrieval_strategy: str
    tools_retrieved: List[str]
    tool_selected: Optional[str]  # Which tool LLM actually chose
    execution_success: Optional[bool]
    retrieval_time_ms: int
    relevance_score: Optional[float]  # If user provides feedback

@dataclass
class ToolExecutionEvent:
    event_id: str
    timestamp: datetime
    tool_id: str
    user_id: str
    session_id: str
    success: bool
    execution_time_ms: int
    error_type: Optional[str]
    prior_tools_in_session: List[str]
```

### 7.2 Learning Pipeline

```
Event Stream
     │
     ▼
┌──────────────────┐
│  Event Ingestion │
│  (Kafka/Kinesis) │
└──────────────────┘
     │
     ▼
┌──────────────────────────────────┐
│  Analytics Processing            │
│  - Co-occurrence analysis        │
│  - Success rate calculation      │
│  - Embedding refinement          │
└──────────────────────────────────┘
     │
     ├─────────────────┬──────────────────┐
     ▼                 ▼                  ▼
┌──────────┐   ┌──────────────┐   ┌──────────────┐
│ Update   │   │ Update       │   │ Retrain      │
│ MongoDB  │   │ Co-occurrence│   │ Ranking      │
│ Analytics│   │ Graph        │   │ Model        │
└──────────┘   └──────────────┘   └──────────────┘
```

### 7.3 Continuous Improvement

**Daily Batch Job:**
```python
async def update_tool_analytics():
    """
    Run daily to update tool analytics based on usage.
    """
    # Update success rates
    for tool in all_tools:
        events = get_tool_events(tool.id, last_24_hours)
        tool.analytics.success_rate = calculate_success_rate(events)
        tool.analytics.avg_execution_time = calculate_avg(events)
    
    # Update co-occurrence scores
    session_sequences = get_all_session_sequences(last_24_hours)
    cooccurrence_matrix = build_cooccurrence_matrix(session_sequences)
    update_tool_relationships(cooccurrence_matrix)
    
    # Update frequency scores for Chroma
    usage_counts = get_usage_counts(last_30_days)
    for tool_id, count in usage_counts.items():
        update_frequency_score(tool_id, count)
```

**Weekly Model Retraining:**
- Retrain ranking weights based on user selections
- Adjust semantic search parameters
- Update embedding if tool descriptions changed significantly

---

## 8. API Specifications

### 8.1 Retrieval API

**Base URL:** `/api/v1/tools/retrieval`

#### GET /api/v1/tools/retrieval/search

**Description:** Search for relevant tools based on query.

**Query Parameters:**
- `q` (required): Search query string
- `strategy` (optional): `hybrid|semantic|category|session` (default: `hybrid`)
- `maxTools` (optional): Maximum tools to return (default: 5, max: 20)
- `includeExamples` (optional): Include usage examples (default: true)
- `category` (optional): Filter by category

**Headers:**
- `X-Session-ID`: Session identifier
- `X-User-ID`: User identifier
- `Authorization`: Bearer token

**Response:**
```json
{
  "status": "success",
  "data": {
    "lightweightIndex": [
      {
        "toolId": "string",
        "verb": "string",
        "shortDescription": "string",
        "category": "string",
        "tags": ["string"],
        "requiredParams": ["string"],
        "optionalParams": ["string"],
        "complexity": "low|medium|high"
      }
    ],
    "detailedTools": [
      {
        "toolId": "string",
        "manifest": {},
        "examples": [],
        "relationships": {}
      }
    ],
    "metadata": {
      "retrievalStrategy": "string",
      "retrievalTimeMs": "integer",
      "totalToolsAvailable": "integer",
      "toolsRetrieved": "integer",
      "cacheHit": "boolean"
    }
  }
}
```

#### GET /api/v1/tools/retrieval/manifest/{toolId}

**Description:** Retrieve full manifest for specific tool.

**Path Parameters:**
- `toolId`: Tool identifier

**Query Parameters:**
- `includeExamples` (optional): default true
- `includeRelationships` (optional): default true
- `includeAnalytics` (optional): default false

**Response:**
```json
{
  "status": "success",
  "data": {
    "toolId": "string",
    "manifest": {},
    "examples": [],
    "relationships": {},
    "analytics": {}
  }
}
```

#### GET /api/v1/tools/retrieval/related/{toolId}

**Description:** Get tools related to specified tool.

**Path Parameters:**
- `toolId`: Source tool identifier

**Query Parameters:**
- `relationshipType`: `dependencies|pairings|alternatives`
- `maxResults` (optional): default 3, max 10

**Response:**
```json
{
  "status": "success",
  "data": {
    "sourceToolId": "string",
    "relationshipType": "string",
    "relatedTools": [
      {
        "toolId": "string",
        "relationshipScore": "float",
        "manifest": {}
      }
    ]
  }
}
```

### 8.2 Admin API

**Base URL:** `/api/v1/tools/admin`

#### POST /api/v1/tools/admin/reindex

**Description:** Trigger reindexing of all tools.

**Request:**
```json
{
  "scope": "all|specific",
  "toolIds": ["string"],  // Required if scope=specific
  "forceEmbeddingRegeneration": "boolean"
}
```

#### DELETE /api/v1/tools/admin/cache/invalidate

**Description:** Invalidate caches.

**Request:**
```json
{
  "scope": "all|user|tool|strategy",
  "userId": "string",  // Required if scope=user
  "toolId": "string",  // Required if scope=tool
  "strategy": "string"  // Required if scope=strategy
}
```

#### GET /api/v1/tools/admin/analytics

**Description:** Get retrieval analytics.

**Query Parameters:**
- `startDate`: ISO8601 date
- `endDate`: ISO8601 date
- `groupBy`: `tool|user|strategy`

---

## 9. Performance Requirements

### 9.1 Latency Targets

| Operation | p50 | p95 | p99 |
|-----------|-----|-----|-----|
| Hybrid Search | <100ms | <200ms | <300ms |
| Manifest Retrieval | <50ms | <100ms | <150ms |
| Cache Hit | <10ms | <20ms | <30ms |
| Embedding Generation | <50ms | <100ms | <150ms |

### 9.2 Throughput Targets

- **Concurrent searches:** 100+ requests/sec
- **Tool registrations:** 10+ registrations/sec
- **Cache invalidations:** Sub-second propagation

### 9.3 Resource Limits

- **Chroma collection size:** 10,000+ tools
- **MongoDB storage:** 1GB per 10,000 tools
- **Redis cache:** 2GB maximum
- **In-memory cache:** 100MB per service instance

---

## 10. Security & Access Control

### 10.1 Permission Model

**Tool Permission Levels:**
- `public`: Available to all users
- `authenticated`: Requires user authentication
- `role:{role_name}`: Requires specific role
- `permission:{permission}`: Requires specific permission

**Implementation:**
```python
def check_tool_access(
    tool: Tool,
    user_context: UserContext
) -> bool:
    """
    Verify user has access to tool.
    """
    required_perms = tool.manifest.security.permissions
    
    for perm in required_perms:
        if perm == "public":
            return True
        elif perm == "authenticated" and user_context.authenticated:
            continue
        elif perm.startswith("role:"):
            role = perm.split(":")[1]
            if role not in user_context.roles:
                return False
        elif perm.startswith("permission:"):
            permission = perm.split(":")[1]
            if permission not in user_context.permissions:
                return False
    
    return True
```

### 10.2 Query Filtering

All retrieval operations must filter results based on user permissions:
- Apply permission filters in Chroma metadata
- Double-check permissions in orchestrator
- Never return tools user cannot execute

### 10.3 Audit Logging

Log all tool retrievals and executions:
```python
@dataclass
class AuditLogEntry:
    timestamp: datetime
    user_id: str
    action: str  # 'retrieve', 'execute', 'register'
    tool_id: str
    success: bool
    ip_address: str
    user_agent: str
```

---

## 11. Migration Strategy

### 11.1 Phase 1: Setup (Week 1-2)
- [ ] Deploy Chroma instance
- [ ] Create MongoDB collections and indexes
- [ ] Implement tool