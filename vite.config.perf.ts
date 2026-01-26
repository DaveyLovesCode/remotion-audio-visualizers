import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: "./",
  build: {
    outDir: "dist-perf",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.perf.html",
    },
  },
  server: {
    port: 3001,
  },
});
