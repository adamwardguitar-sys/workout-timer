import { act, renderHook } from '@testing-library/react';
import { useHistory } from './useHistory';
import { HISTORY_KEY, addSession, loadHistory, type Session } from '../store/history';

const sess = (id: string): Session => ({
  id,
  workoutId: 'w',
  workoutName: 'W',
  mode: 'interval',
  startedAt: 1,
  durationSec: 60,
  roundsDone: 1,
  laps: 0,
  completed: true,
});

beforeEach(() => localStorage.clear());

describe('useHistory', () => {
  it('starts empty, adds, sets notes, removes, and persists synchronously', () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.sessions).toEqual([]);
    act(() => {
      result.current.add(sess('a'));
      expect(loadHistory().map((s) => s.id)).toEqual(['a']); // saved before any re-render
    });
    act(() => result.current.add(sess('b')));
    act(() => result.current.note('a', 'good'));
    expect(result.current.sessions.find((s) => s.id === 'a')?.note).toBe('good');
    act(() => result.current.remove('b'));
    expect(result.current.sessions.map((s) => s.id)).toEqual(['a']);
  });

  it('refreshes when another tab logs a session', () => {
    const { result } = renderHook(() => useHistory());
    addSession(sess('from-other-tab'));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: HISTORY_KEY }));
    });
    expect(result.current.sessions.map((s) => s.id)).toEqual(['from-other-tab']);
  });
});
