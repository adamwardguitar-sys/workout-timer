import { useState } from 'react';
import type { Route } from './route';
import { Library } from './screens/Library';

export type { Route } from './route';

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'library' });
  const navigate = (r: Route) => setRoute(r);

  return (
    <main className="app">
      {route.name === 'library' && (
        <Library navigate={navigate} />
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
