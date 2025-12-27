# Stage7 Environment Variable Comprehensive Guide

**Status:** Active | **Last Updated:** 2025-12-23 | **Version:** 3.0

This document provides a comprehensive, audited guide to all environment variables required for the Stage7 system, including validation rules, default values, and security considerations.

## 📋 Global Configuration

### Core System Variables

**File Path:** `.env` (Root)

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `NODE_ENV` | string | `development` | `development|production|staging` | Node.js environment mode | ❌ None |
| `HOST` | string | `localhost` | Valid hostname/IP | Hostname for services | ❌ None |
| `PORT` | number | - | 1024-65535 | Base port for services | ❌ None |
| `LOG_LEVEL` | string | `info` | `error|warn|info|debug|trace` | Logging level for all services | ❌ None |
| `METRICS_ENABLED` | boolean | `false` | `true|false` | Enable Prometheus metrics | ❌ None |

### Security Configuration (HIGH PRIORITY)

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `JWT_SECRET` | string | **REQUIRED** | Min 32 chars, alphanumeric | Secret for JWT access tokens | ⚠️ **CRITICAL** |
| `JWT_REFRESH_SECRET` | string | **REQUIRED** | Min 32 chars, alphanumeric | Secret for JWT refresh tokens | ⚠️ **CRITICAL** |
| `ENCRYPTION_KEY` | string | **REQUIRED** | Min 32 chars | Key for data encryption | ⚠️ **CRITICAL** |
| `CLIENT_SECRET` | string | **REQUIRED** | Min 16 chars | Shared secret for client auth | ⚠️ **CRITICAL** |
| `JWT_EXPIRATION` | number | `3600` | 300-86400 | JWT expiration in seconds | ❌ None |
| `JWT_REFRESH_EXPIRATION` | number | `86400` | 3600-604800 | Refresh token expiration | ❌ None |

## 🔐 Service-Specific Configuration

### 1. SecurityManager Service

**File Path:** `services/security/.env`

#### Authentication Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `JWT_SECRET` | string | **REQUIRED** | Min 32 chars | JWT signing secret | ⚠️ **CRITICAL** |
| `JWT_REFRESH_SECRET` | string | **REQUIRED** | Min 32 chars | Refresh token secret | ⚠️ **CRITICAL** |
| `JWT_ACCESS_EXPIRATION` | number | `3600` | 300-86400 | Access token lifetime (seconds) | ❌ None |
| `JWT_REFRESH_EXPIRATION` | number | `86400` | 3600-604800 | Refresh token lifetime (seconds) | ❌ None |
| `JWT_VERIFICATION_EXPIRATION` | number | `300` | 60-3600 | Verification token lifetime | ❌ None |
| `JWT_RESET_EXPIRATION` | number | `1800` | 300-86400 | Password reset token lifetime | ❌ None |

#### Service Secrets (HIGH SECURITY)

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `POSTOFFICE_SECRET` | string | **REQUIRED** | Min 16 chars | Secret for PostOffice service | ⚠️ **CRITICAL** |
| `MISSIONCONTROL_SECRET` | string | **REQUIRED** | Min 16 chars | Secret for MissionControl | ⚠️ **CRITICAL** |
| `BRAIN_SECRET` | string | **REQUIRED** | Min 16 chars | Secret for Brain service | ⚠️ **CRITICAL** |
| `LIBRARIAN_SECRET` | string | **REQUIRED** | Min 16 chars | Secret for Librarian | ⚠️ **CRITICAL** |
| `ENGINEER_SECRET` | string | **REQUIRED** | Min 16 chars | Secret for Engineer | ⚠️ **CRITICAL** |
| `TRAFFICMANAGER_SECRET` | string | **REQUIRED** | Min 16 chars | Secret for TrafficManager | ⚠️ **CRITICAL** |
| `CAPABILITIESMANAGER_SECRET` | string | **REQUIRED** | Min 16 chars | Secret for CapabilitiesManager | ⚠️ **CRITICAL** |
| `AGENTSET_SECRET` | string | **REQUIRED** | Min 16 chars | Secret for AgentSet | ⚠️ **CRITICAL** |
| `MARKETPLACE_SECRET` | string | **REQUIRED** | Min 16 chars | Secret for Marketplace | ⚠️ **CRITICAL** |

