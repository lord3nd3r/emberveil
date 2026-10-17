import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5173, strictPort: true, proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: false } } },
  build: { sourcemap: false, target: "es2022", chunkSizeWarningLimit: 1200, rollupOptions: { output: { manualChunks: (id: string) => (id.includes("node_modules/phaser") ? "phaser" : undefined) } } },
  preview: { port: 4173, strictPort: true },
});
