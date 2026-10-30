import path from "node:path";
import { defineConfig } from "vite";

const web = path.resolve(import.meta.dirname);
const preview = path.resolve(web, "../../artifacts/bulk-update-preview");
export default defineConfig({
  define: { "process.env": JSON.stringify({}) },
  root: preview,
  css: { postcss: path.resolve(web, "postcss.config.js") },
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      { find: "@/services/bulk-update.service", replacement: path.resolve(preview, "sample-service.ts") },
      { find: "@", replacement: web },
      { find: "react", replacement: path.resolve(web, "node_modules/react") },
      { find: "react-dom", replacement: path.resolve(web, "node_modules/react-dom") },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: { host: "127.0.0.1", port: 3000, strictPort: true, fs: { allow: [path.resolve(web, "../..")] } },
});