#### Service Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `POSTOFFICE_URL` | string | `http://postoffice:5020` | Valid URL | PostOffice service URL | ❌ None |
| `LIBRARIAN_URL` | string | `http://librarian:5040` | Valid URL | Librarian service URL | ❌ None |
| `FRONTEND_URL` | string | `http://localhost:5070` | Valid URL | Frontend application URL | ❌ None |
| `PORT` | number | `5010` | 1024-65535 | Service port | ❌ None |
| `MAX_LOGIN_ATTEMPTS` | number | `5` | 3-10 | Max login attempts before lockout | ❌ None |
| `LOCKOUT_DURATION` | number | `300` | 60-3600 | Lockout duration (seconds) | ❌ None |

#### Email Configuration (Optional)

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `EMAIL_HOST` | string | - | Valid hostname | SMTP server hostname | ❌ None |
| `EMAIL_PORT` | number | `587` | 1-65535 | SMTP server port | ❌ None |
| `EMAIL_SECURE` | boolean | `true` | `true|false` | Use SSL/TLS | ❌ None |
| `EMAIL_USER` | string | - | Valid email | SMTP username | ⚠️ **SENSITIVE** |
| `EMAIL_PASS` | string | - | - | SMTP password | ⚠️ **CRITICAL** |
| `EMAIL_FROM` | string | - | Valid email | From email address | ❌ None |

### 2. PostOffice Service

**File Path:** `services/postoffice/.env`

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `CLIENT_SECRET` | string | **REQUIRED** | Min 16 chars | Client authentication secret | ⚠️ **CRITICAL** |
| `PORT` | number | `5020` | 1024-65535 | Service port | ❌ None |
| `SECURITYMANAGER_URL` | string | `http://securitymanager:5010` | Valid URL | SecurityManager URL | ❌ None |
| `RATE_LIMIT` | number | `1000` | 100-10000 | Requests per minute | ❌ None |
| `MAX_PAYLOAD_SIZE` | string | `10mb` | Valid size | Max request payload size | ❌ None |
| `CORS_ORIGIN` | string | `*` | Valid URL or `*` | CORS allowed origin | ⚠️ **SECURITY** |
| `API_PREFIX` | string | `/api` | Starts with `/` | API route prefix | ❌ None |

### 3. Brain Service

**File Path:** `services/brain/.env`

#### Core Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `CLIENT_SECRET` | string | **REQUIRED** | Min 16 chars | Client authentication secret | ⚠️ **CRITICAL** |
| `PORT` | number | `5030` | 1024-65535 | Service port | ❌ None |
| `LIBRARIAN_URL` | string | `http://librarian:5040` | Valid URL | Librarian service URL | ❌ None |
| `MAX_CONCURRENT_PLANS` | number | `5` | 1-20 | Max concurrent planning tasks | ❌ None |
| `PLAN_TIMEOUT` | number | `30000` | 5000-300000 | Plan generation timeout (ms) | ❌ None |

#### LLM API Keys (HIGH SECURITY)

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `GROQ_API_KEY` | string | **REQUIRED** | - | Groq API key | ⚠️ **CRITICAL** |
| `ANTHROPIC_API_KEY` | string | - | - | Anthropic API key | ⚠️ **CRITICAL** |
| `GEMINI_API_KEY` | string | - | - | Gemini API key | ⚠️ **CRITICAL** |
| `OPENAI_API_KEY` | string | - | - | OpenAI API key | ⚠️ **CRITICAL** |
| `OPENROUTER_API_KEY` | string | - | - | OpenRouter API key | ⚠️ **CRITICAL** |
| `MISTRAL_API_KEY` | string | - | - | Mistral API key | ⚠️ **CRITICAL** |
| `HUGGINGFACE_API_KEY` | string | - | - | Hugging Face API key | ⚠️ **CRITICAL** |
| `AIML_API_KEY` | string | - | - | AIML API key | ⚠️ **CRITICAL** |

