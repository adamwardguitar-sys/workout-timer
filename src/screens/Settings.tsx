import { useState } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import type { Navigate } from '../route';
import { saveTextFile } from '../util/download';
import { importSessions, loadHistory } from '../store/history';
import { exportLibrary, parseImport } from '../store/library';
import { loadSettings, saveSettings, type Settings as SettingsData } from '../store/settings';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

export function Settings({ navigate }: { navigate: Navigate }) {
  const lib = useLibrary();
  const [settings, setSettings] = useState<SettingsData>(() => loadSettings());
  const [notice, setNotice] = useState<Notice>(null);

  const change = (patch: Partial<SettingsData>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  function exportBackup() {
    void saveTextFile('workout-timer-backup.json', exportLibrary(lib.workouts, loadHistory()));
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setNotice({ kind: 'error', text: 'Could not read that file.' });
      return;
    }
    const result = parseImport(text);
    if (!result.ok) {
      setNotice({ kind: 'error', text: result.error });
      return;
    }
    lib.importMerge(result.workouts);
    const { added } = importSessions(result.history);
    const n = result.workouts.length;
    const sessions = added > 0 ? ` and ${added} ${added === 1 ? 'session' : 'sessions'}` : '';
    setNotice({ kind: 'ok', text: `Imported ${n} ${n === 1 ? 'workout' : 'workouts'}${sessions}` });
  }

  return (
    <section className="screen">
      <header className="screen-head">
        <button className="btn ghost" onClick={() => navigate({ name: 'library' })}>
          <span aria-hidden>←</span>
          <span className="sr-only">Back to library</span>
        </button>
        <h1>Settings</h1>
        <span className="run-spacer" />
      </header>

      <h2>Sound</h2>
      <label className="check">
        <input type="checkbox" aria-label="Sound" checked={settings.sound} onChange={(e) => change({ sound: e.target.checked })} />
        Sound
      </label>
      <label className="field">
        <span className="field-label">Volume</span>
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => change({ volume: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        <span className="field-label">Countdown beeps</span>
        <select
          aria-label="Countdown beeps"
          value={settings.beepSeconds}
          onChange={(e) => change({ beepSeconds: Number(e.target.value) })}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              Last {n} {n === 1 ? 'second' : 'seconds'}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          aria-label="Vibration"
          checked={settings.vibrate}
          onChange={(e) => change({ vibrate: e.target.checked })}
        />
        Vibration <span className="muted">(not available on iPhone)</span>
      </label>

      <h2>Screen</h2>
      <label className="check">
        <input
          type="checkbox"
          aria-label="Keep screen awake"
          checked={settings.keepAwake}
          onChange={(e) => change({ keepAwake: e.target.checked })}
        />
        Keep screen awake during a workout
      </label>
      <p className="muted">Beeps stop if the screen locks, so keep it on while you train.</p>

      <h2>Backup</h2>
      <p className="muted">Your workouts live on this device. Export a copy now and then.</p>
      <div className="backup-actions">
        <button className="btn" onClick={exportBackup}>
          Export backup
        </button>
        <label className="btn file-btn">
          Import backup
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Import backup"
            className="sr-only"
            onChange={(e) => {
              void importBackup(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'errors' : 'muted'}>
          {notice.text}
        </p>
      )}
    </section>
  );
}
