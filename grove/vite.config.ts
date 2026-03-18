import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const host = process.env.TAURI_DEV_HOST;
const target = process.env.GROVE_TARGET || "tauri";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: target === "electron" ? "./" : "/",
  clearScreen: false,
  build: {
    // Desktop bundles are expected to stay large due to xterm/monaco-class deps.
    chunkSizeWarningLimit: 950,
  },
  resolve: {
    alias: {
      "@platform": path.resolve(__dirname, `src/lib/platform/${target}.ts`),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
