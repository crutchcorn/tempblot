import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, expect, test } from "vitest";

import { generate } from "../src/index.ts";

const testRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    testRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

test("generates a static blot file", async () => {
  const { inputDir, outputDir } = await createTestWorkspace();
  await fs.writeFile(
    path.join(inputDir, "test.json.blot"),
    `<setup>
const val = 123;
</setup>

<output lang="json">
{ "value": <<val>> }
</output>
`,
  );

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
  const { inputDir, outputDir } = await createTestWorkspace();
  await fs.writeFile(
    path.join(inputDir, "[path].blot"),
    `<setup>
import { useParams } from "tempblot";

export function getPaths() {
  return [{ path: "one.js", val: 1 }, { path: "two.js", val: 2 }];
}

const { val } = useParams<{ path: string; val: number }>();
</setup>

<output lang="js">
console.log(<<val>>);
</output>
`,
  );

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
  const { inputDir, outputDir } = await createTestWorkspace();
  const dynamicDir = path.join(inputDir, "[name]");
  await fs.mkdir(dynamicDir);
  await fs.writeFile(
    path.join(dynamicDir, "_paths.blot"),
    `<setup>
export function getPaths() {
  return [{ name: "one" }, { name: "two" }];
}
</setup>
`,
  );
  await fs.writeFile(
    path.join(dynamicDir, "index.ts.blot"),
    `<setup>
import { useParams } from "tempblot";

const { name } = useParams<{ name: string }>();
</setup>

<output lang="ts">
export const name = "<<name>>";
</output>
`,
  );
  await fs.writeFile(path.join(dynamicDir, "static.txt"), "copied");

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
    .resolves.toBe("copied");
});

test("skips existing files when requested", async () => {
  const { inputDir, outputDir } = await createTestWorkspace();
  await fs.writeFile(
    path.join(inputDir, "test.txt.blot"),
    `<output>new</output>`,
  );
  await fs.mkdir(outputDir);
  await fs.writeFile(path.join(outputDir, "test.txt"), "existing");

  const result = await generate({
    inputDir,
    outputDir,
    existingFiles: "skip",
  });

  await expect(fs.readFile(path.join(outputDir, "test.txt"), "utf8"))
    .resolves.toBe("existing");
  expect(result.files).toMatchObject([{ action: "skipped" }]);
});

async function createTestWorkspace(): Promise<{
  inputDir: string;
  outputDir: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tempblot-generator-"));
  const inputDir = path.join(root, "input");
  const outputDir = path.join(root, "output");

  testRoots.push(root);
  await fs.mkdir(inputDir);

  return { inputDir, outputDir };
}
