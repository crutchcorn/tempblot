# Tempblot TypeScript Plugin

A TypeScript plugin that provides language features for Tempblot (`.blot`) files within the existing TypeScript language service.

## Features

- **Type-safe templating**: Full TypeScript support in setup blocks and interpolations
- **Syntax highlighting**: Rich syntax highlighting for Tempblot files
- **IntelliSense**: Auto-completion, error checking, and refactoring
- **Resource efficient**: Integrates with existing TypeScript service instead of running a separate language server

## Installation

```bash
npm install @tempblot/typescript-plugin
```

## Configuration

### Method 1: VS Code Settings

Add to your VS Code workspace settings (`.vscode/settings.json`):

```json
{
  "typescript.preferences.plugins": [
    { "name": "@tempblot/typescript-plugin" }
  ]
}
```

### Method 2: tsconfig.json

Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "@tempblot/typescript-plugin" }
    ]
  }
}
```

## Usage

Once configured, the plugin will automatically provide language features for `.blot` files:

```html
<setup>
const name = "World";
const count = 42;
</setup>

<output>
{
  "greeting": "Hello <<name>>!",
  "count": <<count>>,
  "doubled": <<count * 2>>
}
</output>
```
