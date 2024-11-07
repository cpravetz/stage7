import { CapabilitiesManager } from '../src/CapabilitiesManager';
import axios from 'axios';
import express from 'express';
import { MapSerializer, PluginInput, PluginParameterType } from '@cktmcs/shared';

jest.mock('axios');
jest.mock('express');
jest.mock('fs/promises');
jest.mock('child_process');

describe('CapabilitiesManager', () => {
  let capabilitiesManager: CapabilitiesManager;

  beforeEach(() => {
    capabilitiesManager = new CapabilitiesManager();
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should set up the server successfully', async () => {
        const mockListen = jest.fn((port, callback) => callback());
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
            inputs: new Map<string, PluginInput>(),
          },
        }),
      } as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as express.Response;

      const mockPlugin = {
        verb: 'TEST_VERB',
        language: 'javascript',
        entryPoint: { main: 'index.js' },
      };

      jest.spyOn(capabilitiesManager as any, 'loadActionVerbs').mockResolvedValue(undefined);
      jest.spyOn(capabilitiesManager as any, 'actionVerbs', 'get').mockReturnValue(new Map([['TEST_VERB', mockPlugin]]));
      jest.spyOn(capabilitiesManager as any, 'executeJavaScriptPlugin').mockResolvedValue([{
        success: true,
        resultType: PluginParameterType.STRING,
        result: 'Test result',
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
            inputs: new Map<string, PluginInput>(),
          },
        }),
      } as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as express.Response;

      jest.spyOn(capabilitiesManager as any, 'loadActionVerbs').mockResolvedValue(undefined);
      jest.spyOn(capabilitiesManager as any, 'actionVerbs', 'get').mockReturnValue(new Map());
      jest.spyOn(capabilitiesManager as any, 'handleUnknownVerb').mockResolvedValue({
        success: false,
        resultType: PluginParameterType.ERROR,
        error: 'Unknown verb',
      });

      await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
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
        inputs: new Map<string, PluginInput>(),
      };

      jest.spyOn(capabilitiesManager as any, 'requestEngineerForPlugin').mockResolvedValue({
        id: 'new-plugin',
        verb: 'NEW_VERB',
        language: 'javascript',
        entryPoint: { main: 'index.js' },
      });

      jest.spyOn(capabilitiesManager as any, 'createPluginFiles').mockResolvedValue(undefined);

      const result = await (capabilitiesManager as any).handleUnknownVerb(mockStep);

      expect(result).toEqual({
        success: true,
        resultType: PluginParameterType.PLUGIN,
        resultDescription: 'Created new plugin for NEW_VERB',
        result: 'Created new plugin for NEW_VERB',
      });
    });
  });
});