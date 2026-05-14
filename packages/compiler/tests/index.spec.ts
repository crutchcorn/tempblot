import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { test, expect } from "vitest";

import { compilePath, useParams } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
