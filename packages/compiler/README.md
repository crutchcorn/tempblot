<div align="center">
<h1>Tempblot</h1>

<a href="https://emojipedia.org/noto-emoji/17.0/splatter">
  <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/crutchcorn/tempblot/refs/heads/main/packages/vscode/images/tempblot_dark.png">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/crutchcorn/tempblot/refs/heads/main/packages/vscode/images/tempblot_light.png">
      <img height="80" width="80" alt="splatter" src="https://raw.githubusercontent.com/crutchcorn/tempblot/refs/heads/main/packages/vscode/images/tempblot.svg">
  </picture>

</a>

<p>A modern type-safe templating engine</p>

</div>

<hr />

```blot
<!-- Run TypeScript via Node -->
<setup>
import {v4} from "uuid";

const data = {
    hello: !!v4 ? 123 : null
};
</setup>

<!-- Use `lang` to change the syntax highlighting of the `output` block -->
<output lang="json">
{
    "//": "Interpolate values with << >>",
    "test": <<data.hello>>
}
</output>
```

# Passing Params

Pass configuration into a `.blot` file with `compilePath`, then read it in the
`<setup>` block with `useParams`.

```ts
import { compilePath } from "tempblot";

const output = await compilePath("./config.json.blot", { name: "Tempblot" });
```

```blot
<setup>
import { useParams } from "tempblot";

const params = useParams<{ name: string }>();
</setup>

<output lang="json">
{
    "name": <<params.name>>
}
</output>
```

# Installation

```shell
npm install tempblot
```

# Prerequisites

- Node v22.18+