#### LLM API URLs

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `GEMINI_API_URL` | string | `https://generativelanguage.googleapis.com` | Valid URL | Gemini API endpoint | ❌ None |
| `HUGGINGFACE_API_URL` | string | `https://api-inference.huggingface.co` | Valid URL | Hugging Face endpoint | ❌ None |
| `ANTHROPIC_API_URL` | string | `https://api.anthropic.com` | Valid URL | Anthropic API endpoint | ❌ None |
| `OPENWEB_URL` | string | `https://api.openweb.ai` | Valid URL | OpenWeb API endpoint | ❌ None |
| `OPENWEBUI_API_KEY` | string | - | - | OpenWebUI API key | ⚠️ **CRITICAL** |

#### Model Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `DEFAULT_MODEL` | string | `gpt-4` | Valid model ID | Default LLM model | ❌ None |
| `FALLBACK_MODEL` | string | `claude-3-opus` | Valid model ID | Fallback LLM model | ❌ None |
| `MAX_TOKENS` | number | `4096` | 512-8192 | Max tokens per response | ❌ None |
| `TEMPERATURE` | number | `0.7` | 0.0-2.0 | Default temperature | ❌ None |
| `TOP_P` | number | `1.0` | 0.0-1.0 | Nucleus sampling | ❌ None |

### 4. Librarian Service

**File Path:** `services/librarian/.env`

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `CLIENT_SECRET` | string | **REQUIRED** | Min 16 chars | Client authentication secret | ⚠️ **CRITICAL** |
| `PORT` | number | `5040` | 1024-65535 | Service port | ❌ None |
| `REDIS_HOST` | string | `redis` | Valid hostname | Redis hostname | ❌ None |
| `REDIS_PORT` | number | `6379` | 1-65535 | Redis port | ❌ None |
| `REDIS_PASSWORD` | string | - | - | Redis password | ⚠️ **SENSITIVE** |
| `MONGO_URI` | string | `mongodb://mongodb:27017` | Valid MongoDB URI | MongoDB connection URI | ⚠️ **SENSITIVE** |
| `MONGO_DB` | string | `stage7` | Valid DB name | MongoDB database name | ❌ None |
| `CHROMA_HOST` | string | `chroma` | Valid hostname | ChromaDB hostname | ❌ None |
| `CHROMA_PORT` | number | `8000` | 1-65535 | ChromaDB port | ❌ None |
| `SEARCH_TOP_K` | number | `10` | 1-50 | Number of search results | ❌ None |
| `SEARCH_THRESHOLD` | number | `0.7` | 0.0-1.0 | Minimum similarity score | ❌ None |
| `EMBEDDING_MODEL` | string | `all-MiniLM-L6-v2` | Valid model | Embedding model name | ❌ None |
| `DISCOVERY_CACHE_TTL` | number | `300` | 60-3600 | Cache TTL (seconds) | ❌ None |

### 5. CapabilitiesManager Service

**File Path:** `services/capabilitiesmanager/.env`

#### Core Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `CLIENT_SECRET` | string | **REQUIRED** | Min 16 chars | Client authentication secret | ⚠️ **CRITICAL** |
| `PORT` | number | `5060` | 1024-65535 | Service port | ❌ None |
| `PLUGIN_TIMEOUT` | number | `30000` | 5000-300000 | Plugin execution timeout (ms) | ❌ None |
| `PLUGIN_MAX_CONCURRENT` | number | `10` | 1-50 | Max concurrent plugin executions | ❌ None |
| `PLUGIN_RETRY_ATTEMPTS` | number | `3` | 1-10 | Number of retry attempts | ❌ None |
| `PLUGIN_RETRY_DELAY` | number | `1000` | 100-10000 | Delay between retries (ms) | ❌ None |

#### Plugin Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `DEFAULT_PLUGIN_REPOSITORY` | string | `mongo` | `local|github|mongo` | Default plugin repository | ❌ None |
| `LOCAL_PLUGIN_PATH` | string | `./plugins` | Valid path | Local plugin directory | ❌ None |
| `MONGO_COLLECTION` | string | `plugins` | Valid collection | MongoDB plugin collection | ❌ None |
| `CONTAINER_MEMORY_LIMIT` | string | `512m` | Valid size | Container memory limit | ❌ None |
| `CONTAINER_CPU_LIMIT` | number | `1.0` | 0.1-8.0 | Container CPU limit | ❌ None |
| `CONTAINER_NETWORK` | string | `bridge` | Valid network | Docker network mode | ❌ None |

