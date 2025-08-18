export default {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/**/*.example.js',
    '!src/services/examples.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000,
  transform: {},
  globals: {
    __DEV__: true
  },
  preset: null,
  forceExit: true,
  detectOpenHandles: true
};
