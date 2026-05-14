import type {
  Diagnostic,
  LanguageServiceContext,
  LanguageServicePlugin,
  LanguageServicePluginInstance,
} from "@volar/language-service";
import type { ParsedRoot } from "@tempblot/parser";
import { URI } from "vscode-uri";
import { TempblotVirtualCode } from "./language-plugin.ts";

type DiagnosticsDocument = Parameters<
  NonNullable<LanguageServicePluginInstance["provideDiagnostics"]>
>[0];
type PositionAt = DiagnosticsDocument["positionAt"];

export function createTempblotServicePlugin(): LanguageServicePlugin {
  return {
    capabilities: {
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
    },
    create(context: LanguageServiceContext) {
      return {
        provideDiagnostics(document: DiagnosticsDocument) {
          const decoded = context.decodeEmbeddedDocumentUri(
            URI.parse(document.uri),
          );
          if (!decoded) {
            // Not a embedded document
            return;
          }
          const virtualCode = context.language.scripts
            .get(decoded[0])
            ?.generated?.embeddedCodes.get(decoded[1]);
          if (!(virtualCode instanceof TempblotVirtualCode)) {
            return;
          }
          return getTempblotRootDiagnostics(
            virtualCode.rootDocument,
            virtualCode.isPathFile,
            document.positionAt.bind(document),
          );
        },
      };
    },
  };
}

export function getTempblotRootDiagnostics(
  rootDocument: ParsedRoot,
  isPathFile: boolean,
  positionAt: PositionAt,
): Diagnostic[] | undefined {
  const setupNodes = rootDocument.blocks.filter((root) => root.tag === "setup");
  const outputNodes = rootDocument.blocks.filter(
    (root) => root.tag === "output",
  );

  const hasValidSetupCount = setupNodes.length <= 1;
  const hasValidOutputCount = outputNodes.length === 1;
  const hasValidPathOutputCount = outputNodes.length === 0;

  if (
    isPathFile &&
    hasValidSetupCount &&
    setupNodes.length === 1 &&
    hasValidPathOutputCount
  ) {
    return;
  }

  if (!isPathFile && hasValidSetupCount && hasValidOutputCount) {
    return;
  }

  const errors: Diagnostic[] = [];

  if (isPathFile && setupNodes.length === 0) {
    errors.push({
      severity: 1,
      range: {
        start: positionAt(0),
        end: positionAt(1),
      },
      source: "tempblot",
      message: "Missing setup tag.",
    });
  }

  if (!isPathFile && outputNodes.length === 0) {
    errors.push({
      severity: 1,
      range: {
        start: positionAt(0),
        end: positionAt(1),
      },
      source: "tempblot",
      message: "Missing output tag.",
    });
  }

  for (let i = 1; i < setupNodes.length; i++) {
    errors.push({
      severity: 2,
      range: {
        start: positionAt(setupNodes[i].start),
        end: positionAt(setupNodes[i].end),
      },
      source: "tempblot",
      message: "Only one setup tag is allowed.",
    });
  }

  if (isPathFile) {
    for (const outputNode of outputNodes) {
      errors.push({
        severity: 1,
        range: {
          start: positionAt(outputNode.start),
          end: positionAt(outputNode.end),
        },
        source: "tempblot",
        message: "Output tag is not allowed in path files.",
      });
    }

    return errors;
  }

  for (let i = 1; i < outputNodes.length; i++) {
    errors.push({
      severity: 2,
      range: {
        start: positionAt(outputNodes[i].start),
        end: positionAt(outputNodes[i].end),
      },
      source: "tempblot",
      message: "Only one output tag is allowed.",
    });
  }

  return errors;
}
