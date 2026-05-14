import { expect, test } from "vitest";
import { parseRoot, tokenizeRoot } from "../src/index.ts";

const source = `
<setup>
const setup = 123;
</setup>

<output lang="json">
{
  "test": <<setup>>
}
</output>
`.trim();

test("parseRoot returns root blocks with source offsets", () => {
  const tokens = tokenizeRoot(source);
  const root = parseRoot(tokens);

  expect(root).toMatchObject({
    output: {
      attributes: {
        lang: "json",
      },
      contents: `
{
  "test": <<setup>>
}
`,
    },
    setup: {
      attributes: {},
      contents: `
const setup = 123;
`,
    },
  });
  expect(root.setup.startTagEnd).toBe(source.indexOf(">") + 1);
  expect(root.output.contents).toContain("<<setup>>");
});

test("parseRoot ignores top-level HTML comments", () => {
  const sourceWithComments = `
<!-- before setup -->
<setup>
const setup = 123;
</setup>
<!-- between setup and output -->
<output lang="json">
{
  "test": <<setup>>
}
</output>
<!-- after output -->
`.trim();

  const root = parseRoot(tokenizeRoot(sourceWithComments));

  expect(root.setup.contents).toBe(`
const setup = 123;
`);
  expect(root.output.contents).toBe(`
{
  "test": <<setup>>
}
`);
});
