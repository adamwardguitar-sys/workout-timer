import { useCallback, useEffect, useState } from 'react';
import { HISTORY_KEY, addSession, loadHistory, removeSession, setNote, type Session } from '../store/history';

export interface HistoryApi {
  sessions: Session[];
  add(s: Session): void;
  note(id: string, text: string): void;
  remove(id: string): void;
}

/** The store functions write to storage immediately, so nothing is lost if the screen changes. */
export function useHistory(): HistoryApi {
  const [sessions, setSessions] = useState<Session[]>(() => loadHistory());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === HISTORY_KEY) setSessions(loadHistory());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const add = useCallback((s: Session) => setSessions(addSession(s)), []);
  const note = useCallback((id: string, text: string) => setSessions(setNote(id, text)), []);
  const remove = useCallback((id: string) => setSessions(removeSession(id)), []);
  return { sessions, add, note, remove };
}
