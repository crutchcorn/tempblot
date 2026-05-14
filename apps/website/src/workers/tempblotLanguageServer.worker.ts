import {
  createConnection,
  createServer,
  createTypeScriptProject,
  type InitializeParams,
  type InitializeResult,
} from '@volar/language-server/browser';
import {
  createTempblotLanguagePlugin,
  createTempblotServicePlugin,
} from 'tempblot-language-service';
import * as typescript from 'typescript';
import { create as createTypeScriptServicePlugins } from 'volar-service-typescript';

const connection = createConnection();
const server = createServer(connection);

connection.onInitialize(async (parameters: InitializeParams): Promise<InitializeResult> => {
  return server.initialize(
    parameters,
    createTypeScriptProject(
      typescript,
      undefined,
      () => ({ languagePlugins: [createTempblotLanguagePlugin()] }),
    ),
    [
      ...createTypeScriptServicePlugins(typescript),
      createTempblotServicePlugin(),
    ],
  );
});

connection.onInitialized(() => {
  server.initialized();
});

connection.listen();
