/**
 * Semantic versioning utilities for plugins
 */

/**
 * Parse a semantic version string into its components
 * @param version Version string in format "major.minor.patch[-prerelease][+build]"
 * @returns Parsed version object or null if invalid
 */
export function parseVersion(version: string): { 
  major: number; 
  minor: number; 
  patch: number; 
  prerelease?: string; 
  build?: string 
} | null {
  // Regular expression for semantic versioning
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  
  const match = version.match(semverRegex);
  if (!match) {
    return null;
  }
  
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5]
  };
}

/**
 * Compare two semantic version strings
 * @param version1 First version string
 * @param version2 Second version string
 * @returns -1 if version1 < version2, 0 if version1 == version2, 1 if version1 > version2
 */
export function compareVersions(version1: string, version2: string): number {
  const v1 = parseVersion(version1);
  const v2 = parseVersion(version2);
  
  if (!v1 || !v2) {
    throw new Error('Invalid version format');
  }
  
  // Compare major version
  if (v1.major !== v2.major) {
    return v1.major > v2.major ? 1 : -1;
  }
  
  // Compare minor version
  if (v1.minor !== v2.minor) {
    return v1.minor > v2.minor ? 1 : -1;
  }
  
  // Compare patch version
  if (v1.patch !== v2.patch) {
    return v1.patch > v2.patch ? 1 : -1;
  }
  
  // If we get here, the versions are equal (ignoring prerelease and build)
  return 0;
}

/**
 * Check if a version satisfies a version range
 * @param version Version to check
 * @param range Version range (e.g., ">=1.2.3", "^1.2.3", "~1.2.3")
 * @returns True if the version satisfies the range
 */
export function satisfiesRange(version: string, range: string): boolean {
  const parsedVersion = parseVersion(version);
  if (!parsedVersion) {
    return false;
  }
  
  // Handle caret ranges (^) - compatible with same major version
  if (range.startsWith('^')) {
    const minVersion = parseVersion(range.substring(1));
    if (!minVersion) {
      return false;
    }
    
    // Major version must match exactly
    if (parsedVersion.major !== minVersion.major) {
      return false;
    }
    
    // If major is 0, minor must match exactly (breaking changes allowed in 0.x)
    if (minVersion.major === 0 && parsedVersion.minor !== minVersion.minor) {
      return false;
    }
    
    // For major > 0, minor and patch can be greater or equal
    if (parsedVersion.minor < minVersion.minor) {
      return false;
    }
    
    if (parsedVersion.minor === minVersion.minor && parsedVersion.patch < minVersion.patch) {
      return false;
    }
    
    return true;
  }
  
  // Handle tilde ranges (~) - compatible with same minor version
  if (range.startsWith('~')) {
    const minVersion = parseVersion(range.substring(1));
    if (!minVersion) {
      return false;
    }
    
    // Major version must match exactly
    if (parsedVersion.major !== minVersion.major) {
      return false;
    }
    
    // Minor version must match exactly
    if (parsedVersion.minor !== minVersion.minor) {
      return false;
    }
    
    // Patch can be greater or equal
    if (parsedVersion.patch < minVersion.patch) {
      return false;
    }
    
    return true;
  }
  
  // Handle exact version match
  if (!range.startsWith('>') && !range.startsWith('<') && !range.startsWith('=')) {
    return compareVersions(version, range) === 0;
  }
  
  // Handle comparison operators
  if (range.startsWith('>=')) {
    return compareVersions(version, range.substring(2)) >= 0;
  }
  
  if (range.startsWith('>')) {
    return compareVersions(version, range.substring(1)) > 0;
  }
  
  if (range.startsWith('<=')) {
    return compareVersions(version, range.substring(2)) <= 0;
  }
  
  if (range.startsWith('<')) {
    return compareVersions(version, range.substring(1)) < 0;
  }
  
  if (range.startsWith('=')) {
    return compareVersions(version, range.substring(1)) === 0;
  }
  
  return false;
}

/**
 * Check if two versions are compatible
 * @param version1 First version
 * @param version2 Second version
 * @returns True if the versions are compatible
 */
export function areVersionsCompatible(version1: string, version2: string): boolean {
  const v1 = parseVersion(version1);
  const v2 = parseVersion(version2);
  
  if (!v1 || !v2) {
    return false;
  }
  
  // Major version must match for compatibility
  if (v1.major !== v2.major) {
    return false;
  }
  
  // If major version is 0, minor version must match too (0.x.y is unstable)
  if (v1.major === 0 && v1.minor !== v2.minor) {
    return false;
  }
  
  return true;
}

/**
 * Get the next version based on the update type
 * @param currentVersion Current version
 * @param updateType Type of update (major, minor, patch)
 * @returns Next version
 */
export function getNextVersion(currentVersion: string, updateType: 'major' | 'minor' | 'patch'): string {
  const version = parseVersion(currentVersion);
  if (!version) {
    throw new Error('Invalid version format');
  }
  
  switch (updateType) {
    case 'major':
      return `${version.major + 1}.0.0`;
    case 'minor':
      return `${version.major}.${version.minor + 1}.0`;
    case 'patch':
      return `${version.major}.${version.minor}.${version.patch + 1}`;
    default:
      throw new Error('Invalid update type');
  }
}
