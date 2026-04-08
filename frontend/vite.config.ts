import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://192.168.106.56:3008",
      "/v1": "http://192.168.106.56:3008",
      "/ws": {
        target: "ws://localhost:3008",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});

