import { expect, test } from "vitest";
import { parseTempblotRoot } from "@tempblot/parser";
import type * as ts from "typescript";
import { isPathBlotUri, TempblotVirtualCode } from "../src/language-plugin.ts";
import { getTempblotRootDiagnostics } from "../src/service-plugin.ts";

function createVirtualCode(
  source: string,
  isPathFile = false,
): TempblotVirtualCode {
  const snapshot = {
    getText: (start, end) => source.substring(start, end),
    getLength: () => source.length,
    getChangeRange: () => undefined,
  } satisfies ts.IScriptSnapshot;

  return new TempblotVirtualCode(snapshot, isPathFile);
}

const positionAt = (offset: number) => ({ line: 0, character: offset });

test("detects path files from URI and TypeScript plugin file names", () => {
  expect(isPathBlotUri("/project/_paths.blot")).toBe(true);
  expect(isPathBlotUri("C:\\project\\_paths.blot")).toBe(true);
  expect(isPathBlotUri("/project/_path.blot")).toBe(false);
});

test("creates TypeScript embedded code for setup-only path files", () => {
  const source = `<setup>
const value: number = 1;
</setup>`;

  const virtualCode = createVirtualCode(source, true);
  const combinedContext = virtualCode.embeddedCodes.find(
    (code) => code.id === "combined_context",
  );

  expect(combinedContext?.snapshot.getText(0, combinedContext.snapshot.getLength()))
    .toContain("const value: number = 1;");
  expect(virtualCode.embeddedCodes.map((code) => code.id)).not.toContain(
    "output_json",
  );
});

test("creates output embedded code for output-only files", () => {
  const source = `<output lang="json">
{"value": <<1 + 1>>}
</output>`;

  const virtualCode = createVirtualCode(source);
  const combinedContext = virtualCode.embeddedCodes.find(
    (code) => code.id === "combined_context",
  );
  const outputJson = virtualCode.embeddedCodes.find(
    (code) => code.id === "output_json",
  );

  expect(combinedContext?.snapshot.getText(0, combinedContext.snapshot.getLength()))
    .toContain("(1 + 1);");
  expect(outputJson?.snapshot.getText(0, outputJson.snapshot.getLength()))
    .toContain('{"value": null}');
});

test("creates empty TypeScript embedded code for output-only files without interpolations", () => {
  const source = `<output lang="json">
{
    "test": "a"
}
</output>`;

  const virtualCode = createVirtualCode(source);
  const combinedContext = virtualCode.embeddedCodes.find(
    (code) => code.id === "combined_context",
  );
  const outputJson = virtualCode.embeddedCodes.find(
    (code) => code.id === "output_json",
  );

  expect(combinedContext?.snapshot.getText(0, combinedContext.snapshot.getLength()))
    .toBe("export {}; // Make this file a module\n\n");
  expect(combinedContext?.mappings).toEqual([]);
  expect(outputJson?.snapshot.getText(0, outputJson.snapshot.getLength()))
    .toContain('"test": "a"');
});

test("creates empty TypeScript embedded code for files without root sections", () => {
  const virtualCode = createVirtualCode("plain text");
  const combinedContext = virtualCode.embeddedCodes.find(
    (code) => code.id === "combined_context",
  );

  expect(combinedContext?.snapshot.getText(0, combinedContext.snapshot.getLength()))
    .toBe("export {}; // Make this file a module\n\n");
  expect(combinedContext?.mappings).toEqual([]);
});

test("requires output for regular files", () => {
  expect(
    getTempblotRootDiagnostics(
      parseTempblotRoot("<setup></setup>"),
      false,
      positionAt,
    ),
  ).toMatchObject([
    {
      severity: 1,
      source: "tempblot",
      message: "Missing output tag.",
    },
  ]);
});

test("allows output-only regular files", () => {
  const outputOnlyDiagnostics = getTempblotRootDiagnostics(
    parseTempblotRoot("<output></output>"),
    false,
    positionAt,
  );

  expect(outputOnlyDiagnostics).toBeUndefined();
});

test("requires setup and rejects output for path files", () => {
  const setupOnlyDiagnostics = getTempblotRootDiagnostics(
    parseTempblotRoot("<setup></setup>"),
    true,
    positionAt,
  );
  const outputOnlyDiagnostics = getTempblotRootDiagnostics(
    parseTempblotRoot("<output></output>"),
    true,
    positionAt,
  );

  expect(setupOnlyDiagnostics).toBeUndefined();
  expect(outputOnlyDiagnostics).toMatchObject([
    {
      severity: 1,
      source: "tempblot",
      message: "Missing setup tag.",
    },
    {
      severity: 1,
      source: "tempblot",
      message: "Output tag is not allowed in path files.",
    },
  ]);
});

test("reports diagnostics when regular files have no output", () => {
  expect(
    getTempblotRootDiagnostics(parseTempblotRoot("plain text"), false, positionAt),
  ).toMatchObject([
    {
      severity: 1,
      source: "tempblot",
      message: "Missing output tag.",
    },
  ]);
});
