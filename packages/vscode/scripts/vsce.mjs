#!/usr/bin/env node
// vsce validates production dependencies with npm, which misreads pnpm workspace
// links. Stage only the shipped files so validation sees the real VSIX layout.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = join(root, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const vsce = localBin("vsce");
const [command, ...rawArgs] = process.argv.slice(2);
const args = rawArgs.filter((arg) => arg !== "--");

if (command !== "package" && command !== "publish") {
  throw new Error("Expected 'package' or 'publish'.");
}

const stage = await mkdtemp(join(tmpdir(), "tempblot-vsc-"));

try {
  await stageExtension(stage);

  if (command === "package") {
    const packageArgs = hasOutArg(args)
      ? args
      : [...args, "--out", join(root, `${manifest.name}-${manifest.version}.vsix`)];
    await run(vsce, ["package", ...packageArgs], stage);
  } else {
    const packagePath = join(stage, `${manifest.name}-${manifest.version}.vsix`);
    await run(vsce, ["package", ...args, "--out", packagePath], stage);
    await run(vsce, ["publish", "--packagePath", packagePath], root);
  }
} finally {
  await rm(stage, { force: true, recursive: true });
}

async function stageExtension(stageRoot) {
  for (const entry of ["images", "syntaxes", "LICENSE", "README.md"]) {
    await cp(join(root, entry), join(stageRoot, entry), { recursive: true });
  }
  await mkdir(join(stageRoot, "out"));
  for (const entry of ["extension.js", "language-server.js"]) {
    await cp(join(root, "out", entry), join(stageRoot, "out", entry));
  }

  const pluginSource = join(
    root,
    "node_modules",
    "@tempblot",
    "typescript-plugin.js",
  );

  if (!existsSync(pluginSource)) {
    throw new Error(`Missing bundled TypeScript plugin: ${pluginSource}`);
  }

  const pluginRoot = join(
    stageRoot,
    "node_modules",
    "@tempblot",
    "typescript-plugin",
  );
  await mkdir(pluginRoot, { recursive: true });
  await cp(pluginSource, join(pluginRoot, "index.js"));
  await writeJson(join(pluginRoot, "package.json"), {
    name: "@tempblot/typescript-plugin",
    version: manifest.version,
    main: "./index.js",
  });

  const stagedManifest = {
    ...manifest,
    dependencies: {
      "@tempblot/typescript-plugin": manifest.version,
    },
  };
  delete stagedManifest.devDependencies;
  delete stagedManifest.files;
  delete stagedManifest.private;
  delete stagedManifest.scripts;
  await writeJson(join(stageRoot, basename(manifestPath)), stagedManifest);
}

function hasOutArg(argsToCheck) {
  return argsToCheck.includes("--out") || argsToCheck.includes("-o");
}

function localBin(name) {
  const binary = join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name,
  );

  return existsSync(binary) ? binary : name;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function run(binary, argsToRun, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(binary, argsToRun, {
      cwd,
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${binary} ${argsToRun.join(" ")} exited with ${code}`));
      }
    });
  });
}
