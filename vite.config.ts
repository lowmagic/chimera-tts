import { defineConfig } from "vite";

export default defineConfig({
  // relative asset URLs, so the build works at a domain root or under a subpath
  base: "./",
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: true },
  server: { host: "127.0.0.1", port: 5327, strictPort: true },
  preview: { host: "127.0.0.1", port: 5328, strictPort: true },
});
