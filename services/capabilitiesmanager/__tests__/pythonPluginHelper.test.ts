import { ensurePythonDependencies, validatePythonOutput } from '../src/utils/pythonPluginHelper';
import * as path from 'path';
import * as fs from 'fs';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { PluginDefinition, PluginOutput, PluginParameterType } from '@cktmcs/shared';
import { generateStructuredError, GlobalErrorCodes, ErrorSeverity } from '../src/utils/errorReporter';

// Mock external dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('child_process');
jest.mock('crypto');
jest.mock('../src/utils/errorReporter', () => ({
    generateStructuredError: jest.fn((error) => new Error(error.message)),
    GlobalErrorCodes: jest.requireActual('../src/utils/errorReporter').GlobalErrorCodes,
    ErrorSeverity: jest.requireActual('../src/utils/errorReporter').ErrorSeverity,
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockExec = execCallback as jest.MockedFunction<typeof execCallback>;
const mockExecAsync = promisify(mockExec) as jest.MockedFunction<typeof promisify(typeof execCallback)>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;
const mockGenerateStructuredError = generateStructuredError as jest.Mock;

describe('pythonPluginHelper', () => {
    const MOCK_PLUGIN_ROOT_PATH = '/mock/plugin';
    const MOCK_TRACE_ID = 'test-trace-id';
    const MOCK_VENV_PATH = '/mock/plugin/venv';
    const MOCK_REQUIREMENTS_PATH = '/mock/plugin/requirements.txt';
    const MOCK_MARKER_PATH = '/mock/plugin/.dependencies_installed';

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mocks for fs
        mockFs.existsSync.mockReturnValue(false); // Default: no files/dirs exist
        mockFs.readFileSync.mockReturnValue('');
        mockFs.writeFileSync.mockReturnValue(undefined);
        mockFs.rmSync.mockReturnValue(undefined);

        // Default mocks for path
        mockPath.join.mockImplementation((...args) => args.join('/'));

        // Default mocks for child_process.exec
        mockExec.mockImplementation((command, options, callback) => {
            if (command.includes('--version')) {
                callback(null, 'Python 3.8.5', '');
            } else {
                callback(null, '', '');
            }
        });
        mockExecAsync.mockResolvedValue({ stdout: '', stderr: '', code: 0 });

        // Default mocks for crypto
        const mockHash = { update: jest.fn().mockReturnThis(), digest: jest.fn().mockReturnValue('mock-hash') };
        mockCrypto.createHash.mockReturnValue(mockHash as any);

        // Mock process.platform
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            writable: true,
        });

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('ensurePythonDependencies', () => {
        it('should create venv and install dependencies if requirements.txt exists and no venv', async () => {
            mockFs.existsSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH);
            mockFs.readFileSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH ? 'requests\nflask' : '');
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // venv creation
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // pip upgrade
            mockExecAsync.mockResolvedValueOnce({ stdout: 'Successfully installed', stderr: '', code: 0 }); // install reqs

            await ensurePythonDependencies(MOCK_PLUGIN_ROOT_PATH, MOCK_TRACE_ID);

            expect(mockExecAsync).toHaveBeenCalledWith('python3 -m venv /mock/plugin/venv', expect.any(Object));
            expect(mockExecAsync).toHaveBeenCalledWith('/mock/plugin/venv/bin/pip install --upgrade pip', expect.any(Object));
            expect(mockExecAsync).toHaveBeenCalledWith('/mock/plugin/venv/bin/pip install -r /mock/plugin/requirements.txt', expect.any(Object));
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(MOCK_MARKER_PATH, 'mock-hash');
        });

        it('should not recreate venv if healthy and requirements are unchanged', async () => {
            mockFs.existsSync.mockImplementation((p) => p === MOCK_VENV_PATH || p === '/mock/plugin/venv/bin/python' || p === MOCK_REQUIREMENTS_PATH || p === MOCK_MARKER_PATH);
            mockFs.readFileSync.mockImplementation((p) => {
                if (p === MOCK_REQUIREMENTS_PATH) return 'requests';
                if (p === MOCK_MARKER_PATH) return 'mock-hash';
                return '';
            });

            await ensurePythonDependencies(MOCK_PLUGIN_ROOT_PATH, MOCK_TRACE_ID);

            expect(mockExecAsync).not.toHaveBeenCalledWith(expect.stringContaining('venv'));
            expect(mockExecAsync).not.toHaveBeenCalledWith(expect.stringContaining('pip'));
        });

        it('should recreate venv if requirements.txt has changed', async () => {
            mockFs.existsSync.mockImplementation((p) => p === MOCK_VENV_PATH || p === '/mock/plugin/venv/bin/python' || p === MOCK_REQUIREMENTS_PATH || p === MOCK_MARKER_PATH);
            mockFs.readFileSync.mockImplementation((p) => {
                if (p === MOCK_REQUIREMENTS_PATH) return 'requests==2.0';
                if (p === MOCK_MARKER_PATH) return 'old-hash';
                return '';
            });
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // venv creation
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // pip upgrade
            mockExecAsync.mockResolvedValueOnce({ stdout: 'Successfully installed', stderr: '', code: 0 }); // install reqs

            await ensurePythonDependencies(MOCK_PLUGIN_ROOT_PATH, MOCK_TRACE_ID);

            expect(mockFs.rmSync).toHaveBeenCalledWith(MOCK_VENV_PATH, { recursive: true, force: true });
            expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('venv'), expect.any(Object));
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(MOCK_MARKER_PATH, 'mock-hash');
        });

        it('should recreate venv if existing venv is broken', async () => {
            mockFs.existsSync.mockImplementation((p) => p === MOCK_VENV_PATH || p === MOCK_REQUIREMENTS_PATH);
            mockFs.existsSync.mockImplementationOnce((p) => p === MOCK_VENV_PATH); // venv exists
            mockFs.existsSync.mockImplementationOnce((p) => p === MOCK_VENV_PATH); // venv exists
            mockFs.existsSync.mockImplementationOnce((p) => p === '/mock/plugin/venv/bin/python' ? false : true); // venv python does not exist

            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // venv creation
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // pip upgrade
            mockExecAsync.mockResolvedValueOnce({ stdout: 'Successfully installed', stderr: '', code: 0 }); // install reqs

            await ensurePythonDependencies(MOCK_PLUGIN_ROOT_PATH, MOCK_TRACE_ID);

            expect(mockFs.rmSync).toHaveBeenCalledWith(MOCK_VENV_PATH, { recursive: true, force: true });
            expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('venv'), expect.any(Object));
        });

        it('should handle ENOTEMPTY error by retrying venv deletion and re-running', async () => {
            mockFs.existsSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH);
            mockFs.readFileSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH ? 'requests' : '');

            // Simulate initial failure with ENOTEMPTY
            mockExecAsync.mockRejectedValueOnce(Object.assign(new Error('ENOTEMPTY error'), { stderr: 'ENOTEMPTY' }));

            // Simulate successful retry of venv deletion
            mockFs.rmSync.mockImplementationOnce(() => { throw new Error('First rmSync fail'); });
            mockFs.rmSync.mockImplementationOnce(() => { /* success on second try */ });

            // Simulate successful subsequent operations
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // venv creation
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // pip upgrade
            mockExecAsync.mockResolvedValueOnce({ stdout: 'Successfully installed', stderr: '', code: 0 }); // install reqs

            await ensurePythonDependencies(MOCK_PLUGIN_ROOT_PATH, MOCK_TRACE_ID);

            expect(mockFs.rmSync).toHaveBeenCalledTimes(2); // Initial fail + retry success
            expect(mockExecAsync).toHaveBeenCalledTimes(4); // Initial fail + 3 successful retries
            expect(mockGenerateStructuredError).not.toHaveBeenCalled(); // Should not generate error if retry succeeds
        });

        it('should throw structured error if dependency installation fails after retries', async () => {
            mockFs.existsSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH);
            mockFs.readFileSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH ? 'requests' : '');

            // Simulate persistent ENOTEMPTY error
            mockExecAsync.mockRejectedValue(Object.assign(new Error('ENOTEMPTY error'), { stderr: 'ENOTEMPTY' }));
            mockFs.rmSync.mockImplementation(() => { throw new Error('Persistent rmSync fail'); });

            await expect(ensurePythonDependencies(MOCK_PLUGIN_ROOT_PATH, MOCK_TRACE_ID)).rejects.toThrow('Failed to install Python dependencies for /mock/plugin even after retry: Persistent rmSync fail');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
                severity: ErrorSeverity.CRITICAL,
                message: expect.stringContaining('Failed to install Python dependencies for /mock/plugin even after retry'),
            }));
        });

        it('should throw structured error for other installation failures', async () => {
            mockFs.existsSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH);
            mockFs.readFileSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH ? 'requests' : '');
            mockExecAsync.mockRejectedValueOnce(new Error('Generic install error'));

            await expect(ensurePythonDependencies(MOCK_PLUGIN_ROOT_PATH, MOCK_TRACE_ID)).rejects.toThrow('Failed to install Python dependencies for /mock/plugin: Generic install error');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
                severity: ErrorSeverity.CRITICAL,
                message: expect.stringContaining('Failed to install Python dependencies for /mock/plugin'),
            }));
        });

        it('should use python.exe on Windows', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
            });
            mockFs.existsSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH);
            mockFs.readFileSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH ? 'requests' : '');
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // venv creation
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // pip upgrade
            mockExecAsync.mockResolvedValueOnce({ stdout: 'Successfully installed', stderr: '', code: 0 }); // install reqs

            await ensurePythonDependencies(MOCK_PLUGIN_ROOT_PATH, MOCK_TRACE_ID);

            expect(mockExecAsync).toHaveBeenCalledWith('python -m venv /mock/plugin/venv', expect.any(Object));
            expect(mockExecAsync).toHaveBeenCalledWith('/mock/plugin/venv/Scripts/pip install --upgrade pip', expect.any(Object));
        });

        it('should handle pip not found and try ensurepip', async () => {
            mockFs.existsSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH || p === MOCK_VENV_PATH || p === '/mock/plugin/venv/bin/python');
            mockFs.existsSync.mockImplementationOnce((p) => p === MOCK_REQUIREMENTS_PATH); // requirements.txt
            mockFs.existsSync.mockImplementationOnce((p) => p === MOCK_VENV_PATH); // venv exists
            mockFs.existsSync.mockImplementationOnce((p) => p === '/mock/plugin/venv/bin/python'); // venv python exists
            mockFs.existsSync.mockImplementationOnce((p) => p === '/mock/plugin/venv/bin/pip' ? false : true); // venv pip does not exist

            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // venv creation
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // ensurepip
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // pip upgrade after ensurepip
            mockExecAsync.mockResolvedValueOnce({ stdout: 'Successfully installed', stderr: '', code: 0 }); // install reqs

            await ensurePythonDependencies(MOCK_PLUGIN_ROOT_PATH, MOCK_TRACE_ID);

            expect(mockExecAsync).toHaveBeenCalledWith('/mock/plugin/venv/bin/python -m ensurepip --upgrade', expect.any(Object));
            expect(mockExecAsync).toHaveBeenCalledWith('/mock/plugin/venv/bin/pip install --upgrade pip', expect.any(Object));
        });

        it('should handle ensurepip failure and try get-pip.py', async () => {
            mockFs.existsSync.mockImplementation((p) => p === MOCK_REQUIREMENTS_PATH || p === MOCK_VENV_PATH || p === '/mock/plugin/venv/bin/python');
            mockFs.existsSync.mockImplementationOnce((p) => p === MOCK_REQUIREMENTS_PATH); // requirements.txt
            mockFs.existsSync.mockImplementationOnce((p) => p === MOCK_VENV_PATH); // venv exists
            mockFs.existsSync.mockImplementationOnce((p) => p === '/mock/plugin/venv/bin/python'); // venv python exists
            mockFs.existsSync.mockImplementationOnce((p) => p === '/mock/plugin/venv/bin/pip' ? false : true); // venv pip does not exist

            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // venv creation
            mockExecAsync.mockRejectedValueOnce(new Error('ensurepip failed')); // ensurepip fails
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // get-pip.py
            mockExecAsync.mockResolvedValueOnce({ stdout: 'Successfully installed', stderr: '', code: 0 }); // install reqs

            await ensurePythonDependencies(MOCK_PLUGIN_ROOT_PATH, MOCK_TRACE_ID);

            expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('curl https://bootstrap.pypa.io/get-pip.py'), expect.any(Object));
        });
    });

    describe('validatePythonOutput', () => {
        const mockPluginDefinition: PluginDefinition = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'python',
            entryPoint: { main: 'main.py' },
            inputDefinitions: [],
            outputDefinitions: [],
            repository: { type: 'local' }
        };

        it('should validate and return valid PluginOutput array', () => {
            const stdout = JSON.stringify([
                { success: true, name: 'output1', resultType: PluginParameterType.STRING, result: 'hello', resultDescription: 'desc' },
                { success: false, name: 'output2', resultType: PluginParameterType.ERROR, result: null, resultDescription: 'error', error: 'err' },
            ]);
            const result = validatePythonOutput(stdout, mockPluginDefinition, MOCK_TRACE_ID);
            expect(result).toEqual(JSON.parse(stdout));
        });

        it('should return error PluginOutput if stdout is not valid JSON', () => {
            const stdout = 'invalid json';
            const result = validatePythonOutput(stdout, mockPluginDefinition, MOCK_TRACE_ID);
            expect(result[0].success).toBe(false);
            expect(result[0].name).toBe('validation_error');
            expect(result[0].resultType).toBe(PluginParameterType.ERROR);
            expect(result[0].resultDescription).toContain('Invalid plugin output format');
        });

        it('should return error PluginOutput if stdout is not an array', () => {
            const stdout = JSON.stringify({ key: 'value' });
            const result = validatePythonOutput(stdout, mockPluginDefinition, MOCK_TRACE_ID);
            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Plugin output must be an array');
        });

        it('should return error PluginOutput if array elements are not objects', () => {
            const stdout = JSON.stringify(['string', 123]);
            const result = validatePythonOutput(stdout, mockPluginDefinition, MOCK_TRACE_ID);
            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Each output must be an object');
        });

        it('should return error PluginOutput if required fields are missing', () => {
            const stdout = JSON.stringify([
                { success: true, name: 'output1' }, // Missing resultType, result, resultDescription
            ]);
            const result = validatePythonOutput(stdout, mockPluginDefinition, MOCK_TRACE_ID);
            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Missing required field: resultType');
        });
    });
});
