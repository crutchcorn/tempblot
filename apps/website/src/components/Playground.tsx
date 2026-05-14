import Editor, { type Monaco } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import {
  getRootBlocks,
  parseTempblotRoot,
  scanInterpolations,
  type InterpolationData,
  type ParsedRoot,
} from 'tempblot-parser';
import type { editor, languages } from 'monaco-editor';
import './Playground.css';

const DEFAULT_SOURCE = `<!-- Run TypeScript via Node -->
<setup>
import { v4 } from "uuid";

const data = {
  hello: !!v4 ? 123 : null
};
</setup>

<!-- Use \`lang\` to change the syntax highlighting of the \`output\` block -->
<output lang="json">
{
  "//": "Interpolate values with << >>",
  "test": <<data.hello>>
}
</output>
`;

const BLOT_URI = 'file:///playground/template.blot';
const TS_URI = 'file:///playground/template.blot.combined_context.ts';
const JSON_URI = 'file:///playground/template.blot.output.json';
const TS_BASE = 'export {}; // Make this file a module\n\n';
const TS_INTERPOLATION_HEADER = '\n\n// Output interpolations:\n';

type Marker = editor.IMarkerData;
type TypeScriptDiagnostic = {
  category: 0 | 1 | 2 | 3;
  code: number;
  start?: number;
  length?: number;
  messageText: string | DiagnosticMessageChain;
};
type DiagnosticMessageChain = {
  messageText: string;
  next?: DiagnosticMessageChain[];
};

interface Mapping {
  sourceStart: number;
  generatedStart: number;
  length: number;
}

interface VirtualDocuments {
  rootDocument: ParsedRoot;
  tsText: string;
  tsMappings: Mapping[];
  jsonText: string;
  jsonMappings: Mapping[];
  rootMarkers: Marker[];
}

export default function Playground() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const tsModelRef = useRef<editor.ITextModel | null>(null);
  const jsonModelRef = useRef<editor.ITextModel | null>(null);
  const rootMarkersRef = useRef<Marker[]>([]);
  const tsMarkersRef = useRef<Marker[]>([]);
  const jsonMarkersRef = useRef<Marker[]>([]);
  const tsMappingsRef = useRef<Mapping[]>([]);
  const jsonMappingsRef = useRef<Mapping[]>([]);
  const validationRunRef = useRef(0);

  useEffect(() => {
    const monaco = monacoRef.current;
    const blotModel = editorRef.current?.getModel();
    if (!monaco || !blotModel) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void validateSource(monaco, blotModel, source, validationRunRef.current + 1);
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [source]);

  function handleMount(instance: editor.IStandaloneCodeEditor, monaco: Monaco) {
    editorRef.current = instance;
    monacoRef.current = monaco;

    configureMonaco(monaco);

    const blotUri = monaco.Uri.parse(BLOT_URI);
    const tsUri = monaco.Uri.parse(TS_URI);
    const jsonUri = monaco.Uri.parse(JSON_URI);

    instance.setModel(monaco.editor.createModel(source, 'tempblot', blotUri));
    tsModelRef.current = monaco.editor.createModel('', 'typescript', tsUri);
    jsonModelRef.current = monaco.editor.createModel('', 'json', jsonUri);

    monaco.editor.onDidChangeMarkers((uris: readonly { toString(): string }[]) => {
      if (!uris.some((uri) => uri.toString() === JSON_URI)) {
        return;
      }

      jsonMarkersRef.current = mapMonacoMarkers(
        monaco,
        jsonModelRef.current,
        jsonMappingsRef.current,
        monaco.editor.getModelMarkers({ resource: jsonUri }),
      );
      publishMarkers(monaco);
    });

    void validateSource(monaco, instance.getModel(), source, validationRunRef.current + 1);
  }

  async function validateSource(
    monaco: Monaco,
    blotModel: editor.ITextModel | null,
    value: string,
    runId: number,
  ) {
    if (!blotModel || !tsModelRef.current || !jsonModelRef.current) {
      return;
    }

    validationRunRef.current = runId;

    const virtualDocuments = createVirtualDocuments(monaco, blotModel, value);
    rootMarkersRef.current = virtualDocuments.rootMarkers;
    tsMappingsRef.current = virtualDocuments.tsMappings;
    jsonMappingsRef.current = virtualDocuments.jsonMappings;
    tsModelRef.current.setValue(virtualDocuments.tsText);
    jsonModelRef.current.setValue(virtualDocuments.jsonText);

    try {
      const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
      const worker = await getWorker(tsModelRef.current.uri);
      const diagnostics = await Promise.all([
        worker.getSyntacticDiagnostics(TS_URI),
        worker.getSemanticDiagnostics(TS_URI),
      ]);

      if (validationRunRef.current !== runId) {
        return;
      }

      tsMarkersRef.current = diagnostics
        .flat()
        .map((diagnostic: TypeScriptDiagnostic) =>
          mapTypeScriptDiagnostic(monaco, blotModel, virtualDocuments.tsMappings, diagnostic),
        )
        .filter((marker: Marker | undefined): marker is Marker => Boolean(marker));
      publishMarkers(monaco);
    } catch (error) {
      if (validationRunRef.current === runId) {
        tsMarkersRef.current = [
          {
            severity: monaco.MarkerSeverity.Warning,
            message: `TypeScript validation is unavailable: ${error instanceof Error ? error.message : String(error)}`,
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
            source: 'tempblot-playground',
          },
        ];
        publishMarkers(monaco);
      }
    }
  }

  function publishMarkers(monaco: Monaco) {
    const model = editorRef.current?.getModel();
    if (!model) {
      return;
    }

    monaco.editor.setModelMarkers(model, 'tempblot-playground', [
      ...rootMarkersRef.current,
      ...tsMarkersRef.current,
      ...jsonMarkersRef.current,
    ]);
  }

  return (
    <main className="playground-shell">
      <section className="playground-copy">
        <p className="playground-eyebrow">Tempblot Playground</p>
        <h1>Edit templates with browser diagnostics</h1>
        <p>
          Try changing setup variables, interpolation expressions, or the JSON output.
          Monaco reports Tempblot structure errors plus TypeScript and JSON diagnostics
          mapped back into the <code>.blot</code> document.
        </p>
      </section>
      <section className="playground-editor" aria-label="Tempblot editor">
        <Editor
          defaultLanguage="tempblot"
          defaultValue={source}
          height="100%"
          options={{
            automaticLayout: true,
            fontSize: 14,
            minimap: { enabled: false },
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            tabSize: 2,
          }}
          theme="vs-dark"
          onChange={(value) => setSource(value ?? '')}
          onMount={handleMount}
        />
      </section>
    </main>
  );
}

