import { checkPluginToPluginCompatibility, checkHostCompatibility, CompatibilityCheckResult, CompatibilityIssue, HostCompatibilityResult } from '../src/versioning/compatibilityChecker';
import { PluginDefinition, PluginParameterType } from '../src/types/Plugin';
import { compareVersions, areVersionsCompatible } from '../src/versioning/semver';

// Mock external dependencies
jest.mock('../src/versioning/semver');

// Cast mocked functions
const mockCompareVersions = compareVersions as jest.Mock;
const mockAreVersionsCompatible = areVersionsCompatible as jest.Mock;

describe('compatibilityChecker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default mocks for semver functions
        mockCompareVersions.mockImplementation((v1, v2) => {
            // Simple string comparison for default behavior
            if (v1 === v2) return 0;
            return v1 > v2 ? 1 : -1;
        });
        mockAreVersionsCompatible.mockReturnValue(true);
    });

    describe('checkPluginToPluginCompatibility', () => {
        const baseOldPlugin: PluginDefinition = {
            id: 'test-plugin',
            verb: 'TEST',
            language: 'js',
            version: '1.0.0',
            inputDefinitions: [
                { name: 'input1', type: PluginParameterType.STRING, required: true },
                { name: 'input2', type: PluginParameterType.NUMBER, required: false },
            ],
            outputDefinitions: [
                { name: 'output1', type: PluginParameterType.STRING },
            ],
            security: {
                permissions: ['fs.read', 'net.fetch'],
                sandboxOptions: { allowEval: false, allowedModules: [], allowedAPIs: [] }
            },
            repository: { type: 'local' }
        };

        it('should return compatible if no breaking changes', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, version: '1.0.1' };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(true);
            expect(result.issues).toEqual([]);
        });

        it('should flag major version change as error', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, version: '2.0.0' };
            mockAreVersionsCompatible.mockReturnValueOnce(false); // Simulate major version incompatibility
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(false);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'version', severity: 'error', message: expect.stringContaining('Major version change') })
            ]));
        });

        it('should flag older new plugin version as error', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, version: '0.9.0' };
            mockCompareVersions.mockReturnValueOnce(-1); // newPlugin is older
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(false);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'version', severity: 'error', message: expect.stringContaining('New plugin version 0.9.0 is older than existing version 1.0.0') })
            ]));
        });

        // Input Compatibility Tests
        it('should flag removed input parameter as error', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, inputDefinitions: [{ name: 'input1', type: PluginParameterType.STRING, required: true }] };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(false);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'input', severity: 'error', message: expect.stringContaining('Input parameter 'input2' has been removed') })
            ]));
        });

        it('should flag changed input type as error', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, inputDefinitions: [
                { name: 'input1', type: PluginParameterType.NUMBER, required: true }, // Changed type
                { name: 'input2', type: PluginParameterType.NUMBER, required: false },
            ] };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(false);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'input', severity: 'error', message: expect.stringContaining('Input parameter 'input1' changed type') })
            ]));
        });

        it('should flag optional input becoming required as error', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, inputDefinitions: [
                { name: 'input1', type: PluginParameterType.STRING, required: true },
                { name: 'input2', type: PluginParameterType.NUMBER, required: true }, // Changed to required
            ] };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(false);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'input', severity: 'error', message: expect.stringContaining('Input parameter 'input2' changed from optional to required') })
            ]));
        });

        it('should flag new required input as error', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, inputDefinitions: [
                ...baseOldPlugin.inputDefinitions,
                { name: 'newRequired', type: PluginParameterType.STRING, required: true },
            ] };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(false);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'input', severity: 'error', message: expect.stringContaining('New required input parameter 'newRequired' added') })
            ]));
        });

        it('should warn for new optional input', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, inputDefinitions: [
                ...baseOldPlugin.inputDefinitions,
                { name: 'newOptional', type: PluginParameterType.STRING, required: false },
            ] };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(true); // Only warning, so still compatible
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'input', severity: 'warning', message: expect.stringContaining('New optional input parameter 'newOptional' added') })
            ]));
        });

        // Output Compatibility Tests
        it('should flag removed output parameter as error', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, outputDefinitions: [] };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(false);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'output', severity: 'error', message: expect.stringContaining('Output parameter 'output1' has been removed') })
            ]));
        });

        it('should flag changed output type as error', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, outputDefinitions: [
                { name: 'output1', type: PluginParameterType.NUMBER }, // Changed type
            ] };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(false);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'output', severity: 'error', message: expect.stringContaining('Output parameter 'output1' changed type') })
            ]));
        });

        it('should warn for new output', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, outputDefinitions: [
                ...baseOldPlugin.outputDefinitions,
                { name: 'newOutput', type: PluginParameterType.BOOLEAN },
            ] };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(true);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'output', severity: 'warning', message: expect.stringContaining('New output parameter 'newOutput' added') })
            ]));
        });

        // Security Compatibility Tests
        it('should warn for new permission requested', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, security: { permissions: [...baseOldPlugin.security.permissions, 'fs.write'], sandboxOptions: baseOldPlugin.security.sandboxOptions } };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(true);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'security', severity: 'warning', message: expect.stringContaining('New permission requested: 'fs.write'') })
            ]));
        });

        it('should flag allowEval changing from false to true as error', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, security: { permissions: baseOldPlugin.security.permissions, sandboxOptions: { ...baseOldPlugin.security.sandboxOptions, allowEval: true } } };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(false);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'security', severity: 'error', message: expect.stringContaining('Plugin now requests eval permission') })
            ]));
        });

        it('should warn for new allowed module', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, security: { permissions: baseOldPlugin.security.permissions, sandboxOptions: { ...baseOldPlugin.security.sandboxOptions, allowedModules: ['new-module'] } } };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(true);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'security', severity: 'warning', message: expect.stringContaining('Plugin now requests access to module: 'new-module'') })
            ]));
        });

        it('should warn for new allowed API', () => {
            const newPlugin: PluginDefinition = { ...baseOldPlugin, security: { permissions: baseOldPlugin.security.permissions, sandboxOptions: { ...baseOldPlugin.security.sandboxOptions, allowedAPIs: ['new-api'] } } };
            const result = checkPluginToPluginCompatibility(baseOldPlugin, newPlugin);
            expect(result.compatible).toBe(true);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'security', severity: 'warning', message: expect.stringContaining('Plugin now requests access to API: 'new-api'') })
            ]));
        });
    });

    describe('checkHostCompatibility', () => {
        const basePlugin: PluginDefinition = {
            id: 'test-plugin',
            verb: 'TEST',
            language: 'js',
            version: '1.0.0',
            inputDefinitions: [],
            outputDefinitions: [],
            security: { permissions: [], sandboxOptions: {} },
            metadata: { compatibility: { minHostVersion: '1.0.0' } },
            repository: { type: 'local' }
        };

        it('should return compatible if plugin does not specify minHostVersion', () => {
            const pluginWithoutMinHost = { ...basePlugin, metadata: { compatibility: {} } };
            const result = checkHostCompatibility(pluginWithoutMinHost, { hostVersion: '1.0.0' });
            expect(result.isCompatible).toBe(true);
            expect(result.reason).toBe('Plugin does not specify a minimum host version.');
        });

        it('should return incompatible if host version not provided', () => {
            const result = checkHostCompatibility(basePlugin, {});
            expect(result.isCompatible).toBe(false);
            expect(result.reason).toBe('Host version not provided for compatibility check.');
        });

        it('should return compatible if host version meets or exceeds minHostVersion', () => {
            mockCompareVersions.mockReturnValueOnce(0); // hostVersion === minHostVersion
            const result = checkHostCompatibility(basePlugin, { hostVersion: '1.0.0' });
            expect(result.isCompatible).toBe(true);

            mockCompareVersions.mockReturnValueOnce(1); // hostVersion > minHostVersion
            const result2 = checkHostCompatibility(basePlugin, { hostVersion: '1.1.0' });
            expect(result2.isCompatible).toBe(true);
        });

        it('should return incompatible if host version is older than minHostVersion', () => {
            mockCompareVersions.mockReturnValueOnce(-1); // hostVersion < minHostVersion
            const result = checkHostCompatibility(basePlugin, { hostVersion: '0.9.0' });
            expect(result.isCompatible).toBe(false);
            expect(result.reason).toBe('Host version '0.9.0' is older than plugin's required minimum host version '1.0.0'.');
        });

        it('should return compatible with warning if host version meets requirement but areVersionsCompatible is strict', () => {
            // Simulate a scenario where host is newer, but areVersionsCompatible returns false (e.g., major version mismatch)
            mockCompareVersions.mockReturnValueOnce(1); // hostVersion > minHostVersion
            mockAreVersionsCompatible.mockReturnValueOnce(false); // But areVersionsCompatible says no

            const result = checkHostCompatibility(basePlugin, { hostVersion: '2.0.0' });
            expect(result.isCompatible).toBe(true);
            expect(result.reason).toBe('Host version meets or exceeds plugin's minimum requirement. Note: areVersionsCompatible might have stricter rules on major versions.');
        });
    });
});
