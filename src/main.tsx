import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';

// Pick up a new version as soon as it is published (the page reloads itself once).
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
