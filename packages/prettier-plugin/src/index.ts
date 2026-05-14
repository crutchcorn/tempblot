import type { AstPath, Parser, Plugin, Printer } from 'prettier';
import { parseTempblotRoot, type ParsedRoot, type RootBlock } from 'tempblot-parser';

interface TempblotAst {
  type: 'TempblotDocument';
  source: string;
  root: ParsedRoot;
}

const parser: Parser<TempblotAst> = {
  astFormat: 'tempblot-ast',
  parse(source) {
    return {
      type: 'TempblotDocument',
      source,
      root: parseTempblotRoot(source),
    };
  },
  locStart() {
    return 0;
  },
  locEnd(node) {
    return node.source.length;
  },
};

const printer: Printer<TempblotAst> = {
  print(path) {
    return formatDocument(path);
  },
};

const plugin: Plugin<TempblotAst> = {
  languages: [
    {
      name: 'Tempblot',
      parsers: ['tempblot'],
      extensions: ['.blot'],
      vscodeLanguageIds: ['tempblot'],
    },
  ],
  parsers: {
    tempblot: parser,
  },
  printers: {
    'tempblot-ast': printer,
  },
};

export default plugin;
export const languages = plugin.languages;
export const parsers = plugin.parsers;
export const printers = plugin.printers;

function formatDocument(path: AstPath<TempblotAst>) {
  const ast = path.node;
  const blocks = ast.root.blocks;

  if (blocks.length === 0) {
    return ensureTrailingNewline(ast.source.trim());
  }

  const leadingText = ast.source.slice(0, blocks[0].start).trim();
  const trailingText = ast.source.slice(blocks[blocks.length - 1].end).trim();
  const parts = [
    leadingText,
    ...blocks.map((block) => formatBlock(ast.source, block)),
    trailingText,
  ].filter((part) => part.length > 0);

  return ensureTrailingNewline(parts.join('\n\n'));
}

function formatBlock(source: string, block: RootBlock) {
  const openTag = formatOpenTag(block);
  const closeTag = `</${block.tag}>`;
  const contents = source.slice(block.startTagEnd, block.endTagStart).trim();

  if (!contents) {
    return `${openTag}\n${closeTag}`;
  }

  return `${openTag}\n${contents}\n${closeTag}`;
}

function formatOpenTag(block: RootBlock) {
  const attributes = Object.entries(block.attributes)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ');

  return attributes ? `<${block.tag} ${attributes}>` : `<${block.tag}>`;
}

function ensureTrailingNewline(text: string) {
  return `${text}\n`;
}
