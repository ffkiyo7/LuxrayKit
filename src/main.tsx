import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SERVICE_WORKER_UPDATE_EVENT } from './components/ServiceWorkerUpdateToast';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // A controller that already exists at load time means this page was served by an installed
    // service worker. sw.js does skipWaiting + clients.claim, so the *next* controllerchange is a
    // newly deployed version taking over a tab still running the old chunks — that is the only
    // case worth telling the user about. A first install has no prior controller and must not
    // nag: the page is already the newest code. Fire once; repeated swaps add nothing.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let announced = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || announced) return;
      announced = true;
      window.dispatchEvent(new CustomEvent(SERVICE_WORKER_UPDATE_EVENT));
    });

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA registration failure should never block the app shell.
    });
  });
}
