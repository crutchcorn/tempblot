---
title: "Basic Usage"
---

Tempblot files are `.blot` files with two main blocks: `<setup>` and `<output>`.

Use `<setup>` for TypeScript that prepares values. Use `<output>` for the text
you want Tempblot to generate.

```blot
<setup>
const message = "Hello from Tempblot";
</setup>

<output lang="json">
{
    "message": <<message>>
}
</output>
```

## Setup Block

The `<setup>` block runs as TypeScript in Node. You can create values, import
packages, and use top-level `await`.

```blot
<setup>
import { v4 } from "uuid";

const id = v4();
const createdAt = new Date().toISOString();
</setup>

<output lang="json">
{
    "id": <<id>>,
    "createdAt": <<createdAt>>
}
</output>
```

## Output Block

The `<output>` block is the generated document. Use `<< >>` to interpolate
values from `<setup>`.

```blot
<setup>
const user = {
    name: "Ada",
    active: true
};
</setup>

<output lang="json">
{
    "name": <<user.name>>,
    "active": <<user.active>>
}
</output>
```

The `lang` attribute is useful for editor syntax highlighting.

## Passing Params

Use `compilePath` to pass configuration into a `.blot` file.

```ts
import { compilePath } from "tempblot";

const output = await compilePath("./user.json.blot", {
    name: "Ada",
    active: true,
});
```

Inside the `.blot` file, read those params with `useParams`.

```blot
<setup>
import { useParams } from "tempblot";

const params = useParams<{ name: string; active: boolean }>();
</setup>

<output lang="json">
{
    "name": <<params.name>>,
    "active": <<params.active>>
}
</output>
```

You can also define params globally with module augmentation.

```ts
declare module "tempblot" {
    interface TempblotParams {
        name: string;
        active: boolean;
    }
}
```

Then `useParams()` will use that merged interface by default.

```blot
<setup>
import { useParams } from "tempblot";

const params = useParams();
</setup>

<output lang="json">
{
    "name": <<params.name>>,
    "active": <<params.active>>
}
</output>
```

## Comments

You can use HTML comments around your blocks for notes or organization.

```blot
<!-- Prepare the data used by the template -->
<setup>
const total = 123;
</setup>

<!-- Render the final JSON file -->
<output lang="json">
{
    "total": <<total>>
}
</output>
```

Top-level comments are ignored by the compiler output.
