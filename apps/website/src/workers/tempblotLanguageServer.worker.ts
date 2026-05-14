import {
  createConnection,
  createServer,
  createTypeScriptProject,
  FileType,
  type InitializeParams,
  type InitializeResult,
} from '@volar/language-server/browser';
import {
  createTempblotLanguagePlugin,
  createTempblotServicePlugin,
} from '@tempblot/language-service';
import * as typescript from 'typescript';
import { create as createTypeScriptServicePlugins } from 'volar-service-typescript';

const connection = createConnection();
const server = createServer(connection);
const typeScriptLibPath = '/node_modules/typescript/lib';
const nodeTypesPath = '/playground/node_modules/@types/node';

connection.onInitialize(async (parameters: InitializeParams): Promise<InitializeResult> => {
  return server.initialize(
    parameters,
    createTypeScriptProject(
      playgroundTypescript,
      undefined,
      () => ({
        languagePlugins: [createTempblotLanguagePlugin({ serviceScriptMode: 'extraMts' })],
        setup({ project }) {
          patchPlaygroundTypeScriptHost(project.typescript?.languageServiceHost);
        },
      }),
    ),
    [
      ...createTypeScriptServicePlugins(playgroundTypescript),
      createTempblotServicePlugin(),
    ],
  );
});

connection.onInitialized(() => {
  server.initialized();
});

connection.listen();

function installPlaygroundFileSystem() {
  server.fileSystem.install('file', {
    readFile(uri) {
      return virtualTypeFilesByUri.get(toFileUriString(uri));
    },
    stat(uri) {
      const uriString = toFileUriString(uri);
      if (virtualTypeFilesByUri.has(uriString)) {
        return { type: FileType.File, ctime: 0, mtime: 0, size: virtualTypeFilesByUri.get(uriString)!.length };
      }
      if (hasVirtualChild(virtualTypeFilesByUri, uriString)) {
        return { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 };
      }
    },
    readDirectory(uri) {
      const uriString = toFileUriString(uri);
      const prefix = uriString.endsWith('/') ? uriString : `${uriString}/`;
      const entries = new Map<string, FileType>();

      for (const file of virtualTypeFilesByUri.keys()) {
        if (!file.startsWith(prefix)) {
          continue;
        }

        const [name, rest] = file.slice(prefix.length).split('/', 2);
        entries.set(name, rest ? FileType.Directory : FileType.File);
      }

      return [...entries];
    },
  });
}

function patchPlaygroundTypeScriptHost(host: typescript.LanguageServiceHost | undefined) {
  if (!host) {
    return;
  }

  const originalReadFile = host.readFile?.bind(host);
  const originalFileExists = host.fileExists?.bind(host);
  const originalDirectoryExists = host.directoryExists?.bind(host);
  const originalReadDirectory = host.readDirectory?.bind(host);
  const originalGetCompilationSettings = host.getCompilationSettings.bind(host);
  const originalGetScriptFileNames = host.getScriptFileNames.bind(host);
  const originalGetScriptSnapshot = host.getScriptSnapshot.bind(host);
  const originalGetScriptVersion = host.getScriptVersion.bind(host);
  const originalGetDefaultLibFileName = host.getDefaultLibFileName?.bind(host);
  const originalResolveLibrary = host.resolveLibrary?.bind(host);
  const originalResolveTypeReferenceDirectiveReferences = host.resolveTypeReferenceDirectiveReferences?.bind(host);

  host.readFile = (fileName) => {
    const normalized = normalizeFileName(fileName);
    const source = virtualTypeFilesByPath.get(normalized);
    return source ?? originalReadFile?.(fileName);
  };
  host.fileExists = (fileName) => {
    const normalized = normalizeFileName(fileName);
    return virtualTypeFilesByPath.has(normalized) || originalFileExists?.(fileName) || false;
  };
  host.directoryExists = (directoryName) => {
    const normalized = normalizeFileName(directoryName);
    return hasVirtualChild(virtualTypeFilesByPath, normalized)
      || originalDirectoryExists?.(directoryName)
      || false;
  };
  host.readDirectory = (rootDir, extensions, excludes, includes, depth) => {
    const normalizedRoot = normalizeFileName(rootDir);
    const virtualFiles = [...virtualTypeFilesByPath.keys()].filter((file) => file.startsWith(`${normalizedRoot}/`));
    return [...new Set([
      ...virtualFiles,
      ...(originalReadDirectory?.(rootDir, extensions, excludes, includes, depth) ?? []),
    ])];
  };
  host.getCompilationSettings = () => ({
    ...originalGetCompilationSettings(),
    module: playgroundTypescript.ModuleKind.NodeNext,
    moduleResolution: playgroundTypescript.ModuleResolutionKind.NodeNext,
  });
  host.getScriptFileNames = () => [...new Set([
    ...originalGetScriptFileNames(),
    ...nodeTypeRootFiles,
  ])];
  host.getScriptSnapshot = (fileName) => {
    const normalized = normalizeFileName(fileName);
    const source = virtualTypeFilesByPath.get(normalized);
    if (source !== undefined) {
      return playgroundTypescript.ScriptSnapshot.fromString(source);
    }
    return originalGetScriptSnapshot(fileName);
  };
  host.getScriptVersion = (fileName) => {
    if (virtualTypeFilesByPath.has(normalizeFileName(fileName))) {
      return '0';
    }
    return originalGetScriptVersion(fileName);
  };
  host.getDefaultLibFileName = (options) => {
    const libName = playgroundTypescript.getDefaultLibFileName(options).split('/').pop()!;
    const virtualPath = `${typeScriptLibPath}/${libName}`;
    return virtualTypeFilesByPath.has(virtualPath) ? virtualPath : originalGetDefaultLibFileName?.(options) ?? virtualPath;
  };
  host.getDefaultLibLocation = () => typeScriptLibPath;
  host.resolveLibrary = (libraryName, resolveFrom, options, libFileName) => {
    const virtualPath = `${typeScriptLibPath}/${libFileName}`;
    if (virtualTypeFilesByPath.has(virtualPath)) {
      return {
        resolvedModule: {
          resolvedFileName: virtualPath,
          extension: playgroundTypescript.Extension.Dts,
          isExternalLibraryImport: false,
        },
      };
    }
    return originalResolveLibrary?.(libraryName, resolveFrom, options, libFileName) ?? { resolvedModule: undefined };
  };
  host.resolveTypeReferenceDirectiveReferences = (typeDirectiveReferences, containingFile, redirectedReference, options, containingSourceFile, reusedNames) => {
    if (originalResolveTypeReferenceDirectiveReferences) {
      const originalResults = originalResolveTypeReferenceDirectiveReferences(
        typeDirectiveReferences,
        containingFile,
        redirectedReference,
        options,
        containingSourceFile,
        reusedNames,
      );

      return originalResults.map((result, index) => result.resolvedTypeReferenceDirective ? result : resolvePlaygroundTypeReference(typeDirectiveReferences[index]));
    }

    return typeDirectiveReferences.map(resolvePlaygroundTypeReference);
  };

  function resolvePlaygroundTypeReference(typeDirectiveReference: string | typescript.FileReference) {
    const typeName = typeof typeDirectiveReference === 'string' ? typeDirectiveReference : typeDirectiveReference.fileName;
    const virtualPath = `/playground/node_modules/@types/${typeName}/index.d.ts`;

    if (!virtualTypeFilesByPath.has(virtualPath)) {
      return { resolvedTypeReferenceDirective: undefined };
    }

    return {
      resolvedTypeReferenceDirective: {
        primary: true,
        resolvedFileName: virtualPath,
        typeName,
      },
    };
  }
}

