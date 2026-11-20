import { useState } from 'react';
import type { Route } from './route';
import { Editor } from './screens/Editor';
import { Library } from './screens/Library';
import { Runner } from './screens/Runner';
import { Settings } from './screens/Settings';

export type { Route } from './route';

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'library' });
  const navigate = (r: Route) => setRoute(r);

  return (
    <main className="app">
      {route.name === 'library' && <Library navigate={navigate} />}
      {route.name === 'editor' && <Editor id={route.id} navigate={navigate} />}
      {route.name === 'run' && <Runner id={route.id} navigate={navigate} />}
      {route.name === 'settings' && <Settings navigate={navigate} />}
    </main>
  );
}
