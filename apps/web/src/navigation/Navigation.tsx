import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Navigation, readRoute, type LeaveGuard } from './routes.js';
export const NavigationContext = createContext<Navigation | null>(null);
export function useWorkspaceNavigation(fallback: string, settings: boolean) {
  const [navigation] = useState(() => new Navigation({
    url: () => location.href,
    state: () => window.history.state?.tendly ?? null,
    write: (url, entry, replace) => window.history[replace ? 'replaceState' : 'pushState']({ tendly: entry }, '', url),
    go: delta => window.history.go(delta),
  }, { ...readRoute(location.href, fallback), ...(settings ? { view: 'settings' as const, task: '' } : {}) }));
  const route = useSyncExternalStore(navigation.subscribe, navigation.getSnapshot);
  useEffect(() => {
    window.addEventListener('popstate', navigation.pop);
    return () => window.removeEventListener('popstate', navigation.pop);
  }, [navigation]);
  return { navigation, route };
}
export function useNavigationGuard(guard: LeaveGuard) {
  const navigation = useContext(NavigationContext);
  const current = useRef(guard);
  current.current = guard;
  useEffect(() => navigation?.block(next => current.current(next)), [navigation]);
}
