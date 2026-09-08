export function prefixMarkdownLines(value, selectionStart, selectionEnd, prefixForIndex) {
  const lineStart = selectionStart === 0 ? 0 : value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEndSearch = selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
    ? selectionEnd - 1
    : selectionEnd;
  const nextLine = value.indexOf('\n', lineEndSearch);
  const lineEnd = nextLine < 0 ? value.length : nextLine;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const prefixes = lines.map((_, index) => prefixForIndex(index));
  const text = lines.map((line, index) => `${prefixes[index]}${line}`).join('\n');
  const nextSelectionStart = selectionStart + prefixes[0].length;
  const nextSelectionEnd = selectionStart === selectionEnd
    ? nextSelectionStart
    : selectionEnd + prefixes.reduce((total, prefix) => total + prefix.length, 0);
  return {
    start: lineStart,
    end: lineEnd,
    text,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd
  };
}

function continuationForLine(line) {
  const bullet = /^(\s*)([-+*])\s+(.*)$/.exec(line);
  if (bullet) {
    const prefix = `${bullet[1]}${bullet[2]} `;
    return { prefix, originalPrefixLength: prefix.length, empty: bullet[3].trim() === '' };
  }

  const numbered = /^(\s*)(\d+)([.)])\s+(.*)$/.exec(line);
  if (numbered) {
    const originalPrefix = `${numbered[1]}${numbered[2]}${numbered[3]} `;
    const prefix = `${numbered[1]}${Number(numbered[2]) + 1}${numbered[3]} `;
    return { prefix, originalPrefixLength: originalPrefix.length, empty: numbered[4].trim() === '' };
  }

  const quote = /^(\s*(?:>\s*)+)(.*)$/.exec(line);
  if (quote) {
    const prefix = quote[1].endsWith(' ') ? quote[1] : `${quote[1]} `;
    return { prefix, originalPrefixLength: prefix.length, empty: quote[2].trim() === '' };
  }

  return null;
}

export function markdownContinuationEdit(value, cursor) {
  const lineStart = cursor === 0 ? 0 : value.lastIndexOf('\n', cursor - 1) + 1;
  const nextLine = value.indexOf('\n', cursor);
  const lineEnd = nextLine < 0 ? value.length : nextLine;
  const continuation = continuationForLine(value.slice(lineStart, lineEnd));
  if (!continuation || cursor < lineStart + continuation.originalPrefixLength) return null;

  if (continuation.empty) {
    return {
      start: lineStart,
      end: lineEnd,
      text: '\n',
      cursor: lineStart + 1
    };
  }

  const text = `\n${continuation.prefix}`;
  return {
    start: cursor,
    end: cursor,
    text,
    cursor: cursor + text.length
  };
}
