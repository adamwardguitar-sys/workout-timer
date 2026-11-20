import { useCallback, useEffect, useState } from 'react';
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

export function useLibrary(): LibraryApi {
  const [workouts, setWorkouts] = useState<Workout[]>(() => loadLibrary());

  useEffect(() => {
    saveLibrary(workouts);
  }, [workouts]);

  const save = useCallback((w: Workout) => {
    setWorkouts((ws) => (ws.some((x) => x.id === w.id) ? ws.map((x) => (x.id === w.id ? w : x)) : [...ws, w]));
  }, []);

  const remove = useCallback((id: string) => {
    setWorkouts((ws) => ws.filter((w) => w.id !== id));
  }, []);

  const duplicate = useCallback((id: string) => {
    setWorkouts((ws) => {
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
    });
  }, []);

  const move = useCallback((from: number, to: number) => {
    setWorkouts((ws) => {
      if (from === to || from < 0 || to < 0 || from >= ws.length || to >= ws.length) return ws;
      const next = [...ws];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const importMerge = useCallback((incoming: Workout[]) => {
    setWorkouts((ws) => mergeImport(ws, incoming));
  }, []);

  return { workouts, save, remove, duplicate, move, importMerge };
}
