import { createConnection, createServer, createTypeScriptProject, Diagnostic, loadTsdkByPath } from '@volar/language-server/node';
import { create as createHtmlService } from 'volar-service-html';
import { create as createTypeScriptServices } from 'volar-service-typescript';
import { URI } from 'vscode-uri';
import { tempblotLanguagePlugin, TempblotVirtualCode } from './languagePlugin';

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize(params => {
	const tsdk = loadTsdkByPath(params.initializationOptions.typescript.tsdk, params.locale);
	return server.initialize(
		params,
		createTypeScriptProject(tsdk.typescript, tsdk.diagnosticMessages, () => ({languagePlugins: [tempblotLanguagePlugin]})),
		[
			createHtmlService(),
			...createTypeScriptServices(tsdk.typescript),
			{
				capabilities: {
					diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
				},
				create(context) {
					return {
						provideDiagnostics(document) {
							const decoded = context.decodeEmbeddedDocumentUri(URI.parse(document.uri));
							if (!decoded) {
								// Not a embedded document
								return;
							}
							const virtualCode = context.language.scripts.get(decoded[0])?.generated?.embeddedCodes.get(decoded[1]);
							if (!(virtualCode instanceof TempblotVirtualCode)) {
								return;
							}
							const setupNodes = virtualCode.htmlDocument.roots.filter(root => root.tag === 'setup');
							const outputNodes = virtualCode.htmlDocument.roots.filter(root => root.tag === 'output');

							if (setupNodes.length == 1 && outputNodes.length == 1) {
								return;
							}

							const errors: Diagnostic[] = [];

							if (setupNodes.length === 0) {
								errors.push({
									severity: 1,
									range: {
										start: document.positionAt(0),
										end: document.positionAt(1),
									},
									source: 'tempblot',
									message: 'Missing setup tag.',
								});
							}

							if (outputNodes.length === 0) {
								errors.push({
									severity: 1,
									range: {
										start: document.positionAt(0),
										end: document.positionAt(1),
									},
									source: 'tempblot',
									message: 'Missing output tag.',
								});
							}

							for (let i = 1; i < setupNodes.length; i++) {
								errors.push({
									severity: 2,
									range: {
										start: document.positionAt(setupNodes[i].start),
										end: document.positionAt(setupNodes[i].end),
									},
									source: 'tempblot',
									message: 'Only one setup tag is allowed.',
								});
							}

							for (let i = 1; i < outputNodes.length; i++) {
								errors.push({
									severity: 2,
									range: {
										start: document.positionAt(outputNodes[i].start),
										end: document.positionAt(outputNodes[i].end),
									},
									source: 'tempblot',
									message: 'Only one output tag is allowed.',
								});
							}
							return errors;
						},
					};
				},
			},
		],
	)
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);
