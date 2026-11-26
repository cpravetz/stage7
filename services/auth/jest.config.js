// ensureDefaultAdmin seeds a usable admin credential only when
// ADMIN_PASSWORD is set (the seed fails closed without it), and several
// tests exercise login through that seeded account.
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-in-production';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@stage7-nextgen/shared$': '<rootDir>/../../shared-nextgen/src',
  },
};
