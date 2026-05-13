import { expect, test } from "vitest";
import { transformSetup } from "../src/setup-transformer.js";

const sourcePath = "/path/to/somefile.tempblot";
const tempblotModulePath = new URL("../src/index.ts", import.meta.url).href;

function normalizeOutput(output: string): string {
  return output.replaceAll(tempblotModulePath, "file:///tempblot/index.ts");
}

test("transforms useParams calls", () => {
  const result = transformSetup(
    `import { useParams } from "tempblot";

const _config = useParams();
const config = useParams<{ abc: 1 }>();
`,
    sourcePath,
  );

  expect(normalizeOutput(result)).toMatchSnapshot();
});

test("transforms aliased useParams calls", () => {
  const result = transformSetup(
    `import { useParams as getParams } from "tempblot";

const config = getParams<{ abc: 1 }>();
`,
    sourcePath,
  );

  expect(normalizeOutput(result)).toMatchSnapshot();
});

test("does not transform setup without tempblot useParams import", () => {
  const setup = `const config = useParams<{ abc: 1 }>();
`;

  expect(transformSetup(setup, sourcePath)).toMatchSnapshot();
});
