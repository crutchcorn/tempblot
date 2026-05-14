export interface RootAttribute {
  name: string;
  value: string;
  start: number;
  end: number;
}

export interface RootTag {
  name: string;
  start: number;
  end: number;
}

export interface RootText {
  value: string;
  start: number;
  end: number;
}

export type RootToken =
  | {
      type: "TagOpenStart";
      attributes: RootTag;
    }
  | {
      type: "TagOpenEnd";
      attributes: RootTag;
    }
  | {
      type: "TagClose";
      attributes: RootTag;
    }
  | {
      type: "TagAttribute";
      attributes: RootAttribute;
    }
  | {
      type: "Text";
      attributes: RootText;
    };

export interface RootBlock {
  tag: string;
  attributes: Record<string, string>;
  contents: string;
  start: number;
  end: number;
  startTagStart: number;
  startTagEnd: number;
  endTagStart: number;
  endTagEnd: number;
}

export interface ParsedRoot {
  blocks: RootBlock[];
}

export interface RequiredRoot {
  setup: RootBlock;
  output: RootBlock;
}

export interface InterpolationData {
  expression: string;
  rawExpression: string;
  sourceStart: number;
  sourceEnd: number;
  fullStart: number;
  fullEnd: number;
}

const emptyBlock = (tag: string): RootBlock => ({
  tag,
  attributes: {},
  contents: "",
  start: 0,
  end: 0,
  startTagStart: 0,
  startTagEnd: 0,
  endTagStart: 0,
  endTagEnd: 0,
});

export function tokenizeRoot(source: string): RootToken[] {
  const tokens: RootToken[] = [];
  const tagPattern = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(source))) {
    const tagText = match[0];
    const tagName = match[1];
    const tagStart = match.index;
    const tagEnd = match.index + tagText.length;
    const closeText = `</${tagName}>`;
    const closeStart = source.indexOf(closeText, tagEnd);

    if (closeStart === -1) {
      continue;
    }

    if (tagStart > lastEnd) {
      tokens.push({
        type: "Text",
        attributes: {
          value: source.slice(lastEnd, tagStart),
          start: lastEnd,
          end: tagStart,
        },
      });
    }

    tokens.push({
      type: "TagOpenStart",
      attributes: {
        name: tagName,
        start: tagStart,
        end: tagStart + tagName.length + 1,
      },
    });

    const attributePattern = /([a-zA-Z-]+)="([^"]*)"/g;
    let attributeMatch: RegExpExecArray | null;
    while ((attributeMatch = attributePattern.exec(tagText))) {
      tokens.push({
        type: "TagAttribute",
        attributes: {
          name: attributeMatch[1],
          value: attributeMatch[2],
          start: tagStart + attributeMatch.index,
          end: tagStart + attributeMatch.index + attributeMatch[0].length,
        },
      });
    }

    tokens.push({
      type: "TagOpenEnd",
      attributes: { name: tagName, start: tagEnd - 1, end: tagEnd },
    });

    if (closeStart > tagEnd) {
      tokens.push({
        type: "Text",
        attributes: {
          value: source.slice(tagEnd, closeStart),
          start: tagEnd,
          end: closeStart,
        },
      });
    }

    const closeEnd = closeStart + closeText.length;
    tokens.push({
      type: "TagClose",
      attributes: { name: tagName, start: closeStart, end: closeEnd },
    });

    lastEnd = closeEnd;
    tagPattern.lastIndex = closeEnd;
  }

  if (lastEnd < source.length) {
    tokens.push({
      type: "Text",
      attributes: {
        value: source.slice(lastEnd),
        start: lastEnd,
        end: source.length,
      },
    });
  }

  return tokens;
}

export function parseRootDocument(tokens: RootToken[]): ParsedRoot {
  const blocks: RootBlock[] = [];
  let currentBlock: RootBlock | undefined;
  let hasSeenCurrentTagOpeningEnd = false;

  for (const token of tokens) {
    if (!currentBlock && token.type === "TagOpenStart") {
      currentBlock = {
        tag: token.attributes.name,
        attributes: {},
        contents: "",
        start: token.attributes.start,
        end: token.attributes.end,
        startTagStart: token.attributes.start,
        startTagEnd: token.attributes.end,
        endTagStart: token.attributes.end,
        endTagEnd: token.attributes.end,
      };
      hasSeenCurrentTagOpeningEnd = false;
      continue;
    }

    if (!currentBlock) {
      continue;
    }

    if (!hasSeenCurrentTagOpeningEnd && token.type === "TagAttribute") {
      currentBlock.attributes[token.attributes.name] = token.attributes.value;
      continue;
    }

    if (!hasSeenCurrentTagOpeningEnd && token.type === "TagOpenEnd") {
      currentBlock.startTagEnd = token.attributes.end;
      hasSeenCurrentTagOpeningEnd = true;
      continue;
    }

    if (
      token.type === "TagClose" &&
      token.attributes.name === currentBlock.tag
    ) {
      currentBlock.endTagStart = token.attributes.start;
      currentBlock.endTagEnd = token.attributes.end;
      currentBlock.end = token.attributes.end;
      blocks.push(currentBlock);
      currentBlock = undefined;
      hasSeenCurrentTagOpeningEnd = false;
      continue;
    }

    if (hasSeenCurrentTagOpeningEnd) {
      currentBlock.contents += tokenToSource(token);
    }
  }

  return { blocks };
}