#### Plugin Security (HIGH SECURITY)

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `PLUGIN_SIGNING_KEY` | string | **REQUIRED** | - | Private key for plugin signing | ⚠️ **CRITICAL** |
| `PLUGIN_PUBLIC_KEY` | string | **REQUIRED** | - | Public key for plugin verification | ⚠️ **CRITICAL** |
| `PLUGIN_SANDBOX_ENABLED` | boolean | `true` | `true|false` | Enable plugin sandboxing | ⚠️ **SECURITY** |
| `PLUGIN_NETWORK_ISOLATION` | boolean | `true` | `true|false` | Isolate plugin network | ⚠️ **SECURITY** |
| `PLUGIN_FILESYSTEM_READONLY` | boolean | `true` | `true|false` | Read-only filesystem | ⚠️ **SECURITY** |

#### GitHub Integration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `ENABLE_GITHUB` | boolean | `false` | `true|false` | Enable GitHub integration | ❌ None |
| `GITHUB_TOKEN` | string | - | - | GitHub personal access token | ⚠️ **CRITICAL** |
| `GITHUB_USERNAME` | string | - | - | GitHub username | ❌ None |
| `GIT_REPOSITORY_URL` | string | - | Valid URL | Git repository URL | ❌ None |
| `GIT_DEFAULT_BRANCH` | string | `main` | Valid branch | Default git branch | ❌ None |
| `GITHUB_EMAIL` | string | - | Valid email | GitHub email address | ❌ None |

#### External API Keys

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `GOOGLE_SEARCH_API_KEY` | string | - | - | Google Custom Search API key | ⚠️ **CRITICAL** |
| `GOOGLE_CSE_ID` | string | - | - | Google Custom Search Engine ID | ❌ None |
| `LANGSEARCH_API_KEY` | string | - | - | LangSearch API key | ⚠️ **CRITICAL** |

### 6. Engineer Service

**File Path:** `services/engineer/.env`

#### Core Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `CLIENT_SECRET` | string | **REQUIRED** | Min 16 chars | Client authentication secret | ⚠️ **CRITICAL** |
| `PORT` | number | `5080` | 1024-65535 | Service port | ❌ None |
| `PLUGIN_VALIDATION_TIMEOUT` | number | `60000` | 10000-300000 | Validation timeout (ms) | ❌ None |
| `CODE_GENERATION_TIMEOUT` | number | `120000` | 30000-600000 | Code generation timeout | ❌ None |

#### GitHub Integration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `ENABLE_GITHUB` | boolean | `false` | `true|false` | Enable GitHub integration | ❌ None |
| `GITHUB_TOKEN` | string | - | - | GitHub personal access token | ⚠️ **CRITICAL** |
| `GITHUB_USERNAME` | string | - | - | GitHub username | ❌ None |
| `GIT_REPOSITORY_URL` | string | - | Valid URL | Git repository URL | ❌ None |
| `GIT_DEFAULT_BRANCH` | string | `main` | Valid branch | Default git branch | ❌ None |
| `GITHUB_EMAIL` | string | - | Valid email | GitHub email address | ❌ None |

#### Plugin Development

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `PLUGIN_TEMPLATE_PATH` | string | `./templates` | Valid path | Plugin template directory | ❌ None |
| `PLUGIN_OUTPUT_PATH` | string | `./output` | Valid path | Generated plugin output | ❌ None |
| `PLUGIN_SIGNING_KEY` | string | **REQUIRED** | - | Plugin signing private key | ⚠️ **CRITICAL** |
| `PLUGIN_TEST_TIMEOUT` | number | `30000` | 5000-300000 | Test execution timeout | ❌ None |

### 7. Marketplace Service

**File Path:** `services/marketplace/.env`

