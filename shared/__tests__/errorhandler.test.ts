import { analyzeError, clearAnalyzedErrors, getAnalyzedErrorCount } from '../src/errorhandler';
import axios from 'axios';
import { ServiceTokenManager } from '../src/security/ServiceTokenManager';
import * as fs from 'node:fs/promises';

// Mock dependencies
jest.mock('axios');
jest.mock('../src/security/ServiceTokenManager');
jest.mock('node:fs/promises');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFs = fs as jest.Mocked<typeof fs>;
const MockedServiceTokenManager = ServiceTokenManager as jest.MockedClass<typeof ServiceTokenManager>;

describe('analyzeError', () => {
    let mockTokenManager: jest.Mocked<ServiceTokenManager>;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        clearAnalyzedErrors(); // Clear the set of analyzed errors

        // Mock ServiceTokenManager
        mockTokenManager = {
            getToken: jest.fn().mockResolvedValue('mock-token'),
        } as any;
        MockedServiceTokenManager.getInstance.mockReturnValue(mockTokenManager);

        // Mock axios
        mockedAxios.get.mockResolvedValue({ data: {} }); // Mock health check
        mockedAxios.post.mockResolvedValue({ data: { response: 'mock-remediation' } });

        // Mock fs
        mockedFs.access.mockResolvedValue(undefined);
        mockedFs.readFile.mockResolvedValue('const x = 1;');
    });

    it('should not analyze null or undefined errors', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await analyzeError(null as any);
        expect(consoleErrorSpy).toHaveBeenCalledWith('analyzeError called with null or undefined error');
        consoleErrorSpy.mockRestore();
    });

    it('should convert non-Error objects to Error objects', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await analyzeError('just a string' as any);
        expect(consoleErrorSpy).toHaveBeenCalledWith('analyzeError called with non-Error object:', 'just a string');
        expect(mockedAxios.post).toHaveBeenCalled(); // It should still proceed to analyze
        consoleErrorSpy.mockRestore();
    });

    it('should not analyze ECONNREFUSED errors', async () => {
        const error = new Error('connect ECONNREFUSED 127.0.0.1:8080');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await analyzeError(error);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error is ', error.message);
        expect(mockedAxios.post).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    it('should not analyze recursive errors', async () => {
        const error = new Error('Error analyzing error: something went wrong');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await analyzeError(error);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Recursive error analysis detected, skipping further analysis for this error.');
        expect(mockedAxios.post).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    it('should skip analysis if already in progress', async () => {
        const error = new Error('test error');
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        
        // Use a promise to control when the first call finishes
        const firstCallPromise = analyzeError(error);
        
        // Immediately call it again
        await analyzeError(error);

        expect(consoleLogSpy).toHaveBeenCalledWith('Error analysis already in progress, skipping');
        
        // Allow the first call to complete
        await firstCallPromise;
        consoleLogSpy.mockRestore();
    });

    it('should skip analysis if error has already been analyzed', async () => {
        const error = new Error('unique error');
        error.stack = 'unique stack';

        await analyzeError(error);
        expect(getAnalyzedErrorCount()).toBe(1);

        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        await analyzeError(error);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Error already analyzed:'));
        expect(getAnalyzedErrorCount()).toBe(1); // Should not increase

        consoleLogSpy.mockRestore();
    });

    it('should not proceed if brain service is unavailable', async () => {
        mockedAxios.get.mockRejectedValue(new Error('Brain is down'));
        const error = new Error('test error');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        await analyzeError(error);

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Brain service at brain:5070 is not available:'), 'Brain is down');
        expect(mockedAxios.post).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    it('should call brain service with serialized error and source code', async () => {
        const error = new Error('test error');
        error.stack = 'at /app/dist/services/some-service/src/someFile.js:10:5';
        mockedFs.readFile.mockResolvedValue('1\n2\n3\n4\n5\n6\n7\n8\n9\nfunction a(){\n11\n12\n13\n14\n15');
        
        await analyzeError(error);

        expect(mockTokenManager.getToken).toHaveBeenCalledTimes(3);
        expect(mockedAxios.get).toHaveBeenCalledWith('http://brain:5070/models', expect.any(Object));
        expect(mockedAxios.post).toHaveBeenCalledTimes(2);

        // Check brain call
        const brainCall = mockedAxios.post.mock.calls[0];
        expect(brainCall[0]).toBe('http://brain:5070/chat');
        const brainPayload = brainCall[1] as any;
        expect(brainPayload.exchanges[0].content).toContain('"message": "test error"');
        expect(brainPayload.exchanges[0].content).toContain('> 10: function a(){ <-- ERROR');
        
        // Check librarian call
        const librarianCall = mockedAxios.post.mock.calls[1];
        expect(librarianCall[0]).toBe('http://librarian:5040/collections/code_recommendations/documents');
        const librarianPayload = librarianCall[1] as any;
        expect(librarianPayload.serializedError).toContain('"message": "test error"');
        expect(librarianPayload.sourceCode).toContain('> 10: function a(){ <-- ERROR');
        expect(librarianPayload.remediationGuidance).toBe('mock-remediation');
    });

    it('should handle invalid response from brain service', async () => {
        mockedAxios.post.mockResolvedValueOnce({ data: null }); // Invalid brain response
        const error = new Error('test error');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await analyzeError(error);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid response from Brain service');
        expect(result).toBeUndefined();
        consoleErrorSpy.mockRestore();
    });

    it('should handle error during librarian call', async () => {
        mockedAxios.post.mockImplementation((url) => {
            if (url.includes('librarian')) {
                return Promise.reject(new Error('Librarian down'));
            }
            return Promise.resolve({ data: { response: 'mock-remediation' } });
        });

        const error = new Error('test error');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await analyzeError(error);

        expect(result).toBe('mock-remediation'); // Should still return guidance
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error sending code suggestion to Librarian:', 'Librarian down');
        consoleErrorSpy.mockRestore();
    });

    it('should handle general analysis error gracefully', async () => {
        mockedAxios.post.mockRejectedValue(new Error('General analysis failure'));
        const error = new Error('test error');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await analyzeError(error);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Error analyzing error:', 'General analysis failure');
        expect(result).toContain('There is an error analyzing the error:');
        consoleErrorSpy.mockRestore();
    });
});