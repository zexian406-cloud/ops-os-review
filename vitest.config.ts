import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Vitest config for Amazon Ops OS.
// - jsdom environment (DOM + IndexedDB via fake-indexeddb)
// - esbuild automatic JSX so .tsx test files compile
// - alias @ -> ./src (same as production build)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    include: ["src/__tests__/**/*.{test,spec}.{ts,tsx}"],
  },
});
