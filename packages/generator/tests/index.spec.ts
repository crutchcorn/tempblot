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

  await expectOutputToMatchFixture(outputDir, "static");
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

  await expectOutputToMatchFixture(outputDir, "dynamic-files");
});

test("generates dynamic directories from _paths.blot", async () => {
  const inputDir = getFixtureInputDir("dynamic-directories");
  const outputDir = await createOutputDir();

  await generate({ inputDir, outputDir });

  await expectOutputToMatchFixture(outputDir, "dynamic-directories");
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

  await expectOutputToMatchFixture(outputDir, "skip-existing");
  expect(result.files).toMatchObject([{ action: "skipped" }]);
});

async function expectOutputToMatchFixture(
  outputDir: string,
  fixtureName: string,
): Promise<void> {
  const fixtureOutputDir = getFixtureOutputDir(fixtureName);
  const outputFiles = await readTreeFilePaths(outputDir);

  expect(outputFiles).toEqual(await readTreeFilePaths(fixtureOutputDir));

  for (const outputFile of outputFiles) {
    await expect(
      await fs.readFile(path.join(outputDir, outputFile), "utf8"),
    ).toMatchFileSnapshot(path.join(fixtureOutputDir, outputFile));
  }
}

async function readTreeFilePaths(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  await readTreeFilePathsInto(rootDir, rootDir, files);
  return files;
}

async function readTreeFilePathsInto(
  rootDir: string,
  currentDir: string,
  files: string[],
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await readTreeFilePathsInto(rootDir, entryPath, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(path.relative(rootDir, entryPath));
    }
  }
}

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
