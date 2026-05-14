import Editor, { type Monaco } from '@monaco-editor/react';
import { useRef, useState } from 'react';
import type { CancellationToken, editor, IMarkdownString, languages, Position } from 'monaco-editor';
import { Registry, INITIAL, type IGrammar, type IRawGrammar, type IRawTheme, type StateStack } from 'vscode-textmate';
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma';
import { BrowserMessageReader, BrowserMessageWriter, createProtocolConnection } from 'vscode-languageserver-protocol/browser';
import type {
  CompletionItem,
  CompletionList,
  Diagnostic,
  DocumentDiagnosticReport,
  Hover,
  InitializeResult,
  Location,
  LocationLink,
  MarkupContent,
  Position as LspPosition,
  Range as LspRange,
  SemanticTokens,
  SemanticTokensOptions,
  SignatureHelp,
  ProtocolConnection,
} from 'vscode-languageserver-protocol/browser';
import tempblotGrammar from '../../../../packages/vscode/syntaxes/tempblot.tmLanguage.json';
import cssGrammar from 'tm-grammars/grammars/css.json';
import htmlGrammar from 'tm-grammars/grammars/html.json';
import htmlDerivativeGrammar from 'tm-grammars/grammars/html-derivative.json';
import javascriptGrammar from 'tm-grammars/grammars/javascript.json';
import jsxGrammar from 'tm-grammars/grammars/jsx.json';
import jsonGrammar from 'tm-grammars/grammars/json.json';
import jsoncGrammar from 'tm-grammars/grammars/jsonc.json';
import tsxGrammar from 'tm-grammars/grammars/tsx.json';
import typescriptGrammar from 'tm-grammars/grammars/typescript.json';
import yamlGrammar from 'tm-grammars/grammars/yaml.json';
import darkPlusTheme from 'tm-themes/themes/dark-plus.json';
import onigurumaWasmUrl from 'vscode-oniguruma/release/onig.wasm?url';
import './Playground.css';

const DEFAULT_SOURCE = `<setup>
// Run TypeScript in the <setup>
const someNumber = 123;

function add(a: number, b: number) {
  return a + b;
}
</setup>

<!-- Then use \`lang\` to get syntax highlighting in the template! -->
<!-- This browser version only supports a few languages, but the editor extensions supports many more. -->
<output lang="json">
{
    "Interpolation using arrows": "",
    "LSP Support": "Hover over this <<add(1, 2)>>",
    "Even proper type checking!": "Try changing the arguments to <<add(1, '2')>>"
}
</output>
`;

const BLOT_URI = 'file:///playground/template.blot';
const SEMANTIC_TOKEN_TYPES = [
  'namespace',
  'class',
  'enum',
  'interface',
  'typeParameter',
  'type',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'function',
  'method',
  'macro',
  'keyword',
  'modifier',
  'comment',
  'string',
  'number',
  'regexp',
  'operator',
  'decorator',
];
const SEMANTIC_TOKEN_MODIFIERS = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'abstract',
  'async',
  'modification',
  'documentation',
  'defaultLibrary',
  'local',
];

type Disposable = { dispose(): void };
type RawGrammar = IRawGrammar;
const asRawGrammar = (grammar: unknown): RawGrammar => grammar as RawGrammar;

class TextMateState implements languages.IState {
  constructor(private readonly ruleStack: StateStack | null) {}

  get stack() {
    return this.ruleStack;
  }

  clone() {
    return new TextMateState(this.ruleStack);
  }

  equals(other: languages.IState) {
    return other instanceof TextMateState && this.ruleStack === other.ruleStack;
  }
}

interface TempblotLanguageClient {
  dispose(): void;
}

