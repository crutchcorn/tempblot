import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { test, expect } from "vitest";

import { compilePath } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test("compiles a basic file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/test.json.blot"),
  );

  expect(result).toMatchSnapshot();
});

test("compiles an array-interpolated file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/array.json.blot"),
  );

  expect(result).toMatchSnapshot();
});

test("compiles a top-level await file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/top-await.json.blot"),
  );

  expect(result).toMatchSnapshot();
});

test("compiles an import file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/import.json.blot"),
  );

  expect(result).toMatchSnapshot();
});
