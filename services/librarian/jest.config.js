module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  testMatch: [
    '<rootDir>/__tests__/**/*.test.ts',
  ],
  modulePaths: [
    '<rootDir>/src',
  ],
  moduleNameMapper: {
    '^@cktmcs/shared$': '<rootDir>/../../shared/src',
    '^@cktmcs/shared/(.*)$': '<rootDir>/../../shared/src/index',
    '^@cktmcs/errorhandler$': '<rootDir>/../../errorhandler/src',
    '^@cktmcs/errorhandler/(.*)$': '<rootDir>/../../errorhandler/src/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
};
