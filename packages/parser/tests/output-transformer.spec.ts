import { expect, test } from "vitest";
import { transformOutputTemplate } from "../src/index.js";

test("transformOutputTemplate", () => {
  const source = 'const someStr = `<div><<val ? "\\>\\>" : "\\<\\<">></div>`;';
  const cleaned = transformOutputTemplate(source);
  expect(cleaned).toEqual('const someStr = \\`<div>${val ? ">>" : "<<"}</div>\\`;');
});
