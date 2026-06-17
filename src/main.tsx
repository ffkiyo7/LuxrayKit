import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initInstallPromptCapture } from './lib/pwa';
import './styles.css';

// Capture `beforeinstallprompt` before React mounts so the install guide can
// trigger the native prompt on demand instead of losing the event.
initInstallPromptCapture();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA registration failure should never block the app shell.
    });
  });
}
