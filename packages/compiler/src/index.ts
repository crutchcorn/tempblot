import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as ts from "typescript";
import { tokenizeRoot } from "./root-lexer.js";
import { parseRoot } from "./root-parser.js";
import { transformOutput } from "./output-transformer.js";

export { DoodlInstance, useParams } from "./instance.js";

// Declare the global storage for params
declare global {
  let doodleParams: Record<string, unknown> | undefined;
}

/**
 * Initialize globalThis.doodleParams if not already set
 */
function ensureDoodleParams(): Record<string, unknown> {
  if (!globalThis.doodleParams) {
    globalThis.doodleParams = {};
  }
  return globalThis.doodleParams;
}

/**
 * Transforms setup code to rewrite useParams() calls.
 * - Detects if useParams is imported from "doodl" (handles renames)
 * - Rewrites useParams() or aliasedName() to useParams.call(__doodlInstance)
 * - Injects the __doodlInstance creation at the top of setup
 */
function transformSetupCode(setupCode: string, sourcePath: string): string {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    setupCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  // Find the local name of useParams (could be renamed via `import { useParams as foo }`)
  let localUseParamsName: string | null = null;
  let isRenamed = false;

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== "doodl") continue;

    const namedBindings = stmt.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;

    for (const el of namedBindings.elements) {
      const importedName = el.propertyName?.text ?? el.name.text;
      if (importedName !== "useParams") continue;
      localUseParamsName = el.name.text;
      isRenamed = localUseParamsName !== "useParams";
      break;
    }

    if (localUseParamsName) break;
  }

  // If useParams is not imported from doodl, no transformation needed
  if (!localUseParamsName) return setupCode;

  // Escape sourcePath for use in string literal
  const escapedSourcePath = sourcePath
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  // Create the instance initialization code
  // If useParams was renamed, we need to import it with its original name for .call()
  const useParamsImport = isRenamed
    ? `import { useParams as __useParams, DoodlInstance as __DoodlInstance } from "doodl";`
    : `import { DoodlInstance as __DoodlInstance } from "doodl";`;

  const useParamsRef = isRenamed ? "__useParams" : "useParams";

  const instanceInit = `${useParamsImport}
const __doodlInstance = new __DoodlInstance(globalThis.doodleParams["${escapedSourcePath}"]);
`;

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit: ts.Visitor = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === localUseParamsName &&
        node.arguments.length === 0
      ) {
        const instantiated =
          node.typeArguments && node.typeArguments.length > 0
            ? ts.factory.createInstantiationExpression(
                ts.factory.createIdentifier(useParamsRef),
                node.typeArguments,
              )
            : ts.factory.createIdentifier(useParamsRef);

        return ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(instantiated, "call"),
          undefined,
          [ts.factory.createIdentifier("__doodlInstance")],
        );
      }

      return ts.visitEachChild(node, visit, context);
    };

    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };

  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const transformedCode = printer.printFile(result.transformed[0]);
  result.dispose();

  return instanceInit + transformedCode;
}

/**
 * @param sourcePath - the absolute path to the `.dood` source file
 * @param params - optional configuration to pass to the `.dood` file, accessible via useParams()
 * @returns the compiled output as a string
 */
export async function compilePath<TParams = unknown>(
  sourcePath: string,
  params?: TParams,
): Promise<string> {
  // Store params in globalThis for the compiled module to access
  const paramsStore = ensureDoodleParams();
  paramsStore[sourcePath] = params;

  try {
    const source = await fs.readFile(sourcePath, "utf8");
    const sourceDir = path.dirname(sourcePath);
    const rootTokens = tokenizeRoot(source);
    const rootAST = parseRoot(rootTokens);

    // Transform setup code to handle useParams() calls
    const transformedSetup = transformSetupCode(
      rootAST.setup.contents,
      sourcePath,
    );

    const transformedOutput = transformOutput(rootAST.output.contents);

    // Generate unique var name per compilation to avoid module caching issues
    const outputVarName = "o" + crypto.randomUUID().replace(/-/g, "");

    const concatenatedSetupOutput = `
      ${transformedSetup}
      export const ${outputVarName} = \`${transformedOutput}\`;
    `;
    // Write a temporary file to disk
    const tempPath = path.join(sourceDir, `.doodl_${outputVarName}.ts`);
    await fs.writeFile(tempPath, concatenatedSetupOutput);
    const compiledOutput: string = (await import(tempPath))[outputVarName];
    await fs.unlink(tempPath);
    return compiledOutput;
  } finally {
    // Clean up the stored params
    delete paramsStore[sourcePath];
  }
}