function configureMonaco(monaco: Monaco) {
  if (!monaco.languages.getLanguages().some((language: languages.ILanguageExtensionPoint) => language.id === 'tempblot')) {
    monaco.languages.register({ id: 'tempblot', extensions: ['.blot'] });
    monaco.languages.setMonarchTokensProvider('tempblot', {
      tokenizer: {
        root: [
          [/<!--.*-->/, 'comment'],
          [/<\/?[a-zA-Z][\w-]*/, 'tag'],
          [/\b[a-zA-Z-]+(?==)/, 'attribute.name'],
          [/"[^"]*"/, 'attribute.value'],
          [/<<|>>/, 'delimiter'],
        ],
      },
    });
  }

  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    noEmit: true,
    strict: true,
    target: monaco.languages.typescript.ScriptTarget.ES2022,
  });
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
  });
}

function createVirtualDocuments(monaco: Monaco, blotModel: editor.ITextModel, source: string): VirtualDocuments {
  const rootDocument = parseTempblotRoot(source);
  const setups = getRootBlocks(rootDocument, 'setup');
  const outputs = getRootBlocks(rootDocument, 'output');
  const rootMarkers = createRootMarkers(monaco, blotModel, setups, outputs);

  if (setups.length === 0 || outputs.length === 0) {
    return { rootDocument, tsText: '', tsMappings: [], jsonText: '', jsonMappings: [], rootMarkers };
  }

  const setup = setups[0];
  const output = outputs[0];
  const setupText = source.slice(setup.startTagEnd, setup.endTagStart);
  const outputText = source.slice(output.startTagEnd, output.endTagStart);
  const interpolations = scanInterpolations(outputText);
  const tsMappings: Mapping[] = [
    { sourceStart: setup.startTagEnd, generatedStart: TS_BASE.length, length: setupText.length },
  ];
  let tsText = `${TS_BASE}${setupText}${TS_INTERPOLATION_HEADER}`;

  interpolations.forEach((interpolation, index) => {
    const prefix = `const __interp_${index} = `;
    const line = `${prefix}${interpolation.expression};\n`;
    tsMappings.push({
      sourceStart: output.startTagEnd + interpolation.sourceStart,
      generatedStart: tsText.length + prefix.length,
      length: interpolation.expression.length,
    });
    tsText += line;
  });

  const { jsonText, jsonMappings } = createJsonVirtualDocument(outputText, interpolations, output.startTagEnd);

  return { rootDocument, tsText, tsMappings, jsonText, jsonMappings, rootMarkers };
}

