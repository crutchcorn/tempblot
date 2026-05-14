import * as prettier from "prettier";
import type {
  AstPath,
  Options,
  Parser,
  ParserOptions,
  Plugin,
  Printer,
} from "prettier";
import {
  parseTempblotRoot,
  type ParsedRoot,
  type RootBlock,
} from "@tempblot/parser";

interface TempblotAst {
  type: "TempblotDocument";
  source: string;
  root: ParsedRoot;
  formattedBlocks: Map<RootBlock, string>;
}

const parser: Parser<TempblotAst> = {
  astFormat: "tempblot-ast",
  async parse(source, options) {
    const root = parseTempblotRoot(source);
    return {
      type: "TempblotDocument",
      source,
      root,
      formattedBlocks: await formatBlocks(source, root.blocks, options),
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
      name: "Tempblot",
      parsers: ["tempblot"],
      extensions: [".blot"],
      vscodeLanguageIds: ["tempblot"],
    },
  ],
  parsers: {
    tempblot: parser,
  },
  printers: {
    "tempblot-ast": printer,
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
    ...blocks.map((block) => formatBlock(ast, block)),
    trailingText,
  ].filter((part) => part.length > 0);

  return ensureTrailingNewline(parts.join("\n\n"));
}

function formatBlock(ast: TempblotAst, block: RootBlock) {
  const openTag = formatOpenTag(block);
  const closeTag = `</${block.tag}>`;
  const contents =
    ast.formattedBlocks.get(block) ??
    ast.source.slice(block.startTagEnd, block.endTagStart).trim();

  if (!contents) {
    return `${openTag}\n${closeTag}`;
  }

  return `${openTag}\n${contents}\n${closeTag}`;
}

function formatOpenTag(block: RootBlock) {
  const attributes = Object.entries(block.attributes)
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");

  return attributes ? `<${block.tag} ${attributes}>` : `<${block.tag}>`;
}

function ensureTrailingNewline(text: string) {
  return `${text}\n`;
}

async function formatBlocks(
  source: string,
  blocks: RootBlock[],
  options: ParserOptions<TempblotAst>,
) {
  const formattedBlocks = new Map<RootBlock, string>();

  await Promise.all(
    blocks.map(async (block) => {
      const parserName = getBlockParser(block);
      const rawContents = source
        .slice(block.startTagEnd, block.endTagStart)
        .trim();

      if (!parserName || !rawContents) {
        formattedBlocks.set(block, rawContents);
        return;
      }

      formattedBlocks.set(
        block,
        await formatEmbedded(rawContents, parserName, options),
      );
    }),
  );

  return formattedBlocks;
}

async function formatEmbedded(
  source: string,
  parserName: string,
  options: ParserOptions<TempblotAst>,
) {
  try {
    return (
      await prettier.format(source, {
        ...copyPrettierOptions(options),
        parser: parserName,
      })
    ).trim();
  } catch {
    return source.trim();
  }
}

function getBlockParser(block: RootBlock) {
  if (block.tag === "setup") {
    return "typescript";
  }

  if (block.tag !== "output") {
    return undefined;
  }

  return getOutputParser(block.attributes.lang);
}

function getOutputParser(lang: string | undefined) {
  switch (lang) {
    case undefined:
    case "json":
    case "jsonc":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "html":
      return "html";
    case "css":
      return "css";
    case "javascript":
    case "js":
      return "babel";
    case "typescript":
    case "ts":
      return "typescript";
    default:
      return undefined;
  }
}

function copyPrettierOptions(options: ParserOptions<TempblotAst>): Options {
  return {
    arrowParens: options.arrowParens,
    bracketSameLine: options.bracketSameLine,
    bracketSpacing: options.bracketSpacing,
    endOfLine: options.endOfLine,
    htmlWhitespaceSensitivity: options.htmlWhitespaceSensitivity,
    printWidth: options.printWidth,
    proseWrap: options.proseWrap,
    quoteProps: options.quoteProps,
    semi: options.semi,
    singleAttributePerLine: options.singleAttributePerLine,
    singleQuote: options.singleQuote,
    tabWidth: options.tabWidth,
    trailingComma: options.trailingComma,
    useTabs: options.useTabs,
  };
}
