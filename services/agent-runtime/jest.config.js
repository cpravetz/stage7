module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@stage7-nextgen/shared$': '<rootDir>/../../shared-nextgen/src',
    '^@stage7-nextgen/shared/(.*)$': '<rootDir>/../../shared-nextgen/src/$1',
  },
}
