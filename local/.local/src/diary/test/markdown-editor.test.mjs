import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownContinuationEdit, prefixMarkdownLines } from '../public/markdown-editor.js';
import { extractImages, removeImages } from '../public/markdown-images.js';

function applyEdit(value, edit) {
  return `${value.slice(0, edit.start)}${edit.text}${value.slice(edit.end)}`;
}

test('line markers leave the caret after the marker on an empty line', () => {
  for (const prefix of ['- ', '1. ', '> ']) {
    const edit = prefixMarkdownLines('', 0, 0, () => prefix);
    assert.equal(applyEdit('', edit), prefix);
    assert.equal(edit.selectionStart, prefix.length);
    assert.equal(edit.selectionEnd, prefix.length);
  }
});

test('line markers preserve a collapsed caret position instead of selecting the marker', () => {
  const edit = prefixMarkdownLines('alpha', 2, 2, () => '- ');
  assert.equal(applyEdit('alpha', edit), '- alpha');
  assert.equal(edit.selectionStart, 4);
  assert.equal(edit.selectionEnd, 4);
});

test('Enter continues unordered lists, ordered lists, and quotes', () => {
  const cases = [
    ['- item', '- item\n- '],
    ['9. item', '9. item\n10. '],
    ['> note', '> note\n> ']
  ];
  for (const [value, expected] of cases) {
    const edit = markdownContinuationEdit(value, value.length);
    assert.ok(edit);
    assert.equal(applyEdit(value, edit), expected);
    assert.equal(edit.cursor, expected.length);
  }
});

test('Enter on an empty marker exits the Markdown block', () => {
  for (const value of ['- ', '1. ', '> ']) {
    const edit = markdownContinuationEdit(value, value.length);
    assert.ok(edit);
    assert.equal(applyEdit(value, edit), '\n');
    assert.equal(edit.cursor, 1);
  }
});

test('ordinary text does not start a list or quote on Enter', () => {
  assert.equal(markdownContinuationEdit('plain text', 10), null);
});

test('Markdown images retain their order and labels while reading text keeps ordinary links', () => {
  const markdown = '前文 ![封面](<../0.media/旅行 照片.png> "照片") 中间 ![](./other.webp) [链接](https://example.com)';
  assert.deepEqual(extractImages(markdown), [
    { alt: '封面', source: '../0.media/旅行 照片.png' },
    { alt: '日记图片', source: './other.webp' }
  ]);
  assert.equal(removeImages(markdown), '前文  中间  [链接](https://example.com)');
});
