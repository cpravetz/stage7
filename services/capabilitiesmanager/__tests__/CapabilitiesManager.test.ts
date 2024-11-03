import axios from 'axios';
import express from 'express';
import CapabilitiesManager from '../src/CapabilitiesManager';
import { loadPlugins } from '../src/utils/pluginUtils';
import AccomplishPlugin from '../src/plugins/ACCOMPLISH';

jest.mock('axios');
jest.mock('../src/utils/pluginUtils');
jest.mock('../src/plugins/ACCOMPLISH');

describe('CapabilitiesManager', () => {
  let capabilitiesManager: CapabilitiesManager;
  let mockExpress: jest.Mocked<express.Express>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExpress = {
      use: jest.fn(),
      post: jest.fn(),
      listen: jest.fn().mockImplementation((port, callback) => {
        callback();
        return { on: jest.fn() };
      }),
    } as unknown as jest.Mocked<express.Express>;
    jest.spyOn(express, 'default').mockReturnValue(mockExpress);
    
    capabilitiesManager = new CapabilitiesManager();
  });

  describe('start', () => {
    it('should set up the server and load action verbs', async () => {
      (loadPlugins as jest.Mock).mockResolvedValue(new Map([['TEST', 'test.js']]));
      
      await capabilitiesManager.start();
      
      expect(mockExpress.use).toHaveBeenCalled();
      expect(mockExpress.post).toHaveBeenCalledTimes(3);
      expect(loadPlugins).toHaveBeenCalled();
    });

    it('should handle errors during startup', async () => {
      (loadPlugins as jest.Mock).mockRejectedValue(new Error('Load error'));
      
      await expect(capabilitiesManager.start()).rejects.toThrow('Load error');
    });
  });

  describe('executeActionVerb', () => {
    it('should execute a known action verb', async () => {
      const mockPlugin = {
        execute: jest.fn().mockResolvedValue({ success: true, resultType: 'string', result: 'Test result' }),
      };
      jest.mock('../src/plugins/TEST', () => ({ default: jest.fn(() => mockPlugin) }), { virtual: true });
      
      (capabilitiesManager as any).actionVerbs.set('TEST', 'TEST.js');
      
      const req = { body: { verb: 'TEST', inputs: { inputValue: 'test', args: {} } } } as express.Request;
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
      
      await (capabilitiesManager as any).executeActionVerb(req, res);
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({ success: true, resultType: 'string', result: 'Test result' });
    });

    it('should handle unknown action verbs', async () => {
      (AccomplishPlugin.prototype.execute as jest.Mock).mockResolvedValue({
        success: true,
        resultType: 'string',
        result: 'Handled unknown verb',
      });
      
      const req = { body: { verb: 'UNKNOWN', inputs: { inputValue: 'test', args: {} } } } as express.Request;
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
      
      await (capabilitiesManager as any).executeActionVerb(req, res);
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({
        success: true,
        resultType: 'string',
        result: 'Handled unknown verb',
      });
    });
  });

  describe('registerActionVerb', () => {
    it('should register a new action verb', async () => {
      const req = { body: { verb: 'NEW_VERB', fileName: 'new_verb.js' } } as express.Request;
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
      
      await (capabilitiesManager as any).registerActionVerb(req, res);
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({ status: 'success', verb: 'NEW_VERB', fileName: 'new_verb.js' });
      expect((capabilitiesManager as any).actionVerbs.get('NEW_VERB')).toBe('new_verb.js');
    });

    it('should handle invalid registration requests', async () => {
      const req = { body: { verb: 'INVALID', fileName: 'invalid.txt' } } as express.Request;
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
      
      await (capabilitiesManager as any).registerActionVerb(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({ error: 'fileName must end with .js' });
    });
  });
});