import { expect, test } from "vitest";
import { parseTempblotRoot } from "@tempblot/parser";
import type * as ts from "typescript";
import { TempblotVirtualCode } from "../src/language-plugin.ts";
import { getTempblotRootDiagnostics } from "../src/service-plugin.ts";

function createVirtualCode(source: string): TempblotVirtualCode {
  const snapshot = {
    getText: (start, end) => source.substring(start, end),
    getLength: () => source.length,
    getChangeRange: () => undefined,
  } satisfies ts.IScriptSnapshot;

  return new TempblotVirtualCode(snapshot);
}

const positionAt = (offset: number) => ({ line: 0, character: offset });

test("creates TypeScript embedded code for setup-only files", () => {
  const source = `<setup>
const value: number = 1;
</setup>`;

  const virtualCode = createVirtualCode(source);
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

test("does not report missing-block diagnostics for single-section files", () => {
  const setupOnlyDiagnostics = getTempblotRootDiagnostics(
    parseTempblotRoot("<setup></setup>"),
    positionAt,
  );
  const outputOnlyDiagnostics = getTempblotRootDiagnostics(
    parseTempblotRoot("<output></output>"),
    positionAt,
  );

  expect(setupOnlyDiagnostics).toBeUndefined();
  expect(outputOnlyDiagnostics).toBeUndefined();
});

test("reports diagnostics when neither root section exists", () => {
  expect(
    getTempblotRootDiagnostics(parseTempblotRoot("plain text"), positionAt),
  ).toMatchObject([
    {
      severity: 1,
      source: "tempblot",
      message: "Missing setup or output tag.",
    },
  ]);
});
