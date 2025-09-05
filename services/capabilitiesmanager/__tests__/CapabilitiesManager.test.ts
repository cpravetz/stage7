jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    })),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  },
}));
jest.mock('express');
jest.mock('fs/promises');
jest.mock('child_process');

jest.mock('@cktmcs/shared', () => {
    const originalModule = jest.requireActual('@cktmcs/shared');
    return {
        ...originalModule,
        createAuthenticatedAxios: jest.fn(() => ({
            get: jest.fn(),
            post: jest.fn(),
            put: jest.fn(),
            delete: jest.fn(),
        })),
    };
});

// Mock PluginExecutor module
jest.mock('../src/utils/pluginExecutor', () => {
    return {
        PluginExecutor: jest.fn().mockImplementation(() => {
            return {
                execute: jest.fn(),
                executeOpenAPITool: jest.fn(),
                executeMCPTool: jest.fn(),
            };
        }),
    };
});

import { CapabilitiesManager } from '../src/CapabilitiesManager';
import { MapSerializer, InputValue, PluginParameterType, Step } from '@cktmcs/shared';
import { GlobalErrorCodes } from '../src/utils/errorReporter';
import axios from 'axios';
import express from 'express';
import { PluginExecutor } from '../src/utils/pluginExecutor'; // Import the mocked PluginExecutor

describe('CapabilitiesManager', () => {
  let capabilitiesManager: CapabilitiesManager;
  let mockPluginExecutorInstance: any; // To hold the mocked instance

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock instance of PluginExecutor before CapabilitiesManager
    mockPluginExecutorInstance = new PluginExecutor();
    (PluginExecutor as jest.Mock).mockImplementationOnce(() => mockPluginExecutorInstance);

    capabilitiesManager = new CapabilitiesManager();
    
  });

  describe('start', () => {
    it('should set up the server successfully', async () => {
        const mockListen = jest.fn((port: any, callback: any) => callback());
        const mockApp = {
          use: jest.fn(),
          post: jest.fn(),
          get: jest.fn(),
          listen: mockListen,
        };
        (express as jest.MockedFunction<typeof express>).mockReturnValue(mockApp as unknown as express.Express);

      await capabilitiesManager.start();

      expect(mockListen).toHaveBeenCalled();
    });

    it('should handle server startup errors', async () => {
        const mockListen = jest.fn((_port: number, _callback: () => void) => {
          throw new Error('Server startup error');
        });
        const mockApp = {
          use: jest.fn(),
          post: jest.fn(),
          get: jest.fn(),
          listen: mockListen,
        };
        (express as jest.MockedFunction<typeof express>).mockReturnValue(mockApp as unknown as express.Express);
  
        await expect(capabilitiesManager.start()).rejects.toThrow('Server startup error');
      });
  });

  describe('executeActionVerb', () => {
    it('should execute a known action verb', async () => {
      const mockReq = {
        body: MapSerializer.transformForSerialization({
          step: {
            actionVerb: 'TEST_VERB',
            inputs: new Map<string, InputValue>(),
          },
        }),
      } as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as express.Response;

      // Mock the internal plugin execution logic
      jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue({
        type: 'plugin',
        handler: {
          id: 'test-plugin',
          verb: 'TEST_VERB',
          language: 'javascript',
          entryPoint: { main: 'index.js' },
          description: 'A test plugin',
          inputDefinitions: [],
          outputDefinitions: [],
          repository: { type: 'local' },
          security: { permissions: [] },
          version: '1.0.0',
        },
      });
      mockPluginExecutorInstance.execute.mockResolvedValue([{
        name: 'output',
        success: true,
        resultType: PluginParameterType.STRING,
        result: 'Test result',
        resultDescription: 'Test result description',
      }]);

      await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        resultType: PluginParameterType.STRING,
        result: 'Test result',
      }));
    });

    it('should handle unknown action verbs', async () => {
      const mockReq = {
        body: MapSerializer.transformForSerialization({
          step: {
            actionVerb: 'UNKNOWN_VERB',
            inputs: new Map<string, InputValue>(),
          },
        }),
      } as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as express.Response;

      jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue(null);
      jest.spyOn(capabilitiesManager as any, 'handleUnknownVerb').mockResolvedValue([{
        name: 'error',
        success: false,
        resultType: PluginParameterType.ERROR,
        error: 'Unknown verb',
        resultDescription: 'Unknown verb',
      }]);

      await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200); // handleUnknownVerb returns 200 with an error object
      expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        resultType: PluginParameterType.ERROR,
        error: 'Unknown verb',
      }));
    });
  });

  describe('handleUnknownVerb', () => {
    it('should attempt to create a new plugin for unknown verbs', async () => {
      const mockStep = {
        actionVerb: 'NEW_VERB',
        inputValues: new Map<string, InputValue>(),
      };

      // Mock the internal call to executeAccomplishPlugin
      jest.spyOn(capabilitiesManager as any, 'executeAccomplishPlugin').mockResolvedValue([{
        name: 'plugin_created',
        success: true,
        resultType: PluginParameterType.PLUGIN,
        resultDescription: 'Created new plugin for NEW_VERB',
        result: 'Created new plugin for NEW_VERB',
      }]);

      const result = await (capabilitiesManager as any).handleUnknownVerb(mockStep, 'test-trace-id');

      expect(result).toEqual([{
        success: true,
        resultType: PluginParameterType.PLUGIN,
        resultDescription: 'Created new plugin for NEW_VERB',
        result: 'Created new plugin for NEW_VERB',
      }]);
    });
  });
});