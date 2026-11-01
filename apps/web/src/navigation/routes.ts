import { columns, type TaskColumn } from '@tendly/shared';
export const workspaceViews = ['now', 'board', 'more', 'library', 'settings', 'search', 'custom', 'views'] as const;
export type WorkspaceView = typeof workspaceViews[number];
export type Route = {
  household: string; view: WorkspaceView; custom: string; task: string;
  column: TaskColumn; q: string; filters: string[]; comment: string; match: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readRoute(url: string, fallback: string): Route {
  const p = new URL(url, 'http://local').searchParams;
  const id = (key: string) => uuid.test(p.get(key) ?? '') ? p.get(key)! : '';
  const view = p.get('view');
  return { household: id('household') || fallback,
    view: workspaceViews.includes(view as WorkspaceView) ? view as WorkspaceView : 'now',
    custom: id('custom'), task: id('task'), column: columns.includes(p.get('column') as TaskColumn) ? p.get('column') as TaskColumn : 'todo', q: (p.get('q') ?? '').slice(0, 200),
    filters: p.getAll('filter').filter(v => uuid.test(v)).slice(0, 100),
    comment: id('comment'), match: (p.get('match') ?? '').slice(0, 200) };
}
export function routeUrl(route: Route) {
  const p = new URLSearchParams({ household: route.household, view: route.view });
  if (route.view === 'custom' && route.custom) p.set('custom', route.custom);
  if (route.view === 'board' || route.view === 'custom') p.set('column', route.column);
  if (route.view === 'search') {
    if (route.q) p.set('q', route.q);
    route.filters.forEach(id => p.append('filter', id));
  }
  if (route.task) {
    p.set('task', route.task);
    if (route.comment) p.set('comment', route.comment);
    if (route.match) p.set('match', route.match);
  }
  return '/?' + p;
}
export type LeaveGuard = (continueNavigation: () => void) => void;
type Entry = { index: number; parent?: string };
export type NavigationPort = {
  url: () => string; state: () => Entry | null;
  write: (url: string, entry: Entry, replace: boolean) => void;
  go: (delta: number) => void;
};
// Restore the current history entry before asking about unsaved work. Cancel then
// leaves both URL and document intact; approval traverses the original history.
export class Navigation {
  private entry: Entry;
  private restoring: (() => void) | null = null;
  private approved = false;
  private listeners = new Set<() => void>();
  private guards = new Set<LeaveGuard>();
  constructor(private port: NavigationPort, private route: Route) {
    this.entry = port.state() ?? { index: 0 };
    port.write(routeUrl(route), this.entry, true);
  }
  getSnapshot = () => this.route;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  block = (guard: LeaveGuard) => { this.guards.add(guard); return () => { this.guards.delete(guard); }; };
  private ask(action: () => void) {
    const guards = [...this.guards].reverse();
    const next = () => { const guard = guards.shift(); if (guard) guard(next); else action(); };
    next();
  }
  private publish(route: Route) { this.route = route; this.listeners.forEach(fn => fn()); }
  navigate = (changes: Partial<Route>, replace = false) => {
    if (this.restoring) return;
    const next = { ...this.route, ...changes };
    if (routeUrl(next) === routeUrl(this.route)) return;
    const commit = () => {
      this.entry = { index: this.entry.index + (replace ? 0 : 1),
        ...(!replace && next.task && !this.route.task ? { parent: routeUrl(this.route) } : replace ? { parent: this.entry.parent } : {}) };
      this.port.write(routeUrl(next), this.entry, replace);
      this.publish(next);
    };
    // Search typing only replaces its current workspace entry.
    if (replace && !this.route.task) commit(); else this.ask(commit);
  };
  closeTask = () => {
    if (this.entry.parent) this.ask(() => { this.approved = true; this.port.go(-1); });
    else this.navigate({ task: '', comment: '', match: '' }, true);
  };
  pop = () => {
    if (this.restoring) { const restored = this.restoring; this.restoring = null; restored(); return; }
    const target = this.port.state();
    const next = readRoute(this.port.url(), this.route.household);
    if (this.approved || !this.guards.size || !target) {
      this.approved = false;
      this.entry = target ?? { index: 0 };
      this.publish(next);
      return;
    }
    const delta = target.index - this.entry.index;
    if (!delta) return;
    this.restoring = () => this.ask(() => { this.approved = true; this.port.go(delta); });
    this.port.go(-delta);
  };
}
