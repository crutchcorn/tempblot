import tempblotPreset from "./packages/config/eslint-preset.js";

export default [
  ...tempblotPreset,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain ESM/CJS files (Lambda runtime shims, build scripts) live
    // outside any tsconfig `include`. Override the global
    // projectService so the parser doesn't bail with "file was not
    // found by the project service".
    files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: false,
      },
    },
  },
];
