import { act, renderHook } from '@testing-library/react';
import { useLibrary } from './useLibrary';
import { loadLibrary } from '../store/library';
import { seedWorkouts } from '../store/seed';

beforeEach(() => localStorage.clear());

describe('useLibrary', () => {
  it('starts with the seed workouts', () => {
    const { result } = renderHook(() => useLibrary());
    expect(result.current.workouts.map((w) => w.name)[0]).toBe('Full Body A');
    expect(result.current.workouts).toHaveLength(3);
  });

  it('save replaces an existing workout and appends a new one, and persists', () => {
    const { result } = renderHook(() => useLibrary());
    const first = result.current.workouts[0];
    act(() => result.current.save({ ...first, name: 'Renamed' }));
    expect(result.current.workouts[0].name).toBe('Renamed');
    expect(result.current.workouts).toHaveLength(3);
    act(() => result.current.save({ ...first, id: 'new-one', name: 'Fresh' }));
    expect(result.current.workouts).toHaveLength(4);
    expect(loadLibrary().map((w) => w.name)).toContain('Fresh');
  });

  it('remove deletes by id', () => {
    const { result } = renderHook(() => useLibrary());
    const id = result.current.workouts[1].id;
    act(() => result.current.remove(id));
    expect(result.current.workouts.map((w) => w.id)).not.toContain(id);
    expect(result.current.workouts).toHaveLength(2);
  });

  it('duplicate inserts a copy after the original with fresh ids', () => {
    const { result } = renderHook(() => useLibrary());
    const orig = result.current.workouts[0];
    act(() => result.current.duplicate(orig.id));
    const copy = result.current.workouts[1];
    expect(copy.name).toBe('Full Body A copy');
    expect(copy.id).not.toBe(orig.id);
    expect(copy.steps.map((s) => s.label)).toEqual(orig.steps.map((s) => s.label));
    expect(copy.steps[0].id).not.toBe(orig.steps[0].id);
  });

  it('move reorders', () => {
    const { result } = renderHook(() => useLibrary());
    const names = result.current.workouts.map((w) => w.name);
    act(() => result.current.move(0, 2));
    expect(result.current.workouts.map((w) => w.name)).toEqual([names[1], names[2], names[0]]);
  });

  it('importMerge appends incoming workouts', () => {
    const { result } = renderHook(() => useLibrary());
    act(() => result.current.importMerge(seedWorkouts().slice(0, 2)));
    expect(result.current.workouts).toHaveLength(5);
  });

  it('persists synchronously, so a screen that unmounts right after saving cannot lose the change', () => {
    const { result } = renderHook(() => useLibrary());
    const first = result.current.workouts[0];
    act(() => {
      result.current.save({ ...first, id: 'created-then-navigated', name: 'Quick' });
      // no render has happened yet inside this callback
      expect(loadLibrary().map((w) => w.id)).toContain('created-then-navigated');
    });
  });

  it('successive updates in the same tick all land', () => {
    const { result } = renderHook(() => useLibrary());
    const [a, b] = result.current.workouts;
    act(() => {
      result.current.remove(a.id);
      result.current.remove(b.id);
    });
    expect(result.current.workouts).toHaveLength(1);
    expect(loadLibrary()).toHaveLength(1);
  });
});
