import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Engine/auth tests are pure Node; UI tests need a DOM. jsdom covers both.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/ui/test-setup.ts"],
  },
});
