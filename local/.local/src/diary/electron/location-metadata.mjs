const LOCATION_FIELD = '地点';
const MAX_LOCATION_LENGTH = 160;

export function normalizeLocationKey(value) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...normalized].slice(0, MAX_LOCATION_LENGTH).join('');
}

function unquoteLocationValue(value) {
  if (value.length < 2 || value[0] !== value.at(-1) || !['"', "'"].includes(value[0])) return value;
  return value.slice(1, -1);
}

export function extractLocationMetadata(content) {
  const normalizedContent = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const frontmatter = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalizedContent)?.[1];
  if (frontmatter === undefined) {
    return { present: false, field: LOCATION_FIELD, sourceLabel: '', sourceKey: '' };
  }
  for (const line of frontmatter.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1 || line.slice(0, colon).trim() !== LOCATION_FIELD) continue;
    const sourceLabel = normalizeLocationKey(unquoteLocationValue(line.slice(colon + 1).trim()));
    return {
      present: true,
      field: LOCATION_FIELD,
      sourceLabel,
      sourceKey: normalizeLocationKey(sourceLabel)
    };
  }
  return { present: false, field: LOCATION_FIELD, sourceLabel: '', sourceKey: '' };
}
