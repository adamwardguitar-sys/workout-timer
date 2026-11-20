import { useCallback, useRef, useState } from 'react';
import { newId } from '../model/id';
import type { Workout } from '../model/types';
import { loadLibrary, mergeImport, saveLibrary } from '../store/library';

export interface LibraryApi {
  workouts: Workout[];
  save(w: Workout): void;
  remove(id: string): void;
  duplicate(id: string): void;
  move(from: number, to: number): void;
  importMerge(incoming: Workout[]): void;
}

/**
 * Every change is written to storage immediately (not in an effect), so a screen
 * that unmounts in the same tick as a save, e.g. create-then-navigate, cannot lose it.
 */
export function useLibrary(): LibraryApi {
  const [workouts, setWorkouts] = useState<Workout[]>(() => loadLibrary());
  const latest = useRef(workouts);

  const commit = useCallback((update: (ws: Workout[]) => Workout[]) => {
    const next = update(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    saveLibrary(next);
    setWorkouts(next);
  }, []);

  const save = useCallback(
    (w: Workout) =>
      commit((ws) => (ws.some((x) => x.id === w.id) ? ws.map((x) => (x.id === w.id ? w : x)) : [...ws, w])),
    [commit],
  );

  const remove = useCallback((id: string) => commit((ws) => ws.filter((w) => w.id !== id)), [commit]);

  const duplicate = useCallback(
    (id: string) =>
      commit((ws) => {
        const i = ws.findIndex((w) => w.id === id);
        if (i < 0) return ws;
        const src = ws[i];
        const copy: Workout = {
          ...src,
          id: newId(),
          name: `${src.name} copy`,
          steps: src.steps.map((s) => ({ ...s, id: newId() })),
        };
        return [...ws.slice(0, i + 1), copy, ...ws.slice(i + 1)];
      }),
    [commit],
  );

  const move = useCallback(
    (from: number, to: number) =>
      commit((ws) => {
        if (from === to || from < 0 || to < 0 || from >= ws.length || to >= ws.length) return ws;
        const next = [...ws];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      }),
    [commit],
  );

  const importMerge = useCallback(
    (incoming: Workout[]) => commit((ws) => mergeImport(ws, incoming)),
    [commit],
  );

  return { workouts, save, remove, duplicate, move, importMerge };
}
