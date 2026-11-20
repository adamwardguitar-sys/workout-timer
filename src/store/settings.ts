export interface Settings {
  sound: boolean;
  volume: number;
  beepSeconds: number;
  keepAwake: boolean;
  vibrate: boolean;
}

export const SETTINGS_KEY = 'workout-timer:settings:v1';

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  volume: 0.8,
  beepSeconds: 3,
  keepAwake: true,
  vibrate: true,
};

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;

export function loadSettings(storage: Storage | undefined = defaultStorage()): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      sound: bool(p.sound, DEFAULT_SETTINGS.sound),
      volume: num(p.volume, DEFAULT_SETTINGS.volume, 0, 1),
      beepSeconds: Math.round(num(p.beepSeconds, DEFAULT_SETTINGS.beepSeconds, 1, 5)),
      keepAwake: bool(p.keepAwake, DEFAULT_SETTINGS.keepAwake),
      vibrate: bool(p.vibrate, DEFAULT_SETTINGS.vibrate),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
