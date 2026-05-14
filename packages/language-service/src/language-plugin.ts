/// <reference types="@volar/typescript" />
import type { CodeMapping, VirtualCode } from "@volar/language-core";
import { type LanguagePlugin } from "@volar/language-service";
import {
  getRootBlocks,
  parseTempblotRoot,
  scanInterpolations,
  type InterpolationData,
  type ParsedRoot,
} from "@tempblot/parser";
import type * as ts from "typescript";
import { URI } from "vscode-uri";

interface TempblotLanguagePluginOptions {
  serviceScriptMode?: "primary" | "extraMts";
}

export function createTempblotLanguagePlugin(
  options: TempblotLanguagePluginOptions = {},
): LanguagePlugin<URI, TempblotVirtualCode> {
  const serviceScriptMode = options.serviceScriptMode ?? "primary";

  return {
    getLanguageId(fileNameOrUri) {
      if (String(fileNameOrUri).endsWith(".blot")) {
        return "tempblot";
      }
    },
    createVirtualCode(
      _uri: URI,
      languageId: string,
      snapshot: ts.IScriptSnapshot,
    ) {
      if (languageId === "tempblot") {
        return new TempblotVirtualCode(snapshot);
      }
    },
    typescript: {
      extraFileExtensions: [
        {
          extension: "blot",
          isMixedContent: true,
          scriptKind: 3 satisfies ts.ScriptKind.TS,
        },
      ],
      getServiceScript(root) {
        if (serviceScriptMode === "extraMts") {
          return undefined;
        }

        const code = getCombinedContextCode(root);
        if (!code) {
          return undefined;
        }

        return {
          code,
          extension: ".ts",
          scriptKind: 3 satisfies ts.ScriptKind.TS,
          preventLeadingOffset: true,
        };
      },
      getExtraServiceScripts(fileName, root) {
        if (serviceScriptMode !== "extraMts") {
          return [];
        }

        const code = getCombinedContextCode(root);

        if (code) {
          return [
            {
              fileName: fileName + "." + code.id + ".mts",
              code,
              extension: ".mts",
              scriptKind: 3,
            },
          ];
        }
        return [];
      },
    },
  };
}

function getCombinedContextCode(root: VirtualCode) {
  return root.embeddedCodes?.find((code) => code.id === "combined_context");
}

export class TempblotVirtualCode implements VirtualCode {
  id = "root";
  languageId = "tempblot";
  mappings: CodeMapping[];
  embeddedCodes: VirtualCode[] = [];

  // Reuse in custom language service plugin
  rootDocument: ParsedRoot;

  snapshot: ts.IScriptSnapshot;

  constructor(snapshot: ts.IScriptSnapshot) {
    this.snapshot = snapshot;
    this.mappings = [
      {
        sourceOffsets: [0],
        generatedOffsets: [0],
        lengths: [snapshot.getLength()],
        data: {
          completion: true,
          format: true,
          navigation: true,
          semantic: true,
          structure: true,
          verification: true,
        },
      },
    ];
    this.rootDocument = parseTempblotRoot(
      snapshot.getText(0, snapshot.getLength()),
    );
    this.embeddedCodes = [
      ...getTempblotEmbeddedCodes(snapshot, this.rootDocument),
    ];
  }
}

