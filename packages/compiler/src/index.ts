import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tokenizeRoot } from "./root-lexer.js";
import { parseRoot } from "./root-parser.js";
import { transformOutput } from "./output-transformer.js";

declare global {
  var tempbloteParams: Record<string, unknown> | undefined;
}

const tempblotInstanceVarName = "__tempblotInstance";
const tempblotModulePath = pathToFileURL(fileURLToPath(import.meta.url)).href;

export class TempblotInstance<TParams = unknown> {
  params: TParams;

  constructor(params: TParams) {
    this.params = params;
  }
}

export function useParams<TParams = unknown>(): TParams;
export function useParams<TParams = unknown>(
  this: TempblotInstance<TParams>,
): TParams;
export function useParams<TParams = unknown>(
  this: TempblotInstance<TParams> | undefined,
): TParams {
  if (!(this instanceof TempblotInstance)) {
    throw new Error(
      "You can only use `useParams` from `tempblot` in a `.blot` file",
    );
  }

  return this.params;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getUseParamsLocalNames(setup: string): string[] {
  const localNames: string[] = [];
  const tempblotImportRegex =
    /import\s*{(?<imports>[^}]*)}\s*from\s*["']tempblot["']\s*;?/g;

  for (const match of setup.matchAll(tempblotImportRegex)) {
    const imports = match.groups?.imports;

    if (!imports) continue;

    for (const specifier of imports.split(",")) {
      const parts = specifier.trim().split(/\s+as\s+/);
      const importedName = parts[0]?.trim();
      const localName = parts[1]?.trim() ?? importedName;

      if (importedName === "useParams" && localName) {
        localNames.push(localName);
      }
    }
  }

  return localNames;
}

function setupImportsTempblotInstance(setup: string): boolean {
  const tempblotImportRegex =
    /import\s*{(?<imports>[^}]*)}\s*from\s*["']tempblot["']\s*;?/g;

  for (const match of setup.matchAll(tempblotImportRegex)) {
    const imports = match.groups?.imports;

    if (!imports) continue;

    for (const specifier of imports.split(",")) {
      const importedName = specifier.trim().split(/\s+as\s+/)[0]?.trim();

      if (importedName === "TempblotInstance") {
        return true;
      }
    }
  }

  return false;
}

function updateTempblotImports(setup: string): string {
  let addedTempblotInstanceImport = setupImportsTempblotInstance(setup);

  return setup.replace(
    /import\s*{(?<imports>[^}]*)}\s*from\s*["']tempblot["']\s*;?/g,
    (importStatement, imports: string) => {
      if (addedTempblotInstanceImport) {
        return importStatement.replace(
          /["']tempblot["']/,
          JSON.stringify(tempblotModulePath),
        );
      }

      addedTempblotInstanceImport = true;

      return importStatement
        .replace(`{${imports}}`, `{${imports.trim()}, TempblotInstance}`)
        .replace(/["']tempblot["']/, JSON.stringify(tempblotModulePath));
    },
  );
}

function getImportInsertionIndex(setup: string): number {
  const importRegex = /^\s*import[\s\S]*?;\s*$/gm;
  let insertionIndex = 0;

  for (const match of setup.matchAll(importRegex)) {
    insertionIndex = match.index + match[0].length;
  }

  return insertionIndex;
}

function transformSetup(setup: string, sourcePath: string): string {
  const useParamsLocalNames = getUseParamsLocalNames(setup);

  if (useParamsLocalNames.length === 0) {
    return setup;
  }

  let transformedSetup = updateTempblotImports(setup);

  for (const localName of useParamsLocalNames) {
    const callRegex = new RegExp(
      String.raw`(?<![\w$.])${escapeRegExp(localName)}(\s*<[^()\n;]+>)?\s*\(\s*\)`,
      "g",
    );

    transformedSetup = transformedSetup.replace(
      callRegex,
      `${localName}$1.call(${tempblotInstanceVarName})`,
    );
  }

  const insertionIndex = getImportInsertionIndex(transformedSetup);
  const tempblotInstanceDeclaration = `\nconst ${tempblotInstanceVarName} = new TempblotInstance(globalThis.tempbloteParams[${JSON.stringify(sourcePath)}]);\n`;

  return `${transformedSetup.slice(0, insertionIndex)}${tempblotInstanceDeclaration}${transformedSetup.slice(insertionIndex)}`;
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
  globalThis.tempbloteParams ??= {};
  globalThis.tempbloteParams[sourcePath] = params;

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