#### Core Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `CLIENT_SECRET` | string | **REQUIRED** | Min 16 chars | Client authentication secret | ⚠️ **CRITICAL** |
| `PORT` | number | `5050` | 1024-65535 | Service port | ❌ None |
| `DEFAULT_PLUGIN_REPOSITORY` | string | `mongo` | `local|github|mongo` | Default repository type | ❌ None |

#### GitHub Integration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `ENABLE_GITHUB` | boolean | `false` | `true|false` | Enable GitHub integration | ❌ None |
| `GITHUB_TOKEN` | string | - | - | GitHub personal access token | ⚠️ **CRITICAL** |
| `GITHUB_USERNAME` | string | - | - | GitHub username | ❌ None |
| `GIT_REPOSITORY_URL` | string | - | Valid URL | Git repository URL | ❌ None |
| `GIT_DEFAULT_BRANCH` | string | `main` | Valid branch | Default git branch | ❌ None |
| `GITHUB_EMAIL` | string | - | Valid email | GitHub email address | ❌ None |

#### Database Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `MONGO_COLLECTION` | string | `plugins` | Valid collection | MongoDB collection name | ❌ None |
| `PLUGIN_METADATA_CACHE_TTL` | number | `3600` | 300-86400 | Metadata cache TTL | ❌ None |

### 8. AgentSet Service

**File Path:** `services/agentset/.env`

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `CLIENT_SECRET` | string | **REQUIRED** | Min 16 chars | Client authentication secret | ⚠️ **CRITICAL** |
| `PORT` | number | `5110` | 1024-65535 | Service port | ❌ None |
| `MAX_AGENTS` | number | `20` | 1-100 | Maximum number of agents | ❌ None |
| `AGENT_TIMEOUT` | number | `300000` | 60000-1800000 | Agent execution timeout | ❌ None |
| `MAX_CONCURRENT_MISSIONS` | number | `10` | 1-50 | Max concurrent missions | ❌ None |
| `MISSION_HISTORY_LIMIT` | number | `100` | 10-1000 | Mission history retention | ❌ None |

### 9. MissionControl Service

**File Path:** `services/missioncontrol/.env`

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `CLIENT_SECRET` | string | **REQUIRED** | Min 16 chars | Client authentication secret | ⚠️ **CRITICAL** |
| `PORT` | number | `5100` | 1024-65535 | Service port | ❌ None |
| `MAX_CONCURRENT_MISSIONS` | number | `5` | 1-20 | Max concurrent missions | ❌ None |
| `MISSION_TIMEOUT` | number | `3600000` | 300000-86400000 | Mission timeout (ms) | ❌ None |
| `MISSION_RETRY_LIMIT` | number | `3` | 1-10 | Mission retry attempts | ❌ None |

### 10. TrafficManager Service

**File Path:** `services/trafficmanager/.env`

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `CLIENT_SECRET` | string | **REQUIRED** | Min 16 chars | Client authentication secret | ⚠️ **CRITICAL** |
| `PORT` | number | `5090` | 1024-65535 | Service port | ❌ None |
| `LOAD_BALANCING_STRATEGY` | string | `round-robin` | `round-robin|least-connections|ip-hash` | Load balancing strategy | ❌ None |
| `HEALTH_CHECK_INTERVAL` | number | `30000` | 5000-300000 | Health check interval | ❌ None |
| `MAX_RETRIES` | number | `3` | 1-10 | Max retry attempts | ❌ None |
| `CIRCUIT_BREAKER_THRESHOLD` | number | `5` | 1-20 | Circuit breaker threshold | ❌ None |
| `CIRCUIT_BREAKER_RESET` | number | `30000` | 5000-300000 | Circuit breaker reset time | ❌ None |

### 11. Frontend Configuration

**File Path:** `services/mcsreact/.env`

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `REACT_APP_API_BASE_URL` | string | `http://localhost:5020` | Valid URL | API base URL | ❌ None |
| `REACT_APP_WS_URL` | string | `ws://localhost:5020` | Valid URL | WebSocket URL | ❌ None |
| `NODE_ENV` | string | `development` | `development|production` | React environment | ❌ None |
| `GENERATE_SOURCEMAP` | boolean | `true` | `true|false` | Generate source maps | ❌ None |
| `SKIP_PREFLIGHT_CHECK` | boolean | `false` | `true|false` | Skip preflight checks | ❌ None |
| `DANGEROUSLY_DISABLE_HOST_CHECK` | boolean | `false` | `true|false` | Disable host check | ⚠️ **SECURITY** |

