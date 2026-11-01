import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useHouseholdEvents(householdId: string) {
  const queries = useQueryClient();
  useEffect(() => {
    if (!householdId) return;
    let disposed = false,
      socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let batch: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const reconcile = () => {
      void queries.invalidateQueries({ queryKey: ['planning', householdId] });
      void queries.invalidateQueries({ queryKey: ['members', householdId] });
      void queries.invalidateQueries({ queryKey: ['session'] });
    };
    function connect() {
      if (disposed) return;
      const url = new URL(`/api/v1/households/${householdId}/events`, window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(url);
      socket.onopen = () => {
        failures = 0;
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type !== 'invalidate') return;
          for (const resource of message.resources ?? ['all']) pending.add(resource);
          if (batch) return;
          batch = setTimeout(() => {
            batch = undefined;
            if (pending.has('all')) reconcile();
            else {
              const keys = new Set<string>();
              for (const resource of pending) {
                if (resource === 'tasks' || resource === 'entities' || resource === 'members') {
                  keys.add('tasks');
                  keys.add('task');
                  keys.add('activity');
                }
                if (resource === 'comments' || resource === 'attachments') keys.add(resource);
                if (resource === 'entities') keys.add('entities');
                if (resource === 'planning-settings') keys.add('planning-settings');
                if (resource === 'members') {
                  keys.add('members');
                  void queries.invalidateQueries({
                    queryKey: ['members', householdId],
                  });
                  void queries.invalidateQueries({ queryKey: ['session'] });
                }
              }
              if([...pending].some(r=>['views','filters','view-context'].includes(r))){keys.add('views');keys.add('tasks');}
              keys.add('preview');
              keys.add('search');
              for (const key of keys)
                void queries.invalidateQueries({
                  queryKey: ['planning', householdId, key],
                });
            }
            pending.clear();
          }, 150);
        } catch {
          /* Ignore unknown event formats. */
        }
      };
      socket.onclose = (event) => {
        if (disposed) return;
        if (event.code === 1008) {
          // Drop cached private data after revocation and re-evaluate membership.
          queries.removeQueries({ queryKey: ['planning', householdId] });
          void queries.invalidateQueries({ queryKey: ['session'] });
          return;
        }
        retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** failures++) + Math.random() * 250);
      };
    }
    connect();
    const resume = () => {
      if (document.visibilityState === 'visible') reconcile();
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(batch);
      socket?.close();
      document.removeEventListener('visibilitychange', resume);
    };
  }, [householdId, queries]);
}
