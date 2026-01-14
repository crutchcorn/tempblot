import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { test, expect } from "vitest";

import { compilePath, useParams, DoodlInstance } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test("compiles a basic file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/test.json.dood"),
  );

  expect(result).toMatchSnapshot();
});

test("compiles an array-interpolated file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/array.json.dood"),
  );

  expect(result).toMatchSnapshot();
});

test("compiles a top-level await file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/top-await.json.dood"),
  );

  expect(result).toMatchSnapshot();
});

test("compiles an import file", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/import.json.dood"),
  );

  expect(result).toMatchSnapshot();
});

test("useParams returns passed params inside .dood file", async () => {
  const params = { name: "World", count: 42 };
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/use-params.json.dood"),
    params,
  );

  const parsed = JSON.parse(result);
  expect(parsed).toStrictEqual({
    greeting: "Hello, World!",
    count: 42,
  });
});

test("useParams works with renamed import (useParams as alias)", async () => {
  const params = { value: "test-value" };
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/use-params-renamed.json.dood"),
    params,
  );

  const parsed = JSON.parse(result);
  expect(parsed).toStrictEqual({
    result: "test-value",
  });
});

test("useParams returns undefined when no params passed", async () => {
  const result = await compilePath(
    path.resolve(__dirname, "../../../sample/use-params-optional.json.dood"),
  );

  const parsed = JSON.parse(result);
  expect(parsed).toStrictEqual({
    hasParams: false,
  });
});

test("useParams throws when called outside .dood file", () => {
  expect(() => {
    // @ts-expect-error - intentionally testing runtime guard with invalid this context
    useParams();
  }).toThrow("You can only use `useParams` from `doodl` in a `.dood` file");
});

test("useParams works when called with DoodlInstance context", () => {
  const instance = new DoodlInstance({ foo: "bar" });
  const result = useParams.call(instance);
  expect(result).toStrictEqual({ foo: "bar" });
});