function* getTempblotEmbeddedCodes(
  snapshot: ts.IScriptSnapshot,
  rootDocument: ParsedRoot,
): Generator<VirtualCode> {
  const setups = getRootBlocks(rootDocument, "setup");
  const outputs = getRootBlocks(rootDocument, "output");
  const setup = setups[0];
  const output = outputs[0];

  // Combine setup and output interpolations into one TypeScript context so setup
  // variables are visible from interpolation expressions when both exist.
  if (setup || output) {
    const base = `export {}; // Make this file a module\n\n`;
    let combinedText = base;
    const tsMappings: CodeMapping[] = [];

    if (setup) {
      const setupText = snapshot.getText(setup.startTagEnd, setup.endTagStart);
      const setupGeneratedOffset = combinedText.length;
      combinedText += setupText;

      tsMappings.push({
        sourceOffsets: [setup.startTagEnd],
        generatedOffsets: [setupGeneratedOffset],
        lengths: [setupText.length],
        data: {
          completion: true,
          format: true,
          navigation: true,
          semantic: true,
          structure: true,
          verification: true,
        },
      });
    }

    const outputText = output
      ? snapshot.getText(output.startTagEnd, output.endTagStart)
      : "";

    const interpolationsData = output ? scanInterpolations(outputText) : [];
    if (interpolationsData.length > 0) {
      combinedText += `\n\n// Output interpolations:\n`;
    }

    interpolationsData.forEach((interp) => {
      const interpLine = `(${interp.expression});\n`;
      const interpStartOffset = combinedText.length;
      combinedText += interpLine;

      // Map the interpolation expression to the original source
      const expressionStart = interpStartOffset + `(`.length;
      tsMappings.push({
        sourceOffsets: [output.startTagEnd + interp.sourceStart],
        generatedOffsets: [expressionStart],
        lengths: [interp.expression.length],
        data: {
          completion: true,
          format: true,
          navigation: true,
          semantic: true,
          structure: true,
          verification: true,
        },
      });
    });

    yield {
      id: "combined_context",
      languageId: "typescript",
      snapshot: {
        getText: (start, end) => combinedText.substring(start, end),
        getLength: () => combinedText.length,
        getChangeRange: () => undefined,
      },
      mappings: tsMappings,
      embeddedCodes: [],
    };

    if (!output) {
      return;
    }

    // Create JSON output with interpolations replaced by placeholder values
    const { transformedText, jsonMappings } = createJsonWithMappings(
      outputText,
      interpolationsData,
      output.startTagEnd,
    );

    // TODO: Make generic and not tied to JSON
    yield {
      id: "output_json",
      languageId: "json",
      snapshot: {
        getText: (start, end) => transformedText.substring(start, end),
        getLength: () => transformedText.length,
        getChangeRange: () => undefined,
      },
      mappings: jsonMappings,
      embeddedCodes: [],
    };
  }
}

function createJsonWithMappings(
  outputText: string,
  interpolationsData: InterpolationData[],
  outputStartOffset: number,
): { transformedText: string; jsonMappings: CodeMapping[] } {
  const mappings: CodeMapping[] = [];
  let transformedText = "";
  let lastOffset = 0;
  let generatedOffset = 0;

  // Process each interpolation
  for (const interp of interpolationsData) {
    // Add text before interpolation with mapping
    const beforeText = outputText.substring(lastOffset, interp.fullStart);
    if (beforeText.length > 0) {
      mappings.push({
        sourceOffsets: [outputStartOffset + lastOffset],
        generatedOffsets: [generatedOffset],
        lengths: [beforeText.length],
        data: {
          completion: true,
          format: true,
          navigation: true,
          semantic: true,
          structure: true,
          verification: true,
        },
      });
      transformedText += beforeText;
      generatedOffset += beforeText.length;
    }

    // Replace interpolation with null placeholder for JSON validity
    const placeholder = "null";
    transformedText += placeholder;
    generatedOffset += placeholder.length;

    lastOffset = interp.fullEnd;
  }

  // Add remaining text after last interpolation
  const remainingText = outputText.substring(lastOffset);
  if (remainingText.length > 0) {
    mappings.push({
      sourceOffsets: [outputStartOffset + lastOffset],
      generatedOffsets: [generatedOffset],
      lengths: [remainingText.length],
      data: {
        completion: true,
        format: true,
        navigation: true,
        semantic: true,
        structure: true,
        verification: true,
      },
    });
    transformedText += remainingText;
  }

  return { transformedText, jsonMappings: mappings };
}
