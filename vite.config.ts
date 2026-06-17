import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Engine/auth tests are pure Node; UI tests need a DOM. jsdom covers both.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/ui/test-setup.ts"],
    // The StrengthVerdict Monte-Carlo runs synchronously and, under jsdom +
    // StrictMode double-render, the full builder-walk test can exceed the 5s
    // default. Give the UI suite headroom so it's reliable, not flaky.
    testTimeout: 30000,
  },
});