export default function Playground() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const clientRef = useRef<TempblotLanguageClient | null>(null);

  async function handleMount(instance: editor.IStandaloneCodeEditor, monaco: Monaco) {
    const model = monaco.editor.createModel(source, 'tempblot', monaco.Uri.parse(BLOT_URI));
    instance.setModel(model);
    await configureMonaco(monaco, instance);
    clientRef.current?.dispose();
    clientRef.current = await startTempblotLanguageClient(monaco, model);
  }

  return (
    <main className="playground-shell">
      <section className="playground-copy">
        <p className="playground-eyebrow">Tempblot</p>
        <h1>Write templates with real TypeScript values</h1>
        <p>
          Tempblot lets you prepare data in a setup block, then interpolate those
          values into any text-based output format. Use it for generated files,
          configuration, fixtures, documentation, or any template that benefits
          from typed JavaScript and TypeScript expressions.
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
            'semanticHighlighting.enabled': true,
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

async function startTempblotLanguageClient(
  monaco: Monaco,
  model: editor.ITextModel,
): Promise<TempblotLanguageClient> {
  const worker = new Worker(new URL('../workers/tempblotLanguageServer.worker.ts', import.meta.url), {
    type: 'module',
  });
  const reader = new BrowserMessageReader(worker);
  const writer = new BrowserMessageWriter(worker);
  const connection = createProtocolConnection(reader, writer);
  const disposables: Disposable[] = [];

  connection.onNotification('textDocument/publishDiagnostics', (params: { uri: string; diagnostics: Diagnostic[] }) => {
    if (params.uri !== model.uri.toString()) {
      return;
    }

    monaco.editor.setModelMarkers(
      model,
      'tempblot-language-server',
      params.diagnostics.map((diagnostic) => toMonacoMarker(monaco, diagnostic)),
    );
  });

  connection.listen();

  const initializeResult = await connection.sendRequest('initialize', {
    processId: null,
    clientInfo: { name: 'tempblot-playground' },
    locale: navigator.language,
    rootUri: 'file:///playground',
    workspaceFolders: [{ uri: 'file:///playground', name: 'playground' }],
    capabilities: {
      textDocument: {
        synchronization: { dynamicRegistration: false, didSave: false },
        completion: {
          dynamicRegistration: false,
          completionItem: {
            documentationFormat: ['markdown', 'plaintext'],
            snippetSupport: true,
          },
        },
        hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
        signatureHelp: { dynamicRegistration: false, signatureInformation: { documentationFormat: ['markdown', 'plaintext'] } },
        definition: { dynamicRegistration: false, linkSupport: true },
        declaration: { dynamicRegistration: false, linkSupport: true },
        typeDefinition: { dynamicRegistration: false, linkSupport: true },
        implementation: { dynamicRegistration: false, linkSupport: true },
        documentHighlight: { dynamicRegistration: false },
        documentSymbol: { dynamicRegistration: false },
        semanticTokens: {
          dynamicRegistration: false,
          requests: { full: true, range: false },
          tokenTypes: SEMANTIC_TOKEN_TYPES,
          tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
          formats: ['relative'],
          overlappingTokenSupport: false,
          multilineTokenSupport: false,
          augmentsSyntaxTokens: true,
        },
        publishDiagnostics: { relatedInformation: true, versionSupport: false },
      },
      workspace: {
        workspaceFolders: true,
        configuration: false,
        didChangeWatchedFiles: { dynamicRegistration: false },
      },
      general: { positionEncodings: ['utf-16'] },
    },
  }) as InitializeResult;

  connection.sendNotification('initialized', {});
  sendDidOpen(connection, model);
  void pullDiagnostics(monaco, connection, model);

  let diagnosticsTimeout = 0;
  disposables.push(model.onDidChangeContent(() => {
    sendDidChange(connection, model);
    window.clearTimeout(diagnosticsTimeout);
    diagnosticsTimeout = window.setTimeout(() => {
      void pullDiagnostics(monaco, connection, model);
    }, 200);
  }));
  registerLanguageProviders(monaco, connection, initializeResult, disposables);

  return {
    dispose() {
      window.clearTimeout(diagnosticsTimeout);
      for (const disposable of disposables) {
        disposable.dispose();
      }
      connection.sendNotification('textDocument/didClose', {
        textDocument: { uri: model.uri.toString() },
      });
      monaco.editor.setModelMarkers(model, 'tempblot-language-server', []);
      connection.dispose();
      worker.terminate();
    },
  };
}

async function configureMonaco(monaco: Monaco, instance: editor.IStandaloneCodeEditor) {
  if (!monaco.languages.getLanguages().some((language: languages.ILanguageExtensionPoint) => language.id === 'tempblot')) {
    monaco.languages.register({ id: 'tempblot', extensions: ['.blot'] });
    monaco.languages.setLanguageConfiguration('tempblot', {
      brackets: [['<', '>'], ['{', '}'], ['[', ']'], ['(', ')']],
      autoClosingPairs: [
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: '`', close: '`' },
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
      ],
    });
  }

  await configureTextMate(monaco, instance);
}

