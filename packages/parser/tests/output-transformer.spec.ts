import { expect, test } from "vitest";
import { transformOutputTemplate } from "../src/index.ts";

test("transformOutputTemplate", () => {
  const source = 'const someStr = `<div><<val ? "\\>\\>" : "\\<\\<">></div>`;';
  const cleaned = transformOutputTemplate(source);
  expect(cleaned).toEqual(
    'const someStr = \\`<div>${val ? ">>" : "<<"}</div>\\`;',
  );
});

test("transformOutputTemplate allows shift operators in interpolations", () => {
  const source = "<< 1 << 2 >> 3 >>";
  const cleaned = transformOutputTemplate(source);
  expect(cleaned).toEqual("${1 << 2 >> 3}");
});

test.each([
  ["${value}", "\\${value}"],
  ["${{ github.ref }}", "\\${{ github.ref }}"],
  ["C:\\users\\x", "C:\\\\users\\\\x"],
  ["\\n\\t\\u0041\\x42", "\\\\n\\\\t\\\\u0041\\\\x42"],
  ["trailing \\", "trailing \\\\"],
  ["\\${value}", "\\\\\\${value}"],
  ["\\`", "\\\\\\`"],
])("transformOutputTemplate escapes literal text %j", (source, expected) => {
  expect(transformOutputTemplate(source)).toEqual(expected);
});

test("transformOutputTemplate preserves escaped delimiters", () => {
  const source = "\\<\\<literal\\>\\> \\\\<\\<literal\\>\\>";
  expect(transformOutputTemplate(source)).toEqual(
    "<<literal>> \\\\<<literal>>",
  );
});

test("transformOutputTemplate only escapes text outside interpolations", () => {
  const source = "${value} << `value: ${value}\\n` >> \\n";
  expect(transformOutputTemplate(source)).toEqual(
    "\\${value} ${`value: ${value}\\n`} \\\\n",
  );
});
