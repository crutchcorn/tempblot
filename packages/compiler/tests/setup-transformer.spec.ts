import { expect, test } from "vitest";
import { transformSetup } from "../src/setup-transformer.js";

const sourcePath = "/path/to/somefile.tempblot";

test("transforms useParams calls", () => {
  const result = transformSetup(
    `import { useParams } from "tempblot";

const _config = useParams();
const config = useParams<{ abc: 1 }>();
`,
    sourcePath,
  );

  expect(result).toMatchSnapshot();
});

test("transforms aliased useParams calls", () => {
  const result = transformSetup(
    `import { useParams as getParams } from "tempblot";

const config = getParams<{ abc: 1 }>();
`,
    sourcePath,
  );

  expect(result).toMatchSnapshot();
});

test("does not transform setup without tempblot useParams import", () => {
  const setup = `const config = useParams<{ abc: 1 }>();
`;

  expect(transformSetup(setup, sourcePath)).toMatchSnapshot();
});
