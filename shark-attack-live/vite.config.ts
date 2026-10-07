import { defineConfig } from "vitest/config";

export default defineConfig({
  // Caminhos relativos: o build em dist/ funciona servido de qualquer pasta.
  base: "./",
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
