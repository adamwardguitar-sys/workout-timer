import { useState } from 'react';
import { TabBar } from './components/TabBar';
import type { Route } from './route';
import { History } from './screens/History';
import { Editor } from './screens/Editor';
import { Library } from './screens/Library';
import { Runner } from './screens/Runner';
import { Settings } from './screens/Settings';

export type { Route } from './route';

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'library' });
  const navigate = (r: Route) => setRoute(r);
  const showTabs = route.name === 'library' || route.name === 'history' || route.name === 'settings';

  return (
    <main className={`app${showTabs ? ' with-tabs' : ''}`}>
      {route.name === 'library' && <Library navigate={navigate} />}
      {route.name === 'editor' && <Editor id={route.id} navigate={navigate} />}
      {route.name === 'run' && <Runner id={route.id} resume={route.resume} navigate={navigate} />}
      {route.name === 'history' && <History />}
      {route.name === 'settings' && <Settings navigate={navigate} />}
      {showTabs && <TabBar route={route} navigate={navigate} />}
    </main>
  );
}
