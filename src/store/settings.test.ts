import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from './settings';
import { memStorage, throwingStorage } from '../test/memStorage';

describe('settings', () => {
  it('defaults', () => {
    expect(loadSettings(memStorage())).toEqual({
      sound: true,
      volume: 0.8,
      beepSeconds: 3,
      keepAwake: true,
      vibrate: true,
    });
  });

  it('round trips', () => {
    const st = memStorage();
    const s = { sound: false, volume: 0.4, beepSeconds: 5, keepAwake: false, vibrate: false };
    saveSettings(s, st);
    expect(loadSettings(st)).toEqual(s);
  });

  it('falls back to defaults for corrupt or wrong-typed values', () => {
    expect(loadSettings(memStorage({ [SETTINGS_KEY]: '{oops' }))).toEqual(DEFAULT_SETTINGS);
    const st = memStorage({ [SETTINGS_KEY]: JSON.stringify({ sound: 'yes', volume: 'loud', beepSeconds: null }) });
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps volume to 0..1 and beep seconds to 1..5', () => {
    const st = memStorage({ [SETTINGS_KEY]: JSON.stringify({ volume: 7, beepSeconds: 99 }) });
    expect(loadSettings(st)).toMatchObject({ volume: 1, beepSeconds: 5 });
  });

  it('ignores unknown keys', () => {
    const st = memStorage({ [SETTINGS_KEY]: JSON.stringify({ sound: false, mystery: 1 }) });
    const s = loadSettings(st);
    expect(s.sound).toBe(false);
    expect('mystery' in s).toBe(false);
  });

  it('does not throw when storage is unavailable', () => {
    expect(loadSettings(throwingStorage())).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, throwingStorage())).not.toThrow();
  });
});
