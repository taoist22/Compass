// AsyncStorage is a native module, so every suite that reaches calendarStorage —
// directly or transitively — needs the mock. Registering it globally avoids
// per-file jest.mock() calls in suites that never touch storage themselves.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
