import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/coordination/**/*.test.ts"],
    testTimeout: 30000,
  },
});
