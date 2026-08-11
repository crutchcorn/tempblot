---
title: "Building CLIs"
description: Compose Tempblot with existing CLI tools for prompts, args, and shell completion.
---

Tempblot does not need to own user input. Treat CLI input as normal TypeScript:
collect params with the tools you prefer, pass those params to `generate`, and read
them from `.blot` files with `useParams`.

```ts
import { generate } from "@tempblot/generator";

await generate({
  inputDir: "./templates",
  outputDir: "./dist",
  params: {
    name: "Tempblot",
  },
});
```

Inside a `.blot` file, those params are available through `useParams`.

```blot
<setup>
import { useParams } from "tempblot";

const params = useParams<{ name: string }>();
</setup>

<output lang="json">
{
  "name": <<JSON.stringify(params.name)>>
}
</output>
```

## Prompting With Clack

[Clack](https://bomb.sh/docs/clack/basics/getting-started/) provides typed,
interactive prompts. Use it directly in your generator script.

```ts
import { generate } from "@tempblot/generator";
import { isCancel, select, text } from "@clack/prompts";

async function getParams() {
  const name = await text({
    message: "Project name?",
    placeholder: "my-app",
    validate(value) {
      if (!value) return "Enter a project name";
    },
  });

  if (isCancel(name)) {
    process.exitCode = 1;
    throw new Error("Cancelled");
  }

  const framework = await select({
    message: "Framework?",
    options: [
      { value: "react", label: "React" },
      { value: "vue", label: "Vue" },
      { value: "svelte", label: "Svelte" },
    ],
  });

  if (isCancel(framework)) {
    process.exitCode = 1;
    throw new Error("Cancelled");
  }

  return { name, framework };
}

const params = await getParams();

await generate({
  inputDir: "./templates",
  outputDir: `./${params.name}`,
  params,
});
```

Run the script with Node's TypeScript support.

```sh
node ./scripts/generate.ts
```

Tempblot requires Node 22.18 or newer, where type stripping is enabled by
default. Keep in mind that Node removes erasable TypeScript syntax; it does not
type-check the file or read your `tsconfig.json`. If your script relies on
features such as path aliases or syntax that needs JavaScript emitted, compile
it first or use a tool such as `tsx`.

## Typing `useParams`

Put a module augmentation in a `.ts` or `.d.ts` file included by the TypeScript
project that contains your `.blot` files to type `useParams()` globally.

```ts
type UserInput = Awaited<ReturnType<typeof getParams>>;

declare module "tempblot" {
  interface TempblotParams extends UserInput {}
}
```

Then `.blot` files can call `useParams()` without a local generic.

```blot
<setup>
import { useParams } from "tempblot";

const params = useParams();
</setup>

<output lang="md">
# <<params.name>>

Generated with <<params.framework>>.
</output>
```

## Flags With Args

Use [Args](https://bomb.sh/docs/args/getting-started) when values should come
from command-line flags, and fall back to prompts only when needed.

```ts
import { parse } from "@bomb.sh/args";
import { generate } from "@tempblot/generator";
import { isCancel, text } from "@clack/prompts";

const args = parse(process.argv.slice(2), {
  string: ["name", "out"],
  boolean: ["force"],
});

const name = args.name ?? (await text({ message: "Project name?" }));

if (isCancel(name)) {
  process.exitCode = 1;
  throw new Error("Cancelled");
}

await generate({
  inputDir: "./templates",
  outputDir: args.out ?? `./${name}`,
  existingFiles: args.force ? "overwrite" : "error",
  params: { name },
});
```

## Shell Completion With Tab

Use [Tab](https://bomb.sh/docs/tab/) when your generator script grows enough to
benefit from shell completion. Define the CLI shape next to the script that calls
`generate`.

One subtle detail: Tab describes the commands and options that the shell can
complete. It does not parse or dispatch your CLI's normal execution for you.
We'll connect those two pieces in the next section.

```ts
import t from "@bomb.sh/tab";

const generateCommand = t.command("generate", "Generate files from templates");

generateCommand.option("out", "Output directory", (complete) => {
  complete("./dist", "Default output directory");
  complete("./generated", "Generated files directory");
});

generateCommand.option("force", "Overwrite existing files");

const argv = process.argv.slice(2);

function handleCompletion() {
  if (argv[0] !== "complete") return false;

  const shell = argv[1];

  if (shell === "--") {
    t.parse(argv.slice(2));
  } else if (shell) {
    t.setup("my-generator", "node ./scripts/generate.ts", shell);
  }

  return true;
}

if (!handleCompletion()) {
  // Parse the normal command and call generate here.
}
```

## Putting It All Together

Small examples are useful, but CLIs have a habit of becoming several small
examples wearing a trench coat. Let's look at Tempblot's own binary to see how
the pieces fit together.

```ts
#!/usr/bin/env node
import { cloneTemplate, spawnSafe } from "@tempblot/utils";
import t from "@bomb.sh/tab";
import { parse } from "@bomb.sh/args";
import { text, isCancel } from "@clack/prompts";
import * as path from "node:path";
import * as fs from "node:fs";

// tempblot get --url
const getCmd = t.command("get", "Get a template from a git repository");
getCmd.option("url", "Specify the git repository URL", (complete) => {
  complete("https://github.com/crutchcorn/tempblot.git", "Default repository");
});

const argv = process.argv.slice(2);
const args = parse(argv, {
  string: ["url"],
});

const [command] = args._;

if (command !== getCmd.value) {
  console.error(`Usage: tempblot ${getCmd.value} [--url <repository-url>]`);
  process.exit(1);
}

const url =
  args.url ||
  ((await text({
    message: "What is the URL of the git repository?",
    placeholder: "https://github.com/crutchcorn/tempblot.git",
  })) as string);

if (isCancel(url)) {
  console.log("Operation cancelled.");
  process.exit(0);
}

const { tmpPath } = await cloneTemplate({ url });

const configPath = path.resolve(tmpPath, "tempblot.config.ts");

if (!fs.existsSync(configPath)) {
  console.error(`Configuration file not found at ${configPath}`);
  process.exit(1);
}

const { new_child_process } = spawnSafe({
  file: configPath,
  defaultFSPaths: [process.cwd(), tmpPath],
});

new_child_process.stdout.pipe(process.stdout);
new_child_process.stderr.pipe(process.stderr);
new_child_process.on("exit", (code) => {
  process.exit(code || 0);
});
```

There are four handoffs happening here:

1. Tab's `getCmd` describes the `get` command and its `url` option.
2. Args turns the raw argument list into named flags and positional values.
3. The positional command is checked against `getCmd.value`. This reuse matters:
   without it, defining `getCmd` would only affect completion, and
   `tempblot anything` could accidentally run the same code.
4. Clack asks for a URL only when `--url` did not already provide one. Once the
   input is known, the CLI can hand control to its actual work—in this case,
   cloning and running a Tempblot configuration.

The last step uses Tempblot's internal `cloneTemplate` and `spawnSafe` helpers.
Your generator can replace that portion with the `generate` call from the
earlier examples; the input flow stays the same.

### Publishing the Binary

The shebang tells a shell to launch the file with Node, but a shebang alone does
not make a package executable. The package also needs a `bin` entry that points
to the file consumers will actually receive.

```json
{
  "bin": "dist/bin/tempblot.js",
  "files": ["dist"]
}
```

Notice that this points to built JavaScript, not the TypeScript source shown
above. Node deliberately refuses to type-strip `.ts` files inside
`node_modules`, so publishing `bin/tempblot.ts` would work in the repository and
then fail for consumers. Whatever build tool you choose must emit
`dist/bin/tempblot.js`, preserve the shebang, and mark the result as executable.

This final packaging check is easy to miss in a monorepo because workspace
dependencies and source files are already available. Pack the package and run
its advertised binary from a temporary consumer directory before publishing.
That small test catches missing files, incorrect `bin` paths, permission
problems, and accidental reliance on the repository itself.
