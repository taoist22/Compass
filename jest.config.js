module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(sn-plugin-lib|@react-native|react-native)/)',
  ],
  collectCoverageFrom: [
    'src/domain/**/*.{ts,tsx}',
    'src/storage/**/*.{ts,tsx}',
    'src/supernote/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
