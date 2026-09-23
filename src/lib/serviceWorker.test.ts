// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = () => void;

class FakeTarget {
  listeners = new Map<string, Listener[]>();
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class FakeWorker extends FakeTarget {
  state = 'installing';
  postMessage = vi.fn();
}

class FakeRegistration extends FakeTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(async () => undefined);
}

function setup({ controller = true, waiting = false } = {}) {
  const registration = new FakeRegistration();
  if (waiting) registration.waiting = new FakeWorker();
  const container = Object.assign(new FakeTarget(), {
    controller: controller ? {} : null,
    register: vi.fn(async () => registration),
  });
  const reload = vi.fn();
  const updates = vi.fn();
  return { registration, container, reload, updates };
}

// The module keeps the waiting worker and a reload latch; each test gets a fresh copy.
async function load() {
  vi.resetModules();
  return import('./serviceWorker');
}

describe('service worker registration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('prompts for a build that installed while this page was open, and activates it on 重载', async () => {
    const sw = await load();
    const { registration, container, reload, updates } = setup();
    window.addEventListener(sw.SERVICE_WORKER_UPDATE_EVENT, updates);
    await sw.registerServiceWorker(container as unknown as ServiceWorkerContainer, reload);

    const next = new FakeWorker();
    registration.installing = next;
    registration.emit('updatefound');
    next.state = 'installed';
    next.emit('statechange');
    expect(updates).toHaveBeenCalledOnce();

    sw.applyServiceWorkerUpdate();
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();

    // The new worker takes control: reload once onto the new build.
    container.emit('controllerchange');
    container.emit('controllerchange');
    expect(reload).toHaveBeenCalledOnce();
    window.removeEventListener(sw.SERVICE_WORKER_UPDATE_EVENT, updates);
  });

  it('prompts at startup for a build that was already waiting', async () => {
    const sw = await load();
    const { container, reload, updates } = setup({ waiting: true });
    window.addEventListener(sw.SERVICE_WORKER_UPDATE_EVENT, updates);
    await sw.registerServiceWorker(container as unknown as ServiceWorkerContainer, reload);

    expect(updates).toHaveBeenCalledOnce();
    window.removeEventListener(sw.SERVICE_WORKER_UPDATE_EVENT, updates);
  });

  it('neither prompts nor reloads on a first install', async () => {
    const sw = await load();
    const { registration, container, reload, updates } = setup({ controller: false });
    window.addEventListener(sw.SERVICE_WORKER_UPDATE_EVENT, updates);
    await sw.registerServiceWorker(container as unknown as ServiceWorkerContainer, reload);

    const first = new FakeWorker();
    registration.installing = first;
    registration.emit('updatefound');
    first.state = 'installed';
    first.emit('statechange');
    // clients.claim on first activation.
    container.emit('controllerchange');

    expect(updates).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    window.removeEventListener(sw.SERVICE_WORKER_UPDATE_EVENT, updates);
  });

  it('checks for a new build when the app comes back to the foreground', async () => {
    const sw = await load();
    const { registration, container, reload } = setup();
    await sw.registerServiceWorker(container as unknown as ServiceWorkerContainer, reload);

    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalled();
  });

  it('never lets a failed registration reach the app', async () => {
    const sw = await load();
    const { container, reload } = setup();
    container.register.mockRejectedValueOnce(new Error('insecure context'));

    await expect(sw.registerServiceWorker(container as unknown as ServiceWorkerContainer, reload)).resolves.toBeUndefined();
  });
});
