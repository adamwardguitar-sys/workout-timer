import type { Navigate, Route } from '../route';

const TABS: { name: 'library' | 'history' | 'settings'; label: string; icon: string }[] = [
  { name: 'library', label: 'Workouts', icon: '⏱' },
  { name: 'history', label: 'History', icon: '📈' },
  { name: 'settings', label: 'Settings', icon: '⚙' },
];

export function TabBar({ route, navigate }: { route: Route; navigate: Navigate }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.name}
          className="tab"
          aria-current={route.name === t.name ? 'page' : undefined}
          onClick={() => navigate({ name: t.name })}
        >
          <span className="tab-icon" aria-hidden>
            {t.icon}
          </span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
