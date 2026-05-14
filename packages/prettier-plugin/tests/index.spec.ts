import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { render } from "cli-testing-library";
import * as prettier from "prettier";
import { expect, test } from "vitest";

import plugin from "../src/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

test.each([
  [
    "setup and json output",
    `
<!-- before -->
<setup>
const value={hello:"world",items:[1,2,3]}
</setup>

<output data-z="last" data-a="first" lang="json">
{"hello":"world","items":[1,2,3]}
</output>
`,
  ],
  [
    "yaml output",
    `
<output lang="yaml">
hello: world
items:
- 1
- 2
</output>
`,
  ],
  [
    "html output",
    `
<output lang="html">
<main><h1>Hello</h1><p>World</p></main>
</output>
`,
  ],
  [
    "css output",
    `
<output lang="css">
.card{color:red;background:white}
</output>
`,
  ],
  [
    "javascript output",
    `
<output lang="js">
const run=()=>({hello:"world"})
</output>
`,
  ],
  [
    "typescript output",
    `
<output lang="ts">
const value:Record<string,string>={hello:"world"}
</output>
`,
  ],
  [
    "unknown output language",
    `
<output lang="txt">
  leave   this   alone
</output>
`,
  ],
])("formats %s", async (_name, source) => {
  await expect(format(source.trim())).resolves.toMatchSnapshot();
});

test("formats .blot files through Prettier CLI", async () => {
  const fixturePath = path.join(packageRoot, "tests", "fixtures", "cli.blot");
  const fixtureArg = "tests/fixtures/cli.blot";

  try {
    await fs.writeFile(
      fixturePath,
      `
<setup>
const value={hello:"world"}
</setup>
<output lang="json">
{"hello":"world"}
</output>
`.trim(),
    );

    const cli = await render(
      `pnpm exec prettier --plugin ./lib/index.js ${fixtureArg}`,
      [],
      {
        cwd: packageRoot,
      },
    );

    await waitForExit(cli);

    expect(cli.getStdallStr()).toMatchSnapshot();
    expect(cli.hasExit()).toEqual({ exitCode: 0 });
  } finally {
    await fs.rm(fixturePath, { force: true });
  }
});

function format(source: string) {
  return prettier.format(source, {
    parser: "tempblot",
    plugins: [plugin],
  });
}

async function waitForExit(cli: Awaited<ReturnType<typeof render>>) {
  while (!cli.hasExit()) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
