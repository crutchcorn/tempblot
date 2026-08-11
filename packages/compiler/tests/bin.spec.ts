import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { cleanup, render } from "cli-testing-library";
import "cli-testing-library/vitest";
import { expect, test } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");

test("the packed binary runs outside the project", async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "tempblot-bin-"));

  try {
    const packOutput = execFileSync(
      "npm",
      ["pack", "--json", "--pack-destination", temporaryRoot],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_cache: join(temporaryRoot, "npm-cache"),
        },
      },
    );
    const [{ filename, files }] = JSON.parse(packOutput) as [
      {
        filename: string;
        files: { path: string }[];
      },
    ];

    expect(files.map(({ path }) => path)).toContain("dist/bin/tempblot.js");

    execFileSync("tar", [
      "-xzf",
      join(temporaryRoot, filename),
      "-C",
      temporaryRoot,
    ]);

    const packageDirectory = join(temporaryRoot, "package");
    const packageJson = JSON.parse(
      readFileSync(join(packageDirectory, "package.json"), "utf8"),
    ) as { bin: string };
    const binaryPath = resolve(packageDirectory, packageJson.bin);

    expect(statSync(binaryPath).mode & 0o111).not.toBe(0);

    const installedBinary = join(
      temporaryRoot,
      "consumer/node_modules/.bin/tempblot",
    );
    mkdirSync(dirname(installedBinary), { recursive: true });
    symlinkSync(binaryPath, installedBinary);

    const cli = await render(installedBinary, [], {
      cwd: join(temporaryRoot, "consumer"),
    });

    expect(
      await cli.findByText("What is the URL of the git repository?"),
    ).toBeInTheConsole();
  } finally {
    await cleanup();
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
