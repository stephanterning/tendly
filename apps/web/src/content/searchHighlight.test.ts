import { expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { matchingText } from './searchHighlight.js';
const schema = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*', group: 'block' }, text: { group: 'inline' } }, marks: { bold: {} } });
it('finds a passage across formatting marks without changing document content', () => {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Ljust '), schema.text('matt', [schema.mark('bold')]), schema.text(' kakel.')])]);
  const original = doc.toJSON();
  expect(matchingText(doc, 'matt kakel')).toEqual([{ from: 7, to: 17 }]);
  expect(doc.toJSON()).toEqual(original);
});
