# `@tempblot/utils`

Shared utilities for Tempblot tooling.

```ts
import { cloneTemplate } from "@tempblot/utils";

const { tmpPath } = await cloneTemplate({ url: GIT_URL });
```

`cloneTemplate` requires Git 2.37 or newer. It clones the template into a
temporary sparse checkout and removes that directory when the Node process
exits.
