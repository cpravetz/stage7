import { execute } from '../FILE_OPS/FILE_OPS';
import fs from 'fs/promises';
import { PluginParameterType } from '@cktmcs/shared';

jest.mock('fs/promises');

describe('FILE_OPS', () => {
  const testPath = '/test/path.txt';
  const testContent = 'Test content';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('read operation', () => {
    it('should read file content successfully', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue(testContent);

      const result = await execute('read', testPath);

      expect(result).toEqual({
        success: true,
        resultType: PluginParameterType.ANY,
        resultDescription: `Read content from ${testPath}`,
        result: testContent
      });
      expect(fs.readFile).toHaveBeenCalledWith(testPath, 'utf-8');
    });

    it('should handle read errors', async () => {
      const error = new Error('Read error');
      (fs.readFile as jest.Mock).mockRejectedValue(error);

      const result = await execute('read', testPath);

      expect(result).toEqual({
        success: false,
        resultType: PluginParameterType.ERROR,
        resultDescription: 'An error occured for operation read',
        result: null,
        error: 'Read error'
      });
    });
  });

  describe('write operation', () => {
    it('should write content to file successfully', async () => {
      const result = await execute('write', testPath, testContent);

      expect(result).toEqual({
        success: true,
        resultType: PluginParameterType.ANY,
        resultDescription: `Saved content to ${testPath}`,
        result: null
      });
      expect(fs.writeFile).toHaveBeenCalledWith(testPath, testContent);
    });

    it('should handle write errors', async () => {
      const error = new Error('Write error');
      (fs.writeFile as jest.Mock).mockRejectedValue(error);

      const result = await execute('write', testPath, testContent);

      expect(result).toEqual({
        success: false,
        resultType: PluginParameterType.ERROR,
        resultDescription: 'An error occured for operation write',
        result: null,
        error: 'Write error'
      });
    });
  });

  describe('append operation', () => {
    it('should append content to file successfully', async () => {
      const result = await execute('append', testPath, testContent);

      expect(result).toEqual({
        success: true,
        resultType: PluginParameterType.ANY,
        resultDescription: `Appended content to ${testPath}`,
        result: null
      });
      expect(fs.appendFile).toHaveBeenCalledWith(testPath, testContent);
    });

    it('should handle append errors', async () => {
      const error = new Error('Append error');
      (fs.appendFile as jest.Mock).mockRejectedValue(error);

      const result = await execute('append', testPath, testContent);

      expect(result).toEqual({
        success: false,
        resultType: PluginParameterType.ERROR,
        resultDescription: 'An error occured for operation append',
        result: null,
        error: 'Append error'
      });
    });
  });

  describe('unknown operation', () => {
    it('should return an error for unknown operations', async () => {
      const result = await execute('unknown' as any, testPath);

      expect(result).toEqual({
        success: false,
        resultType: PluginParameterType.ERROR,
        resultDescription: 'Unknown operation unknown',
        result: null,
        error: 'Unknown operation unknown'
      });
    });
  });
});