import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
export function useHouseholdSync(householdId: string) {
  const queries = useQueryClient(), [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!householdId) return;
    let stopped = false, socket: WebSocket | undefined, timer: ReturnType<typeof setTimeout> | undefined, attempts = 0;
    function connect() {
      const url = new URL(`/api/v1/households/${householdId}/events`, location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(url);
      socket.onopen = () => { attempts = 0; setConnected(true); void queries.invalidateQueries({ queryKey: ['planning', householdId] }); };
      socket.onmessage = () => { void queries.invalidateQueries({ queryKey: ['planning', householdId] }); };
      socket.onclose = () => { setConnected(false); if (!stopped) timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts++)); };
      socket.onerror = () => socket?.close();
    }
    connect();
    return () => { stopped = true; clearTimeout(timer); socket?.close(); };
  }, [householdId, queries]);
  return connected;
}
