import { useState } from 'react';
import type { Route } from './route';

export type { Route } from './route';

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'library' });
  const navigate = (r: Route) => setRoute(r);

  return (
    <main className="app">
      {route.name === 'library' && (
        <section>
          <h1>Library</h1>
        </section>
      )}
      {route.name !== 'library' && (
        <section>
          <h1>{route.name}</h1>
          <button onClick={() => navigate({ name: 'library' })}>Back</button>
        </section>
      )}
    </main>
  );
}
