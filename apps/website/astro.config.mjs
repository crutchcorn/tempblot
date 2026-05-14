// @ts-check
import { defineConfig } from "astro/config";
import AutoImport from "astro-auto-import";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { bundledLanguages } from "shiki/langs";
import tempblotGrammar from "../../packages/vscode/syntaxes/tempblot.tmLanguage.json" with { type: "json" };

const tempblotShikiGrammar = {
  ...tempblotGrammar,
  name: "blot",
  displayName: "Tempblot",
  scopeName: "source.tempblot",
  aliases: ["tempblot"],
  embeddedLangs: [
    "html",
    "markdown",
    "css",
    "scss",
    "less",
    "javascript",
    "typescript",
    "jsx",
    "tsx",
    "json",
    "jsonc",
    "yaml",
  ],
};
const tempblotEmbeddedLangs = [
  "html",
  "markdown",
  "css",
  "scss",
  "less",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "json",
  "jsonc",
  "yaml",
];
const tempblotEmbeddedShikiGrammars = tempblotEmbeddedLangs.map(
  (lang) => bundledLanguages[lang],
);

// https://astro.build/config
export default defineConfig({
  vite: {
    resolve: {
      alias: {
        "@tempblot/language-service": new URL(
          "../../packages/language-service/src/index.ts",
          import.meta.url,
        ).pathname,
        "@tempblot/parser": new URL(
          "../../packages/parser/src/index.ts",
          import.meta.url,
        ).pathname,
      },
    },
  },
  integrations: [
    react(),
    starlight({
      title: "Tempblot",
      customCss: ["./src/styles/theme.css"],
      expressiveCode: {
        shiki: {
          langs: [...tempblotEmbeddedShikiGrammars, tempblotShikiGrammar],
        },
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/crutchcorn/tempblot",
        },
      ],
      sidebar: [
        { label: "Playground", slug: "playground" },
        {
          label: "Guides",
          items: [
            { label: "Basic Usage", slug: "guides/basic-usage" },
            { label: "Project Layout", slug: "guides/project-layout" },
          ],
        },
      ],
    }),
    AutoImport({
      imports: [{ [import.meta.resolve("@astrojs/starlight/components")]: ["FileTree"] }],
    }),
  ],
});
