module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',
  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',
  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  // setupFilesAfterEnv: ['./jest.setup.js'], // If you have a setup file
  moduleNameMapper: {
    // Handle module aliases (if you have them in tsconfig.json)
    '^@cktmcs/shared$': '<rootDir>/shared/src', // Or <rootDir>/shared/src/index.ts if that's the entry
    '^@cktmcs/shared/(.*)$': '<rootDir>/shared/src/$1',
    '^@cktmcs/errorhandler$': '<rootDir>/errorhandler/src', // Or <rootDir>/errorhandler/src/index.ts
    '^@cktmcs/errorhandler/(.*)$': '<rootDir>/errorhandler/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      // ts-jest configuration options
      tsconfig: 'tsconfig.json', // Or your specific tsconfig file for tests
    }],
  },
};
