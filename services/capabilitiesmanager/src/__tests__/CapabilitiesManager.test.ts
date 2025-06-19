import { CapabilitiesManager } from '../CapabilitiesManager'; // Adjust path if necessary based on final structure
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as path from 'path';
import { promisify } from 'util'; // This will be mocked via spyOn
import { ConfigManager } from '../utils/configManager.js';

// Mock ConfigManager and other dependencies to simplify CM instantiation
jest.mock('../utils/configManager.js');
jest.mock('../utils/pluginRegistry.js');
jest.mock('../utils/pluginPackager.js');
jest.mock('../utils/containerManager.js');
jest.mock('../utils/pluginRepositoryManager.js');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'), // keep other shared utilities if needed
    BaseEntity: class { // Mock BaseEntity to avoid its constructor logic (like PostOffice registration)
        constructor() {
            // Mock any necessary properties or methods from BaseEntity
            // @ts-ignore
            this.registeredWithPostOffice = true; // Assume registration for tests not focusing on it
            // @ts-ignore
            this.getTokenManager = jest.fn().mockReturnValue({ getToken: jest.fn().mockResolvedValue('mock_token')});
            // @ts-ignore
            this.authenticatedApi = {
                get: jest.fn(),
                post: jest.fn(),
                delete: jest.fn(),
            };
        }
        registerWithPostOffice = jest.fn().mockResolvedValue(undefined);
        handleBaseMessage = jest.fn().mockResolvedValue(undefined);
        verifyToken = jest.fn((req,res,next)=>next());
    },
    ServiceTokenManager: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue('mock-token'),
    })),
}));


jest.mock('fs');
jest.mock('child_process');

// This will be the mock for the promisified version of exec
const execAsyncMock = jest.fn();

// Original exec in child_process is mocked here.
// The actual promisify(exec) will use this mock via the spyOn below.
// @ts-ignore (child_process.exec is not directly typed with jest.Mock)
child_process.exec = jest.fn((command, options, callback) => {
    // This mock of child_process.exec is what promisify will wrap.
    // We make execAsyncMock directly represent the behavior of the promisified version.
    // So, this internal exec mock calls execAsyncMock to simulate the promisified behavior.
    execAsyncMock(command, options)
        .then((result: { stdout: string; stderr: string; }) => {
            if (callback) {
                // @ts-ignore
                callback(null, result);
            }
        })
        .catch((error: Error) => {
            if (callback) {
                // @ts-ignore
                callback(error, { stdout: '', stderr: error.message });
            }
        });
    // This return is for the non-promisified version, not directly used by execAsync
    // but good to have for completeness if someone tried to use exec directly.
    return {} as child_process.ChildProcess;
});


