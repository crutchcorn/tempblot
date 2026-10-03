import * as path from "node:path";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { test, expect } from "vitest";

import { compilePath, useParams } from "../src/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function compileOutput(output: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), "tempblot-output-"));
  const sourcePath = path.join(tempDir, "test.blot");

  try {
    await fs.writeFile(
      sourcePath,
      `<setup>const x = 1;</setup><output>${output}</output>`,
    );
    return await compilePath(sourcePath, undefined);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test.each([
  "a ${{ github.ref }} b",
  "a ${HOME} b",
  "a ${x} b",
  "C:\\users\\x",
  "c \\n d",
  "a ` b",
  "a \\` b",
  "a \\\\` b",
  "a \\${x} b",
  "a \\\\${x} b",
  "a \\",
])("preserves literal output %j", async (output) => {
  expect(await compileOutput(output)).toEqual(output);
});

test("preserves literal syntax alongside Tempblot interpolations", async () => {
  const output = "${x} \\n ` \\<<x>> <<`value: ${x}`>> \\${HOME}";

  expect(await compileOutput(output)).toEqual(
    "${x} \\n ` \\1 value: 1 \\${HOME}",
  );
});

test("preserves escaped delimiters in output and interpolations", async () => {
  const output = '\\<\\<literal\\>\\> << x ? "\\>\\>" : "\\<\\<" >>';

  expect(await compileOutput(output)).toEqual("<<literal>> >>");
});

test("compiles a basic file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/test.json.blot"),
    undefined,
  );

  expect(result).toMatchSnapshot();
});

test("compiles an array-interpolated file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/array.json.blot"),
    undefined,
  );

  expect(result).toMatchSnapshot();
});

test("compiles a top-level await file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/top-await.json.blot"),
    undefined,
  );

  expect(result).toMatchSnapshot();
});

test("compiles an import file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/import.json.blot"),
    undefined,
  );

  expect(result).toMatchSnapshot();
});

test("compiles a file with top-level HTML comments", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/comments.json.blot"),
    undefined,
  );

  expect(result).toMatchSnapshot();
});

test("passes params to a tempblot file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/params.json.blot"),
    { hello: 123 },
  );

  expect(result).toMatchSnapshot();
});

test("passes params to an aliased useParams import", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/params-alias.json.blot"),
    { hello: 123 },
  );

  expect(result).toMatchSnapshot();
});

test("throws when useParams runs outside a tempblot file", () => {
  expect(() => useParams()).toThrow(
    "You can only use `useParams` from `tempblot` in a `.blot` file",
  );
});