function createRootMarkers(
  monaco: Monaco,
  model: editor.ITextModel,
  setups: ReturnType<typeof getRootBlocks>,
  outputs: ReturnType<typeof getRootBlocks>,
): Marker[] {
  const markers: Marker[] = [];

  if (setups.length === 0) {
    markers.push(createMarkerAtOffset(monaco, model, 0, 1, 'Missing setup tag.', monaco.MarkerSeverity.Error, 'tempblot'));
  }

  if (outputs.length === 0) {
    markers.push(createMarkerAtOffset(monaco, model, 0, 1, 'Missing output tag.', monaco.MarkerSeverity.Error, 'tempblot'));
  }

  for (const setup of setups.slice(1)) {
    markers.push(
      createMarkerAtOffset(
        monaco,
        model,
        setup.start,
        Math.max(1, setup.end - setup.start),
        'Only one setup tag is allowed.',
        monaco.MarkerSeverity.Warning,
        'tempblot',
      ),
    );
  }

  for (const output of outputs.slice(1)) {
    markers.push(
      createMarkerAtOffset(
        monaco,
        model,
        output.start,
        Math.max(1, output.end - output.start),
        'Only one output tag is allowed.',
        monaco.MarkerSeverity.Warning,
        'tempblot',
      ),
    );
  }

  return markers;
}

function createJsonVirtualDocument(
  outputText: string,
  interpolations: InterpolationData[],
  outputStartOffset: number,
): { jsonText: string; jsonMappings: Mapping[] } {
  const jsonMappings: Mapping[] = [];
  let jsonText = '';
  let lastOffset = 0;

  for (const interpolation of interpolations) {
    const beforeText = outputText.slice(lastOffset, interpolation.fullStart);
    if (beforeText.length > 0) {
      jsonMappings.push({
        sourceStart: outputStartOffset + lastOffset,
        generatedStart: jsonText.length,
        length: beforeText.length,
      });
      jsonText += beforeText;
    }

    jsonText += 'null';
    lastOffset = interpolation.fullEnd;
  }

  const remainingText = outputText.slice(lastOffset);
  if (remainingText.length > 0) {
    jsonMappings.push({
      sourceStart: outputStartOffset + lastOffset,
      generatedStart: jsonText.length,
      length: remainingText.length,
    });
    jsonText += remainingText;
  }

  return { jsonText, jsonMappings };
}

function mapTypeScriptDiagnostic(
  monaco: Monaco,
  model: editor.ITextModel | null,
  mappings: Mapping[],
  diagnostic: TypeScriptDiagnostic,
): Marker | undefined {
  if (!model || diagnostic.start === undefined) {
    return undefined;
  }

  return mapGeneratedRangeToMarker(
    monaco,
    model,
    mappings,
    diagnostic.start,
    diagnostic.length ?? 1,
    flattenMessageText(diagnostic.messageText),
    diagnostic.category === 0 ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
    'typescript',
  );
}

function mapMonacoMarkers(
  monaco: Monaco,
  model: editor.ITextModel | null,
  mappings: Mapping[],
  markers: editor.IMarker[],
): Marker[] {
  if (!model) {
    return [];
  }

  return markers
    .map((marker) => {
      const startOffset = model.getOffsetAt({ lineNumber: marker.startLineNumber, column: marker.startColumn });
      const endOffset = model.getOffsetAt({ lineNumber: marker.endLineNumber, column: marker.endColumn });
      return mapGeneratedRangeToMarker(
        monaco,
        model,
        mappings,
        startOffset,
        Math.max(1, endOffset - startOffset),
        marker.message,
        marker.severity,
        marker.source ?? 'json',
      );
    })
    .filter((marker): marker is Marker => Boolean(marker));
}

function mapGeneratedRangeToMarker(
  monaco: Monaco,
  sourceModel: editor.ITextModel,
  mappings: Mapping[],
  generatedStart: number,
  generatedLength: number,
  message: string,
  severity: Marker['severity'],
  source: string,
): Marker | undefined {
  const mapping = mappings.find(
    (candidate) =>
      generatedStart >= candidate.generatedStart && generatedStart <= candidate.generatedStart + candidate.length,
  );

  if (!mapping) {
    return undefined;
  }

  const relativeStart = Math.min(generatedStart - mapping.generatedStart, mapping.length);
  const sourceStart = mapping.sourceStart + relativeStart;
  const sourceLength = Math.max(1, Math.min(generatedLength, mapping.length - relativeStart));

  return createMarkerAtOffset(monaco, sourceModel, sourceStart, sourceLength, message, severity, source);
}

function createMarkerAtOffset(
  monaco: Monaco,
  model: editor.ITextModel,
  offset: number,
  length: number,
  message: string,
  severity: Marker['severity'],
  source: string,
): Marker {
  const start = model.getPositionAt(offset);
  const end = model.getPositionAt(offset + length);
  return {
    severity,
    message,
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
    source,
  };
}

function flattenMessageText(message: TypeScriptDiagnostic['messageText']): string {
  if (typeof message === 'string') {
    return message;
  }

  return [message.messageText, ...(message.next ?? []).map(flattenMessageText)].join('\n');
}
