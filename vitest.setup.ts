// Vitest setup — runs before every test file.
// fake-indexeddb/auto provides a browser-compatible IndexedDB so Dexie
// (the app's storage layer) works inside jsdom.
import "fake-indexeddb/auto";
import "@testing-library/jest-dom";
