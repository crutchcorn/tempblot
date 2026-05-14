import * as languageServerProtocol from '@volar/language-server/protocol.js';
import {
  activateAutoInsertion,
  activateDocumentDropEdit,
  createLabsInfo,
  getTsdk
} from '@volar/vscode';
import {
  extensions,
  window,
  workspace,
  Disposable,
  ProgressLocation,
  ExtensionContext
} from 'vscode';
import { LanguageClient, TransportKind } from '@volar/vscode/node.js';

let client: LanguageClient | undefined;
let disposable: Disposable | undefined;

export async function activate(context: ExtensionContext) {
  // Activate TypeScript extension first
  extensions.getExtension('vscode.typescript-language-features')?.activate();

  // Get TypeScript SDK path
  const { tsdk } = (await getTsdk(context)) ?? { tsdk: '' };

  // Create language client
  client = new LanguageClient(
    'Tempblot',
    {
      module: context.asAbsolutePath('./out/language-server.js'),
      transport: TransportKind.ipc
    },
    {
      documentSelector: [{ language: 'tempblot' }],
      initializationOptions: {
        typescript: { tsdk }
      },
      middleware: {}
    }
  );

  // Start server initially if enabled
  void tryRestartServer();

  // Watch for configuration changes
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('tempblot.server.enable')) {
        void tryRestartServer();
      }
    })
  );

  // Create Volar Labs integration
  const volarLabs = createLabsInfo(languageServerProtocol);
  volarLabs.addLanguageClient(client);

  return volarLabs.extensionExports;

  async function tryRestartServer() {
    await stopServer();
    if (workspace.getConfiguration('tempblot').get('server.enable')) {
      await startServer();
    }
  }
}

export async function deactivate() {
  await stopServer();
}

async function stopServer() {
  if (client?.needsStop()) {
    disposable?.dispose();
    await client.stop();
  }
}

async function startServer() {
  if (client?.needsStart()) {
    await window.withProgress(
      {
        location: ProgressLocation.Window,
        title: 'Starting Tempblot Language Server...'
      },
      async () => {
        await client!.start();

        disposable = Disposable.from(
          activateAutoInsertion('tempblot', client!),
          activateDocumentDropEdit('tempblot', client!)
        );
      }
    );
  }
}
