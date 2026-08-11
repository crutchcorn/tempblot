import tempblotPreset from "@tempblot/config/eslint-preset.js";

export default [
  ...tempblotPreset,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ["eslint.config.mjs"],
  },
];
