// ensureDefaultAdmin seeds a usable admin credential only when
// ADMIN_PASSWORD is set (the seed fails closed without it), and the
// integration suites exercise login through that seeded account.
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-in-production';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleDirectories: ['node_modules', 'src'],
  modulePathIgnorePatterns: ['<rootDir>/\\.kilo/.*'],
  testMatch: [
    '<rootDir>/services/brain/src/__tests__/**/*.test.ts',
    '<rootDir>/services/worker-pool/src/__tests__/**/*.test.ts',
    '<rootDir>/services/gateway/src/__tests__/**/*.test.ts',
    '<rootDir>/services/temporal/src/__tests__/**/*.test.ts',
    '<rootDir>/services/vault/src/__tests__/**/*.test.ts',
    '<rootDir>/services/artifacts/src/__tests__/**/*.test.ts',
    '<rootDir>/services/auth/src/__tests__/**/*.test.ts',
    '<rootDir>/services/agent-runtime/src/__tests__/**/*.test.ts',
    '<rootDir>/services/tool-executor/src/__tests__/**/*.test.ts',
    '<rootDir>/services/tool-executor/__tests__/**/*.test.ts',
    '<rootDir>/tests/integration/**/*.test.ts'
  ],
  // Resolve the Docker-only `mongo` service name to a locally reachable Mongo
  // when one is available, so integration suites run without compose.
  globalSetup: '<rootDir>/tests/setup.ts',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@stage7-nextgen/shared$': '<rootDir>/shared-nextgen/src',
    '^@stage7-nextgen/artifacts$': '<rootDir>/services/artifacts/src',
    '^@stage7-nextgen/persistence$': '<rootDir>/services/artifacts/src',
  },
  forceExit: true,
};
