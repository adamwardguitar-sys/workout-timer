import type { Navigate, Route } from '../route';
import { Icon, type IconName } from './Icon';

const TABS: { name: 'library' | 'history' | 'settings'; label: string; icon: IconName }[] = [
  { name: 'library', label: 'Workouts', icon: 'dumbbell' },
  { name: 'history', label: 'History', icon: 'chart' },
  { name: 'settings', label: 'Settings', icon: 'sliders' },
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
          <Icon name={t.icon} size={24} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