## 🔧 Database Configuration

### MongoDB Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `MONGODB_URI` | string | `mongodb://mongodb:27017` | Valid MongoDB URI | MongoDB connection string | ⚠️ **SENSITIVE** |
| `MONGO_URL` | string | `mongodb://mongodb:27017` | Valid URL | MongoDB server URL | ❌ None |
| `MONGO_DB` | string | `stage7` | Valid DB name | MongoDB database name | ❌ None |
| `MONGO_USER` | string | - | - | MongoDB username | ⚠️ **SENSITIVE** |
| `MONGO_PASS` | string | - | - | MongoDB password | ⚠️ **CRITICAL** |
| `MONGO_AUTH_SOURCE` | string | `admin` | Valid DB name | Authentication database | ❌ None |
| `MONGO_REPLICA_SET` | string | - | - | Replica set name | ❌ None |
| `MONGO_SSL` | boolean | `false` | `true|false` | Enable SSL connection | ❌ None |

### Redis Configuration

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `REDIS_URL` | string | `redis://redis:6379` | Valid Redis URL | Redis connection URL | ❌ None |
| `REDIS_HOST` | string | `redis` | Valid hostname | Redis hostname | ❌ None |
| `REDIS_PORT` | number | `6379` | 1-65535 | Redis port | ❌ None |
| `REDIS_PASSWORD` | string | - | - | Redis password | ⚠️ **SENSITIVE** |
| `REDIS_DB` | number | `0` | 0-15 | Redis database index | ❌ None |
| `REDIS_SSL` | boolean | `false` | `true|false` | Enable SSL connection | ❌ None |

## 🌐 External Service Configuration

### API Keys and External Services

| Variable | Type | Default | Validation | Description | Security |
|----------|------|---------|------------|-------------|-----------|
| `GROQ_API_KEY` | string | **REQUIRED** | - | Groq API key | ⚠️ **CRITICAL** |
| `ANTHROPIC_API_KEY` | string | - | - | Anthropic API key | ⚠️ **CRITICAL** |
| `GEMINI_API_KEY` | string | - | - | Gemini API key | ⚠️ **CRITICAL** |
| `OPENAI_API_KEY` | string | - | - | OpenAI API key | ⚠️ **CRITICAL** |
| `OPENROUTER_API_KEY` | string | - | - | OpenRouter API key | ⚠️ **CRITICAL** |
| `MISTRAL_API_KEY` | string | - | - | Mistral API key | ⚠️ **CRITICAL** |
| `HUGGINGFACE_API_KEY` | string | - | - | Hugging Face API key | ⚠️ **CRITICAL** |
| `AIML_API_KEY` | string | - | - | AIML API key | ⚠️ **CRITICAL** |
| `CLOUDFLARE_WORKERS_AI_API_TOKEN` | string | - | - | Cloudflare Workers AI token | ⚠️ **CRITICAL** |
| `CLOUDFLARE_WORKERS_AI_ACCOUNT_ID` | string | - | - | Cloudflare account ID | ⚠️ **SENSITIVE** |
| `OPENWEATHER_API_KEY` | string | - | - | OpenWeather API key | ⚠️ **CRITICAL** |
| `DUCKDUCKGO_API_KEY` | string | - | - | DuckDuckGo API key | ⚠️ **CRITICAL** |
| `GOOGLE_SEARCH_API_KEY` | string | - | - | Google Search API key | ⚠️ **CRITICAL** |
| `GOOGLE_CSE_ID` | string | - | - | Google CSE ID | ❌ None |
| `LANGSEARCH_API_KEY` | string | - | - | LangSearch API key | ⚠️ **CRITICAL** |
| `WEATHER_API_KEY` | string | - | - | Weather API key | ⚠️ **CRITICAL** |

## 🛡️ Security Best Practices

### 1. Secret Management

