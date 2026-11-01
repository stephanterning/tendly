import { describe, expect, it } from 'vitest';
import { Navigation, readRoute, routeUrl, type NavigationPort } from './routes.js';
const household = '11111111-1111-4111-8111-111111111111';
const task = '22222222-2222-4222-8222-222222222222';
function setup() {
  const entries: { url: string; state: ReturnType<NavigationPort['state']> }[] = [{ url: '/', state: null }];
  let index = 0;
  const port: NavigationPort = {
    url: () => entries[index]!.url, state: () => entries[index]!.state,
    write(url, state, replace) {
      if (!replace) { entries.splice(index + 1); index++; }
      entries[index] = { url, state };
    },
    go(delta) { index += delta; navigation.pop(); },
  };
  const navigation = new Navigation(port, readRoute('/', household));
  return { navigation, port, entries };
}
describe('workspace navigation', () => {
  it('preserves search context through task, back, forward and reload', () => {
    const { navigation: nav, port } = setup();
    nav.navigate({ view: 'search' });
    nav.navigate({ q: 'matt kakel', filters: [household] }, true);
    const searchUrl = port.url();
    nav.navigate({ task, comment: task, match: 'matt kakel' });
    const link = port.url();
    expect(readRoute(link, '')).toEqual(nav.getSnapshot());
    nav.closeTask();
    expect(port.url()).toBe(searchUrl);
    port.go(1);
    expect(port.url()).toBe(link);
    expect(nav.getSnapshot().task).toBe(task);
  });
  it('restores URL before guarding browser back and preserves the draft on cancellation', () => {
    const { navigation: nav, port } = setup();
    nav.navigate({ task });
    const link = port.url();
    let proceed: (() => void) | undefined;
    const unblock = nav.block(next => { proceed = next; });
    port.go(-1);
    expect(port.url()).toBe(link);
    expect(nav.getSnapshot().task).toBe(task);
    proceed!();
    expect(nav.getSnapshot().task).toBe('');
    unblock();
    port.go(1);
    expect(nav.getSnapshot().task).toBe(task);
  });
  it('guards internal navigation and closes a direct link within the app', () => {
    const { navigation: nav, port, entries } = setup();
    nav.navigate({ task }, true);
    let proceed: (() => void) | undefined;
    nav.block(next => { proceed = next; });
    nav.closeTask();
    expect(nav.getSnapshot().task).toBe(task);
    proceed!();
    expect(nav.getSnapshot().task).toBe('');
    expect(entries).toHaveLength(1);
    expect(port.url()).toBe(routeUrl(nav.getSnapshot()));
  });
  it('validates identifiers and never includes authentication fragments', () => {
    const route = readRoute('/?household=bad&task=javascript:foo&view=unknown#invite=secret', household);
    expect(route.task).toBe('');
    expect(route.view).toBe('now');
    expect(route.household).toBe(household);
    expect(routeUrl(route)).not.toContain('secret');
  });
  it('returns to the selected board column after leaving and reopening a task', () => {
    const { navigation: nav, port } = setup();
    nav.navigate({ view: 'board', column: 'within_month' });
    nav.navigate({ task });
    nav.closeTask();
    expect(readRoute(port.url(), household).column).toBe('within_month');
    port.go(-1);
    port.go(1);
    expect(nav.getSnapshot().column).toBe('within_month');
  });
});
