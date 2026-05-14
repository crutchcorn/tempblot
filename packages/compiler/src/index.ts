import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  parseRoot,
  tokenizeRoot,
  transformOutputTemplate,
} from "@tempblot/parser";
import { transformSetup } from "./setup-transformer.ts";

export { TempblotInstance, useParams } from "./instance.ts";

declare global {
  var tempblotParams: Record<string, unknown> | undefined;
}

/**
 * @param sourcePath - the absolute path to the `.blot` source file
 * @param params - configuration passed to the `.blot` source file
 * @returns the compiled output as a string
 */
export async function compilePath<TParams = unknown>(
  sourcePath: string,
  params: TParams,
): Promise<string> {
  const outputVarName = "o" + crypto.randomUUID().replace(/-/g, "");
  const compiledModule = await loadPathModule(sourcePath, params, outputVarName);
  const compiledOutput = compiledModule[outputVarName];

  if (typeof compiledOutput !== "string") {
    throw new TypeError("Tempblot output must compile to a string");
  }

  return compiledOutput;
}

/**
 * @param sourcePath - the absolute path to the `.blot` source file
 * @param params - configuration passed to the `.blot` source file
 * @returns the evaluated exports from the source file's `<setup>` block
 */
export async function loadSetupPath<TParams = unknown>(
  sourcePath: string,
  params: TParams,
): Promise<Record<string, unknown>> {
  return loadPathModule(sourcePath, params);
}

async function loadPathModule<TParams = unknown>(
  sourcePath: string,
  params: TParams,
  outputVarName?: string,
): Promise<Record<string, unknown>> {
  globalThis.tempblotParams ??= {};
  globalThis.tempblotParams[sourcePath] = params;

  const source = await fs.readFile(sourcePath, "utf8");
  const sourceDir = path.dirname(sourcePath);
  const rootTokens = tokenizeRoot(source);
  const rootAST = parseRoot(rootTokens);
  const transformedSetup = transformSetup(rootAST.setup.contents, sourcePath);
  const concatenatedSetupOutput = outputVarName
    ? `
      ${transformedSetup}
      export const ${outputVarName} = \`${transformOutputTemplate(rootAST.output.contents)}\`;
    `
    : transformedSetup;

  // Write a temporary file to disk
  const tempPath = path.join(
    sourceDir,
    `.tempblot_${outputVarName ?? crypto.randomUUID().replace(/-/g, "")}.ts`,
  );

  try {
    await fs.writeFile(tempPath, concatenatedSetupOutput);
    return (await import(tempPath)) as Record<string, unknown>;
  } finally {
    await fs.unlink(tempPath);
  }
}
