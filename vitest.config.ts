import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Sama "@/"-polkualias kuin tsconfig.jsonissa.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
