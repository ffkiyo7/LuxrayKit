// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallGuide } from './InstallGuide';
import * as pwa from '../lib/pwa';

vi.mock('../lib/pwa', async () => {
  const actual = await vi.importActual<typeof import('../lib/pwa')>('../lib/pwa');
  return {
    ...actual,
    detectPlatform: vi.fn(() => 'ios' as const),
    isIosSafari: vi.fn(() => true),
    isStandalone: vi.fn(() => false),
    promptInstall: vi.fn(async () => 'accepted' as const),
    useInstallPromptAvailable: vi.fn(() => false),
  };
});

const mocked = {
  detectPlatform: vi.mocked(pwa.detectPlatform),
  isIosSafari: vi.mocked(pwa.isIosSafari),
  isStandalone: vi.mocked(pwa.isStandalone),
  promptInstall: vi.mocked(pwa.promptInstall),
  useInstallPromptAvailable: vi.mocked(pwa.useInstallPromptAvailable),
};

describe('InstallGuide', () => {
  beforeEach(() => {
    mocked.detectPlatform.mockReturnValue('ios');
    mocked.isIosSafari.mockReturnValue(true);
    mocked.isStandalone.mockReturnValue(false);
    mocked.promptInstall.mockResolvedValue('accepted');
    mocked.useInstallPromptAvailable.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('welcomes the user and lists the feature highlights', () => {
    render(<InstallGuide onDismiss={() => {}} />);

    expect(screen.getByRole('dialog', { name: '安装与上手指引' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /欢迎使用 LuxrayKit/ })).toBeTruthy();
    ['环境速览', '队伍配置', '对战工具', '个性与备份'].forEach((title) => {
      expect(screen.getByText(title)).toBeTruthy();
    });
  });

  it('dismisses from both the skip link and the primary button', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<InstallGuide onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: /稍后再说/ }));
    await user.click(screen.getByRole('button', { name: '开始使用' }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('shows manual iOS add-to-home-screen steps when no native prompt is available', () => {
    mocked.detectPlatform.mockReturnValue('ios');
    mocked.useInstallPromptAvailable.mockReturnValue(false);
    render(<InstallGuide onDismiss={() => {}} />);

    expect(screen.getByText(/点按 Safari 底部工具栏的「分享」按钮/)).toBeTruthy();
    expect(screen.getByText(/向下找到并选择「添加到主屏幕」/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /一键添加到主屏幕/ })).toBeNull();
  });

  it('directs iOS alternative browsers through Safari before adding to the home screen', () => {
    mocked.detectPlatform.mockReturnValue('ios');
    mocked.isIosSafari.mockReturnValue(false);
    render(<InstallGuide onDismiss={() => {}} />);

    expect(screen.getByText('iPhone / iPad · 请使用 Safari 安装')).toBeTruthy();
    expect(screen.getByText(/选择「在 Safari 中打开」/)).toBeTruthy();
    expect(screen.queryByText(/Safari 底部工具栏/)).toBeNull();
  });

  it('offers the native install button when the browser prompt is captured', async () => {
    const onDismiss = vi.fn();
    mocked.detectPlatform.mockReturnValue('android');
    mocked.useInstallPromptAvailable.mockReturnValue(true);
    const user = userEvent.setup();
    render(<InstallGuide onDismiss={onDismiss} />);

    const installButton = screen.getByRole('button', { name: /一键添加到主屏幕/ });
    await user.click(installButton);

    expect(mocked.promptInstall).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps the guide open when the native install prompt cannot be shown', async () => {
    const onDismiss = vi.fn();
    mocked.useInstallPromptAvailable.mockReturnValue(true);
    mocked.promptInstall.mockResolvedValue('unavailable');
    const user = userEvent.setup();
    render(<InstallGuide onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: /一键添加到主屏幕/ }));

    expect(mocked.promptInstall).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('confirms App mode instead of install steps when already standalone', () => {
    mocked.isStandalone.mockReturnValue(true);
    render(<InstallGuide onDismiss={() => {}} />);

    expect(screen.getByText(/已经在 App 模式运行/)).toBeTruthy();
    expect(screen.queryByText(/点按 Safari 底部工具栏/)).toBeNull();
  });
});
