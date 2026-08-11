import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const minimumGitVersion = [2, 37, 0] as const;
const cleanupPaths = new Set<string>();
let cleanupRegistered = false;

export interface CloneTemplateOptions {
  url: string | URL;
}

export interface CloneTemplateResult {
  tmpPath: string;
}

export type SpawnSafeAllow =
  | "addons"
  | "child"
  | "ffi"
  | "net"
  | "wasi"
  | "worker";

export type SpawnSafeAllows = Partial<Record<SpawnSafeAllow, boolean>>;

export interface SpawnSafeOptions {
  allows?: SpawnSafeAllows;
  defaultFSPaths?: readonly (string | URL)[];
  file: string | URL;
}

export interface SpawnSafeResult {
  new_child_process: ChildProcessWithoutNullStreams;
}

export async function cloneTemplate(
  options: CloneTemplateOptions,
): Promise<CloneTemplateResult> {
  await ensureSupportedGitVersion();

  const clonePath = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "tempblot-template-"),
  );

  try {
    await runGit([
      "clone",
      "--filter=blob:none",
      "--sparse",
      "--",
      options.url.toString(),
      clonePath,
    ]);

    const directories = await getTopLevelDirectories(clonePath);
    await runGit(
      [
        "sparse-checkout",
        "set",
        "--",
        ...(directories.length > 0 ? directories : ["."]),
      ],
      clonePath,
    );
  } catch (error) {
    await fsPromises.rm(clonePath, { recursive: true, force: true });
    throw error;
  }

  registerCleanup(clonePath);
  return { tmpPath: clonePath };
}

export function spawnSafe(options: SpawnSafeOptions): SpawnSafeResult {
  ensureSupportedNodeVersion();

  const normalizedFilePath = normalizeFilePath(options.file);
  const extension = path.extname(normalizedFilePath);

  if (extension !== ".js" && extension !== ".ts") {
    throw new TypeError(
      `spawnSafe only supports .js and .ts files: ${String(options.file)}`,
    );
  }

  const defaultFSPaths = (options.defaultFSPaths ?? []).map(normalizeFilePath);
  const nodeArguments = [
    "--permission",
    `--allow-fs-read=${normalizedFilePath}`,
  ];

  for (const defaultFSPath of defaultFSPaths) {
    nodeArguments.push(
      `--allow-fs-read=${defaultFSPath}`,
      `--allow-fs-write=${defaultFSPath}`,
    );
  }

  nodeArguments.push(...getAllowFlags(options.allows ?? {}));
  nodeArguments.push(normalizedFilePath);

  return { new_child_process: spawn(process.execPath, nodeArguments) };
}

const permissionFlags: Readonly<Record<SpawnSafeAllow, string>> = {
  addons: "--allow-addons",
  child: "--allow-child-process",
  ffi: "--allow-ffi",
  net: "--allow-net",
  wasi: "--allow-wasi",
  worker: "--allow-worker",
};

function getAllowFlags(allows: SpawnSafeAllows): string[] {
  const flags: string[] = [];

  for (const [allow, enabled] of Object.entries(allows)) {
    const flag = (permissionFlags as Readonly<Record<string, string>>)[allow];

    if (flag === undefined) {
      throw new TypeError(`Unknown spawnSafe permission: ${allow}`);
    }

    if (typeof enabled !== "boolean") {
      throw new TypeError(`spawnSafe permission ${allow} must be a boolean`);
    }

    if (enabled) {
      flags.push(flag);
    }
  }

  return flags;
}

function ensureSupportedNodeVersion(): void {
  const [majorVersion = ""] = process.versions.node.split(".");
  const major = Number.parseInt(majorVersion, 10);

  if (!Number.isSafeInteger(major) || major < 26) {
    throw new Error(
      `spawnSafe requires Node.js 26 or newer; found ${process.versions.node}.`,
    );
  }
}

function normalizeFilePath(filePath: string | URL): string {
  return filePath instanceof URL
    ? fileURLToPath(filePath)
    : path.resolve(filePath);
}

async function ensureSupportedGitVersion(): Promise<void> {
  const output = await runGit(["--version"]);
  const match = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(output);

  if (match === null) {
    throw new Error(
      `Unable to determine the installed Git version from: ${output}`,
    );
  }

  const version = [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3] ?? "0", 10),
  ] as const;

  if (compareVersions(version, minimumGitVersion) < 0) {
    throw new Error(
      `Git 2.37 or newer is required; found ${version.join(".")}.`,
    );
  }
}

function compareVersions(
  left: readonly number[],
  right: readonly number[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

async function getTopLevelDirectories(
  repositoryPath: string,
): Promise<string[]> {
  const output = await runGit(
    ["ls-tree", "-z", "--name-only", "-d", "HEAD"],
    repositoryPath,
  );

  return output.split("\0").filter((entry) => entry.length > 0);
}

function runGit(arguments_: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const commandName = `git ${arguments_[0] ?? ""}`.trimEnd();
    const child = spawn("git", arguments_, {
      cwd,
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
    child.once("error", (error) => {
      reject(new Error(`Failed to run ${commandName}: ${error.message}`));
    });
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      const reason = signal === null ? `exit code ${code}` : `signal ${signal}`;
      const details = stderr.trim();
      reject(
        new Error(
          `${commandName} failed with ${reason}${details.length > 0 ? `: ${details}` : ""}`,
        ),
      );
    });
  });
}

function registerCleanup(clonePath: string): void {
  cleanupPaths.add(clonePath);

  if (cleanupRegistered) {
    return;
  }

  cleanupRegistered = true;
  process.once("exit", () => {
    for (const cleanupPath of cleanupPaths) {
      try {
        fs.rmSync(cleanupPath, { recursive: true, force: true });
      } catch {
        // The process is exiting, so cleanup is best-effort.
      }
    }
  });
}