export function parseRoot(tokens: RootToken[]): RequiredRoot {
  const document = parseRootDocument(tokens);
  return {
    setup:
      document.blocks.find((block) => block.tag === "setup") ??
      emptyBlock("setup"),
    output:
      document.blocks.find((block) => block.tag === "output") ??
      emptyBlock("output"),
  };
}

export function parseTempblotRoot(source: string): ParsedRoot {
  return parseRootDocument(tokenizeRoot(source));
}

export function getRootBlocks(document: ParsedRoot, tag: string): RootBlock[] {
  return document.blocks.filter((block) => block.tag === tag);
}

export function scanInterpolations(text: string): InterpolationData[] {
  const interpolations: InterpolationData[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] !== "<" || text[i + 1] !== "<") {
      i++;
      continue;
    }

    const fullStart = i;
    let j = i + 2;
    const candidates: number[] = [];

    while (j < text.length) {
      if (text[j - 1] !== "\\" && text[j] === ">" && text[j + 1] === ">") {
        candidates.push(j);
        j += 2;
        continue;
      }

      j++;
    }

    const expressionEnd = findBestInterpolationEnd(text, candidates);

    if (expressionEnd === undefined) {
      i++;
      continue;
    }

    const rawExpression = text.slice(i + 2, expressionEnd);
    const leadingWhitespace = rawExpression.match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespace = rawExpression.match(/\s*$/)?.[0].length ?? 0;
    const trimmedRawExpression = rawExpression.slice(
      leadingWhitespace,
      rawExpression.length - trailingWhitespace,
    );

    interpolations.push({
      expression: unescapeEscapedDelimiters(trimmedRawExpression),
      rawExpression: trimmedRawExpression,
      sourceStart: i + 2 + leadingWhitespace,
      sourceEnd: expressionEnd - trailingWhitespace,
      fullStart,
      fullEnd: expressionEnd + 2,
    });
    i = expressionEnd + 2;
  }

  return interpolations;
}

function findBestInterpolationEnd(
  text: string,
  candidates: number[],
): number | undefined {
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const hasLaterCandidate = i < candidates.length - 1;

    if (hasLaterCandidate && isSpacedShiftOperator(text, candidate)) {
      continue;
    }

    return candidate;
  }

  return undefined;
}

function isSpacedShiftOperator(text: string, offset: number): boolean {
  return /\s/.test(text[offset - 1] ?? "") && /\s/.test(text[offset + 2] ?? "");
}

export function transformOutputTemplate(output: string): string {
  const interpolations = scanInterpolations(output);
  let transformed = "";
  let lastOffset = 0;

  for (const interpolation of interpolations) {
    transformed += escapeOutputText(
      output.slice(lastOffset, interpolation.fullStart),
    );
    transformed += "${";
    transformed += interpolation.expression;
    transformed += "}";
    lastOffset = interpolation.fullEnd;
  }

  transformed += escapeOutputText(output.slice(lastOffset));
  return transformed;
}

function escapeOutputText(text: string): string {
  let transformed = "";

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && text[i + 1] === ">") {
      transformed += ">";
      i++;
    } else if (text[i] === "\\" && text[i + 1] === "<") {
      transformed += "<";
      i++;
    } else if (text[i] === "`") {
      transformed += "\\`";
    } else {
      transformed += text[i];
    }
  }

  return transformed;
}

function unescapeEscapedDelimiters(text: string): string {
  let transformed = "";

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && text[i + 1] === ">") {
      transformed += ">";
      i++;
    } else if (text[i] === "\\" && text[i + 1] === "<") {
      transformed += "<";
      i++;
    } else {
      transformed += text[i];
    }
  }

  return transformed;
}

function tokenToSource(token: RootToken): string {
  if (token.type === "TagOpenStart") {
    return `<${token.attributes.name}`;
  }
  if (token.type === "TagOpenEnd") {
    return ">";
  }
  if (token.type === "TagClose") {
    return `</${token.attributes.name}>`;
  }
  if (token.type === "TagAttribute") {
    return ` ${token.attributes.name}="${token.attributes.value}"`;
  }
  return token.attributes.value;
}
