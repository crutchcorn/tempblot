# Tempblot TypeScript Plugin

A TypeScript plugin that provides language features for Tempblot (`.blot`) files within the existing TypeScript language service.

## Features

- **Type-safe templating**: Full TypeScript support in setup blocks and interpolations
- **Syntax highlighting**: Rich syntax highlighting for Tempblot files
- **IntelliSense**: Auto-completion, error checking, and refactoring
- **Resource efficient**: Integrates with existing TypeScript service instead of running a separate language server

## Installation

```bash
npm install tempblot-typescript-plugin
```

## Configuration

### Method 1: VS Code Settings

Add to your VS Code workspace settings (`.vscode/settings.json`):

```json
{
  "typescript.preferences.plugins": [
    { "name": "tempblot-typescript-plugin" }
  ]
}
```

### Method 2: tsconfig.json

Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "tempblot-typescript-plugin" }
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

## Architecture

This plugin uses the [Volar](https://volarjs.dev) framework to integrate with TypeScript's language service, providing:

- **Virtual Code Generation**: Transforms Tempblot templates into TypeScript code for analysis
- **Source Mapping**: Maps between original Tempblot source and generated TypeScript
- **Embedded Languages**: Supports TypeScript in setup blocks and JSON in output blocks
- **Custom Diagnostics**: Validates Tempblot-specific rules (required setup/output tags, etc.)

## Migration from Language Server

If you're migrating from the Tempblot language server, you can:

1. Remove the language server configuration from your VS Code settings
2. Install this TypeScript plugin
3. Configure it using one of the methods above
4. Restart the TypeScript service (`Cmd+Shift+P` → "TypeScript: Restart TS Server")

The TypeScript plugin provides the same language features as the language server but with better performance and compatibility with other TypeScript tools.
