#!/usr/bin/env node
import { cloneTemplate, spawnSafe } from "@tempblot/utils";
import t from "@bomb.sh/tab";
import { parse } from "@bomb.sh/args";
import { text, isCancel } from "@clack/prompts";
import * as path from "node:path";
import * as fs from "node:fs";

// tempblot get --url
const getCmd = t.command("get", "Get a template from a git repository");
getCmd.option("url", "Specify the git repository URL", (complete) => {
  complete("https://github.com/crutchcorn/tempblot.git", "Default repository");
});

const argv = process.argv.slice(2);
const args = parse(argv, {
  string: ["url"],
});

const [command] = args._;

if (command !== getCmd.value) {
  console.error(`Usage: tempblot ${getCmd.value} [--url <repository-url>]`);
  process.exit(1);
}

const url =
  args.url ||
  ((await text({
    message: "What is the URL of the git repository?",
    placeholder: "https://github.com/crutchcorn/tempblot.git",
  })) as string);

if (isCancel(url)) {
  console.log("Operation cancelled.");
  process.exit(0);
}

const { tmpPath } = await cloneTemplate({ url });

const configPath = path.resolve(tmpPath, "tempblot.config.ts");

if (!fs.existsSync(configPath)) {
  console.error(`Configuration file not found at ${configPath}`);
  process.exit(1);
}

const { new_child_process } = spawnSafe({
  file: configPath,
  defaultFSPaths: [process.cwd(), tmpPath],
});

new_child_process.stdout.pipe(process.stdout);
new_child_process.stderr.pipe(process.stderr);
new_child_process.on("exit", (code) => {
  process.exit(code || 0);
});
