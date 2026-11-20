import { useCallback, useEffect, useState } from 'react';
import {
  HISTORY_KEY,
  addSession,
  loadHistory,
  removeSession,
  setNote,
  setWeights,
  type ExerciseWeight,
  type Session,
  type WeightUnit,
} from '../store/history';

export interface HistoryApi {
  sessions: Session[];
  add(s: Session): void;
  note(id: string, text: string): void;
  remove(id: string): void;
  weights(id: string, list: ExerciseWeight[], unit: WeightUnit): void;
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
  const weights = useCallback(
    (id: string, list: ExerciseWeight[], unit: WeightUnit) => setSessions(setWeights(id, list, unit)),
    [],
  );
  return { sessions, add, note, remove, weights };
}
