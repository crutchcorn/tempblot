import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tokenizeRoot } from "./root-lexer.js";
import { parseRoot } from "./root-parser.js";
import { transformOutput } from "./output-transformer.js";
import { transformSetup } from "./setup-transformer.js";

export { TempblotInstance, useParams } from "./instance.js";

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
  globalThis.tempblotParams ??= {};
  globalThis.tempblotParams[sourcePath] = params;

  const outputVarName = "o" + crypto.randomUUID().replace(/-/g, "");
  const source = await fs.readFile(sourcePath, "utf8");
  const sourceDir = path.dirname(sourcePath);
  const rootTokens = tokenizeRoot(source);
  const rootAST = parseRoot(rootTokens);
  const transformedOutput = transformOutput(rootAST.output.contents);
  const transformedSetup = transformSetup(rootAST.setup.contents, sourcePath);
  const concatenatedSetupOutput = `
    ${transformedSetup}
    export const ${outputVarName} = \`${transformedOutput}\`;
  `;
  // Write a temporary file to disk
  const tempPath = path.join(sourceDir, `.tempblot_${outputVarName}.ts`);
  try {
    await fs.writeFile(tempPath, concatenatedSetupOutput);
    const compiledOutput: string = (await import(tempPath))[outputVarName];
    return compiledOutput;
  } finally {
    await fs.unlink(tempPath);
  }
}
