import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
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

function isTempblotImportDeclaration(
  node: ts.Node,
): node is ts.ImportDeclaration & { moduleSpecifier: ts.StringLiteral } {
  return (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    node.moduleSpecifier.text === "tempblot"
  );
}

function getNamedImportElements(
  node: ts.ImportDeclaration,
): ts.NodeArray<ts.ImportSpecifier> | undefined {
  const namedBindings = node.importClause?.namedBindings;

  if (!namedBindings || !ts.isNamedImports(namedBindings)) {
    return undefined;
  }

  return namedBindings.elements;
}

function getImportedName(specifier: ts.ImportSpecifier): string {
  return specifier.propertyName?.text ?? specifier.name.text;
}

function getUseParamsLocalNames(sourceFile: ts.SourceFile): Set<string> {
  const localNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!isTempblotImportDeclaration(statement) || statement.importClause?.isTypeOnly) {
      continue;
    }

    for (const specifier of getNamedImportElements(statement) ?? []) {
      if (!specifier.isTypeOnly && getImportedName(specifier) === "useParams") {
        localNames.add(specifier.name.text);
      }
    }
  }

  return localNames;
}

function sourceFileImportsTempblotInstance(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some((statement) => {
    if (!isTempblotImportDeclaration(statement) || statement.importClause?.isTypeOnly) {
      return false;
    }

    return (getNamedImportElements(statement) ?? []).some((specifier) => {
      return (
        !specifier.isTypeOnly && getImportedName(specifier) === "TempblotInstance"
      );
    });
  });
}

function updateTempblotImportDeclaration(
  node: ts.ImportDeclaration,
  shouldAddTempblotInstance: boolean,
): ts.ImportDeclaration {
  const importClause = node.importClause;

  if (!importClause) {
    return ts.factory.updateImportDeclaration(
      node,
      node.modifiers,
      importClause,
      ts.factory.createStringLiteral(tempblotModulePath),
      node.attributes,
    );
  }

  const namedBindings = importClause.namedBindings;

  if (
    !shouldAddTempblotInstance ||
    !namedBindings ||
    !ts.isNamedImports(namedBindings)
  ) {
    return ts.factory.updateImportDeclaration(
      node,
      node.modifiers,
      importClause,
      ts.factory.createStringLiteral(tempblotModulePath),
      node.attributes,
    );
  }

  const updatedNamedBindings = ts.factory.updateNamedImports(namedBindings, [
    ...namedBindings.elements,
    ts.factory.createImportSpecifier(
      false,
      undefined,
      ts.factory.createIdentifier("TempblotInstance"),
    ),
  ]);
  const updatedImportClause = ts.factory.updateImportClause(
    importClause,
    importClause.isTypeOnly,
    importClause.name,
    updatedNamedBindings,
  );

  return ts.factory.updateImportDeclaration(
    node,
    node.modifiers,
    updatedImportClause,
    ts.factory.createStringLiteral(tempblotModulePath),
    node.attributes,
  );
}

function createTempblotInstanceDeclaration(sourcePath: string): ts.Statement {
  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          tempblotInstanceVarName,
          undefined,
          undefined,
          ts.factory.createNewExpression(
            ts.factory.createIdentifier("TempblotInstance"),
            undefined,
            [
              ts.factory.createElementAccessExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier("globalThis"),
                  "tempbloteParams",
                ),
                ts.factory.createStringLiteral(sourcePath),
              ),
            ],
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

function transformUseParamsCalls(
  sourceFile: ts.SourceFile,
  useParamsLocalNames: Set<string>,
): ts.SourceFile {
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit: ts.Visitor = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.arguments.length === 0 &&
        useParamsLocalNames.has(node.expression.text)
      ) {
        const callTarget = node.typeArguments
          ? ts.factory.createPropertyAccessExpression(
              ts.factory.createExpressionWithTypeArguments(
                node.expression,
                node.typeArguments,
              ),
              "call",
            )
          : ts.factory.createPropertyAccessExpression(node.expression, "call");

        return ts.factory.createCallExpression(callTarget, undefined, [
          ts.factory.createIdentifier(tempblotInstanceVarName),
        ]);
      }

      return ts.visitEachChild(node, visit, context);
    };

    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };

  const transformResult = ts.transform(sourceFile, [transformer]);
  const transformedSourceFile = transformResult.transformed[0];
  transformResult.dispose();

  return transformedSourceFile;
}

function injectTempblotInstance(
  sourceFile: ts.SourceFile,
  sourcePath: string,
): ts.SourceFile {
  const statements: ts.Statement[] = [];
  const importsTempblotInstance = sourceFileImportsTempblotInstance(sourceFile);
  let addedTempblotInstanceImport = importsTempblotInstance;
  let insertedTempblotInstanceDeclaration = false;

  for (const statement of sourceFile.statements) {
    if (isTempblotImportDeclaration(statement)) {
      const shouldAddTempblotInstance = !addedTempblotInstanceImport;
      statements.push(
        updateTempblotImportDeclaration(statement, shouldAddTempblotInstance),
      );
      addedTempblotInstanceImport = true;
      continue;
    }

    if (!ts.isImportDeclaration(statement) && !insertedTempblotInstanceDeclaration) {
      statements.push(createTempblotInstanceDeclaration(sourcePath));
      insertedTempblotInstanceDeclaration = true;
    }

    statements.push(statement);
  }

  if (!insertedTempblotInstanceDeclaration) {
    statements.push(createTempblotInstanceDeclaration(sourcePath));
  }

  return ts.factory.updateSourceFile(sourceFile, statements);
}

function transformSetup(setup: string, sourcePath: string): string {
  const sourceFile = ts.createSourceFile(
    "setup.ts",
    setup,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const useParamsLocalNames = getUseParamsLocalNames(sourceFile);

  if (useParamsLocalNames.size === 0) {
    return setup;
  }

  const transformedSourceFile = transformUseParamsCalls(
    injectTempblotInstance(sourceFile, sourcePath),
    useParamsLocalNames,
  );

  return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(
    transformedSourceFile,
  );
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
