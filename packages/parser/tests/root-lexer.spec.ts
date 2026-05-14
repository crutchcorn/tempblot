import { expect, test } from "vitest";
import { tokenizeRoot } from "../src/index.js";

function withoutOffsets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutOffsets);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "start" && key !== "end")
        .map(([key, entry]) => [key, withoutOffsets(entry)]),
    );
  }

  return value;
}

test("tokenizeRoot basic", () => {
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

  const tokens = tokenizeRoot(source);
  expect(withoutOffsets(tokens)).toStrictEqual([
    { type: "TagOpenStart", attributes: { name: "setup" } },
    { type: "TagOpenEnd", attributes: { name: "setup" } },
    { type: "Text", attributes: { value: "\nconst setup = 123;\n" } },
    { type: "TagClose", attributes: { name: "setup" } },
    { type: "Text", attributes: { value: "\n\n" } },
    { type: "TagOpenStart", attributes: { name: "output" } },
    { type: "TagAttribute", attributes: { name: "lang", value: "json" } },
    { type: "TagOpenEnd", attributes: { name: "output" } },
    { type: "Text", attributes: { value: "\n{\n  \"test\": <<setup>>\n}\n" } },
    { type: "TagClose", attributes: { name: "output" } },
  ]);
});

test("tokenizeRoot keeps interpolation contents as text", () => {
  const source = `
  <setup>
const hello = 123;
</setup>

<output lang="json">
{
    "test": <<hello ? ["one", 'two', 'three'] : "">>
}
</output>
`.trim();

  const tokens = tokenizeRoot(source);
  expect(withoutOffsets(tokens)).toStrictEqual([
    { type: "TagOpenStart", attributes: { name: "setup" } },
    { type: "TagOpenEnd", attributes: { name: "setup" } },
    { type: "Text", attributes: { value: "\nconst hello = 123;\n" } },
    { type: "TagClose", attributes: { name: "setup" } },
    { type: "Text", attributes: { value: "\n\n" } },
    { type: "TagOpenStart", attributes: { name: "output" } },
    { type: "TagAttribute", attributes: { name: "lang", value: "json" } },
    { type: "TagOpenEnd", attributes: { name: "output" } },
    {
      type: "Text",
      attributes: {
        value:
          "\n{\n    \"test\": <<hello ? [\"one\", 'two', 'three'] : \"\">>\n}\n",
      },
    },
    { type: "TagClose", attributes: { name: "output" } },
  ]);
});

test("tokenizeRoot ignores top-level HTML comments", () => {
  const source = `
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

  const tokens = tokenizeRoot(source);
  expect(withoutOffsets(tokens)).toStrictEqual([
    { type: "Text", attributes: { value: "<!-- before setup -->\n" } },
    { type: "TagOpenStart", attributes: { name: "setup" } },
    { type: "TagOpenEnd", attributes: { name: "setup" } },
    { type: "Text", attributes: { value: "\nconst setup = 123;\n" } },
    { type: "TagClose", attributes: { name: "setup" } },
    {
      type: "Text",
      attributes: { value: "\n<!-- between setup and output -->\n" },
    },
    { type: "TagOpenStart", attributes: { name: "output" } },
    { type: "TagAttribute", attributes: { name: "lang", value: "json" } },
    { type: "TagOpenEnd", attributes: { name: "output" } },
    { type: "Text", attributes: { value: "\n{\n  \"test\": <<setup>>\n}\n" } },
    { type: "TagClose", attributes: { name: "output" } },
    { type: "Text", attributes: { value: "\n<!-- after output -->" } },
  ]);
});
