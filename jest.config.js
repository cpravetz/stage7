module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleDirectories: ['node_modules', 'src'],
  testMatch: [
    '<rootDir>/services/engineer/__tests__/**/*.test.ts',
    '<rootDir>/marketplace/__tests__/**/*.test.ts'
  ],
  modulePaths: [
    '<rootDir>',
    '<rootDir>/marketplace/src'
  ],
  moduleNameMapper: {
    '^@cktmcs/shared$': '<rootDir>/shared/src',
    '^@cktmcs/sdk$': '<rootDir>/sdk/src',
    '^@cktmcs/errorhandler$': '<rootDir>/errorhandler/src',
    '^@cktmcs/marketplace/(.*)$': '<rootDir>/marketplace/src/$1',
    '^../src/(.*)$': '<rootDir>/marketplace/src/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },
};