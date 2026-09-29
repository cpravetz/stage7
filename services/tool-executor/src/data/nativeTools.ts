import { Tool } from '../types';

export const nativeTools: Tool[] = [
  {
    id: 'get_weather',
    name: 'Get Weather',
    description: 'Retrieve current weather information for a specified location using Open-Meteo (no API key required). Supports optional units (metric/imperial) and forecast days (1-7).',
    type: 'native',
    manifest: { executor: 'weather', type: 'native' },
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name, address, or coordinates (e.g., "San Francisco" or "37.7749,-122.4194")', required: true },
        units: { type: 'string', enum: ['metric', 'imperial'], description: 'Temperature units (default: metric)' },
        forecastDays: { type: 'integer', minimum: 1, maximum: 7, description: 'Number of forecast days to include (default: current only)' },
      },
      required: ['location'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        weather: {
          type: 'object',
          properties: {
            location: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            temperature: { type: 'number' },
            apparentTemperature: { type: 'number' },
            humidity: { type: 'number' },
            precipitation: { type: 'number' },
            windSpeed: { type: 'number' },
            condition: { type: 'string' },
            isDay: { type: 'boolean' },
            observedAt: { type: 'string' },
            units: { type: 'string' },
          },
        },
        error: { type: 'string' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'calculate',
    name: 'Calculate',
    description: 'Perform mathematical calculations safely using a secure expression parser (no eval). Supports expressions with arithmetic, functions (sqrt, sin, cos, log, etc.), constants (pi, e), and list operations (sum, mean, median, min, max, stddev).',
    type: 'native',
    manifest: { executor: 'math', type: 'native' },
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Mathematical expression to evaluate (e.g., "2 * (3 + 4) ^ 2", "sqrt(16) + sin(pi/2)")' },
        values: { type: 'array', items: { type: 'number' }, description: 'Array of numbers for list operations' },
        operation: { type: 'string', enum: ['sum', 'mean', 'median', 'min', 'max', 'stddev'], description: 'List operation to perform on values array' },
      },
      required: [],
      anyOf: [
        { required: ['expression'] },
        { required: ['values', 'operation'] },
      ],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        result: { type: 'number' },
        expression: { type: 'string' },
        error: { type: 'string' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'search_web',
    name: 'Search Web',
    description: 'Search the internet for information using multiple providers (Google, LangSearch, DuckDuckGo, SearxNG). Returns ranked results with titles, URLs, and snippets.',
    type: 'native',
    manifest: { executor: 'search', type: 'native' },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string', required: true },
        maxResults: { type: 'integer', minimum: 1, maximum: 50, default: 5, description: 'Maximum number of results to return (default: 5)' },
        searchType: { type: 'string', enum: ['web', 'images', 'news'], default: 'web', description: 'Type of search to perform (default: web)' },
        freshness: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Filter results by recency' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              snippet: { type: 'string' },
            },
          },
        },
        count: { type: 'integer' },
        error: { type: 'string' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'api_client',
    name: 'API Client',
    description: 'Make generic REST API calls to external services. Requires the `api_base_url` credential (or API_CLIENT_BASE_URL env var) to be configured. Supports all HTTP methods, query parameters, custom headers, authentication (bearer, basic, API key), and configurable timeouts.',
    type: 'native',
    manifest: { executor: 'api_client', type: 'native' },
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path appended to the configured base URL (e.g., "/users/123")', required: true },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], default: 'GET', description: 'HTTP method' },
        query: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] }, description: 'Query parameters to append' },
        headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Additional request headers' },
        body: { description: 'Request body (JSON-serializable)' },
        timeoutMs: { type: 'integer', minimum: 1, maximum: 120000, description: 'Request timeout in milliseconds (default: 15000)' },
        auth: { type: 'string', enum: ['none', 'bearer', 'basic', 'apiKeyHeader'], default: 'none', description: 'Authentication mode' },
        acceptErrorResponses: { type: 'boolean', default: false, description: 'When true, non-2xx responses are returned as success with status/data' },
      },
      required: ['path'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: { type: 'integer' },
        data: {},
        headers: { type: 'object', additionalProperties: { type: 'string' } },
        durationMs: { type: 'integer' },
        error: { type: 'string' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'file_ops',
    name: 'File Operations',
    description: 'Read, write, list, delete, check existence, and create directories in a secure sandboxed file storage (local filesystem under FILE_STORAGE_BASE_PATH or /tmp/stage7-filestore). Supports buckets for logical separation.',
    type: 'native',
    manifest: { executor: 'files', type: 'native' },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['read', 'write', 'list', 'delete', 'exists', 'mkdir'], description: 'File operation to perform', required: true },
        path: { type: 'string', description: 'File or directory path (relative to base path or bucket)', required: true },
        content: { type: 'string', description: 'Content to write (for write operation)' },
        bucket: { type: 'string', description: 'Optional bucket name for logical separation' },
      },
      required: ['operation', 'path'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            bytes: { type: 'integer' },
            message: { type: 'string' },
            listing: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  isDirectory: { type: 'boolean' },
                  size: { type: 'integer' },
                },
              },
            },
            exists: { type: 'boolean' },
          },
        },
        error: { type: 'string' },
        durationMs: { type: 'integer' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
];
