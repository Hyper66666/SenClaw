import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { resolveGatewayProxyTarget } from "./src/dev-proxy";

const gatewayProxyTarget = resolveGatewayProxyTarget();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: gatewayProxyTarget,
        changeOrigin: true,
      },
      "/health": {
        target: gatewayProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
