import tempblotPreset from "./eslint-preset.js";

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
];
