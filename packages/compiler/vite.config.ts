import { chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "unplugin-dts/vite";
import packageJson from "./package.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [
    dts({
      tsconfigPath: "tsconfig.app.json",
      entryRoot: "src",
      include: ["src"],
    }),
    {
      name: "executable-bin",
      closeBundle() {
        chmodSync(resolve(__dirname, "dist/bin/tempblot.js"), 0o755);
      },
    },
  ],
  resolve: {
    alias: {
      tempblot: resolve(__dirname, "src/index.ts"),
    },
  },
  build: {
    lib: {
      name: "Tempblot",
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "bin/tempblot": resolve(__dirname, "bin/tempblot.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^node:/, "typescript"],
    },
  },
  test: {
    name: packageJson.name,
    dir: "./tests",
    watch: false,
  },
  define: {
    "import.meta.vitest": mode !== "production",
  },
}));
