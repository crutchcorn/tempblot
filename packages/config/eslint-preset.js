import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const tempblotTSRules = {
  "@typescript-eslint/no-empty-function": "off",
  "@typescript-eslint/no-unused-vars": [
    "warn", // or "error"
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
};

const tempblotJSRules = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          regex: "^\.\.?\/.*\.js$",
          message:
            "importing `.js` files is not supported by Node's built-in TypeScript support. Use `.ts` instead.",
        },
        {
          regex: "^\\./(?!.*\\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$)",
          message:
            'Relative imports must include the file extension. For example, use `import foo from "./foo.ts"` instead of `import foo from "./foo"`.',
        },
      ],
    },
  ],
};

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    rules: {
      ...tempblotTSRules,
      ...tempblotJSRules,
    },
  },
  {
    // Plain `.js`/`.mjs`/`.cjs` source files (build shims, config
    // files, the eslint preset itself) aren't part of any TS
    // project. Disable the typed lint rules so the project-service
    // parser doesn't fail with "file was not found by the project
    // service".
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // - `eslint-preset.js`: the preset bootstraps itself, ignoring
    //   keeps eslint from re-evaluating it under the typed rules.
    ignores: ["eslint-preset.js", "**/dist/**", "**/out/**"],
  },
);
