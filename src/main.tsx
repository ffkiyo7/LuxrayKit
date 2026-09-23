import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './lib/serviceWorker';
import './styles.css';
import './styles/p2.css';
import './styles/p3.css';
import './styles/p3b.css';
import './styles/p4a.css';
import './styles/p4b.css';
import './styles/p6.css';
import './styles/calculator.css';

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
