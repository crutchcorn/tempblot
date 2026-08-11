# `@tempblot/utils`

Shared utilities for Tempblot tooling.

```ts
import { cloneTemplate } from "@tempblot/utils";

const { tmpPath } = await cloneTemplate({ url: GIT_URL });
```

`cloneTemplate` requires Git 2.37 or newer. It clones the template into a
temporary sparse checkout and removes that directory when the Node process
exits.

## Safe scripts

`spawnSafe` requires Node.js 26 or newer and runs JavaScript or TypeScript with
Node's permission model enabled. Every `defaultFSPaths` entry is normalized to an
absolute path and granted read/write access. Other permissions remain disabled
unless explicitly allowed. The `allows` option supports `"net"`, `"child"`,
`"worker"`, `"addons"`, `"wasi"`, and `"ffi"`.

```ts
import { spawnSafe } from "@tempblot/utils";

const { new_child_process } = spawnSafe({
  file: "./generate.ts",
  defaultFSPaths: ["./input", "./output"],
  allows: { net: true },
});
```
