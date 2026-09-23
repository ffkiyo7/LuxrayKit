/**
 * Dispatched on `window` when a new build has been downloaded and is waiting to take over.
 * Kept as a CustomEvent so this module stays plain DOM code and never reaches into React state.
 */
export const SERVICE_WORKER_UPDATE_EVENT = 'luxraykit:service-worker-updated';

let waitingWorker: ServiceWorker | null = null;
let reloading = false;

const announce = (worker: ServiceWorker) => {
  waitingWorker = worker;
  window.dispatchEvent(new CustomEvent(SERVICE_WORKER_UPDATE_EVENT));
};

/**
 * sw.js never skips waiting on its own: the running tab keeps its build's cache (including lazy
 * chunks it has not opened yet) until the user taps 重载. That hands the waiting worker control;
 * the controllerchange listener below then reloads onto the new build.
 */
export function applyServiceWorkerUpdate() {
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  window.location.reload();
}

export function registerServiceWorker(
  container: ServiceWorkerContainer = navigator.serviceWorker,
  reload: () => void = () => window.location.reload(),
) {
  // Present at load = this page is an installed build. Without one, the first install's
  // clients.claim also fires controllerchange, and that must neither prompt nor reload.
  const hadController = Boolean(container.controller);
  container.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    // Every tab on the old build reloads, not only the one that tapped: activation deleted the
    // old build's cache, so its not-yet-loaded chunks are gone.
    reloading = true;
    reload();
  });

  return container
    .register('/sw.js')
    .then((registration) => {
      // Only an update needs a prompt; with no controller the page already runs the newest build.
      if (registration.waiting && container.controller) announce(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && container.controller) announce(installing);
        });
      });
      // An installed PWA can sit in the background for days without a navigation, which is when
      // the browser would otherwise look for a new sw.js.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => undefined);
      });
      return registration;
    })
    .catch(() => {
      // PWA registration failure should never block the app shell.
      return undefined;
    });
}
