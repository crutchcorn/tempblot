import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test } from "vitest";

import { generate } from "../src/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");
const testRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    testRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

test("generates a static blot file", async () => {
  const inputDir = getFixtureInputDir("static");
  const outputDir = await createOutputDir();

  const result = await generate({ inputDir, outputDir });

  await expect(fs.readFile(path.join(outputDir, "test.json"), "utf8")).resolves.toBe(
    `
{ "value": 123 }
`,
  );
  expect(result.files).toMatchObject([
    {
      outputPath: path.join(outputDir, "test.json"),
      action: "created",
    },
  ]);
});

test("generates dynamic file names from getPaths", async () => {
  const inputDir = getFixtureInputDir("dynamic-files");
  const outputDir = await createOutputDir();

  await generate({ inputDir, outputDir });

  await expect(fs.readFile(path.join(outputDir, "one.js"), "utf8")).resolves.toBe(
    `
console.log(1);
`,
  );
  await expect(fs.readFile(path.join(outputDir, "two.js"), "utf8")).resolves.toBe(
    `
console.log(2);
`,
  );
});

test("generates dynamic directories from _paths.blot", async () => {
  const inputDir = getFixtureInputDir("dynamic-directories");
  const outputDir = await createOutputDir();

  await generate({ inputDir, outputDir });

  await expect(fs.readFile(path.join(outputDir, "one", "index.ts"), "utf8"))
    .resolves.toBe(`
export const name = "one";
`);
  await expect(fs.readFile(path.join(outputDir, "two", "index.ts"), "utf8"))
    .resolves.toBe(`
export const name = "two";
`);
  await expect(fs.readFile(path.join(outputDir, "one", "static.txt"), "utf8"))
    .resolves.toBe("copied\n");
});

test("skips existing files when requested", async () => {
  const inputDir = getFixtureInputDir("skip-existing");
  const outputDir = await createOutputDir();

  await fs.cp(getFixtureOutputDir("skip-existing"), outputDir, {
    recursive: true,
  });

  const result = await generate({
    inputDir,
    outputDir,
    existingFiles: "skip",
  });

  await expect(fs.readFile(path.join(outputDir, "test.txt"), "utf8"))
    .resolves.toBe("existing\n");
  expect(result.files).toMatchObject([{ action: "skipped" }]);
});

async function createOutputDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tempblot-generator-"));
  const outputDir = path.join(root, "output");

  testRoots.push(root);

  return outputDir;
}

function getFixtureInputDir(name: string): string {
  return path.join(fixturesDir, name, "input");
}

function getFixtureOutputDir(name: string): string {
  return path.join(fixturesDir, name, "output");
}
