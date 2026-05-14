# Tempblot Prettier Plugin

Prettier plugin for formatting Tempblot (`.blot`) templates.

## Installation

```bash
npm install --save-dev prettier prettier-plugin-tempblot
```

This package supports Prettier 3 and newer.

## Configuration

Add the plugin to your Prettier configuration:

```json
{
  "plugins": ["prettier-plugin-tempblot"]
}
```

The plugin registers `.blot` files with the `tempblot` parser, so Prettier can format Tempblot files once the plugin is loaded.

## Usage

Format Tempblot files with the Prettier CLI:

```bash
npx prettier --write "**/*.blot"
```

You can also pass the plugin explicitly:

```bash
npx prettier --plugin prettier-plugin-tempblot --write "**/*.blot"
```

Use the plugin programmatically with `parser: "tempblot"`:

```ts
import * as prettier from "prettier";
import tempblotPlugin from "prettier-plugin-tempblot";

const formatted = await prettier.format(source, {
  parser: "tempblot",
  plugins: [tempblotPlugin],
});
```

## What Gets Formatted

The plugin formats the Tempblot document structure and delegates supported block contents to Prettier's built-in parsers.

Supported blocks:

- `<setup>` is formatted as TypeScript.
- `<output>` without `lang`, with `lang="json"`, or with `lang="jsonc"` is formatted as JSON.
- `<output lang="yaml">` and `<output lang="yml">` are formatted as YAML.
- `<output lang="html">` is formatted as HTML.
- `<output lang="css">` is formatted as CSS.
- `<output lang="javascript">` and `<output lang="js">` are formatted as JavaScript.
- `<output lang="typescript">` and `<output lang="ts">` are formatted as TypeScript.

Unknown output languages are preserved as plain text after trimming surrounding whitespace.

## Example

Input:

```blot
<!-- before -->
<setup>
const value={hello:"world",items:[1,2,3]}
</setup>

<output data-z="last" data-a="first" lang="json">
{"hello":"world","items":[1,2,3]}
</output>
```

Output:

```blot
<!-- before -->

<setup>
const value = { hello: "world", items: [1, 2, 3] };
</setup>

<output data-z="last" data-a="first" lang="json">
{ "hello": "world", "items": [1, 2, 3] }
</output>
```

## Formatting Behavior

- Root-level blocks are separated by one blank line.
- Leading and trailing content outside Tempblot blocks is preserved after trimming surrounding whitespace.
- Attribute order is preserved.
- Empty blocks are printed with opening and closing tags on separate lines.
- Files are always written with a trailing newline.
- If an embedded parser cannot format a block, the original trimmed block contents are preserved.
