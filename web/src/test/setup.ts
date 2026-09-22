import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

// Mock performance.now for deterministic monotonic testing if needed
if (!globalThis.performance) {
  (globalThis as any).performance = {
    now: () => Date.now(),
  };
}
