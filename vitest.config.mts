import { defineConfig } from "vitest/config";

/**
 * Node environment on purpose: these specs exercise the decision logic against a stubbed
 * `Xrm` global. Anything that needs a real client goes through the manual test matrix.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
