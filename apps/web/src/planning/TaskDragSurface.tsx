import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Destination = { key: string; position: 'before' | 'after' | 'child' | 'end'; commit: (id: string) => void };
type Preview = { source: string; height: number; destination: Destination | null; pending: string | null };
type DragControl = {
  preview: Preview | null;
  manual: boolean;
  start: (id: string, height: number) => void;
  hover: (destination: Destination, nest?: Destination) => void;
  finish: () => void;
  clearTarget: () => void;
};
const DragContext = createContext<DragControl | null>(null);
export const useTaskDrag = () => useContext(DragContext);

export function TaskDragSurface({ children, className, manual = true }: { children: ReactNode; className?: string; manual?: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const current = useRef<Preview | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelTimer() { if (timer.current) clearTimeout(timer.current); timer.current = null; }
  function update(value: Preview | null) { current.current = value; setPreview(value); }
  function finish() { cancelTimer(); update(null); }
  function clearTarget() { cancelTimer(); if (current.current) update({ ...current.current, destination: null, pending: null }); }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function hover(destination: Destination, nest?: Destination) {
    const state = current.current;
    if (!state) return;
    if (nest && state.destination?.key === nest.key && state.destination.position === 'child') return;
    if (state.destination?.key === destination.key && state.destination.position === destination.position && state.pending === (nest?.key ?? null)) return;
    cancelTimer();
    update({ ...state, destination, pending: nest?.key ?? null });
    // A deliberate dwell distinguishes nesting from simply moving past another card.
    if (nest) timer.current = setTimeout(() => {
      if (current.current?.pending === nest.key) update({ ...current.current, destination: nest, pending: null });
    }, 650);
  }
  return <DragContext.Provider value={{ preview, manual, start: (source, height) => { cancelTimer(); update({ source, height, destination: null, pending: null }); }, hover, finish, clearTarget }}>
    <div className={className} onDragEnd={finish} onDragOver={event => {
      if (current.current) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
    }} onDragLeave={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        clearTarget();
      }
    }} onDrop={event => {
      const state = current.current;
      if (!state) return;
      event.preventDefault(); event.stopPropagation();
      finish(); state.destination?.commit(state.source);
    }}>{children}</div>
  </DragContext.Provider>;
}

export function DragPlaceholder({ target, position }: { target: string; position: Destination['position'] }) {
  const drag = useTaskDrag(), state = drag?.preview;
  if (!drag?.manual || !state || state.destination?.key !== target || state.destination.position !== position) return null;
  return <div className="drag-placeholder" aria-hidden="true" style={{ height: state.height }} onDragOver={event => {
    // Keep the slot stable once it has displaced the cards beneath the pointer.
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
  }} />;
}
