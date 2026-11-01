import { Extension, type Editor } from '@tiptap/react';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Fragment, Slice } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import type { UploadedFile } from './api.js';
type Anchor = { id: string; pos: number; name: string };
type PlacementChange = { add?: Anchor[]; remove?: string; inserted?: string; clear?: boolean };
export const imagePlacements = new PluginKey<Anchor[]>('imagePlacements');
export function mapPlacements(anchors: Anchor[], tr: Transaction): Anchor[] {
  const change = tr.getMeta(imagePlacements) as PlacementChange | undefined;
  if (change?.clear) return [];
  const completed = anchors.findIndex(anchor => anchor.id === change?.inserted);
  const origin = anchors[completed]?.pos;
  return [...anchors.flatMap((anchor, index) => {
    if (anchor.id === change?.remove || anchor.id === change?.inserted) return [];
    // Typing at the insertion point stays after the placeholder. Later files
    // at that same point move after each completed image, retaining batch order.
    const association = completed >= 0 && index > completed && anchor.pos === origin ? 1 : -1;
    const mapped = tr.mapping.mapResult(anchor.pos, association);
    return mapped.deletedAcross ? [] : [{ ...anchor, pos: mapped.pos }];
  }), ...(change?.add ?? [])];
}
export const ImagePlacements = Extension.create({
  name: 'imagePlacements',
  addProseMirrorPlugins() {
    return [new Plugin<Anchor[]>({
      key: imagePlacements,
      state: { init: () => [], apply: (tr, anchors) => mapPlacements(anchors, tr) },
      props: {
        decorations(state) {
          return DecorationSet.create(state.doc, (imagePlacements.getState(state) ?? []).map(anchor => Decoration.widget(anchor.pos, () => {
            const placeholder = document.createElement('span');
            placeholder.className = 'image-upload-placeholder';
            placeholder.textContent = anchor.name;
            placeholder.contentEditable = 'false';
            return placeholder;
          }, { key: anchor.id, side: -1 })));
        },
      },
    })];
  },
});
export function addPlacements(editor: Editor, anchors: Anchor[]) {
  editor.view.dispatch(editor.state.tr.setMeta(imagePlacements, { add: anchors }));
}
export function removePlacement(editor: Editor, id: string) {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(imagePlacements, { remove: id }));
}
export function insertUploadedFile(editor: Editor, file: UploadedFile, id?: string) {
  if (editor.isDestroyed) return false;
  const anchor = id ? imagePlacements.getState(editor.state)?.find(item => item.id === id) : null;
  if (id && !anchor) return false;
  const pos = anchor?.pos ?? editor.state.selection.from;
  const { schema } = editor;
  const nodes = file.image ? [schema.nodes.image!.create({ src: file.src, alt: file.name, width: file.width ?? null, height: file.height ?? null })]
    : [schema.text(file.name, [schema.marks.link!.create({ href: file.src })]), schema.text(' ')];
  const tr = closeHistory(editor.state.tr).replaceRange(pos, pos, new Slice(Fragment.fromArray(nodes), 0, 0));
  if (id) tr.setMeta(imagePlacements, { inserted: id });
  // Do not focus, replace selected text or scroll to an asynchronous insertion.
  editor.view.dispatch(tr);
  // A gallery/recovery button is an explicit navigation back to the editor.
  if (!id) editor.commands.focus();
  return true;
}
