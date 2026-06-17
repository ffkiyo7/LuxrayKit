// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { BeforeInstallPromptEvent } from './pwa';

describe('PWA install helpers', () => {
  it('consumes a captured install prompt before awaiting the browser response', async () => {
    vi.resetModules();
    const pwa = await import('./pwa');
    pwa.initInstallPromptCapture();

    let resolveChoice!: (choice: { outcome: 'accepted'; platform: string }) => void;
    const userChoice = new Promise<{ outcome: 'accepted'; platform: string }>((resolve) => {
      resolveChoice = resolve;
    });
    const prompt = vi.fn(async () => {});
    const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
    Object.assign(event, { platforms: ['web'], prompt, userChoice });
    window.dispatchEvent(event);

    const firstAttempt = pwa.promptInstall();
    expect(pwa.isInstallPromptAvailable()).toBe(false);
    await expect(pwa.promptInstall()).resolves.toBe('unavailable');

    resolveChoice({ outcome: 'accepted', platform: 'web' });
    await expect(firstAttempt).resolves.toBe('accepted');
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('clears a captured prompt when the browser prompt throws', async () => {
    vi.resetModules();
    const pwa = await import('./pwa');
    pwa.initInstallPromptCapture();

    const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
    Object.assign(event, {
      platforms: ['web'],
      prompt: vi.fn(async () => {
        throw new DOMException('The prompt was already used', 'InvalidStateError');
      }),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    });
    window.dispatchEvent(event);

    await expect(pwa.promptInstall()).resolves.toBe('unavailable');
    expect(pwa.isInstallPromptAvailable()).toBe(false);
  });

  it('distinguishes iOS Safari from alternative iOS browsers', async () => {
    vi.resetModules();
    const pwa = await import('./pwa');
    const userAgentSpy = vi.spyOn(window.navigator, 'userAgent', 'get');

    userAgentSpy.mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
    expect(pwa.isIosSafari()).toBe(true);

    userAgentSpy.mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148 Safari/604.1');
    expect(pwa.isIosSafari()).toBe(false);

    userAgentSpy.mockRestore();
  });
});
