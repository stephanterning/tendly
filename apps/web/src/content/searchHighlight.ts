import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node } from '@tiptap/pm/model';
export const searchHighlightKey = new PluginKey<{ query: string; decorations: DecorationSet }>('searchHighlight');
export function matchingText(doc: Node, query: string) {
  const ranges: { from: number; to: number }[] = [];
  const needle = query.toLowerCase();
  if (!needle) return ranges;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    // Preserve positions across formatting marks and inline non-text nodes.
    const text = node.textBetween(0, node.content.size, '', '\uFFFC').toLowerCase();
    let from = text.indexOf(needle);
    while (from >= 0) {
      ranges.push({ from: pos + 1 + from, to: pos + 1 + from + needle.length });
      from = text.indexOf(needle, from + needle.length);
    }
    return false;
  });
  return ranges;
}
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: searchHighlightKey,
      state: {
        init: () => ({ query: '', decorations: DecorationSet.empty }),
        apply(tr, previous) {
          const query = tr.getMeta(searchHighlightKey) as string | undefined ?? previous.query;
          if (!tr.docChanged && query === previous.query) return previous;
          return { query, decorations: DecorationSet.create(tr.doc, matchingText(tr.doc, query).map(({ from, to }) =>
            Decoration.inline(from, to, { class: 'search-match' }))) };
        },
      },
      props: { decorations: state => searchHighlightKey.getState(state)?.decorations },
    })];
  },
});
