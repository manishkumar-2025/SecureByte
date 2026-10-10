module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  testTimeout: 30000,
  // Run serially: all suites share one PostgreSQL test database.
  // (npm script already passes --runInBand; kept here for direct `npx jest` runs.)
};
