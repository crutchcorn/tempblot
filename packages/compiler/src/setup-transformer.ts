import ts from "typescript";

const tempblotInstanceVarName = "__tempblotInstance";

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

function isTypeOnlyImportClause(importClause: ts.ImportClause): boolean {
  return importClause.phaseModifier === ts.SyntaxKind.TypeKeyword;
}

function isTypeOnlyImportSpecifier(specifier: ts.ImportSpecifier): boolean {
  return ts.isTypeOnlyImportDeclaration(specifier);
}

function getUseParamsLocalNames(sourceFile: ts.SourceFile): Set<string> {
  const localNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !isTempblotImportDeclaration(statement) ||
      (statement.importClause && isTypeOnlyImportClause(statement.importClause))
    ) {
      continue;
    }

    for (const specifier of getNamedImportElements(statement) ?? []) {
      if (
        !isTypeOnlyImportSpecifier(specifier) &&
        getImportedName(specifier) === "useParams"
      ) {
        localNames.add(specifier.name.text);
      }
    }
  }

  return localNames;
}

function sourceFileImportsTempblotInstance(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some((statement) => {
    if (
      !isTempblotImportDeclaration(statement) ||
      (statement.importClause && isTypeOnlyImportClause(statement.importClause))
    ) {
      return false;
    }

    return (getNamedImportElements(statement) ?? []).some((specifier) => {
      return (
        !isTypeOnlyImportSpecifier(specifier) &&
        getImportedName(specifier) === "TempblotInstance"
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
      node.moduleSpecifier,
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
      node.moduleSpecifier,
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
  const updatedImportClause = ts.factory.createImportClause(
    importClause.phaseModifier,
    importClause.name,
    updatedNamedBindings,
  );

  return ts.factory.updateImportDeclaration(
    node,
    node.modifiers,
    updatedImportClause,
    node.moduleSpecifier,
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
                  "tempblotParams",
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
        const callExpression = ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(node.expression, "call"),
          undefined,
          [ts.factory.createIdentifier(tempblotInstanceVarName)],
        );

        if (node.typeArguments?.[0]) {
          return ts.factory.createAsExpression(
            callExpression,
            node.typeArguments[0],
          );
        }

        return callExpression;
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

    if (
      !ts.isImportDeclaration(statement) &&
      !insertedTempblotInstanceDeclaration
    ) {
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

export function transformSetup(setup: string, sourcePath: string): string {
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

  return ts
    .createPrinter({ newLine: ts.NewLineKind.LineFeed })
    .printFile(transformedSourceFile);
}
