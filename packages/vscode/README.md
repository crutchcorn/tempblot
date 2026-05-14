# Tempblot Language Features

VS Code language support for Tempblot `.blot` templates.

Tempblot is a type-safe templating language with TypeScript-powered `<setup>` blocks and interpolated output blocks.

## Features

- Syntax highlighting for `.blot` files.
- File icons for Tempblot templates.
- IntelliSense for TypeScript inside Tempblot files.
- Diagnostics and editor language features powered by the Tempblot language server.
- TypeScript server integration for workspace TypeScript versions.

## Example

```blot
<setup>
const user = {
  name: "Tempblot",
  enabled: true,
};
</setup>

<output lang="json">
{
  "name": <<user.name>>,
  "enabled": <<user.enabled>>
}
</output>
```

## Settings

- `tempblot.server.enable`: Enable or disable experimental IntelliSense support for Tempblot files.
- `tempblot.trace.server.verbosity`: Control language server tracing verbosity.
- `tempblot.trace.server.format`: Choose text or JSON formatting for traced language server requests.

## Requirements

- VS Code 1.104.0 or newer.
- A workspace using TypeScript for full TypeScript-powered language features.

## Feedback

Report issues at https://github.com/crutchcorn/tempblot/issues.