**DO:**
- ✅ Use environment variables for all secrets
- ✅ Generate strong, random values for secrets
- ✅ Rotate secrets regularly
- ✅ Use different secrets for different environments
- ✅ Store secrets in secure vaults in production

**DON'T:**
- ❌ Commit secrets to version control
- ❌ Use weak or predictable secrets
- ❌ Share secrets between environments
- ❌ Hardcode secrets in configuration files
- ❌ Use the same secret for multiple purposes

### 2. Configuration Validation

**Validation Tools:**
```bash
# Validate environment variables
node scripts/validate_env.js

# Check for missing required variables
node scripts/check_required_env.js

# Verify variable formats
node scripts/verify_env_formats.js
```

**Validation Rules:**
- All required variables are present
- Variables match expected formats
- Secrets meet minimum strength requirements
- URLs are valid and accessible
- Ports are within valid ranges

### 3. Environment Management

**Development:**
```bash
# Use .env.development for local development
cp .env.example .env.development
# Edit with development values
```

**Production:**
```bash
# Use secure secret management in production
# Never commit production .env files
# Use Docker secrets or Kubernetes secrets
```

**Multiple Environments:**
```bash
# .env.development - Local development
# .env.staging - Staging environment
# .env.production - Production (use secret management)
```

### 4. Security Auditing

**Regular Audits:**
```bash
# Check for exposed secrets
npx secret-scan

# Audit environment variables
node scripts/audit_env.js

# Check file permissions
node scripts/check_permissions.js
```

**Audit Checklist:**
- [ ] All secrets are properly secured
- [ ] No secrets in version control
- [ ] Appropriate file permissions
- [ ] Secrets meet strength requirements
- [ ] Regular rotation schedule
- [ ] Access controls in place

## 🔄 Environment Variable Lifecycle

### 1. Initial Setup

```mermaid
graph TD
    A[Clone Repository] --> B[Copy .env.example]
    B --> C[Generate Secrets]
    C --> D[Configure Services]
    D --> E[Validate Configuration]
    E --> F[Start Services]
```

### 2. Secret Rotation

```mermaid
graph TD
    A[Plan Rotation] --> B[Generate New Secrets]
    B --> C[Update One Service]
    C --> D[Verify Service Health]
    D --> E[Update Next Service]
    E --> F[Monitor for Issues]
    F --> G[Complete Rotation]
    G --> H[Archive Old Secrets]
```

### 3. Environment Promotion

```mermaid
graph TD
    A[Develop in Local] --> B[Test in Staging]
    B --> C[Validate Configuration]
    C --> D[Promote to Production]
    D --> E[Monitor Performance]
    E --> F[Document Changes]
```

## 📊 Configuration Examples

### 1. Development Configuration

```env
# .env.development
NODE_ENV=development
LOG_LEVEL=debug
METRICS_ENABLED=false

# Security - Development only!
JWT_SECRET=development_secret_1234567890abcdef
JWT_REFRESH_SECRET=development_refresh_1234567890abcdef
ENCRYPTION_KEY=development_encryption_key_123456
CLIENT_SECRET=development_client_secret

# Services
POSTOFFICE_URL=http://localhost:5020
BRAIN_URL=http://localhost:5030
LIBRARIAN_URL=http://localhost:5040

# Database
MONGODB_URI=mongodb://localhost:27017/stage7_dev
REDIS_URL=redis://localhost:6379

# LLM APIs - Use development keys
GROQ_API_KEY=dev_groq_key
ANTHROPIC_API_KEY=dev_anthropic_key
```

### 2. Production Configuration

```env
# .env.production (use secret management!)
NODE_ENV=production
LOG_LEVEL=info
METRICS_ENABLED=true

# Security - Use strong, random values!
JWT_SECRET=your_strong_random_jwt_secret_here_minimum_32_chars
JWT_REFRESH_SECRET=your_strong_random_refresh_secret_here_minimum_32_chars
ENCRYPTION_KEY=your_strong_encryption_key_here_minimum_32_chars
CLIENT_SECRET=your_strong_client_secret_here_minimum_16_chars

# Services
POSTOFFICE_URL=https://postoffice.example.com
BRAIN_URL=https://brain.example.com
LIBRARIAN_URL=https://librarian.example.com

# Database - Use production credentials
MONGODB_URI=mongodb+srv://prod_user:strong_password@cluster.example.com/stage7_prod?retryWrites=true&w=majority
REDIS_URL=rediss://:strong_redis_password@redis.example.com:6379

# LLM APIs - Use production keys
GROQ_API_KEY=your_production_groq_key
ANTHROPIC_API_KEY=your_production_anthropic_key
```

