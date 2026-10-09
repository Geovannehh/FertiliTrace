import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), "");
  return {
    root: "frontend",
    publicDir: "../public",
    plugins: [react()],
    resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
    build: { outDir: "../dist-portable", emptyOutDir: true },
    server: {
      host: "0.0.0.0",
      port: 3000,
      proxy: {
        "/api/platform": {
          target: values.FERTILI_API_URL || "http://localhost:8000",
          rewrite: () => "/platform",
          headers: { Authorization: "Bearer " + (values.API_TOKEN || "") },
        },
      },
    },
  };
});
