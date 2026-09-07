// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTrackedRoute, trackRoute } from './analytics';

const readBeaconBody = async (blob: unknown) => JSON.parse(await (blob as Blob).text());

describe('trackRoute', () => {
  let sendBeacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetTrackedRoute();
    // import.meta.env.DEV is true under vitest; the ping is deliberately suppressed there, so
    // flip it for these cases. Restored by unstubAllEnvs.
    vi.stubEnv('DEV', false);
    sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
    document.documentElement.dataset.theme = 'dark';
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the route pattern, PWA flag and theme — and nothing else', async () => {
    trackRoute('/env/pokemon/:id');

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/ping');
    expect(await readBeaconBody(sendBeacon.mock.calls[0][1])).toEqual({
      route: '/env/pokemon/:id',
      standalone: false,
      theme: 'dark',
    });
  });

  it('reports the installed PWA and the light theme', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query === '(display-mode: standalone)' })));
    document.documentElement.dataset.theme = 'light';

    trackRoute('/teams');

    expect(await readBeaconBody(sendBeacon.mock.calls[0][1])).toMatchObject({ standalone: true, theme: 'light' });
  });

  it('does not repeat the same route', () => {
    trackRoute('/env');
    trackRoute('/env');
    trackRoute('/env');
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    trackRoute('/teams');
    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when the user opted out', () => {
    trackRoute('/env', { optOut: true });
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('sends nothing in development', () => {
    vi.stubEnv('DEV', true);
    trackRoute('/env');
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('falls back to keepalive fetch when sendBeacon is unavailable', async () => {
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: undefined });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    trackRoute('/tools/speed');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ping');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toMatchObject({ route: '/tools/speed' });
  });

  it('swallows a throwing transport instead of surfacing it', () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: () => {
        throw new Error('blocked by extension');
      },
    });

    expect(() => trackRoute('/profile')).not.toThrow();
  });
});
