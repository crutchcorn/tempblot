/// <reference types="@volar/typescript" />
import { CodeMapping, type VirtualCode } from "@volar/language-core";
import { type LanguagePlugin } from "@volar/language-service";
import type * as ts from "typescript";
import * as html from "vscode-html-languageservice";
import { URI } from "vscode-uri";

export function createTempblotLanguagePlugin(): LanguagePlugin<
  URI,
  TempblotVirtualCode
> {
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
        const code = root.embeddedCodes?.find(
          (code) => code.id === "combined_context",
        );
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
        if (root.embeddedCodes) {
          const code = root.embeddedCodes[0];
          return [
            {
              fileName: fileName + "." + code.id + ".ts",
              code,
              extension: ".ts",
              scriptKind: 3,
            },
          ];
        }
        return [];
      },
    },
  };
}

const htmlLs = html.getLanguageService();

export class TempblotVirtualCode implements VirtualCode {
  id = "root";
  languageId = "tempblot";
  mappings: CodeMapping[];
  embeddedCodes: VirtualCode[] = [];

  // Reuse in custom language service plugin
  htmlDocument: html.HTMLDocument;

  constructor(public snapshot: ts.IScriptSnapshot) {
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
    this.htmlDocument = htmlLs.parseHTMLDocument(
      html.TextDocument.create(
        "",
        "html",
        0,
        snapshot.getText(0, snapshot.getLength()),
      ),
    );
    this.embeddedCodes = [
      ...getTempblotEmbeddedCodes(snapshot, this.htmlDocument),
    ];
  }
}

function* getTempblotEmbeddedCodes(
  snapshot: ts.IScriptSnapshot,
  htmlDocument: html.HTMLDocument,
): Generator<VirtualCode> {
  const setups = htmlDocument.roots.filter((root) => root.tag === "setup");
  const outputs = htmlDocument.roots.filter((root) => root.tag === "output");

  // If we have both setup and output, combine them into a single TypeScript context
  // This allows setup variables to be accessible in output interpolations
  if (setups.length > 0 && outputs.length > 0) {
    const setup = setups[0]; // Take the first setup block
    const output = outputs[0]; // Take the first output block

    if (
      !setup.startTagEnd ||
      !setup.endTagStart ||
      !output.startTagEnd ||
      !output.endTagStart
    ) {
      return;
    }

    const setupText = snapshot.getText(setup.startTagEnd, setup.endTagStart);
    const outputText = snapshot.getText(output.startTagEnd, output.endTagStart);

    // Extract interpolation expressions and their positions from output
    const interpolationsData = extractInterpolationsWithPositions(outputText);

    // Create a combined TypeScript context wrapped in a module
    // This ensures each .blot file has its own isolated scope
    const base = `export {}; // Make this file a module\n\n`;
    let combinedText = `${base}${setupText}\n\n// Output interpolations:\n`;

    const tsInterpolationMappings: CodeMapping[] = [];
    interpolationsData.forEach((interp, index) => {
      const interpLine = `const __interp_${index} = ${interp.expression};\n`;
      const interpStartOffset = combinedText.length;
      combinedText += interpLine;

      // Map the interpolation expression to the original source
      const expressionStart =
        interpStartOffset + `const __interp_${index} = `.length;
      tsInterpolationMappings.push({
        sourceOffsets: [output.startTagEnd! + interp.sourceStart],
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
      mappings: [
        // Mapping for setup block
        {
          sourceOffsets: [setup.startTagEnd],
          generatedOffsets: [base.length],
          lengths: [setupText.length],
          data: {
            completion: true,
            format: true,
            navigation: true,
            semantic: true,
            structure: true,
            verification: true,
          },
        },
        // Mappings for interpolation expressions
        ...tsInterpolationMappings,
      ],
      embeddedCodes: [],
    };

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

interface InterpolationData {
  expression: string;
  sourceStart: number;
  sourceEnd: number;
  fullStart: number; // includes <<
  fullEnd: number; // includes >>
}

function extractInterpolationsWithPositions(text: string): InterpolationData[] {
  const interpolations: InterpolationData[] = [];
  let i = 0;
  const length = text.length;

  while (i < length) {
    if (text[i] === "<" && text[i + 1] === "<") {
      const fullStart = i;
      let j = i + 2;
      let depth = 1;

      // Find the matching >>
      while (j < length && depth > 0) {
        if (text[j] === "<" && text[j + 1] === "<") {
          depth++;
          j += 2;
        } else if (text[j] === ">" && text[j + 1] === ">") {
          depth--;
          if (depth === 0) {
            // Extract the interpolation content
            const sourceStart = i + 2;
            const sourceEnd = j;
            const expression = text.substring(sourceStart, sourceEnd).trim();
            const fullEnd = j + 2;

            if (expression) {
              interpolations.push({
                expression,
                sourceStart,
                sourceEnd,
                fullStart,
                fullEnd,
              });
            }
            i = j + 2;
            break;
          }
          j += 2;
        } else {
          j++;
        }
      }

      if (depth > 0) {
        // Unclosed interpolation, skip
        i++;
      }
    } else {
      i++;
    }
  }

  return interpolations;
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
