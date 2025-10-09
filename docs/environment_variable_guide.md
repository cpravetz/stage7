# Environment Variable Guidance

This document provides guidance on setting the environment variables for each service in the system.

## Marketplace

**File Path:** `/marketplace/.env`

| Variable | Description |
| --- | --- |
| `GITHUB_TOKEN` | Personal access token for GitHub API access. |
| `GITHUB_USERNAME` | Your GitHub username. |
| `GIT_REPOSITORY_URL` | The URL of the git repository for plugins. |
| `GIT_DEFAULT_BRANCH` | The default branch of the git repository. |
| `GITHUB_EMAIL` | The email associated with your GitHub account. |

## AgentSet

**File Path:** `/services/agentset/.env`

| Variable | Description |
| --- | --- |
| `CLIENT_SECRET` | A secret key for client authentication. |

## Brain

**File Path:** `/services/brain/.env`

| Variable | Description |
| --- | --- |
| `OPENAI_API_KEY` | Your API key for OpenAI services. |
| `GEMINI_API_KEY` | Your API key for Gemini services. |
| `GEMINI_API_URL` | The URL for the Gemini API. |
| `HUGGINGFACE_API_KEY` | Your API key for Hugging Face services. |
| `HUGGINGFACE_API_URL` | The URL for the Hugging Face API. |
| `ANTHROPIC_API_KEY` | Your API key for Anthropic services. |
| `ANTHROPIC_API_URL` | The URL for the Anthropic API. |
| `OPENROUTER_API_KEY` | Your API key for OpenRouter services. |
| `CLIENT_SECRET` | A secret key for client authentication. |
| `OPENWEB_URL` | The URL for OpenWeb. |
| `OPENWEBUI_API_KEY` | Your API key for OpenWebUI. |
| `GROQ_API_KEY` | Your API key for Groq services. |
| `MISTRAL_API_KEY` | Your API key for Mistral services. |
| `CLOUDFLARE_WORKERS_AI_API_TOKEN` | Your API token for Cloudflare Workers AI. |
| `CLOUDFLARE_WORKERS_AI_ACCOUNT_ID` | Your account ID for Cloudflare Workers AI. |

## Capabilities Manager

**File Path:** `/services/capabilitiesmanager/.env`

| Variable | Description |
| --- | --- |
| `CLIENT_SECRET` | A secret key for client authentication. |
| `GITHUB_TOKEN` | Personal access token for GitHub API access. |
| `GITHUB_USERNAME` | Your GitHub username. |
| `GIT_REPOSITORY_URL` | The URL of the git repository for plugins. |
| `GIT_DEFAULT_BRANCH` | The default branch of the git repository. |
| `GITHUB_EMAIL` | The email associated with your GitHub account. |
| `DEFAULT_PLUGIN_REPOSITORY` | The default repository for plugins (e.g., `local`, `github`). |
| `ENABLE_GITHUB` | A boolean to enable or disable GitHub integration. |
| `GOOGLE_SEARCH_API_KEY` | Your API key for Google Custom Search. |
| `GOOGLE_CSE_ID` | Your Google Custom Search Engine ID. |
| `LANGSEARCH_API_KEY` | Your API key for LangSearch. |

## Engineer

**File Path:** `/services/engineer/.env`

| Variable | Description |
| --- | --- |
| `CLIENT_SECRET` | A secret key for client authentication. |
| `GITHUB_TOKEN` | Personal access token for GitHub API access. |
| `GITHUB_USERNAME` | Your GitHub username. |
| `GIT_REPOSITORY_URL` | The URL of the git repository for plugins. |
| `GIT_DEFAULT_BRANCH` | The default branch of the git repository. |
| `GITHUB_EMAIL` | The email associated with your GitHub account. |

## Librarian

**File Path:** `/services/librarian/.env`

| Variable | Description |
| --- | --- |
| `REDIS_HOST` | The hostname of the Redis server. |
| `REDIS_PORT` | The port of the Redis server. |
| `MONGO_URI` | The connection URI for MongoDB. |
| `MONGO_DB` | The name of the MongoDB database. |
| `CLIENT_SECRET` | A secret key for client authentication. |

## MCS React

**File Path:** `/services/mcsreact/.env`

| Variable | Description |
| --- | --- |
| `REACT_APP_API_BASE_URL` | The base URL for the React app's API. |
| `REACT_APP_WS_URL` | The WebSocket URL for the React app. |
| `NODE_ENV` | The Node.js environment (e.g., `production`, `development`). |
| `GENERATE_SOURCEMAP` | A boolean to enable or disable sourcemap generation. |
| `SKIP_PREFLIGHT_CHECK` | A boolean to skip preflight checks. |

## Mission Control

**File Path:** `/services/missioncontrol/.env`

| Variable | Description |
| --- | --- |
| `CLIENT_SECRET` | A secret key for client authentication. |

## Post Office

**File Path:** `/services/postoffice/.env`

| Variable | Description |
| --- | --- |
| `CLIENT_SECRET` | A secret key for client authentication. |

## Security

**File Path:** `/services/security/.env`

| Variable | Description |
| --- | --- |
| `JWT_SECRET` | The secret key for signing JWT access tokens. |
| `JWT_REFRESH_SECRET` | The secret key for signing JWT refresh tokens. |
| `JWT_ACCESS_EXPIRATION` | The expiration time for JWT access tokens. |
| `JWT_REFRESH_EXPIRATION` | The expiration time for JWT refresh tokens. |
| `JWT_VERIFICATION_EXPIRATION` | The expiration time for JWT verification tokens. |
| `JWT_RESET_EXPIRATION` | The expiration time for JWT reset tokens. |
| `POSTOFFICE_URL` | The URL for the Post Office service. |
| `PORT` | The port for the service to run on. |
| `CLIENT_SECRET` | A secret key for client authentication. |
| `CONFIG_SERVICE_SECRET` | A secret for authenticating with the config service. |
| `POSTOFFICE_SECRET` | A secret for authenticating with the Post Office service. |
| `MISSIONCONTROL_SECRET` | A secret for authenticating with the Mission Control service. |
| `BRAIN_SECRET` | A secret for authenticating with the Brain service. |
| `LIBRARIAN_SECRET` | A secret for authenticating with the Librarian service. |
| `ENGINEER_SECRET` | A secret for authenticating with the Engineer service. |
| `TRAFFICMANAGER_SECRET` | A secret for authenticating with the Traffic Manager service. |
| `CAPABILITIESMANAGER_SECRET` | A secret for authenticating with the Capabilities Manager service. |
| `AGENTSET_SECRET` | A secret for authenticating with the Agent Set service. |
| `LIBRARIAN_URL` | The URL for the Librarian service. |
| `EMAIL_HOST` | The hostname of the email server. |
| `EMAIL_PORT` | The port of the email server. |
| `EMAIL_SECURE` | A boolean to enable or disable secure email connection. |
| `EMAIL_USER` | The username for the email account. |
| `EMAIL_PASS` | The password for the email account. |
| `EMAIL_FROM` | The "from" address for emails. |
| `FRONTEND_URL` | The URL of the frontend application. |
| `MAX_LOGIN_ATTEMPTS` | The maximum number of login attempts before lockout. |
| `LOCKOUT_DURATION` | The duration of the lockout in minutes. |

## Traffic Manager

**File Path:** `/services/trafficmanager/.env`

| Variable | Description |
| --- | --- |
| `CLIENT_SECRET` | A secret key for client authentication. |
