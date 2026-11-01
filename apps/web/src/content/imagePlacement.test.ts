import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { imagePlacements, mapPlacements } from './imagePlacement.js';
const schema = new Schema({ nodes: {
  doc: { content: 'block+' }, paragraph: { group: 'block', content: 'inline*' },
  text: { group: 'inline' }, image: { group: 'block', attrs: { src: {} } },
} });
const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('Before after')), schema.node('paragraph', null, schema.text('Decision'))]);
const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 20) });
const anchor = { id: 'first', pos: 8, name: 'tiles.png' };

describe('image insertion positions', () => {
  it('tracks edits before a position, ignores cursor moves and stays before typing at that position', () => {
    expect(mapPlacements([anchor], state.tr.insertText('New ', 1))[0]?.pos).toBe(12);
    expect(mapPlacements([anchor], state.tr.setSelection(TextSelection.create(doc, 2)))[0]?.pos).toBe(8);
    expect(mapPlacements([anchor], state.tr.insertText('Continue ', 8))[0]?.pos).toBe(8);
  });
  it('preserves batch order including a retry before a later image, and maps the current selection', () => {
    const anchors = [anchor, { ...anchor, id: 'second' }, { ...anchor, id: 'third' }];
    const tr = state.tr.replaceRangeWith(8, 8, schema.node('image', { src: 'second.jpg' })).setMeta(imagePlacements, { inserted: 'second' });
    const remaining = mapPlacements(anchors, tr);
    const next = state.apply(tr);
    expect(remaining[0]?.pos).toBeLessThan(remaining[1]!.pos);
    expect(next.doc.resolve(next.selection.from).parent.textContent).toBe('Decision');
    const retry = next.tr.replaceRangeWith(remaining[0]!.pos, remaining[0]!.pos, schema.node('image', { src: 'first.jpg' }));
    const images: string[] = []; retry.doc.descendants(n => { if (n.type.name === 'image') images.push(n.attrs.src); });
    expect(images).toEqual(['first.jpg', 'second.jpg']);
    expect(retry.doc.textContent).toBe('Before afterDecision');
  });
  it('does not move an upload to unrelated text after its surrounding content is deleted or replaced', () => {
    expect(mapPlacements([anchor], state.tr.delete(1, 13))).toEqual([]);
    expect(mapPlacements([anchor], state.tr.setMeta(imagePlacements, { clear: true }))).toEqual([]);
  });
});
