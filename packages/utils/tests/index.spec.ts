import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, expect, test } from "vitest";

import { cloneTemplate, spawnSafe } from "../src/index.ts";

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

test("requires Node.js 26 or newer for safe processes", () => {
  withNodeRuntime("25.9.0", process.execPath, () => {
    expect(() => spawnSafe({ file: "script.ts" })).toThrow(
      "spawnSafe requires Node.js 26 or newer; found 25.9.0.",
    );
  });
});

test("passes restricted permission flags to Node", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tempblot-utils-safe-"));
  const executablePath = path.join(root, "node");
  const argumentLogPath = path.join(root, "arguments.json");
  const scriptPath = path.join(root, "script.ts");
  const allowedPath = path.join(root, "allowed");
  testRoots.push(root);

  await fs.writeFile(
    executablePath,
    `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(argumentLogPath)}, JSON.stringify(process.argv.slice(2)));\n`,
  );
  await fs.chmod(executablePath, 0o755);
  await fs.writeFile(scriptPath, "");

  const { new_child_process } = withNodeRuntime("26.0.0", executablePath, () =>
    spawnSafe({
      file: scriptPath,
      defaultFSPaths: [allowedPath],
      allows: {
        net: true,
        child: true,
        worker: true,
        addons: true,
        wasi: true,
        ffi: true,
      },
    }),
  );
  const result = await collectProcess(new_child_process);

  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  await expect(fs.readFile(argumentLogPath, "utf8")).resolves.toBe(
    JSON.stringify([
      "--permission",
      `--allow-fs-read=${scriptPath}`,
      `--allow-fs-read=${allowedPath}`,
      `--allow-fs-write=${allowedPath}`,
      "--allow-net",
      "--allow-child-process",
      "--allow-worker",
      "--allow-addons",
      "--allow-wasi",
      "--allow-ffi",
      scriptPath,
    ]),
  );
});

test("allows requested files and denies other permissions by default", async () => {
  const root = await fs.mkdtemp(path.join(__dirname, "tempblot-utils-safe-"));
  const scriptPath = path.join(root, "script.ts");
  const allowedPath = path.join(root, "allowed.txt");
  const blockedPath = path.join(root, "blocked.txt");
  testRoots.push(root);

  await fs.writeFile(
    scriptPath,
    `
      import { writeFileSync } from "node:fs";
      import { spawnSync } from "node:child_process";
      import { Worker } from "node:worker_threads";

      writeFileSync(${JSON.stringify(allowedPath)}, "allowed");

      let fileSystemError;
      let childProcessError;
      let workerError;
      try {
        writeFileSync(${JSON.stringify(blockedPath)}, "blocked");
      } catch (error) {
        fileSystemError = error.code;
      }
      try {
        spawnSync(process.execPath, ["--version"]);
      } catch (error) {
        childProcessError = error.code;
      }
      try {
        new Worker("", { eval: true });
      } catch (error) {
        workerError = error.code;
      }

      console.log(JSON.stringify({ fileSystemError, childProcessError, workerError }));
    `,
  );

  const { new_child_process } = withNodeRuntime("26.0.0", process.execPath, () =>
    spawnSafe({ file: scriptPath, defaultFSPaths: [allowedPath] }),
  );
  const result = await collectProcess(new_child_process);

  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    fileSystemError: "ERR_ACCESS_DENIED",
    childProcessError: "ERR_ACCESS_DENIED",
    workerError: "ERR_ACCESS_DENIED",
  });
  await expect(fs.readFile(allowedPath, "utf8")).resolves.toBe("allowed");
  await expect(fs.access(blockedPath)).rejects.toThrow();
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

function withNodeRuntime<TResult>(
  version: string,
  execPath: string,
  callback: () => TResult,
): TResult {
  const versionDescriptor = Object.getOwnPropertyDescriptor(
    process.versions,
    "node",
  );
  const originalExecPath = process.execPath;

  Object.defineProperty(process.versions, "node", {
    configurable: true,
    enumerable: true,
    value: version,
  });
  process.execPath = execPath;

  try {
    return callback();
  } finally {
    process.execPath = originalExecPath;

    if (versionDescriptor !== undefined) {
      Object.defineProperty(process.versions, "node", versionDescriptor);
    }
  }
}

function collectProcess(
  child: ReturnType<typeof spawnSafe>["new_child_process"],
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
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
