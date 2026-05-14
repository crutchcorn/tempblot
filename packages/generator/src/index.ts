import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { compilePath, loadSetupPath } from "tempblot";

export type ExistingFileBehavior = "error" | "overwrite" | "skip";

export type TemplateParams = Record<string, unknown>;

export interface GenerateOptions<TParams extends TemplateParams = TemplateParams> {
  inputDir: string | URL;
  params?: TParams;
  outputDir: string | URL;
  existingFiles?: ExistingFileBehavior;
}

export type GeneratedFileAction = "created" | "overwritten" | "skipped";

export interface GeneratedFile {
  sourcePath: string;
  outputPath: string;
  action: GeneratedFileAction;
}

export interface GenerateResult {
  files: GeneratedFile[];
}

interface GenerateState {
  inputDir: string;
  outputDir: string;
  existingFiles: ExistingFileBehavior;
  files: GeneratedFile[];
}

const blotExtension = ".blot";
const pathsFileName = `_paths${blotExtension}`;
const dynamicSegmentPattern = /\[([^\]]+)\]/g;

export async function generate<
  TParams extends TemplateParams = TemplateParams,
>(options: GenerateOptions<TParams>): Promise<GenerateResult> {
  const state: GenerateState = {
    inputDir: normalizeInputPath(options.inputDir),
    outputDir: normalizeInputPath(options.outputDir),
    existingFiles: options.existingFiles ?? "error",
    files: [],
  };

  await processDirectoryContents(state, state.inputDir, [], options.params ?? {});

  return { files: state.files };
}

async function processDirectoryContents(
  state: GenerateState,
  inputDir: string,
  outputSegments: string[],
  params: TemplateParams,
): Promise<void> {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });

  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const sourcePath = path.join(inputDir, entry.name);

    if (entry.isDirectory()) {
      await processDirectory(state, sourcePath, outputSegments, params);
      continue;
    }

    if (!entry.isFile() || entry.name === pathsFileName) {
      continue;
    }

    if (entry.name.endsWith(blotExtension)) {
      await processBlotFile(state, sourcePath, outputSegments, params);
    } else {
      await copyStaticFile(state, sourcePath, [...outputSegments, entry.name]);
    }
  }
}

async function processDirectory(
  state: GenerateState,
  sourcePath: string,
  outputSegments: string[],
  params: TemplateParams,
): Promise<void> {
  const directoryName = path.basename(sourcePath);

  if (!hasDynamicSegment(directoryName)) {
    await processDirectoryContents(state, sourcePath, [
      ...outputSegments,
      directoryName,
    ], params);
    return;
  }

  const pathsSourcePath = path.join(sourcePath, pathsFileName);
  const pathParams = await readPathParams(pathsSourcePath, params, true);

  for (const nextParams of pathParams) {
    const mergedParams = mergeParams(params, nextParams);
    const renderedDirectoryName = renderDynamicSegments(
      directoryName,
      mergedParams,
      sourcePath,
    );

    await processDirectoryContents(
      state,
      sourcePath,
      [...outputSegments, ...splitOutputPath(renderedDirectoryName, sourcePath)],
      mergedParams,
    );
  }
}

async function processBlotFile(
  state: GenerateState,
  sourcePath: string,
  outputSegments: string[],
  params: TemplateParams,
): Promise<void> {
  const sourceName = path.basename(sourcePath);
  const outputName = sourceName.slice(0, -blotExtension.length);

  if (!hasDynamicSegment(outputName)) {
    const output = await compilePath(sourcePath, params);
    await writeOutputFile(state, sourcePath, [...outputSegments, outputName], output);
    return;
  }

  const pathParams = await readPathParams(sourcePath, params, false);

  for (const nextParams of pathParams) {
    const mergedParams = mergeParams(params, nextParams);
    const renderedOutputName = renderDynamicSegments(
      outputName,
      mergedParams,
      sourcePath,
    );
    const output = await compilePath(sourcePath, mergedParams);

    await writeOutputFile(
      state,
      sourcePath,
      [...outputSegments, ...splitOutputPath(renderedOutputName, sourcePath)],
      output,
    );
  }
}