let textMateConfiguration: Promise<void> | undefined;

async function configureTextMate(monaco: Monaco, instance: editor.IStandaloneCodeEditor) {
  textMateConfiguration ??= (async () => {
    await loadWASM(await fetch(onigurumaWasmUrl));

    const grammarByScope = new Map<string, RawGrammar>([
      ['source.tempblot', asRawGrammar(tempblotGrammar)],
      ['source.ts', asRawGrammar(typescriptGrammar)],
      ['source.tsx', asRawGrammar(tsxGrammar)],
      ['source.js', asRawGrammar(javascriptGrammar)],
      ['source.js.jsx', asRawGrammar(jsxGrammar)],
      ['source.json', asRawGrammar(jsonGrammar)],
      ['source.json.comments', asRawGrammar(jsoncGrammar)],
      ['text.html.basic', asRawGrammar(htmlGrammar)],
      ['text.html.derivative', asRawGrammar(htmlDerivativeGrammar)],
      ['source.css', asRawGrammar(cssGrammar)],
      ['source.yaml', asRawGrammar(yamlGrammar)],
    ]);

    const registry = new Registry({
      theme: createTextMateTheme(),
      onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
      loadGrammar: async (scopeName) => grammarByScope.get(scopeName) ?? createPlainTextGrammar(scopeName),
    });

    const grammar = await registry.loadGrammarWithEmbeddedLanguages('source.tempblot', 1, {
      'source.tempblot': 1,
      'text.html.derivative': 2,
      'text.html.basic': 3,
      'source.ts': 4,
      'source.tsx': 5,
      'source.js': 6,
      'source.js.jsx': 7,
      'source.css': 8,
      'source.json': 9,
      'source.json.comments': 10,
      'source.yaml': 11,
    });

    if (!grammar) {
      throw new Error('Unable to load Tempblot TextMate grammar.');
    }

    monaco.languages.setColorMap(registry.getColorMap());
    monaco.languages.setTokensProvider('tempblot', createTextMateTokensProvider(grammar));
    instance.setModel(instance.getModel());
  })();

  await textMateConfiguration;
}

function createTextMateTokensProvider(grammar: IGrammar): languages.EncodedTokensProvider {
  return {
    getInitialState() {
      return new TextMateState(INITIAL);
    },
    tokenizeEncoded(line, state) {
      const result = grammar.tokenizeLine2(line, state instanceof TextMateState ? state.stack : INITIAL);
      return {
        tokens: result.tokens,
        endState: new TextMateState(result.ruleStack),
      };
    },
  };
}

function createTextMateTheme(): IRawTheme {
  return {
    name: 'Tempblot Dark+',
    settings: [
      {
        settings: {
          foreground: darkPlusTheme.colors['editor.foreground'],
          background: darkPlusTheme.colors['editor.background'],
        },
      },
      ...darkPlusTheme.tokenColors,
    ],
  };
}

function createPlainTextGrammar(scopeName: string): RawGrammar {
  return {
    scopeName,
    repository: { $self: {}, $base: {} },
    patterns: [],
  };
}

