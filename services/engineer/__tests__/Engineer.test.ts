import axios from 'axios';
import { Engineer } from '../src/Engineer';
import { MapSerializer, InputValue, PluginParameterType, PluginDefinition, OpenAPIAuthentication } from '@cktmcs/shared'; // Added OpenAPIAuthentication
import request from 'supertest'; // Renamed supertest to request for clarity

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Engineer', () => {
  let engineer: Engineer;
  let app: any; // Declare app here

  beforeEach(() => {
    // Mock setupServer before Engineer is instantiated
    jest.spyOn(Engineer.prototype as any, 'setupServer').mockImplementation(async function(this: Engineer) { // Use 'this' to refer to the instance
      const express = require('express');
      app = express();
      app.use(express.json());

      // Mock verifyToken to allow requests through for testing
      app.use((req: any, res: any, next: any) => {
        if (req.path === '/health' || req.path === '/ready') {
          return next();
        }
        next();
      });

      // Bind 'this' to the actual engineer instance for route handlers
      app.post('/createPlugin', async (req: any, res: any) => {
        try {
          const { verb, context, guidance, language } = req.body;
          const deserializedContext = context instanceof Map ? context : MapSerializer.transformFromSerialization(context || {});
          const plugin = await this.createPlugin(verb, deserializedContext, guidance, language); // Use this.createPlugin
          res.json(plugin || {});
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      });

      app.post('/tools/openapi', async (req: any, res: any) => {
        try {
          const result = await this.registerOpenAPITool(req.body); // Use this.registerOpenAPITool
          res.json(result);
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      });

      app.post('/validate', async (req: any, res: any) => {
        try {
          const { manifest, code } = req.body;
          const result = await this.validateTool(manifest, code); // Use this.validateTool
          res.json(result);
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      });

      app.get('/tools/openapi/:id', async (req: any, res: any) => {
        try {
          const { id } = req.params;
          const tool = await this.getOpenAPITool(id); // Use this.getOpenAPITool
          if (!tool) {
            res.status(404).json({ error: 'OpenAPI tool not found' });
            return;
          }
          res.json(tool);
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      });

      // Corrected access to private methods
      app.post('/message', (req: any, res: any) => this['handleMessage'](req, res));
      app.get('/statistics', (req: any, res: any) => this['getStatistics'](req, res));

      // Mock app.listen to prevent actual server from starting
      app.listen = jest.fn((port, callback) => callback());
    });

    engineer = new Engineer(); // Instantiate Engineer after mocking setupServer
    process.env.BRAIN_URL = 'mock-brain:5070';
    process.env.LIBRARIAN_URL = 'mock-librarian:5040';
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks(); // Restore mocks after each test
  });

  describe('createPlugin', () => {
    it('should create a plugin successfully', async () => {
      const verb = 'TEST_VERB';
      const context = new Map<string, InputValue>();
      context.set('testInput', { value: 'test', valueType: PluginParameterType.STRING, args: {}, inputName: 'testInput' });
      const guidance = 'Test guidance';

      const mockExplanation = 'Test explanation';
      const mockPluginStructure: PluginDefinition = {
        id: 'plugin-TEST_VERB',
        verb: 'TEST_VERB',
        description: 'Test description',
        explanation: 'Test explanation',
        inputDefinitions: [{ name: 'testInput', type: PluginParameterType.STRING, description: 'Test input', required: true }],
        outputDefinitions: [{ name: 'testOutput', type: PluginParameterType.STRING, description: 'Test output', required: true }],
        entryPoint: {
          main: 'index.js',
          files: { 'index.js': 'console.log("Test plugin")' }
        },
        language: 'javascript',
        version: '1.0.0',
        metadata: {
          category: ['test'],
          tags: ['test'],
          complexity: 1,
          dependencies: {},
          version: '1.0.0'
        },
        security: {
          permissions: [],
          sandboxOptions: {
            allowEval: false,
            timeout: 5000,
            memory: 128 * 1024 * 1024,
            allowedModules: ['fs', 'path', 'http', 'https'],
            allowedAPIs: ['fetch', 'console']
          },
          trust: {
            publisher: 'test',
            signature: undefined
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce({ data: { result: mockExplanation } });
      mockedAxios.post.mockResolvedValueOnce({ data: { result: JSON.stringify(mockPluginStructure) } });
      mockedAxios.post.mockResolvedValueOnce({ data: { status: 'success' } });

      const result = await engineer.createPlugin(verb, context, guidance);

      expect(result).toEqual(expect.objectContaining({
        id: 'plugin-TEST_VERB',
        verb: 'TEST_VERB',
        description: 'Test description',
        explanation: mockExplanation
      }));
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should throw an error if plugin structure generation fails', async () => {
      const verb = 'FAIL_VERB';
      const context = new Map<string, InputValue>();
      const guidance = 'Test guidance';

      mockedAxios.post.mockResolvedValueOnce({ data: { result: 'Test explanation' } });
      mockedAxios.post.mockRejectedValueOnce(new Error('Failed to generate plugin structure'));

      await expect(engineer.createPlugin(verb, context, guidance)).rejects.toThrow('Failed to generate plugin structure');
    });
  });

  describe('createContainerPlugin', () => {
    it('should create a container plugin successfully', async () => {
      const verb = 'CONTAINER_VERB';
      const context = new Map<string, InputValue>();
      const guidance = 'Container guidance';
      const explanation = 'Container explanation';

      const mockContainerPluginStructure = {
        id: 'plugin-container_verb',
        verb: 'CONTAINER_VERB',
        description: 'Container description',
        explanation: 'Container explanation',
        inputDefinitions: [],
        outputDefinitions: [],
        language: 'container',
        container: {
          dockerfile: 'Dockerfile content',
          buildContext: './',
          image: 'stage7/plugin-container_verb:1.0.0',
          ports: [{ container: 8080, host: 0 }],
          environment: {},
          resources: { memory: '256m', cpu: '0.5' },
          healthCheck: { path: '/health', interval: '30s', timeout: '10s', retries: 3 }
        },
        api: { endpoint: '/execute', method: 'POST', timeout: 30000 },
        entryPoint: {
          main: 'app.py',
          files: {
            'app.py': '# Flask app',
            'Dockerfile': '# Dockerfile',
            'requirements.txt': '# requirements'
          }
        },
        version: '1.0.0',
        metadata: { category: [], tags: [], complexity: 1, dependencies: {}, version: '1.0.0' },
        security: { permissions: [], sandboxOptions: {}, trust: { publisher: 'test', signature: undefined } }
      };

      mockedAxios.post.mockResolvedValueOnce({ data: { result: explanation } }); // For generateExplanation
      mockedAxios.post.mockResolvedValueOnce({ data: { result: JSON.stringify(mockContainerPluginStructure) } }); // For Brain response
      mockedAxios.post.mockResolvedValueOnce({ data: { status: 'success' } }); // For signPlugin

      const result = await engineer.createContainerPlugin(verb, context, explanation, guidance);

      expect(result).toEqual(expect.objectContaining({
        id: 'plugin-container_verb',
        verb: 'CONTAINER_VERB',
        language: 'container',
        container: expect.any(Object),
        api: expect.any(Object)
      }));
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should return undefined if container plugin structure generation fails', async () => {
      const verb = 'FAIL_CONTAINER_VERB';
      const context = new Map<string, InputValue>();
      const guidance = 'Container guidance';
      const explanation = 'Container explanation';

      mockedAxios.post.mockResolvedValueOnce({ data: { result: explanation } });
      mockedAxios.post.mockRejectedValueOnce(new Error('Failed to generate container plugin structure'));

      const result = await engineer.createContainerPlugin(verb, context, explanation, guidance);
      expect(result).toBeUndefined();
    });
  });

  describe('validatePluginStructure', () => {
    it('should return valid result for a valid plugin structure', () => {
      const validPlugin = {
        id: 'test-plugin',
        verb: 'TEST_VERB',
        description: 'A test plugin',
        explanation: 'A detailed explanation',
        inputDefinitions: [{ name: 'input1', type: 'string', required: true }],
        outputDefinitions: [{ name: 'output1', type: 'string', required: true }],
        language: 'javascript',
        entryPoint: { main: 'index.js', files: { 'index.js': '// code' } }
      };
      const result = engineer['validatePluginStructure'](validPlugin);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should return invalid result with issues for missing required fields', () => {
      const invalidPlugin = {
        verb: 'TEST_VERB',
        description: 'A test plugin',
        inputDefinitions: [],
        outputDefinitions: [],
        language: 'javascript',
        entryPoint: { main: 'index.js', files: { 'index.js': '// code' } }
      };
      const result = engineer['validatePluginStructure'](invalidPlugin);
      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toContain('Schema validation error');
    });

    it('should return invalid result for semantic issues', () => {
      const invalidPlugin = {
        id: 'test-plugin',
        verb: 'TEST_VERB',
        description: 'short',
        explanation: 'A detailed explanation',
        inputDefinitions: [{ name: 'input1', type: 'string', required: true }],
        outputDefinitions: [{ name: 'output1', type: 'string', required: true }],
        language: 'javascript',
        entryPoint: { main: 'index.js', files: { 'index.js': '// code' } }
      };
      const result = engineer['validatePluginStructure'](invalidPlugin);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Plugin description should be more detailed');
    });

    it('should detect duplicate input/output names', () => {
      const invalidPlugin = {
        id: 'test-plugin',
        verb: 'TEST_VERB',
        description: 'A test plugin',
        explanation: 'A detailed explanation',
        inputDefinitions: [
          { name: 'duplicate', type: 'string', required: true },
          { name: 'input1', type: 'string', required: true }
        ],
        outputDefinitions: [
          { name: 'duplicate', type: 'string', required: true },
          { name: 'output1', type: 'string', required: true }
        ],
        language: 'javascript',
        entryPoint: { main: 'index.js', files: { 'index.js': '// code' } }
      };
      const result = engineer['validatePluginStructure'](invalidPlugin);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Duplicate input/output names detected');
    });
  });

  describe('validateContainerPluginStructure', () => {
    it('should return true for a valid container plugin structure', () => {
      const validContainerPlugin = {
        id: 'test-container-plugin',
        verb: 'TEST_CONTAINER_VERB',
        description: 'A test container plugin',
        inputDefinitions: [],
        outputDefinitions: [],
        language: 'container',
        container: {
          dockerfile: 'Dockerfile content',
          buildContext: './',
          image: 'test-image',
          ports: [{ container: 8080, host: 0 }]
        },
        api: { endpoint: '/execute', method: 'POST' },
        entryPoint: { main: 'app.py', files: { 'app.py': '// code' } }
      };
      expect(engineer['validateContainerPluginStructure'](validContainerPlugin)).toBe(true);
    });

    it('should return false if required fields are missing in container plugin', () => {
      const invalidContainerPlugin = {
        verb: 'TEST_CONTAINER_VERB',
        description: 'A test container plugin',
        inputDefinitions: [],
        outputDefinitions: [],
        language: 'container',
        container: {
          dockerfile: 'Dockerfile content',
          buildContext: './',
          image: 'test-image',
          ports: [{ container: 8080, host: 0 }]
        },
        api: { endpoint: '/execute', method: 'POST' },
        entryPoint: { main: 'app.py', files: { 'app.py': '// code' } }
      };
      expect(engineer['validateContainerPluginStructure'](invalidContainerPlugin)).toBe(false);
    });

    it('should return false if container config is missing fields', () => {
      const invalidContainerPlugin = {
        id: 'test-container-plugin',
        verb: 'TEST_CONTAINER_VERB',
        description: 'A test container plugin',
        inputDefinitions: [],
        outputDefinitions: [],
        language: 'container',
        container: {
          buildContext: './',
          image: 'test-image',
          ports: [{ container: 8080, host: 0 }]
        },
        api: { endpoint: '/execute', method: 'POST' },
        entryPoint: { main: 'app.py', files: { 'app.py': '// code' } }
      };
      expect(engineer['validateContainerPluginStructure'](invalidContainerPlugin)).toBe(false);
    });

    it('should return false if api config is missing fields', () => {
      const invalidContainerPlugin = {
        id: 'test-container-plugin',
        verb: 'TEST_CONTAINER_VERB',
        description: 'A test container plugin',
        inputDefinitions: [],
        outputDefinitions: [],
        language: 'container',
        container: {
          dockerfile: 'Dockerfile content',
          buildContext: './',
          image: 'test-image',
          ports: [{ container: 8080, host: 0 }]
        },
        api: { endpoint: '/execute' },
        entryPoint: { main: 'app.py', files: { 'app.py': '// code' } }
      };
      expect(engineer['validateContainerPluginStructure'](invalidContainerPlugin)).toBe(false);
    });

    it('should return false if entryPoint is missing fields', () => {
      const invalidContainerPlugin = {
        id: 'test-container-plugin',
        verb: 'TEST_CONTAINER_VERB',
        description: 'A test container plugin',
        inputDefinitions: [],
        outputDefinitions: [],
        language: 'container',
        container: {
          dockerfile: 'Dockerfile content',
          buildContext: './',
          image: 'test-image',
          ports: [{ container: 8080, host: 0 }]
        },
        api: { endpoint: '/execute', method: 'POST' },
        entryPoint: { main: 'app.py' }
      };
      expect(engineer['validateContainerPluginStructure'](invalidContainerPlugin)).toBe(false);
    });
  });

  describe('validatePluginCode', () => {
    it('should return true for valid JavaScript code', async () => {
      const entryPoint = { main: 'index.js', files: { 'index.js': 'console.log("hello");' } };
      expect(await engineer['validatePluginCode'](entryPoint, 'javascript')).toBe(true);
    });

    it('should return false for invalid JavaScript code', async () => {
      const entryPoint = { main: 'index.js', files: { 'index.js': 'console.log("hello");;;', 'another.js': 'valid code' } };
      expect(await engineer['validatePluginCode'](entryPoint, 'javascript')).toBe(false);
    });

    it('should return true for valid Python code', async () => {
      const entryPoint = { main: 'main.py', files: { 'main.py': 'print("hello")' } };
      // Mock execAsync to simulate successful Python compilation
      jest.spyOn(require('util'), 'promisify').mockReturnValue(jest.fn().mockResolvedValue({ stdout: '', stderr: '' }));
      expect(await engineer['validatePluginCode'](entryPoint, 'python')).toBe(true);
    });

    it('should return false for invalid Python code', async () => {
      const entryPoint = { main: 'main.py', files: { 'main.py': 'print("hello";;)' } };
      // Mock execAsync to simulate failed Python compilation
      jest.spyOn(require('util'), 'promisify').mockReturnValue(jest.fn().mockRejectedValue({ stdout: '', stderr: 'SyntaxError' }));
      expect(await engineer['validatePluginCode'](entryPoint, 'python')).toBe(false);
    });

    it('should return true if no files are present', async () => {
      const entryPoint = { main: 'index.js', files: {} };
      expect(await engineer['validatePluginCode'](entryPoint, 'javascript')).toBe(true);
    });
  });

  describe('validatePluginCodeString', () => {
    it('should return true for valid JavaScript code string', () => {
      expect(engineer['validatePluginCodeString']('console.log("hello");', 'javascript')).toBe(true);
    });

    it('should return false for invalid JavaScript code string', () => {
      expect(engineer['validatePluginCodeString']('console.log("hello");;;', 'javascript')).toBe(false);
    });

    it('should return true for valid Python code string (basic check)', () => {
      expect(engineer['validatePluginCodeString']('print("hello")', 'python')).toBe(true);
    });

    it('should return false for Python code string with unsafe import', () => {
      expect(engineer['validatePluginCodeString']('import os', 'python')).toBe(false);
    });

    it('should return true for Python code string with safe os import', () => {
      expect(engineer['validatePluginCodeString']('import os # SAFE_OS_IMPORT', 'python')).toBe(true);
    });

    it('should return true for unknown language', () => {
      expect(engineer['validatePluginCodeString']('some code', 'unknown')).toBe(true);
    });

    it('should return false for empty code string', () => {
      expect(engineer['validatePluginCodeString']('', 'javascript')).toBe(false);
    });
  });

  describe('registerOpenAPITool', () => {
    const mockOpenApiSpecV3 = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            operationId: 'getTest',
            summary: 'Get Test Data',
            parameters: [
              { name: 'param1', in: 'query', schema: { type: 'string' }, required: true }
            ],
            responses: { '200': { description: 'Success' } }
          }
        }
      }
    };

    const mockOpenApiSpecV2 = {
      swagger: '2.0',
      info: { title: 'Test API', version: '1.0.0' },
      host: 'example.com',
      basePath: '/v1',
      schemes: ['https'],
      paths: {
        '/test': {
          get: {
            operationId: 'getTestV2',
            summary: 'Get Test Data V2',
            parameters: [
              { name: 'param1', in: 'query', type: 'string', required: true }
            ],
            responses: { '200': { description: 'Success' } }
          }
        }
      }
    };

    it('should register an OpenAPI tool (V3) successfully', async () => {
      const request = {
        name: 'TestTool',
        specUrl: 'http://example.com/openapi.json',
        authentication: { type: 'none' as OpenAPIAuthentication['type'] }, // Cast to specific type
        description: 'A test OpenAPI tool' // Added missing description
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockOpenApiSpecV3 });
      mockedAxios.post.mockResolvedValueOnce({ data: { status: 'success' } }); // Mock storeData

      const result = await engineer.registerOpenAPITool(request);

      expect(result.success).toBe(true);
      expect(result.tool).toBeDefined();
      expect(result.tool?.id).toBe('openapi-testtool');
      expect(mockedAxios.get).toHaveBeenCalledWith(request.specUrl);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/storeData'),
        expect.objectContaining({ collection: 'openApiTools', id: 'openapi-testtool' })
      );
    });

    it('should register an OpenAPI tool (V2) successfully', async () => {
      const request = {
        name: 'TestToolV2',
        specUrl: 'http://example.com/openapi-v2.json',
        authentication: { type: 'none' as OpenAPIAuthentication['type'] }, // Cast to specific type
        description: 'A test OpenAPI tool V2' // Added missing description
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockOpenApiSpecV2 });
      mockedAxios.post.mockResolvedValueOnce({ data: { status: 'success' } }); // Mock storeData

      const result = await engineer.registerOpenAPITool(request);

      expect(result.success).toBe(true);
      expect(result.tool).toBeDefined();
      expect(result.tool?.id).toBe('openapi-testtoolv2');
      expect(result.tool?.baseUrl).toBe('https://example.com/v1');
    });

    it('should return errors if spec fetch fails', async () => {
      const request = {
        name: 'FailTool',
        specUrl: 'http://example.com/fail.json',
        authentication: { type: 'none' as OpenAPIAuthentication['type'] }, // Cast to specific type
        description: 'A failing OpenAPI tool' // Added missing description
      };

      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const result = await engineer.registerOpenAPITool(request);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Network error');
    });

    it('should return errors if spec parsing fails (invalid spec)', async () => {
      const request = {
        name: 'InvalidSpecTool',
        specUrl: 'http://example.com/invalid.json',
        authentication: { type: 'none' as OpenAPIAuthentication['type'] }, // Cast to specific type
        description: 'An invalid OpenAPI spec tool' // Added missing description
      };

      mockedAxios.get.mockResolvedValueOnce({ data: { invalid: 'spec' } });

      const result = await engineer.registerOpenAPITool(request);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid OpenAPI specification: missing version field');
    });
  });

  describe('parseOpenAPISpec', () => {
    it('should parse a valid OpenAPI 3.0 spec', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              summary: 'Get all users',
              parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer' } }
              ],
              responses: { '200': { description: 'Success' } }
            },
            post: {
              operationId: 'createUser',
              summary: 'Create a user',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { name: { type: 'string' } } }
                  }
                }
              },
              responses: { '201': { description: 'Created' } }
            }
          }
        }
      };
      const request = { name: 'TestAPI', specUrl: 'http://example.com/spec.json', authentication: { type: 'none' as OpenAPIAuthentication['type'] }, description: 'Test API description' }; // Added missing description and cast
      const result = await engineer['parseOpenAPISpec'](spec, request);

      expect(result.success).toBe(true);
      expect(result.tool).toBeDefined();
      expect(result.tool?.actionMappings).toHaveLength(2);
      expect(result.tool?.actionMappings[0].actionVerb).toBe('GET_USERS');
      expect(result.tool?.actionMappings[1].actionVerb).toBe('CREATE_USER');
      expect(result.tool?.actionMappings[1].inputs[0].name).toBe('body');
      expect(result.tool?.actionMappings[1].inputs[0].type).toBe(PluginParameterType.OBJECT);
    });

    it('should parse a valid Swagger 2.0 spec', async () => {
      const spec = {
        swagger: '2.0',
        info: { title: 'Test API V2', version: '1.0.0' },
        host: 'api.example.com',
        basePath: '/v2',
        schemes: ['http'],
        paths: {
          '/products': {
            get: {
              operationId: 'getProducts',
              summary: 'Get all products',
              parameters: [
                { name: 'category', in: 'query', type: 'string' }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };
      const request = { name: 'TestAPIV2', specUrl: 'http://example.com/spec-v2.json', authentication: { type: 'none' as OpenAPIAuthentication['type'] }, description: 'Test API V2 description' }; // Added missing description and cast
      const result = await engineer['parseOpenAPISpec'](spec, request);

      expect(result.success).toBe(true);
      expect(result.tool).toBeDefined();
      expect(result.tool?.actionMappings).toHaveLength(1);
      expect(result.tool?.actionMappings[0].actionVerb).toBe('GET_PRODUCTS');
      expect(result.tool?.baseUrl).toBe('http://api.example.com/v2');
    });

    it('should return error for unsupported OpenAPI version', async () => {
      const spec = { openapi: '4.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} };
      const request = { name: 'Test', specUrl: 'http://example.com/spec.json', authentication: { type: 'none' as OpenAPIAuthentication['type'] }, description: 'Test description' }; // Added missing description and cast
      const result = await engineer['parseOpenAPISpec'](spec, request);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Unsupported OpenAPI version: 4.0.0');
    });

    it('should handle missing paths gracefully', async () => {
      const spec = { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} };
      const request = { name: 'Test', specUrl: 'http://example.com/spec.json', authentication: { type: 'none' as OpenAPIAuthentication['type'] }, description: 'Test description' }; // Added missing description and cast
      const result = await engineer['parseOpenAPISpec'](spec, request);
      expect(result.success).toBe(true);
      expect(result.tool?.actionMappings).toHaveLength(0);
    });
  });

  describe('extractBaseUrl', () => {
    it('should extract base URL from OpenAPI 3.0 servers', () => {
      const spec = { servers: [{ url: 'https://api.example.com/v1' }] };
      expect(engineer['extractBaseUrl'](spec)).toBe('https://api.example.com/v1');
    });

    it('should extract base URL from Swagger 2.0 host and schemes', () => {
      const spec = { host: 'api.example.com', schemes: ['http'], basePath: '/v2' };
      expect(engineer['extractBaseUrl'](spec)).toBe('http://api.example.com/v2');
    });

    it('should return empty string if no base URL found', () => {
      const spec = {};
      expect(engineer['extractBaseUrl'](spec)).toBe('');
    });
  });

  describe('createActionMapping', () => {
    it('should create action mapping for OpenAPI 3.0 GET operation', () => {
      const operation = {
        operationId: 'getUsers',
        summary: 'Get all users',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer' }, required: false }
        ],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array' } } } } }
      };
      const mapping = engineer['createActionMapping']('getUsers', 'GET', '/users', operation, true);
      expect(mapping).toBeDefined();
      expect(mapping?.actionVerb).toBe('GET_USERS');
      expect(mapping?.inputs).toHaveLength(1);
      expect(mapping?.inputs[0].name).toBe('limit');
      expect(mapping?.inputs[0].type).toBe(PluginParameterType.NUMBER);
      expect(mapping?.outputs).toHaveLength(1);
      expect(mapping?.outputs[0].type).toBe(PluginParameterType.OBJECT);
    });

    it('should create action mapping for OpenAPI 3.0 POST operation with request body', () => {
      const operation = {
        operationId: 'createUser',
        summary: 'Create a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } } }
            }
          }
        },
        responses: { '201': { description: 'Created' } }
      };
      const mapping = engineer['createActionMapping']('createUser', 'POST', '/users', operation, true);
      expect(mapping).toBeDefined();
      expect(mapping?.inputs).toHaveLength(1);
      expect(mapping?.inputs[0].name).toBe('body');
      expect(mapping?.inputs[0].type).toBe(PluginParameterType.OBJECT);
    });

    it('should create action mapping for Swagger 2.0 GET operation', () => {
      const operation = {
        operationId: 'getProducts',
        summary: 'Get all products',
        parameters: [
          { name: 'category', in: 'query', type: 'string', required: false }
        ],
        responses: { '200': { description: 'Success', schema: { type: 'array' } } }
      };
      const mapping = engineer['createActionMapping']('getProducts', 'GET', '/products', operation, false);
      expect(mapping).toBeDefined();
      expect(mapping?.actionVerb).toBe('GET_PRODUCTS');
      expect(mapping?.inputs).toHaveLength(1);
      expect(mapping?.inputs[0].name).toBe('category');
      expect(mapping?.inputs[0].type).toBe(PluginParameterType.STRING);
      expect(mapping?.outputs).toHaveLength(1);
      expect(mapping?.outputs[0].type).toBe(PluginParameterType.OBJECT);
    });

    it('should return null if operation is invalid', () => {
      const mapping = engineer['createActionMapping']('invalid', 'GET', '/path', null, true);
      expect(mapping).toBeNull();
    });
  });

  describe('mapOpenAPITypeToPluginType', () => {
    it('should map string types correctly', () => {
      expect(engineer['mapOpenAPITypeToPluginType']('string')).toBe(PluginParameterType.STRING);
    });

    it('should map number types correctly', () => {
      expect(engineer['mapOpenAPITypeToPluginType']('number')).toBe(PluginParameterType.NUMBER);
      expect(engineer['mapOpenAPITypeToPluginType']('integer')).toBe(PluginParameterType.NUMBER);
    });

    it('should map boolean types correctly', () => {
      expect(engineer['mapOpenAPITypeToPluginType']('boolean')).toBe(PluginParameterType.BOOLEAN);
    });

    it('should map array types correctly', () => {
      expect(engineer['mapOpenAPITypeToPluginType']('array')).toBe(PluginParameterType.ARRAY);
    });

    it('should map object types correctly', () => {
      expect(engineer['mapOpenAPITypeToPluginType']('object')).toBe(PluginParameterType.OBJECT);
    });

    it('should default to string for unknown types', () => {
      expect(engineer['mapOpenAPITypeToPluginType']('unknown')).toBe(PluginParameterType.STRING);
    });
  });

  describe('generateToolId', () => {
    it('should generate a valid tool ID', () => {
      expect(engineer['generateToolId']('My Test Tool')).toBe('openapi-my-test-tool');
      expect(engineer['generateToolId']('Another_Tool-123')).toBe('openapi-another_tool-123');
    });
  });

  describe('generateActionVerb', () => {
    it('should convert camelCase to UPPER_CASE', () => {
      expect(engineer['generateActionVerb']('getUsersData')).toBe('GET_USERS_DATA');
    });

    it('should convert snake_case to UPPER_CASE', () => {
      expect(engineer['generateActionVerb']('get_users_data')).toBe('GET_USERS_DATA');
    });

    it('should handle mixed cases and special characters', () => {
      expect(engineer['generateActionVerb']('get-users-data_v1')).toBe('GET_USERS_DATA_V1');
    });
  });

  describe('storeOpenAPITool', () => {
    it('should call librarian to store the tool', async () => {
      const mockTool = { id: 'test-tool', name: 'Test Tool' } as any;
      mockedAxios.post.mockResolvedValueOnce({ data: { status: 'success' } });

      await engineer['storeOpenAPITool'](mockTool);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/storeData'),
        expect.objectContaining({ collection: 'openApiTools',
          id: 'test-tool',
          data: mockTool,
          storageType: 'mongo'
        })
      );
    });

    it('should throw error if librarian call fails', async () => {
      const mockTool = { id: 'test-tool', name: 'Test Tool' } as any;
      mockedAxios.post.mockRejectedValueOnce(new Error('Librarian error'));

      await expect(engineer['storeOpenAPITool'](mockTool)).rejects.toThrow('Failed to store OpenAPI tool: Librarian error');
    });
  });

  describe('getOpenAPITool', () => {
    it('should retrieve an OpenAPI tool from librarian', async () => {
      const mockTool = { id: 'test-tool', name: 'Test Tool' };
      mockedAxios.get.mockResolvedValueOnce({ data: { data: mockTool } });

      const result = await engineer.getOpenAPITool('test-tool');

      expect(result).toEqual(mockTool);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/loadData/test-tool'),
        expect.objectContaining({
          params: { collection: 'openApiTools',
            storageType: 'mongo'
          }
        })
      );
    });

    it('should return null if tool not found', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { data: null } });
      const result = await engineer.getOpenAPITool('non-existent-tool');
      expect(result).toBeNull();
    });

    it('should return null if librarian call fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Librarian error'));
      const result = await engineer.getOpenAPITool('test-tool');
      expect(result).toBeNull();
    });
  });

  describe('validateTool', () => {
    it('should return valid for a valid openapi tool manifest', async () => {
      const manifest = {
        id: 'test-openapi',
        name: 'Test OpenAPI',
        description: 'Desc',
        type: 'openapi',
        specUrl: 'http://example.com/spec.json',
        authentication: { type: 'none' as OpenAPIAuthentication['type'] } // Cast to specific type
      };
      const result = await engineer.validateTool(manifest);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should return invalid if openapi tool manifest is missing specUrl', async () => {
      const manifest = {
        id: 'test-openapi',
        name: 'Test OpenAPI',
        description: 'Desc',
        type: 'openapi',
        authentication: { type: 'none' as OpenAPIAuthentication['type'] } // Cast to specific type
      };
      const result = await engineer.validateTool(manifest);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('OpenAPI spec URL is required');
    });

    it('should return valid for a valid plugin tool manifest', async () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        description: 'Desc',
        type: 'plugin',
        language: 'javascript',
        entryPoint: { main: 'index.js' }
      };
      const result = await engineer.validateTool(manifest);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should return invalid if plugin tool manifest is missing language', async () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        description: 'Desc',
        type: 'plugin',
        entryPoint: { main: 'index.js' }
      };
      const result = await engineer.validateTool(manifest);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Plugin language is required');
    });

    it('should return invalid if plugin tool manifest has invalid code', async () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        description: 'Desc',
        type: 'plugin',
        language: 'javascript',
        entryPoint: { main: 'index.js' }
      };
      const invalidCode = 'console.log("hello");;;';
      const result = await engineer.validateTool(manifest, invalidCode);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Plugin code validation failed');
    });

    it('should return invalid if basic fields are missing', async () => {
      const manifest = {
        name: 'Test Plugin',
        description: 'Desc',
        type: 'plugin',
        language: 'javascript',
        entryPoint: { main: 'index.js' }
      };
      const result = await engineer.validateTool(manifest);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Tool ID is required');
    });
  });

  describe('finalizePlugin', () => {
    it('should finalize a plugin with default values and security', () => {
      const mockPluginStructure = {
        id: 'plugin-test',
        verb: 'TEST',
        description: 'Test plugin',
        inputDefinitions: [],
        outputDefinitions: [],
        language: 'javascript',
        entryPoint: { main: 'index.js', files: { 'index.js': 'console.log("test");' } },
        metadata: { category: ['test'], tags: ['test'], complexity: 1, dependencies: {}, version: '1.0.0' },
        configuration: [] // Added missing configuration array
      };
      const explanation = 'Detailed explanation';

      const finalizedPlugin = engineer['finalizePlugin'](mockPluginStructure, explanation);

      expect(finalizedPlugin.id).toBe('plugin-test');
      expect(finalizedPlugin.explanation).toBe(explanation);
      expect(finalizedPlugin.version).toBe('1.0.0');
      expect(finalizedPlugin.security).toBeDefined();
      expect(finalizedPlugin.security.permissions).toContain('console'); // Assuming console.log adds this
      expect(finalizedPlugin.security.trust.signature).toBeDefined();
    });

    it('should use provided configuration and security options', () => {
      const mockPluginStructure = {
        id: 'plugin-test-config',
        verb: 'TEST_CONFIG',
        description: 'Test plugin with config',
        inputDefinitions: [],
        outputDefinitions: [],
        language: 'javascript',
        entryPoint: { main: 'index.js', files: { 'index.js': 'console.log("test");' } },
        configuration: [
          { key: 'API_KEY', value: 'abc', description: 'API Key', required: true, type: 'secret' }
        ],
        security: {
          sandboxOptions: {
            allowEval: true,
            timeout: 10000,
            memory: 256 * 1024 * 1024,
            allowedModules: ['http'],
            allowedAPIs: ['fetch']
          }
        },
        metadata: { category: ['test'], tags: ['test'], complexity: 1, dependencies: {}, version: '1.0.0' }
      };
      const explanation = 'Detailed explanation';

      const finalizedPlugin = engineer['finalizePlugin'](mockPluginStructure, explanation);

      expect(finalizedPlugin.configuration!).toHaveLength(1); // Added non-null assertion
      expect(finalizedPlugin.configuration![0].key).toBe('API_KEY'); // Added non-null assertion
      expect(finalizedPlugin.security.sandboxOptions.allowEval).toBe(true);
      expect(finalizedPlugin.security.sandboxOptions.timeout).toBe(10000);
    });
  });

  describe('handleMessage', () => {
    it('should handle a message successfully', async () => {
      const mockReq = {
        body: { type: 'TEST_MESSAGE', content: 'Test content' }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await engineer['handleMessage'](mockReq as any, mockRes as any);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith({ status: 'Message received and processed' });
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', () => {
      const mockReq = {};
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      engineer['newPlugins'] = ['TEST_PLUGIN1', 'TEST_PLUGIN2'];

      engineer['getStatistics'](mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ newPlugins: ['TEST_PLUGIN1', 'TEST_PLUGIN2'] });
    });
  });

  describe('determineRequiredPermissions', () => {
    it('should return empty array if no files are present', () => {
      const plugin: PluginDefinition = {
        id: 'test', verb: 'test', description: 'test', explanation: 'test',
        inputDefinitions: [], outputDefinitions: [], language: 'javascript',
        entryPoint: { main: 'index.js' }, version: '1.0.0', metadata: { category: [], tags: [], complexity: 1, dependencies: {}, version: '1.0.0' },
        security: { permissions: [], sandboxOptions: { allowEval: false, timeout: 5000, memory: 128 * 1024 * 1024, allowedModules: [], allowedAPIs: [] }, trust: { publisher: 'test', signature: undefined } }
      };
      const permissions = engineer['determineRequiredPermissions'](plugin);
      expect(permissions).toEqual([]);
    });

    it('should detect fs.read and fs.write permissions', () => {
      const plugin: PluginDefinition = {
        id: 'test', verb: 'test', description: 'test', explanation: 'test',
        inputDefinitions: [], outputDefinitions: [], language: 'javascript',
        entryPoint: { main: 'index.js', files: { 'main.js': 'fs.readFile("test.txt"); fs.writeFile("test.txt", "content");' } },
        version: '1.0.0', metadata: { category: [], tags: [], complexity: 1, dependencies: {}, version: '1.0.0' },
        security: { permissions: [], sandboxOptions: { allowEval: false, timeout: 5000, memory: 128 * 1024 * 1024, allowedModules: [], allowedAPIs: [] }, trust: { publisher: 'test', signature: undefined } }
      };
      const permissions = engineer['determineRequiredPermissions'](plugin);
      expect(permissions).toEqual(['fs.read', 'fs.write']);
    });

    it('should detect net.fetch permission', () => {
      const plugin: PluginDefinition = {
        id: 'test', verb: 'test', description: 'test', explanation: 'test',
        inputDefinitions: [], outputDefinitions: [], language: 'javascript',
        entryPoint: { main: 'index.js', files: { 'main.js': 'fetch("http://example.com");' } },
        version: '1.0.0', metadata: { category: [], tags: [], complexity: 1, dependencies: {}, version: '1.0.0' },
        security: { permissions: [], sandboxOptions: { allowEval: false, timeout: 5000, memory: 128 * 1024 * 1024, allowedModules: [], allowedAPIs: [] }, trust: { publisher: 'test', signature: undefined } }
      };
      const permissions = engineer['determineRequiredPermissions'](plugin);
      expect(permissions).toEqual(['net.fetch']);
    });

    it('should detect net.http permission', () => {
      const plugin: PluginDefinition = {
        id: 'test', verb: 'test', description: 'test', explanation: 'test',
        inputDefinitions: [], outputDefinitions: [], language: 'javascript',
        entryPoint: { main: 'index.js', files: { 'main.js': 'http.get("http://example.com");' } },
        version: '1.0.0', metadata: { category: [], tags: [], complexity: 1, dependencies: {}, version: '1.0.0' },
        security: { permissions: [], sandboxOptions: { allowEval: false, timeout: 5000, memory: 128 * 1024 * 1024, allowedModules: [], allowedAPIs: [] }, trust: { publisher: 'test', signature: undefined } }
      };
      const permissions = engineer['determineRequiredPermissions'](plugin);
      expect(permissions).toEqual(['net.http']);
    });

    it('should return unique permissions', () => {
      const plugin: PluginDefinition = {
        id: 'test', verb: 'test', description: 'test', explanation: 'test',
        inputDefinitions: [], outputDefinitions: [], language: 'javascript',
        entryPoint: { main: 'index.js', files: { 'main.js': 'fs.readFile("a"); fs.writeFile("b"); fetch("c"); http.get("d"); fs.readFile("e");' } },
        version: '1.0.0', metadata: { category: [], tags: [], complexity: 1, dependencies: {}, version: '1.0.0' },
        security: { permissions: [], sandboxOptions: { allowEval: false, timeout: 5000, memory: 128 * 1024 * 1024, allowedModules: [], allowedAPIs: [] }, trust: { publisher: 'test', signature: undefined } }
      };
      const permissions = engineer['determineRequiredPermissions'](plugin);
      expect(permissions.sort()).toEqual(['fs.read', 'fs.write', 'net.fetch', 'net.http'].sort());
    });
  });

  describe('API Endpoints', () => {
    let app: any;

    beforeAll(async () => {
      // Engineer constructor calls setupServer, so we need to mock it before instantiation
      jest.spyOn(Engineer.prototype as any, 'setupServer').mockImplementation(async function(this: Engineer) {
        const express = require('express');
        app = express();
        app.use(express.json());

        // Mock verifyToken to allow requests through for testing
        app.use((req: any, res: any, next: any) => {
          if (req.path === '/health' || req.path === '/ready') {
            return next();
          }
          next();
        });

        // Bind 'this' to the actual engineer instance for route handlers
        app.post('/createPlugin', async (req: any, res: any) => {
          try {
            const { verb, context, guidance, language } = req.body;
            const deserializedContext = context instanceof Map ? context : MapSerializer.transformFromSerialization(context || {});
            const plugin = await this.createPlugin(verb, deserializedContext, guidance, language);
            res.json(plugin || {});
          } catch (error: any) {
            res.status(500).json({ error: error.message });
          }
        });

        app.post('/tools/openapi', async (req: any, res: any) => {
          try {
            const result = await this.registerOpenAPITool(req.body);
            res.json(result);
          } catch (error: any) {
            res.status(500).json({ error: error.message });
          }
        });

        app.post('/validate', async (req: any, res: any) => {
          try {
            const { manifest, code } = req.body;
            const result = await this.validateTool(manifest, code);
            res.json(result);
          } catch (error: any) {
            res.status(500).json({ error: error.message });
          }
        });

        app.get('/tools/openapi/:id', async (req: any, res: any) => {
          try {
            const { id } = req.params;
            const tool = await this.getOpenAPITool(id);
            if (!tool) {
              res.status(404).json({ error: 'OpenAPI tool not found' });
              return;
            }
            res.json(tool);
          } catch (error: any) {
            res.status(500).json({ error: error.message });
          }
        });

        app.post('/message', (req: any, res: any) => this['handleMessage'](req, res));
        app.get('/statistics', (req: any, res: any) => this['getStatistics'](req, res));

        // Mock app.listen to prevent actual server from starting
        app.listen = jest.fn((port, callback) => callback());
      });
      engineer = new Engineer(); // Instantiate Engineer after mocking setupServer
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it('POST /createPlugin should call createPlugin', async () => {
      const createPluginSpy = jest.spyOn(engineer, 'createPlugin' as any).mockResolvedValue({});
      const mockBody = { verb: 'TEST', context: {}, guidance: 'test' };

      await request(app).post('/createPlugin').send(mockBody).expect(200);

      expect(createPluginSpy).toHaveBeenCalledWith('TEST', expect.any(Map), 'test', undefined);
    });

    it('POST /tools/openapi should call registerOpenAPITool', async () => {
      const registerOpenAPIToolSpy = jest.spyOn(engineer, 'registerOpenAPITool' as any).mockResolvedValue({ success: true });
      const mockBody = { name: 'TestTool', specUrl: 'http://example.com/spec.json', authentication: { type: 'none' as OpenAPIAuthentication['type'] }, description: 'A test OpenAPI tool' };

      await request(app).post('/tools/openapi').send(mockBody).expect(200);

      expect(registerOpenAPIToolSpy).toHaveBeenCalledWith(mockBody);
    });

    it('POST /validate should call validateTool', async () => {
      const validateToolSpy = jest.spyOn(engineer, 'validateTool' as any).mockResolvedValue({ valid: true, issues: [] });
      const mockBody = { manifest: { id: 'test' }, code: 'console.log("hello")' };

      await request(app).post('/validate').send(mockBody).expect(200);

      expect(validateToolSpy).toHaveBeenCalledWith(mockBody.manifest, mockBody.code);
    });

    it('GET /tools/openapi/:id should call getOpenAPITool', async () => {
      const getOpenAPIToolSpy = jest.spyOn(engineer, 'getOpenAPITool' as any).mockResolvedValue({ id: 'test-id' });

      await request(app).get('/tools/openapi/test-id').expect(200);

      expect(getOpenAPIToolSpy).toHaveBeenCalledWith('test-id');
    });

    it('POST /message should call handleMessage', async () => {
      const handleMessageSpy = jest.spyOn(engineer, 'handleMessage' as any).mockResolvedValue({});
      const mockBody = { type: 'TEST_MESSAGE', content: 'Test content' };

      await request(app).post('/message').send(mockBody).expect(200);

      expect(handleMessageSpy).toHaveBeenCalled();
    });

    it('GET /statistics should call getStatistics', async () => {
      const getStatisticsSpy = jest.spyOn(engineer, 'getStatistics' as any).mockResolvedValue({});

      await request(app).get('/statistics').expect(200);

      expect(getStatisticsSpy).toHaveBeenCalled();
    });
  });

  describe('New Enhanced Methods', () => {
    describe('performSemanticAnalysis', () => {
      it('should return empty array for valid plugin', () => {
        const validPlugin = {
          id: 'test-plugin',
          verb: 'TEST_VERB',
          description: 'A detailed description of the plugin',
          explanation: 'A comprehensive explanation of the plugin functionality',
          inputDefinitions: [{ name: 'input1', type: 'string', required: true }],
          outputDefinitions: [{ name: 'output1', type: 'string', required: true }],
          language: 'javascript',
          entryPoint: { main: 'index.js', files: { 'index.js': '// code' } },
          metadata: { complexity: 5 }
        };
        const issues = engineer['performSemanticAnalysis'](validPlugin);
        expect(issues).toHaveLength(0);
      });

      it('should detect short description', () => {
        const invalidPlugin = {
          id: 'test-plugin',
          verb: 'TEST_VERB',
          description: 'short',
          explanation: 'A comprehensive explanation',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'javascript',
          entryPoint: { main: 'index.js', files: { 'index.js': '// code' } }
        };
        const issues = engineer['performSemanticAnalysis'](invalidPlugin);
        expect(issues).toContain('Plugin description should be more detailed');
      });

      it('should detect short explanation', () => {
        const invalidPlugin = {
          id: 'test-plugin',
          verb: 'TEST_VERB',
          description: 'A detailed description',
          explanation: 'short',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'javascript',
          entryPoint: { main: 'index.js', files: { 'index.js': '// code' } }
        };
        const issues = engineer['performSemanticAnalysis'](invalidPlugin);
        expect(issues).toContain('Plugin explanation should be more comprehensive');
      });

      it('should detect duplicate names', () => {
        const invalidPlugin = {
          id: 'test-plugin',
          verb: 'TEST_VERB',
          description: 'A detailed description',
          explanation: 'A comprehensive explanation',
          inputDefinitions: [
            { name: 'duplicate', type: 'string', required: true },
            { name: 'input1', type: 'string', required: true }
          ],
          outputDefinitions: [
            { name: 'duplicate', type: 'string', required: true },
            { name: 'output1', type: 'string', required: true }
          ],
          language: 'javascript',
          entryPoint: { main: 'index.js', files: { 'index.js': '// code' } }
        };
        const issues = engineer['performSemanticAnalysis'](invalidPlugin);
        expect(issues).toContain('Duplicate input/output names detected');
      });

      it('should detect security concerns', () => {
        const invalidPlugin = {
          id: 'test-plugin',
          verb: 'TEST_VERB',
          description: 'This plugin requires password handling',
          explanation: 'A comprehensive explanation',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'javascript',
          entryPoint: { main: 'index.js', files: { 'index.js': '// code' } }
        };
        const issues = engineer['performSemanticAnalysis'](invalidPlugin);
        expect(issues).toContain('Potential security concern: plugin description mentions password');
      });

      it('should detect invalid complexity', () => {
        const invalidPlugin = {
          id: 'test-plugin',
          verb: 'TEST_VERB',
          description: 'A detailed description',
          explanation: 'A comprehensive explanation',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'javascript',
          entryPoint: { main: 'index.js', files: { 'index.js': '// code' } },
          metadata: { complexity: 15 }
        };
        const issues = engineer['performSemanticAnalysis'](invalidPlugin);
        expect(issues).toContain('Complexity should be between 1 and 10');
      });
    });

    describe('createPluginWithRecovery', () => {
      it('should succeed on first attempt', async () => {
        const verb = 'TEST_VERB';
        const context = new Map<string, InputValue>();
        const guidance = 'Test guidance';

        const mockExplanation = 'Test explanation';
        const mockPluginStructure: PluginDefinition = {
          id: 'plugin-TEST_VERB',
          verb: 'TEST_VERB',
          description: 'Test description',
          explanation: 'Test explanation',
          inputDefinitions: [],
          outputDefinitions: [],
          entryPoint: {
            main: 'index.js',
            files: { 'index.js': 'console.log("Test plugin")' }
          },
          language: 'javascript',
          version: '1.0.0',
          metadata: {
            category: ['test'],
            tags: ['test'],
            complexity: 1,
            dependencies: {},
            version: '1.0.0'
          },
          security: {
            permissions: [],
            sandboxOptions: {
              allowEval: false,
              timeout: 5000,
              memory: 128 * 1024 * 1024,
              allowedModules: ['fs', 'path', 'http', 'https'],
              allowedAPIs: ['fetch', 'console']
            },
            trust: {
              publisher: 'test',
              signature: undefined
            }
          }
        };

        mockedAxios.post.mockResolvedValueOnce({ data: { result: mockExplanation } });
        mockedAxios.post.mockResolvedValueOnce({ data: { result: JSON.stringify(mockPluginStructure) } });
        mockedAxios.post.mockResolvedValueOnce({ data: { status: 'success' } });

        const result = await engineer['createPluginWithRecovery'](verb, context, guidance);
        expect(result).toBeDefined();
        expect(result?.id).toBe('plugin-TEST_VERB');
      });

      it('should retry and succeed on second attempt', async () => {
        const verb = 'TEST_VERB';
        const context = new Map<string, InputValue>();
        const guidance = 'Test guidance';

        const mockExplanation = 'Test explanation';
        const mockPluginStructure: PluginDefinition = {
          id: 'plugin-TEST_VERB',
          verb: 'TEST_VERB',
          description: 'Test description',
          explanation: 'Test explanation',
          inputDefinitions: [],
          outputDefinitions: [],
          entryPoint: {
            main: 'index.js',
            files: { 'index.js': 'console.log("Test plugin")' }
          },
          language: 'javascript',
          version: '1.0.0',
          metadata: {
            category: ['test'],
            tags: ['test'],
            complexity: 1,
            dependencies: {},
            version: '1.0.0'
          },
          security: {
            permissions: [],
            sandboxOptions: {
              allowEval: false,
              timeout: 5000,
              memory: 128 * 1024 * 1024,
              allowedModules: ['fs', 'path', 'http', 'https'],
              allowedAPIs: ['fetch', 'console']
            },
            trust: {
              publisher: 'test',
              signature: undefined
            }
          }
        };

        // First attempt fails, second succeeds
        mockedAxios.post.mockRejectedValueOnce(new Error('First attempt failed'));
        mockedAxios.post.mockResolvedValueOnce({ data: { result: mockExplanation } });
        mockedAxios.post.mockResolvedValueOnce({ data: { result: JSON.stringify(mockPluginStructure) } });
        mockedAxios.post.mockResolvedValueOnce({ data: { status: 'success' } });

        const result = await engineer['createPluginWithRecovery'](verb, context, guidance);
        expect(result).toBeDefined();
        expect(result?.id).toBe('plugin-TEST_VERB');
      });

      it('should throw error after max attempts', async () => {
        const verb = 'TEST_VERB';
        const context = new Map<string, InputValue>();
        const guidance = 'Test guidance';

        // All attempts fail
        mockedAxios.post.mockRejectedValue(new Error('All attempts failed'));

        await expect(engineer['createPluginWithRecovery'](verb, context, guidance))
          .rejects.toThrow('All attempts failed');
      });
    });

    describe('enhanceErrorHandlingInPlugin', () => {
      it('should add error handling to Python plugin', async () => {
        const plugin: PluginDefinition = {
          id: 'test-plugin',
          verb: 'TEST_VERB',
          description: 'Test plugin',
          explanation: 'Test explanation',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'python',
          entryPoint: {
            main: 'main.py',
            files: {
              'main.py': 'print("Hello World")\nif __name__ == "__main__":\n    print("Running")'
            }
          },
          version: '1.0.0',
          metadata: {
            category: ['test'],
            tags: ['test'],
            complexity: 1,
            dependencies: {},
            version: '1.0.0'
          },
          security: {
            permissions: [],
            sandboxOptions: {
              allowEval: false,
              timeout: 5000,
              memory: 128 * 1024 * 1024,
              allowedModules: ['fs', 'path', 'http', 'https'],
              allowedAPIs: ['fetch', 'console']
            },
            trust: {
              publisher: 'test',
              signature: undefined
            }
          }
        };

        const enhancedPlugin = await engineer['enhanceErrorHandlingInPlugin'](plugin);
        const entryPoint = enhancedPlugin.entryPoint as { main: string, files: { [key: string]: string } };
        const mainCode = entryPoint.files['main.py'];
        expect(mainCode).toContain('try:');
        expect(mainCode).toContain('except Exception as e:');
        expect(mainCode).toContain('logger.error');
      });

      it('should add error handling to JavaScript plugin', async () => {
        const plugin: PluginDefinition = {
          id: 'test-plugin',
          verb: 'TEST_VERB',
          description: 'Test plugin',
          explanation: 'Test explanation',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'javascript',
          entryPoint: {
            main: 'index.js',
            files: {
              'index.js': 'module.exports = function() { console.log("Hello"); }'
            }
          },
          version: '1.0.0',
          metadata: {
            category: ['test'],
            tags: ['test'],
            complexity: 1,
            dependencies: {},
            version: '1.0.0'
          },
          security: {
            permissions: [],
            sandboxOptions: {
              allowEval: false,
              timeout: 5000,
              memory: 128 * 1024 * 1024,
              allowedModules: ['fs', 'path', 'http', 'https'],
              allowedAPIs: ['fetch', 'console']
            },
            trust: {
              publisher: 'test',
              signature: undefined
            }
          }
        };

        const enhancedPlugin = await engineer['enhanceErrorHandlingInPlugin'](plugin);
        const entryPoint = enhancedPlugin.entryPoint as { main: string, files: { [key: string]: string } };
        const mainCode = entryPoint.files['index.js'];
        expect(mainCode).toContain('try {');
        expect(mainCode).toContain('} catch (error) {');
        expect(mainCode).toContain('logger.error');
      });

      it('should return plugin unchanged if no files', async () => {
        const plugin: PluginDefinition = {
          id: 'test-plugin',
          verb: 'TEST_VERB',
          description: 'Test plugin',
          explanation: 'Test explanation',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'javascript',
          entryPoint: {
            main: 'index.js'
          },
          version: '1.0.0',
          metadata: {
            category: ['test'],
            tags: ['test'],
            complexity: 1,
            dependencies: {},
            version: '1.0.0'
          },
          security: {
            permissions: [],
            sandboxOptions: {
              allowEval: false,
              timeout: 5000,
              memory: 128 * 1024 * 1024,
              allowedModules: ['fs', 'path', 'http', 'https'],
              allowedAPIs: ['fetch', 'console']
            },
            trust: {
              publisher: 'test',
              signature: undefined
            }
          }
        };

        const enhancedPlugin = await engineer['enhanceErrorHandlingInPlugin'](plugin);
        expect(enhancedPlugin).toEqual(plugin);
      });
    });

    describe('logPerformanceMetrics', () => {
      it('should log performance metrics', () => {
        engineer['performanceMetrics'] = {
          validationTime: 100,
          generationTime: 200,
          testExecutionTime: 50
        };

        const consoleSpy = jest.spyOn(console, 'log');
        engineer['logPerformanceMetrics']();

        expect(consoleSpy).toHaveBeenCalledWith('Engineer Performance Metrics:');
        expect(consoleSpy).toHaveBeenCalledWith('- Validation Time: 100ms');
        expect(consoleSpy).toHaveBeenCalledWith('- Generation Time: 200ms');
        expect(consoleSpy).toHaveBeenCalledWith('- Test Execution Time: 50ms');
        expect(consoleSpy).toHaveBeenCalledWith('- Total Time: 350ms');

        consoleSpy.mockRestore();
      });
    });

    describe('createPluginFromOpenAPI', () => {
      it('should create a plugin from OpenAPI spec successfully', async () => {
        const specUrl = 'http://example.com/openapi.json';
        const name = 'TestAPI';
        const description = 'Test API description';

        const mockOpenApiSpec = {
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' },
          paths: {
            '/test': {
              get: {
                operationId: 'getTest',
                summary: 'Get Test Data',
                parameters: [{ name: 'param1', in: 'query', schema: { type: 'string' }, required: true }],
                responses: { '200': { description: 'Success' } }
              }
            }
          }
        };

        const mockTool = {
          id: 'openapi-testapi',
          name: 'TestAPI',
          description: 'Test API description',
          actionMappings: [{
            actionVerb: 'GET_TEST',
            operationId: 'getTest',
            method: 'GET',
            path: '/test',
            inputs: [{ name: 'param1', type: PluginParameterType.STRING, required: true }],
            outputs: [{ name: 'result', type: PluginParameterType.OBJECT }]
          }]
        };

        const mockPlugin = {
          id: 'plugin-testapi',
          verb: 'TESTAPI',
          description: 'Test API plugin',
          explanation: 'Generated plugin for TestAPI',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'typescript',
          entryPoint: { main: 'index.ts', files: { 'index.ts': 'console.log("test");' } },
          version: '1.0.0',
          metadata: { category: [], tags: [], complexity: 1, dependencies: {}, version: '1.0.0' },
          security: { permissions: [], sandboxOptions: {}, trust: { publisher: 'test', signature: undefined } }
        };

        mockedAxios.get.mockResolvedValueOnce({ data: mockOpenApiSpec });
        mockedAxios.post.mockResolvedValueOnce({ data: { status: 'success' } }); // registerOpenAPITool
        mockedAxios.post.mockResolvedValueOnce({ data: { result: JSON.stringify(mockPlugin) } }); // generateWrapperPlugin

        const result = await engineer.createPluginFromOpenAPI(specUrl, name, description);

        expect(result).toBeDefined();
        expect(result?.id).toBe('plugin-testapi');
        expect(mockedAxios.get).toHaveBeenCalledWith(specUrl);
      });

      it('should throw error if OpenAPI spec fetch fails', async () => {
        const specUrl = 'http://example.com/fail.json';
        const name = 'FailAPI';

        mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

        await expect(engineer.createPluginFromOpenAPI(specUrl, name)).rejects.toThrow('Failed to parse OpenAPI spec');
      });
    });

    describe('onboardTool', () => {
      it('should onboard a tool successfully', async () => {
        const toolManifest = {
          id: 'test-tool',
          name: 'Test Tool',
          description: 'A test tool',
          type: 'openapi',
          specUrl: 'http://example.com/spec.json'
        };
        const policyConfig = { rateLimit: 100 };

        const mockGeneratedPlugin = {
          id: 'plugin-test-tool',
          verb: 'TEST_TOOL',
          description: 'Generated wrapper plugin',
          explanation: 'Wrapper plugin for test tool',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'typescript',
          entryPoint: { main: 'index.ts', files: { 'index.ts': 'console.log("test");' } },
          version: '1.0.0',
          metadata: { category: [], tags: [], complexity: 1, dependencies: {}, version: '1.0.0' },
          security: { permissions: [], sandboxOptions: {}, trust: { publisher: 'test', signature: undefined } }
        };

        // Mock generateWrapperPlugin
        jest.spyOn(engineer, 'generateWrapperPlugin' as any).mockResolvedValue(mockGeneratedPlugin);
        // Mock executeWrapperTests
        jest.spyOn(engineer, 'executeWrapperTests' as any).mockResolvedValue({ valid: true, issues: [] });
        // Mock pluginMarketplace.store
        jest.spyOn(engineer['pluginMarketplace'], 'store').mockResolvedValue();

        const result = await engineer['onboardTool'](toolManifest, policyConfig);

        expect(result.success).toBe(true);
        expect(result.message).toContain('onboarded successfully');
        expect(engineer['generateWrapperPlugin']).toHaveBeenCalledWith(toolManifest, policyConfig, 'typescript');
        expect(engineer['executeWrapperTests']).toHaveBeenCalledWith(mockGeneratedPlugin);
        expect(engineer['pluginMarketplace'].store).toHaveBeenCalled();
      });

      it('should throw error if wrapper plugin generation fails', async () => {
        const toolManifest = { id: 'test-tool', name: 'Test Tool' };
        const policyConfig = {};

        jest.spyOn(engineer, 'generateWrapperPlugin' as any).mockResolvedValue(null);

        await expect(engineer['onboardTool'](toolManifest, policyConfig)).rejects.toThrow('Failed to generate wrapper plugin');
      });

      it('should throw error if wrapper tests fail', async () => {
        const toolManifest = { id: 'test-tool', name: 'Test Tool' };
        const policyConfig = {};

        const mockGeneratedPlugin = {
          id: 'plugin-test-tool',
          verb: 'TEST_TOOL',
          description: 'Generated wrapper plugin',
          explanation: 'Wrapper plugin for test tool',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'typescript',
          entryPoint: { main: 'index.ts', files: { 'index.ts': 'console.log("test");' } },
          version: '1.0.0',
          metadata: { category: [], tags: [], complexity: 1, dependencies: {}, version: '1.0.0' },
          security: { permissions: [], sandboxOptions: {}, trust: { publisher: 'test', signature: undefined } }
        };

        jest.spyOn(engineer, 'generateWrapperPlugin' as any).mockResolvedValue(mockGeneratedPlugin);
        jest.spyOn(engineer, 'executeWrapperTests' as any).mockResolvedValue({ valid: false, issues: ['Test failed'] });

        await expect(engineer['onboardTool'](toolManifest, policyConfig)).rejects.toThrow('Wrapper plugin tests failed');
      });
    });

    describe('generateWrapperPlugin', () => {
      it('should generate a wrapper plugin successfully', async () => {
        const toolManifest = {
          id: 'test-tool',
          name: 'Test Tool',
          description: 'A test tool',
          type: 'openapi'
        };
        const policyConfig = { rateLimit: 100 };
        const language = 'typescript';

        const mockGeneratedPlugin = {
          id: 'plugin-test-tool',
          verb: 'TEST_TOOL',
          description: 'Generated wrapper plugin',
          explanation: 'Wrapper plugin for test tool',
          inputDefinitions: [],
          outputDefinitions: [],
          language: 'typescript',
          entryPoint: { main: 'index.ts', files: { 'index.ts': 'console.log("test");' } },
          version: '1.0.0',
          metadata: { category: [], tags: [], complexity: 1, dependencies: {}, version: '1.0.0' },
          security: { permissions: [], sandboxOptions: {}, trust: { publisher: 'test', signature: undefined } }
        };

        mockedAxios.post.mockResolvedValueOnce({ data: { result: JSON.stringify(mockGeneratedPlugin) } });

        const result = await engineer['generateWrapperPlugin'](toolManifest, policyConfig, language);

        expect(result).toEqual(mockGeneratedPlugin);
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining('/chat'),
          expect.objectContaining({
            exchanges: [expect.objectContaining({ role: 'user' })],
            optimization: 'accuracy',
            responseType: 'json'
          })
        );
      });

      it('should throw error if generated plugin is invalid', async () => {
        const toolManifest = { id: 'test-tool', name: 'Test Tool' };
        const policyConfig = {};
        const language = 'typescript';

        const invalidPlugin = { id: 'invalid' }; // Missing required fields

        mockedAxios.post.mockResolvedValueOnce({ data: { result: JSON.stringify(invalidPlugin) } });

        await expect(engineer['generateWrapperPlugin'](toolManifest, policyConfig, language))
          .rejects.toThrow('Generated wrapper plugin structure is invalid');
      });
    });

    describe('executeWrapperTests', () => {
      it('should execute wrapper tests successfully', async () => {
        const generatedPlugin = {
          id: 'test-plugin',
          language: 'javascript',
          entryPoint: {
            files: {
              'index.js': 'console.log("test");',
              'index.test.js': 'test("should pass", () => { expect(true).toBe(true); });'
            }
          }
        };

        jest.spyOn(engineer, 'validatePluginCode' as any).mockResolvedValue(true);
        jest.spyOn(engineer, 'executeTestRunner' as any).mockResolvedValue({ valid: true, issues: [] });

        const result = await engineer['executeWrapperTests'](generatedPlugin);

        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
        expect(engineer['validatePluginCode']).toHaveBeenCalledWith(generatedPlugin.entryPoint, 'javascript');
        expect(engineer['executeTestRunner']).toHaveBeenCalledWith(generatedPlugin);
      });

      it('should return invalid if code validation fails', async () => {
        const generatedPlugin = {
          id: 'test-plugin',
          language: 'javascript',
          entryPoint: { files: { 'index.js': 'invalid code {{{' } }
        };

        jest.spyOn(engineer, 'validatePluginCode' as any).mockResolvedValue(false);

        const result = await engineer['executeWrapperTests'](generatedPlugin);

        expect(result.valid).toBe(false);
        expect(result.issues).toContain('Generated wrapper code failed basic validation');
      });

      it('should return invalid if test execution fails', async () => {
        const generatedPlugin = {
          id: 'test-plugin',
          language: 'javascript',
          entryPoint: { files: { 'index.js': 'console.log("test");' } }
        };

        jest.spyOn(engineer, 'validatePluginCode' as any).mockResolvedValue(true);
        jest.spyOn(engineer, 'executeTestRunner' as any).mockResolvedValue({ valid: false, issues: ['Test failed'] });

        const result = await engineer['executeWrapperTests'](generatedPlugin);

        expect(result.valid).toBe(false);
        expect(result.issues).toContain('Test failed');
      });
    });

    describe('executeTestRunner', () => {
      it('should execute JavaScript tests successfully', async () => {
        const generatedPlugin = {
          id: 'test-plugin',
          language: 'javascript',
          entryPoint: {
            files: {
              'index.js': 'console.log("test");',
              'index.test.js': 'test("should pass", () => { expect(true).toBe(true); });'
            }
          }
        };

        // Mock execAsync to simulate successful test execution
        jest.spyOn(require('util'), 'promisify').mockReturnValue(
          jest.fn().mockResolvedValue({ stdout: 'PASS', stderr: '' })
        );

        const result = await engineer['executeTestRunner'](generatedPlugin);

        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
      });

      it('should execute Python tests successfully', async () => {
        const generatedPlugin = {
          id: 'test-plugin',
          language: 'python',
          entryPoint: {
            files: {
              'main.py': 'print("test")',
              'test_main.py': 'def test_example(): assert True'
            }
          }
        };

        // Mock execAsync to simulate successful test execution
        jest.spyOn(require('util'), 'promisify').mockReturnValue(
          jest.fn().mockResolvedValue({ stdout: '1 passed', stderr: '' })
        );

        const result = await engineer['executeTestRunner'](generatedPlugin);

        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
      });

      it('should return invalid if no test files found', async () => {
        const generatedPlugin = {
          id: 'test-plugin',
          language: 'javascript',
          entryPoint: {
            files: { 'index.js': 'console.log("test");' } // No test files
          }
        };

        const result = await engineer['executeTestRunner'](generatedPlugin);

        expect(result.valid).toBe(false);
        expect(result.issues).toContain('No test files found for JavaScript/TypeScript plugin');
      });

      it('should return invalid if test execution fails', async () => {
        const generatedPlugin = {
          id: 'test-plugin',
          language: 'javascript',
          entryPoint: {
            files: {
              'index.js': 'console.log("test");',
              'index.test.js': 'test("should fail", () => { throw new Error("fail"); });'
            }
          }
        };

        // Mock execAsync to simulate failed test execution
        jest.spyOn(require('util'), 'promisify').mockReturnValue(
          jest.fn().mockResolvedValue({ stdout: '', stderr: 'FAIL' })
        );

        const result = await engineer['executeTestRunner'](generatedPlugin);

        expect(result.valid).toBe(false);
        expect(result.issues).toContain('Tests failed: FAIL');
      });

      it('should return invalid for unsupported language', async () => {
        const generatedPlugin = {
          id: 'test-plugin',
          language: 'unsupported',
          entryPoint: { files: {} }
        };

        const result = await engineer['executeTestRunner'](generatedPlugin);

        expect(result.valid).toBe(false);
        expect(result.issues).toContain('Test execution not supported for language: unsupported');
      });
    });
  });
});
