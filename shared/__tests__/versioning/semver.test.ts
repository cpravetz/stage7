import { parseVersion, compareVersions, satisfiesRange, areVersionsCompatible, getNextVersion } from '../src/versioning/semver';

describe('semver', () => {
    describe('parseVersion', () => {
        it('should parse a standard version string', () => {
            const parsed = parseVersion('1.2.3');
            expect(parsed).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined, build: undefined });
        });

        it('should parse a version with prerelease', () => {
            const parsed = parseVersion('1.2.3-alpha.1');
            expect(parsed).toEqual({ major: 1, minor: 2, patch: 3, prerelease: 'alpha.1', build: undefined });
        });

        it('should parse a version with build metadata', () => {
            const parsed = parseVersion('1.2.3+build.456');
            expect(parsed).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined, build: 'build.456' });
        });

        it('should parse a version with prerelease and build metadata', () => {
            const parsed = parseVersion('1.2.3-beta.2+exp.sha.5114f85');
            expect(parsed).toEqual({ major: 1, minor: 2, patch: 3, prerelease: 'beta.2', build: 'exp.sha.5114f85' });
        });

        it('should return null for invalid version format', () => {
            expect(parseVersion('1.2')).toBeNull();
            expect(parseVersion('1.2.3.4')).toBeNull();
            expect(parseVersion('abc')).toBeNull();
        });
    });

    describe('compareVersions', () => {
        it('should return 0 for equal versions', () => {
            expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
            expect(compareVersions('1.2.3-alpha', '1.2.3-beta')).toBe(0); // Prerelease ignored
        });

        it('should return 1 if version1 is greater than version2', () => {
            expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
            expect(compareVersions('1.3.0', '1.2.3')).toBe(1);
            expect(compareVersions('2.0.0', '1.2.3')).toBe(1);
        });

        it('should return -1 if version1 is less than version2', () => {
            expect(compareVersions('1.2.2', '1.2.3')).toBe(-1);
            expect(compareVersions('1.1.0', '1.2.3')).toBe(-1);
            expect(compareVersions('0.9.0', '1.2.3')).toBe(-1);
        });

        it('should throw error for invalid version format', () => {
            expect(() => compareVersions('1.2', '1.2.3')).toThrow('Invalid version format');
            expect(() => compareVersions('1.2.3', 'abc')).toThrow('Invalid version format');
        });
    });

    describe('satisfiesRange', () => {
        // Exact match
        it('should satisfy exact version', () => {
            expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
            expect(satisfiesRange('1.2.4', '1.2.3')).toBe(false);
        });

        // Caret ranges (^) 
        it('should satisfy caret range for same major', () => {
            expect(satisfiesRange('1.2.3', '^1.0.0')).toBe(true);
            expect(satisfiesRange('1.5.0', '^1.2.3')).toBe(true);
            expect(satisfiesRange('2.0.0', '^1.0.0')).toBe(false);
        });

        it('should satisfy caret range for 0.x.y (same minor)', () => {
            expect(satisfiesRange('0.2.3', '^0.2.0')).toBe(true);
            expect(satisfiesRange('0.2.5', '^0.2.3')).toBe(true);
            expect(satisfiesRange('0.3.0', '^0.2.0')).toBe(false);
        });

        it('should not satisfy caret range for older patch', () => {
            expect(satisfiesRange('1.0.0', '^1.2.3')).toBe(false);
        });

        // Tilde ranges (~)
        it('should satisfy tilde range for same major and minor', () => {
            expect(satisfiesRange('1.2.3', '~1.2.0')).toBe(true);
            expect(satisfiesRange('1.2.5', '~1.2.3')).toBe(true);
            expect(satisfiesRange('1.3.0', '~1.2.0')).toBe(false);
        });

        it('should not satisfy tilde range for older patch', () => {
            expect(satisfiesRange('1.2.0', '~1.2.3')).toBe(false);
        });

        // Comparison operators
        it('should satisfy >= operator', () => {
            expect(satisfiesRange('1.2.3', '>=1.2.3')).toBe(true);
            expect(satisfiesRange('1.2.4', '>=1.2.3')).toBe(true);
            expect(satisfiesRange('1.2.2', '>=1.2.3')).toBe(false);
        });

        it('should satisfy > operator', () => {
            expect(satisfiesRange('1.2.4', '>1.2.3')).toBe(true);
            expect(satisfiesRange('1.2.3', '>1.2.3')).toBe(false);
        });

        it('should satisfy <= operator', () => {
            expect(satisfiesRange('1.2.3', '<='1.2.3')).toBe(true);
            expect(satisfiesRange('1.2.2', '<='1.2.3')).toBe(true);
            expect(satisfiesRange('1.2.4', '<='1.2.3')).toBe(false);
        });

        it('should satisfy < operator', () => {
            expect(satisfiesRange('1.2.2', '<1.2.3')).toBe(true);
            expect(satisfiesRange('1.2.3', '<1.2.3')).toBe(false);
        });

        it('should satisfy = operator', () => {
            expect(satisfiesRange('1.2.3', '=1.2.3')).toBe(true);
            expect(satisfiesRange('1.2.4', '=1.2.3')).toBe(false);
        });

        it('should return false for invalid version or range', () => {
            expect(satisfiesRange('1.2', '^1.0.0')).toBe(false);
            expect(satisfiesRange('1.2.3', 'invalid-range')).toBe(false);
        });
    });

    describe('areVersionsCompatible', () => {
        it('should return true for compatible versions (same major)', () => {
            expect(areVersionsCompatible('1.2.3', '1.5.0')).toBe(true);
            expect(areVersionsCompatible('1.0.0', '1.99.99')).toBe(true);
        });

        it('should return false for incompatible versions (different major)', () => {
            expect(areVersionsCompatible('1.2.3', '2.0.0')).toBe(false);
        });

        it('should return true for compatible 0.x.y versions (same major and minor)', () => {
            expect(areVersionsCompatible('0.2.3', '0.2.5')).toBe(true);
        });

        it('should return false for incompatible 0.x.y versions (different minor)', () => {
            expect(areVersionsCompatible('0.2.3', '0.3.0')).toBe(false);
        });

        it('should return false for invalid version format', () => {
            expect(areVersionsCompatible('1.2', '1.2.3')).toBe(false);
            expect(areVersionsCompatible('1.2.3', 'abc')).toBe(false);
        });
    });

    describe('getNextVersion', () => {
        it('should increment major version', () => {
            expect(getNextVersion('1.2.3', 'major')).toBe('2.0.0');
            expect(getNextVersion('0.9.9', 'major')).toBe('1.0.0');
        });

        it('should increment minor version', () => {
            expect(getNextVersion('1.2.3', 'minor')).toBe('1.3.0');
            expect(getNextVersion('1.9.9', 'minor')).toBe('1.10.0');
        });

        it('should increment patch version', () => {
            expect(getNextVersion('1.2.3', 'patch')).toBe('1.2.4');
            expect(getNextVersion('1.2.9', 'patch')).toBe('1.2.10');
        });

        it('should throw error for invalid version format', () => {
            expect(() => getNextVersion('1.2', 'major')).toThrow('Invalid version format');
        });

        it('should throw error for invalid update type', () => {
            expect(() => getNextVersion('1.2.3', 'invalid' as any)).toThrow('Invalid update type');
        });
    });
});