function registerLanguageProviders(
  monaco: Monaco,
  connection: ProtocolConnection,
  initializeResult: InitializeResult,
  disposables: Disposable[],
) {
  const capabilities = initializeResult.capabilities;

  if (capabilities.completionProvider) {
    disposables.push(monaco.languages.registerCompletionItemProvider('tempblot', {
      triggerCharacters: capabilities.completionProvider.triggerCharacters,
      async provideCompletionItems(model: editor.ITextModel, position: Position, context: languages.CompletionContext) {
        const result = await connection.sendRequest('textDocument/completion', {
          textDocument: { uri: model.uri.toString() },
          position: toLspPosition(position),
          context: {
            triggerKind: context.triggerKind + 1,
            triggerCharacter: context.triggerCharacter,
          },
        }) as CompletionList | CompletionItem[] | null;

        const items = Array.isArray(result) ? result : (result?.items ?? []);
        return {
          incomplete: !Array.isArray(result) && result?.isIncomplete,
          suggestions: items.map((item) => toMonacoCompletionItem(monaco, model, position, item)),
        };
      },
    }));
  }

  if (capabilities.hoverProvider) {
    disposables.push(monaco.languages.registerHoverProvider('tempblot', {
      async provideHover(model: editor.ITextModel, position: Position) {
        const hover = await connection.sendRequest('textDocument/hover', {
          textDocument: { uri: model.uri.toString() },
          position: toLspPosition(position),
        }) as Hover | null;

        if (!hover) {
          return null;
        }

        return {
          contents: markupToMarkdownStrings(hover.contents),
          range: hover.range ? toMonacoRange(monaco, hover.range) : undefined,
        };
      },
    }));
  }

  if (capabilities.signatureHelpProvider) {
    disposables.push(monaco.languages.registerSignatureHelpProvider('tempblot', {
      signatureHelpTriggerCharacters: capabilities.signatureHelpProvider.triggerCharacters,
      signatureHelpRetriggerCharacters: capabilities.signatureHelpProvider.retriggerCharacters,
      async provideSignatureHelp(
        model: editor.ITextModel,
        position: Position,
        _token: CancellationToken,
        context: languages.SignatureHelpContext,
      ) {
        const signatureHelp = await connection.sendRequest('textDocument/signatureHelp', {
          textDocument: { uri: model.uri.toString() },
          position: toLspPosition(position),
          context: {
            triggerKind: context.triggerKind + 1,
            triggerCharacter: context.triggerCharacter,
            isRetrigger: context.isRetrigger,
          },
        }) as SignatureHelp | null;

        if (!signatureHelp) {
          return null;
        }

        return {
          value: {
            activeParameter: signatureHelp.activeParameter ?? 0,
            activeSignature: signatureHelp.activeSignature ?? 0,
            signatures: signatureHelp.signatures.map((signature) => ({
              label: signature.label,
              documentation: markupToString(signature.documentation),
              parameters: signature.parameters?.map((parameter) => ({
                label: Array.isArray(parameter.label) ? [parameter.label[0], parameter.label[1]] : parameter.label,
                documentation: markupToString(parameter.documentation),
              })) ?? [],
            })),
          },
          dispose() {},
        };
      },
    }));
  }

  if (capabilities.definitionProvider) {
    disposables.push(monaco.languages.registerDefinitionProvider('tempblot', {
      async provideDefinition(model: editor.ITextModel, position: Position) {
        const result = await connection.sendRequest('textDocument/definition', {
          textDocument: { uri: model.uri.toString() },
          position: toLspPosition(position),
        }) as Location | Location[] | LocationLink[] | null;

        return locationsToMonaco(monaco, result);
      },
    }));
  }

  if (capabilities.semanticTokensProvider) {
    const semanticTokensProvider = capabilities.semanticTokensProvider as SemanticTokensOptions;
    disposables.push(monaco.languages.registerDocumentSemanticTokensProvider('tempblot', {
      getLegend() {
        return semanticTokensProvider.legend;
      },
      async provideDocumentSemanticTokens(model: editor.ITextModel) {
        const result = await connection.sendRequest('textDocument/semanticTokens/full', {
          textDocument: { uri: model.uri.toString() },
        }) as SemanticTokens | null;

        return {
          resultId: result?.resultId,
          data: new Uint32Array(result?.data ?? []),
        };
      },
      releaseDocumentSemanticTokens() {},
    }));
  }
}

function sendDidOpen(connection: ProtocolConnection, model: editor.ITextModel) {
  connection.sendNotification('textDocument/didOpen', {
    textDocument: {
      uri: model.uri.toString(),
      languageId: 'tempblot',
      version: model.getVersionId(),
      text: model.getValue(),
    },
  });
}

function sendDidChange(connection: ProtocolConnection, model: editor.ITextModel) {
  connection.sendNotification('textDocument/didChange', {
    textDocument: {
      uri: model.uri.toString(),
      version: model.getVersionId(),
    },
    contentChanges: [{ text: model.getValue() }],
  });
}

async function pullDiagnostics(monaco: Monaco, connection: ProtocolConnection, model: editor.ITextModel) {
  try {
    const report = await connection.sendRequest('textDocument/diagnostic', {
      textDocument: { uri: model.uri.toString() },
    }) as DocumentDiagnosticReport | null;

    if (!report || report.kind !== 'full') {
      return;
    }

    monaco.editor.setModelMarkers(
      model,
      'tempblot-language-server',
      report.items.map((diagnostic) => toMonacoMarker(monaco, diagnostic)),
    );
  } catch {
    // Some server configurations use push diagnostics instead.
  }
}