describe('CapabilitiesManager.ensurePythonDependencies', () => {
    let capabilitiesManager: CapabilitiesManager;
    const pluginRootPath = '/tmp/test_plugin';
    const requirementsTxtFileName = 'requirements.txt'; // Consistent with product code
    const requirementsPath = path.join(pluginRootPath, requirementsTxtFileName);
    const venvDirName = 'venv'; // Consistent with product code
    const venvPath = path.join(pluginRootPath, venvDirName);
    const markerFileName = '.dependencies_installed'; // Consistent with product code
    const markerPath = path.join(pluginRootPath, markerFileName);
    const requirementsContent = 'requests==2.25.1\nnumpy==1.20.0';
    // Calculate hash similar to how it's done in the actual code
    const requirementsHash = require('crypto').createHash('md5').update(requirementsContent).digest('hex');

    beforeAll(() => {
        // Spy on util.promisify to ensure our execAsyncMock is used by the code under test
        // This effectively mocks `const execAsync = promisify(execCallback);`
        jest.spyOn(require('util'), 'promisify').mockImplementation((fn) => {
            if (fn === child_process.exec) {
                return execAsyncMock;
            }
            // Fallback for other uses of promisify if any
            return jest.requireActual('util').promisify(fn);
        });
    });

    beforeEach(() => {
        // Create a new instance of CapabilitiesManager before each test
        // Mocking ConfigManager.initialize to return a dummy resolved value
        (ConfigManager.initialize as jest.Mock).mockResolvedValue({
            getPluginConfig: jest.fn().mockResolvedValue([]),
            recordPluginUsage: jest.fn().mockResolvedValue(undefined),
        });
        capabilitiesManager = new CapabilitiesManager();

        // Reset mocks for each test
        jest.clearAllMocks(); // Clears call counts etc. for all mocks

        // Default mock implementations for fs
        (fs.existsSync as jest.Mock).mockImplementation((p) => {
            if (p === requirementsPath) return true; // requirements.txt exists
            if (p === venvPath) return false;      // venv directory does NOT exist initially
            if (p === markerPath) return false;      // marker file does NOT exist initially
            return false; // Default for any other path
        });
        (fs.readFileSync as jest.Mock).mockImplementation((p) => {
            if (p === requirementsPath) return requirementsContent;
            return ''; // Default for other files
        });
        (fs.writeFileSync as jest.Mock).mockClear(); // Clear previous calls

        // Default mock implementation for execAsync
        execAsyncMock.mockResolvedValue({ stdout: 'Successfully installed', stderr: '' });
    });

    afterAll(() => {
        // Restore original promisify
        jest.restoreAllMocks();
    });

    test('should create venv and install dependencies if requirements.txt exists, and venv and marker do not', async () => {
        // ensurePythonDependencies is private, so we cast to any to access it in tests
        await (capabilitiesManager as any).ensurePythonDependencies(pluginRootPath, 'test-trace-id-1');

        const venvPipPath = path.join(venvPath, 'bin', 'pip');
        const expectedCommand = `python3 -m venv "${venvPath}" && "${venvPipPath}" install -r "${requirementsPath}"`;

        expect(execAsyncMock).toHaveBeenCalledTimes(1);
        expect(execAsyncMock).toHaveBeenCalledWith(
            expectedCommand,
            { cwd: pluginRootPath, timeout: 120000 }
        );

        expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
        expect(fs.writeFileSync).toHaveBeenCalledWith(markerPath, requirementsHash);

        // Verify console logs (optional, but good for seeing flow)
        // You might need to spyOn console.log if you want to assert specific logs
    });

    test('should use existing venv to install dependencies if venv exists, but marker does not', async () => {
        // Simulate venv already exists
        (fs.existsSync as jest.Mock).mockImplementation((p) => {
            if (p === requirementsPath) return true;
            if (p === venvPath) return true; // venv directory DOES exist
            if (p === markerPath) return false;
            return false;
        });

        await (capabilitiesManager as any).ensurePythonDependencies(pluginRootPath, 'test-trace-id-2');

        const venvPipPath = path.join(venvPath, 'bin', 'pip');
        const expectedCommand = `"${venvPipPath}" install -r "${requirementsPath}"`; // No venv creation

        expect(execAsyncMock).toHaveBeenCalledTimes(1);
        expect(execAsyncMock).toHaveBeenCalledWith(
            expectedCommand,
            { cwd: pluginRootPath, timeout: 120000 }
        );
        // Should not try to create venv again
        expect(execAsyncMock.mock.calls[0][0]).not.toContain(`python3 -m venv "${venvPath}"`);

        expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
        expect(fs.writeFileSync).toHaveBeenCalledWith(markerPath, requirementsHash);
    });

    test('should skip installation if marker file is present and its hash matches requirements.txt', async () => {
        (fs.existsSync as jest.Mock).mockImplementation((p) => {
            if (p === requirementsPath) return true;
            if (p === venvPath) return true; // venv can exist or not, doesn't matter if marker is valid
            if (p === markerPath) return true; // marker file DOES exist
            return false;
        });
        // Mock readFileSync for the marker file to return the current (matching) hash
        (fs.readFileSync as jest.Mock).mockImplementation((p) => {
            if (p === requirementsPath) return requirementsContent;
            if (p === markerPath) return requirementsHash; // Hash matches
            return '';
        });

        await (capabilitiesManager as any).ensurePythonDependencies(pluginRootPath, 'test-trace-id-3');

        expect(execAsyncMock).not.toHaveBeenCalled();
        expect(fs.writeFileSync).not.toHaveBeenCalled(); // No new marker file should be written
    });

    test('should reinstall if marker file exists but hash does not match (requirements.txt changed)', async () => {
        const oldRequirementsHash = 'old-hash-value';
        (fs.existsSync as jest.Mock).mockImplementation((p) => {
            if (p === requirementsPath) return true;
            if (p === venvPath) return true; // venv exists
            if (p === markerPath) return true; // marker file exists
            return false;
        });
        (fs.readFileSync as jest.Mock).mockImplementation((p) => {
            if (p === requirementsPath) return requirementsContent; // New content
            if (p === markerPath) return oldRequirementsHash;    // Old hash
            return '';
        });

        await (capabilitiesManager as any).ensurePythonDependencies(pluginRootPath, 'test-trace-id-4');

        const venvPipPath = path.join(venvPath, 'bin', 'pip');
        // Expect re-installation using existing venv
        const expectedCommand = `"${venvPipPath}" install -r "${requirementsPath}"`;

        expect(execAsyncMock).toHaveBeenCalledTimes(1);
        expect(execAsyncMock).toHaveBeenCalledWith(
            expectedCommand,
            expect.anything()
        );
        // Marker file should be updated with the new hash
        expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
        expect(fs.writeFileSync).toHaveBeenCalledWith(markerPath, requirementsHash); // New hash
    });

    test('should skip installation if requirements.txt does not exist', async () => {
        (fs.existsSync as jest.Mock).mockImplementation((p) => {
            if (p === requirementsPath) return false; // requirements.txt does NOT exist
            return false;
        });

        await (capabilitiesManager as any).ensurePythonDependencies(pluginRootPath, 'test-trace-id-5');

        expect(execAsyncMock).not.toHaveBeenCalled();
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('should handle errors from execAsync gracefully', async () => {
        const errorMessage = 'pip install failed';
        execAsyncMock.mockRejectedValue(new Error(errorMessage));

        // Spy on console.error to check if it's called
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Venv does not exist, marker does not exist
        (fs.existsSync as jest.Mock).mockImplementation((p) => {
            if (p === requirementsPath) return true;
            if (p === venvPath) return false;
            if (p === markerPath) return false;
            return false;
        });

        await (capabilitiesManager as any).ensurePythonDependencies(pluginRootPath, 'test-trace-id-6');

        const venvPipPath = path.join(venvPath, 'bin', 'pip');
        const expectedCommand = `python3 -m venv "${venvPath}" && "${venvPipPath}" install -r "${requirementsPath}"`;

        expect(execAsyncMock).toHaveBeenCalledTimes(1);
         expect(execAsyncMock).toHaveBeenCalledWith(expectedCommand, expect.anything());

        // Check that console.error was called with a message containing the error
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(`Failed to install Python dependencies for ${pluginRootPath}: ${errorMessage}`)
        );

        // Importantly, marker file should NOT be written if installation failed
        expect(fs.writeFileSync).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
    });

});
