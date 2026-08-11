import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, expect, test } from "vitest";

import { cloneTemplate } from "../src/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceUrl = pathToFileURL(path.join(__dirname, "../src/index.ts")).href;
const testRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    testRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

test("clones all template files with sparse checkout", async () => {
  const repositoryPath = await createRepository();

  const result = await cloneTemplate({ url: repositoryPath });
  testRoots.push(result.tmpPath);

  await expect(
    fs.readFile(path.join(result.tmpPath, "root.txt"), "utf8"),
  ).resolves.toBe("root");
  await expect(
    fs.readFile(
      path.join(result.tmpPath, "nested", "deep", "template.txt"),
      "utf8",
    ),
  ).resolves.toBe("nested");
  await expect(
    fs.readFile(
      path.join(result.tmpPath, ".git", "info", "sparse-checkout"),
      "utf8",
    ),
  ).resolves.toContain("nested");
});

test("rejects Git versions older than 2.37", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "tempblot-utils-version-"),
  );
  const binPath = path.join(root, "bin");
  const gitPath = path.join(binPath, "git");
  testRoots.push(root);

  await fs.mkdir(binPath);
  await fs.writeFile(gitPath, "#!/bin/sh\necho 'git version 2.36.9'\n");
  await fs.chmod(gitPath, 0o755);

  const result = await runNode(
    `
      import { cloneTemplate } from ${JSON.stringify(sourceUrl)};
      try {
        await cloneTemplate({ url: "unused" });
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
      }
    `,
    { PATH: binPath },
  );

  expect(result.code).toBe(1);
  expect(result.stderr).toContain(
    "Git 2.37 or newer is required; found 2.36.9.",
  );
});

test("removes the clone when the process exits", async () => {
  const repositoryPath = await createRepository();
  const result = await runNode(
    `
      import { cloneTemplate } from ${JSON.stringify(sourceUrl)};
      const result = await cloneTemplate({ url: process.argv[1] });
      await import("node:fs/promises").then(({ access }) => access(result.tmpPath));
      console.log(result.tmpPath);
    `,
    undefined,
    repositoryPath,
  );
  const clonePath = result.stdout.trim();

  expect(result.code).toBe(0);
  expect(clonePath).not.toBe("");
  await expect(fs.access(clonePath)).rejects.toThrow();
});

async function createRepository(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tempblot-utils-repo-"));
  const repositoryPath = path.join(root, "repository");
  testRoots.push(root);

  await fs.mkdir(path.join(repositoryPath, "nested", "deep"), {
    recursive: true,
  });
  await fs.writeFile(path.join(repositoryPath, "root.txt"), "root");
  await fs.writeFile(
    path.join(repositoryPath, "nested", "deep", "template.txt"),
    "nested",
  );
  await runGit(["init", "--initial-branch=main", repositoryPath]);
  await runGit(["-C", repositoryPath, "add", "."]);
  await runGit([
    "-C",
    repositoryPath,
    "-c",
    "user.name=Tempblot Tests",
    "-c",
    "user.email=tests@tempblot.dev",
    "commit",
    "--message=Initial commit",
  ]);

  return repositoryPath;
}

async function runGit(arguments_: string[]): Promise<void> {
  const result = await runProcess("git", arguments_);

  if (result.code !== 0) {
    throw new Error(result.stderr);
  }
}

function runNode(
  source: string,
  environment?: NodeJS.ProcessEnv,
  ...arguments_: string[]
): Promise<ProcessResult> {
  return runProcess(
    process.execPath,
    ["--input-type=module", "--eval", source, ...arguments_],
    environment === undefined ? undefined : { ...process.env, ...environment },
  );
}

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runProcess(
  command: string,
  arguments_: string[],
  environment?: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
