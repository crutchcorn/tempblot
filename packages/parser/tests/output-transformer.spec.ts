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