function toLspPosition(position: Position): LspPosition {
  return { line: position.lineNumber - 1, character: position.column - 1 };
}

function toMonacoPosition(position: LspPosition) {
  return { lineNumber: position.line + 1, column: position.character + 1 };
}

function toMonacoRange(monaco: Monaco, range: LspRange) {
  return new monaco.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1,
  );
}

function toMonacoMarker(monaco: Monaco, diagnostic: Diagnostic): editor.IMarkerData {
  return {
    severity: toMonacoSeverity(monaco, diagnostic.severity),
    message: diagnostic.message,
    source: diagnostic.source,
    code: typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number' ? String(diagnostic.code) : undefined,
    startLineNumber: diagnostic.range.start.line + 1,
    startColumn: diagnostic.range.start.character + 1,
    endLineNumber: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
  };
}

function toMonacoSeverity(monaco: Monaco, severity: Diagnostic['severity']): editor.IMarkerData['severity'] {
  if (severity === 2) return monaco.MarkerSeverity.Warning;
  if (severity === 3) return monaco.MarkerSeverity.Info;
  if (severity === 4) return monaco.MarkerSeverity.Hint;
  return monaco.MarkerSeverity.Error;
}

function toMonacoCompletionItem(
  monaco: Monaco,
  model: editor.ITextModel,
  position: Position,
  item: CompletionItem,
): languages.CompletionItem {
  const word = model.getWordUntilPosition(position);
  const fallbackRange = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
  const range = item.textEdit && 'range' in item.textEdit
    ? toMonacoRange(monaco, item.textEdit.range)
    : fallbackRange;

  return {
    label: item.label,
    kind: toMonacoCompletionKind(monaco, item.kind),
    detail: item.detail,
    documentation: markupToMarkdownString(item.documentation),
    sortText: item.sortText,
    filterText: item.filterText,
    insertText: item.textEdit && 'newText' in item.textEdit ? item.textEdit.newText : (item.insertText ?? item.label),
    insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
    range,
    commitCharacters: item.commitCharacters,
  };
}

function toMonacoCompletionKind(monaco: Monaco, kind: CompletionItem['kind']): languages.CompletionItemKind {
  const kinds = monaco.languages.CompletionItemKind;
  switch (kind) {
    case 2: return kinds.Method;
    case 3: return kinds.Function;
    case 4: return kinds.Constructor;
    case 5: return kinds.Field;
    case 6: return kinds.Variable;
    case 7: return kinds.Class;
    case 8: return kinds.Interface;
    case 9: return kinds.Module;
    case 10: return kinds.Property;
    case 12: return kinds.Value;
    case 13: return kinds.Enum;
    case 14: return kinds.Keyword;
    case 15: return kinds.Snippet;
    case 20: return kinds.EnumMember;
    case 21: return kinds.Constant;
    case 22: return kinds.Struct;
    case 25: return kinds.TypeParameter;
    default: return kinds.Text;
  }
}

function markupToMarkdownStrings(value: Hover['contents']): IMarkdownString[] {
  if (Array.isArray(value)) {
    return value.map(markupToMarkdownString).filter((item): item is IMarkdownString => Boolean(item));
  }

  const item = markupToMarkdownString(value);
  return item ? [item] : [];
}

function markupToMarkdownString(value: string | MarkupContent | { language: string; value: string } | undefined): IMarkdownString | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return { value };
  }

  if ('language' in value) {
    return { value: `\`\`\`${value.language}\n${value.value}\n\`\`\`` };
  }

  return { value: value.value };
}

function markupToString(value: string | MarkupContent | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value === 'string' ? value : value.value;
}

function locationsToMonaco(monaco: Monaco, result: Location | Location[] | LocationLink[] | null): languages.Definition | null {
  if (!result) {
    return null;
  }

  const locations = Array.isArray(result) ? result : [result];
  return locations.map((location) => {
    if ('targetUri' in location) {
      return {
        uri: monaco.Uri.parse(location.targetUri),
        range: toMonacoRange(monaco, location.targetRange),
        targetSelectionRange: toMonacoRange(monaco, location.targetSelectionRange),
        originSelectionRange: location.originSelectionRange ? toMonacoRange(monaco, location.originSelectionRange) : undefined,
      };
    }

    return {
      uri: monaco.Uri.parse(location.uri),
      range: toMonacoRange(monaco, location.range),
    };
  });
}