function createVirtualTypeFiles() {
  return new Map<string, string>([
    ['/playground/package.json', JSON.stringify({ type: 'module' })],
    ['/playground/tsconfig.json', JSON.stringify({
      compilerOptions: {
        target: 'ES2021',
        lib: ['ES2021'],
        types: ['node'],
        strict: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        allowSyntheticDefaultImports: true,
        skipLibCheck: true,
      },
      include: ['**/*.blot'],
    })],
    ['/playground/node_modules/@types/node/package.json', JSON.stringify({
      name: '@types/node',
      version: '0.0.0-playground',
      types: 'index.d.ts',
    })],
    ...Object.entries(nodeTypeSources).map(([path, source]) => [`${nodeTypesPath}/${path}`, source] as const),
    ...Object.entries(typeScriptLibSources).map(([name, source]) => [`${typeScriptLibPath}/${name}`, source] as const),
  ]);
}

function toFileUriString(uri: { scheme: string; path: string; toString(): string }) {
  return uri.scheme === 'file' ? `file://${uri.path}` : uri.toString();
}

function normalizeFileName(fileName: string) {
  return fileName.replace(/\\/g, '/');
}

function hasVirtualChild(files: Map<string, string>, path: string) {
  return [...files.keys()].some((file) => file.startsWith(`${path}/`));
}

const typeScriptLibSources = Object.fromEntries(
  Object.entries(import.meta.glob('/node_modules/typescript/lib/lib*.d.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  })).map(([path, source]) => [path.split('/').pop()!, source as string]),
);

const nodeTypeSources = Object.fromEntries(
  Object.entries(import.meta.glob('/node_modules/@types/node/**/*.d.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  })).map(([path, source]) => [path.split('/node/')[1], source as string]),
);

const playgroundTypescript = {
  ...typescript,
  getDefaultLibFilePath(options: typescript.CompilerOptions) {
    return `${typeScriptLibPath}/${typescript.getDefaultLibFileName(options)}`;
  },
} satisfies typeof typescript;

const virtualTypeFilesByPath = createVirtualTypeFiles();
const nodeTypeRootFiles = [...virtualTypeFilesByPath.keys()]
  .filter((fileName) => fileName.startsWith(`${nodeTypesPath}/`) && fileName.endsWith('.d.ts'));
const virtualTypeFilesByUri = new Map(
  [...virtualTypeFilesByPath].map(([path, source]) => [`file://${path}`, source]),
);

installPlaygroundFileSystem();
