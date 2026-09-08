const IMAGE_PATTERN = /!\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\)/g;

export function extractImages(markdown) {
  return [...String(markdown || '').matchAll(IMAGE_PATTERN)].map((match) => ({
    alt: match[1] || '日记图片',
    source: match[2] || match[3]
  }));
}

export function removeImages(markdown) {
  return String(markdown || '').replace(IMAGE_PATTERN, '');
}