async function copyStaticFile(
  state: GenerateState,
  sourcePath: string,
  outputSegments: string[],
): Promise<void> {
  const contents = await fs.readFile(sourcePath);
  await writeOutputFile(state, sourcePath, outputSegments, contents);
}

async function readPathParams(
  sourcePath: string,
  params: TemplateParams,
  requireGetPaths: boolean,
): Promise<TemplateParams[]> {
  const setupExports = await loadSetupPath(sourcePath, params);
  const getPaths: unknown = setupExports.getPaths;

  if (getPaths === undefined) {
    if (requireGetPaths) {
      throw new Error(`${sourcePath} must export a getPaths function`);
    }

    return [params];
  }

  if (typeof getPaths !== "function") {
    throw new TypeError(`${sourcePath} exports getPaths, but it is not a function`);
  }

  const pathGetter = getPaths as () => unknown;
  const result = await pathGetter();

  if (!Array.isArray(result)) {
    throw new TypeError(`${sourcePath} getPaths must return an array`);
  }

  return result.map((entry, index) => {
    if (!isTemplateParams(entry)) {
      throw new TypeError(
        `${sourcePath} getPaths entry at index ${index} must be an object`,
      );
    }

    return entry;
  });
}

async function writeOutputFile(
  state: GenerateState,
  sourcePath: string,
  outputSegments: string[],
  contents: string | Uint8Array,
): Promise<void> {
  const outputPath = resolveOutputPath(state, outputSegments);
  const exists = await pathExists(outputPath);

  if (exists && state.existingFiles === "error") {
    throw new Error(`Output file already exists: ${outputPath}`);
  }

  if (exists && state.existingFiles === "skip") {
    state.files.push({ sourcePath, outputPath, action: "skipped" });
    return;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, contents);
  state.files.push({
    sourcePath,
    outputPath,
    action: exists ? "overwritten" : "created",
  });
}

function resolveOutputPath(
  state: GenerateState,
  outputSegments: string[],
): string {
  const outputPath = path.resolve(state.outputDir, ...outputSegments);
  const relativeOutputPath = path.relative(state.outputDir, outputPath);

  if (
    relativeOutputPath.startsWith("..") ||
    path.isAbsolute(relativeOutputPath)
  ) {
    throw new Error(`Generated output path escapes outputDir: ${outputPath}`);
  }

  return outputPath;
}

function renderDynamicSegments(
  segment: string,
  params: TemplateParams,
  sourcePath: string,
): string {
  return segment.replace(dynamicSegmentPattern, (_match, paramName: string) => {
    const value = params[paramName];

    if (value === undefined || value === null) {
      throw new Error(`${sourcePath} is missing dynamic param: ${paramName}`);
    }

    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new TypeError(
        `${sourcePath} dynamic param ${paramName} must be a string, number, or boolean`,
      );
    }

    const text = String(value);

    if (text.length === 0) {
      throw new Error(`${sourcePath} dynamic param ${paramName} cannot be empty`);
    }

    return text;
  });
}

function splitOutputPath(outputPath: string, sourcePath: string): string[] {
  if (path.isAbsolute(outputPath) || /^[A-Za-z]:[\\/]/.test(outputPath)) {
    throw new Error(`${sourcePath} generated an absolute output path`);
  }

  const segments = outputPath.split(/[\\/]+/).filter(Boolean);

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`${sourcePath} generated an unsafe output path`);
  }

  return segments;
}

function hasDynamicSegment(segment: string): boolean {
  return /\[[^\]]+\]/.test(segment);
}

function mergeParams(
  params: TemplateParams,
  nextParams: TemplateParams,
): TemplateParams {
  return { ...params, ...nextParams };
}

function isTemplateParams(value: unknown): value is TemplateParams {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function normalizeInputPath(inputPath: string | URL): string {
  return path.resolve(
    inputPath instanceof URL ? fileURLToPath(inputPath) : inputPath,
  );
}
