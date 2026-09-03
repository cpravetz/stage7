module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleDirectories: ['node_modules', 'src'],
  testMatch: [
    '<rootDir>/services/brain/src/__tests__/**/*.test.ts',
    '<rootDir>/services/mcp-runtime/src/__tests__/**/*.test.ts',
    '<rootDir>/services/worker-pool/src/__tests__/**/*.test.ts',
    '<rootDir>/services/gateway/src/__tests__/**/*.test.ts',
    '<rootDir>/services/temporal/src/__tests__/**/*.test.ts',
    '<rootDir>/services/vault/src/__tests__/**/*.test.ts',
    '<rootDir>/services/artifacts/src/__tests__/**/*.test.ts',
    '<rootDir>/services/auth/src/__tests__/**/*.test.ts',
    '<rootDir>/services/agent-runtime/src/__tests__/**/*.test.ts',
    '<rootDir>/services/tool-executor/src/__tests__/**/*.test.ts',
    '<rootDir>/tests/integration/**/*.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@stage7-nextgen/shared$': '<rootDir>/shared-nextgen/src',
    '^@stage7-nextgen/artifacts$': '<rootDir>/services/artifacts/src',
    '^@stage7-nextgen/persistence$': '<rootDir>/services/artifacts/src',
    '^@stage7-nextgen/mcp-runtime$': '<rootDir>/services/mcp-runtime/src',
  },
  forceExit: true,
};