### 3. Docker Configuration

```yaml
# docker-compose.yaml example
services:
  postoffice:
    environment:
      - NODE_ENV=production
      - CLIENT_SECRET=${CLIENT_SECRET}
      - SECURITYMANAGER_URL=http://securitymanager:5010
      - PORT=5020
    secrets:
      - client_secret
      - jwt_secret

secrets:
  client_secret:
    file: ./secrets/client_secret.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
```

## 🚀 Deployment Checklist

### Pre-Deployment

- [ ] All required environment variables configured
- [ ] Secrets generated with sufficient strength
- [ ] Configuration validated
- [ ] Environment-specific values set
- [ ] Security audit completed
- [ ] Backup of current configuration

### Deployment

- [ ] Services started with correct environment
- [ ] Health checks passing
- [ ] Authentication working
- [ ] Database connections established
- [ ] API keys validated
- [ ] Monitoring configured

### Post-Deployment

- [ ] Verify all services healthy
- [ ] Test authentication flows
- [ ] Check database connectivity
- [ ] Validate API integrations
- [ ] Monitor for configuration issues
- [ ] Document any changes

## 📚 Additional Resources

### Related Documentation

- **Security Guide**: [`security_improvements.md`](docs/security_improvements.md)
- **Authentication**: [`authentication.md`](docs/authentication.md)
- **Deployment Guide**: [`deployment-guide.md`](docs/deployment-guide.md)
- **Developer Guide**: [`DEVELOPER_QUICK_REFERENCE.md`](docs/DEVELOPER_QUICK_REFERENCE.md)

### Configuration Tools

**Validation Scripts:**
- `scripts/validate_env.js`: Validate environment variables
- `scripts/check_required_env.js`: Check for missing variables
- `scripts/generate_secrets.js`: Generate secure secrets
- `scripts/audit_env.js`: Audit environment configuration

**Management Tools:**
- `scripts/rotate_secrets.js`: Rotate secrets safely
- `scripts/backup_env.js`: Backup environment configuration
- `scripts/restore_env.js`: Restore environment configuration
- `scripts/diff_env.js`: Compare environments

## 🎯 Best Practices Summary

### 1. Security First

- **Always** treat secrets as critical security assets
- **Never** commit secrets to version control
- **Regularly** rotate all secrets
- **Use** strong, random values for all secrets
- **Follow** principle of least privilege

### 2. Configuration Management

- **Use** environment-specific configuration files
- **Validate** all configuration before deployment
- **Document** all environment variables
- **Monitor** configuration changes
- **Backup** critical configuration

### 3. Environment Strategy

- **Development**: Local configuration with development secrets
- **Staging**: Environment-specific configuration
- **Production**: Secure secret management system
- **Testing**: Automated configuration validation
- **CI/CD**: Secure secret injection

### 4. Monitoring and Maintenance

- **Monitor** configuration health
- **Alert** on configuration issues
- **Audit** configuration regularly
- **Review** security practices
- **Update** documentation

## 🔒 Conclusion

This comprehensive environment variable guide provides a complete reference for configuring the Stage7 system across all environments. By following the documented best practices, validation rules, and security considerations, you can ensure a secure, maintainable, and scalable deployment.

**Key Takeaways:**
- ✅ **Comprehensive**: Covers all services and components
- ✅ **Secure**: Clear security guidance for sensitive variables
- ✅ **Validated**: Includes validation rules and examples
- ✅ **Organized**: Logical grouping by service and function
- ✅ **Practical**: Real-world examples and best practices

**Remember:** Environment configuration is a critical security concern. Always follow security best practices and regularly audit your configuration to maintain a secure Stage7 deployment.
