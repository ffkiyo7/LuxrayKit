import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './lib/serviceWorker';
import './styles.css';
import './styles/environment.css';
import './styles/teams.css';
import './styles/team-editor.css';
import './styles/dex.css';
import './styles/type-chart.css';
import './styles/profile.css';
import './styles/calculator.css';

// iOS Safari leaves :active unapplied on tap unless a touch listener is registered; this empty
// passive one is what makes the press states in styles.css fire on iPhone.
document.addEventListener('touchstart', () => {}, { passive: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Production only: under `vite dev` the worker would serve stale /src modules from its cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void registerServiceWorker();
  });
}
