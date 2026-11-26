import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
if (!/^\d{4}-\d{2}-\d{2}$/.test(pkg.releaseDate ?? "")) {
  throw new Error("Defina releaseDate no package.json antes de compilar.");
}
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_RELEASE__: JSON.stringify({
      version: pkg.version,
      updatedAt: pkg.releaseDate,
    }),
  },
  build: { outDir: "dist/client" },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
