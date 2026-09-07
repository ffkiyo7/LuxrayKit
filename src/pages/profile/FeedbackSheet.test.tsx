// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackSheet } from './FeedbackSheet';
import { currentDataVersion } from '../../data';

const created = { id: 'fb-1', createdAt: '2026-09-07T08:00:00.000Z' };

const stubFetch = (response: Response | (() => Promise<Response>)) => {
  const fetchMock = vi.fn(typeof response === 'function' ? response : async () => response.clone());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const lastBody = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body as string) as Record<string, unknown>;

describe('FeedbackSheet', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it('keeps 发送 disabled until the message clears the five-character minimum', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(jsonResponse(created, 201));
    render(<FeedbackSheet onClose={() => {}} />);

    const send = screen.getByRole('button', { name: /发送/ });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText('留言内容'), '太短');
    expect((send as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText('留言内容'), '了一点点');
    expect((send as HTMLButtonElement).disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits the chosen kind, the build identity and the honeypot field, then confirms receipt', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(jsonResponse(created, 201));
    render(<FeedbackSheet onClose={() => {}} route="/tools/speed" />);

    await user.click(screen.getByRole('button', { name: '问题' }));
    await user.type(screen.getByLabelText('留言内容'), '  速度线页面在小屏上被裁切  ');
    await user.type(screen.getByLabelText('联系方式（可选）'), 'me@example.com');
    await user.click(screen.getByRole('button', { name: /发送/ }));

    expect(await screen.findByText('已收到，谢谢！')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/feedback');

    const body = lastBody(fetchMock);
    expect(body).toMatchObject({
      kind: 'bug',
      // Trimmed client-side so the character counter and the server's 5–1000 window agree.
      message: '速度线页面在小屏上被裁切',
      contact: 'me@example.com',
      route: '/tools/speed',
      dataVersion: currentDataVersion.id,
      website: '',
    });
    expect(typeof body.appBuild).toBe('string');
    // The form is a private inbox: nothing of what was written comes back on screen.
    expect(screen.queryByLabelText('留言内容')).toBeNull();
  });

  it('defaults to 建议 and reports it when the user never touches the chips', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(jsonResponse(created, 201));
    render(<FeedbackSheet onClose={() => {}} />);

    expect(screen.getByRole('button', { name: '建议' }).getAttribute('aria-pressed')).toBe('true');
    await user.type(screen.getByLabelText('留言内容'), '想要一个深色的图鉴');
    await user.click(screen.getByRole('button', { name: /发送/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody(fetchMock).kind).toBe('idea');
  });

  it('sends whatever a bot typed into the hidden honeypot input', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(jsonResponse(created, 201));
    const { container } = render(<FeedbackSheet onClose={() => {}} />);

    const honeypot = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(honeypot).toBeTruthy();
    expect(honeypot.getAttribute('aria-hidden')).toBe('true');
    expect(honeypot.tabIndex).toBe(-1);
    // Off-screen rather than display:none — a bot that skips `display:none` still fills it.
    expect(honeypot.style.display).not.toBe('none');

    await user.type(screen.getByLabelText('留言内容'), '这是一条正常长度的留言');
    fireEvent.change(honeypot, { target: { value: 'https://spam.example' } });
    await user.click(screen.getByRole('button', { name: /发送/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody(fetchMock).website).toBe('https://spam.example');
  });

  it.each([
    [429, '今天留言太多了，明天再来。'],
    [503, '留言功能暂时不可用，稍后再试。'],
    [400, '这条留言没能通过校验，改一改再发。'],
  ])('explains a %s without losing the draft', async (status, expected) => {
    const user = userEvent.setup();
    stubFetch(jsonResponse({ error: 'nope' }, status));
    render(<FeedbackSheet onClose={() => {}} />);

    await user.type(screen.getByLabelText('留言内容'), '这是一条正常长度的留言');
    await user.click(screen.getByRole('button', { name: /发送/ }));

    expect((await screen.findByRole('alert')).textContent).toBe(expected);
    expect((screen.getByLabelText('留言内容') as HTMLTextAreaElement).value).toBe('这是一条正常长度的留言');
    expect(screen.queryByText('已收到，谢谢！')).toBeNull();
  });

  it('keeps the draft after a network failure so the retry costs nothing', async () => {
    const user = userEvent.setup();
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    render(<FeedbackSheet onClose={() => {}} />);

    await user.type(screen.getByLabelText('留言内容'), '这是一条正常长度的留言');
    await user.click(screen.getByRole('button', { name: /发送/ }));

    expect((await screen.findByRole('alert')).textContent).toBe('发送失败，草稿还在，可以再试一次。');
    expect(window.sessionStorage.getItem('luxraykit:feedback-draft')).toContain('这是一条正常长度的留言');
  });

  it('restores a draft that survived an accidental close, and clears it once sent', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      'luxraykit:feedback-draft',
      JSON.stringify({ kind: 'other', message: '没写完就手滑关掉了', contact: 'me@example.com' }),
    );
    stubFetch(jsonResponse(created, 201));
    render(<FeedbackSheet onClose={() => {}} />);

    expect((screen.getByLabelText('留言内容') as HTMLTextAreaElement).value).toBe('没写完就手滑关掉了');
    expect((screen.getByLabelText('联系方式（可选）') as HTMLInputElement).value).toBe('me@example.com');
    expect(screen.getByRole('button', { name: '其他' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: /发送/ }));

    expect(await screen.findByText('已收到，谢谢！')).toBeTruthy();
    expect(window.sessionStorage.getItem('luxraykit:feedback-draft')).toBeNull();
  });

  it('disables sending while offline and says so', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(jsonResponse(created, 201));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(<FeedbackSheet onClose={() => {}} />);

    await user.type(screen.getByLabelText('留言内容'), '这是一条正常长度的留言');

    expect((screen.getByRole('button', { name: /发送/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/当前离线/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('closes from both the backdrop and the 关闭 control', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FeedbackSheet onClose={onClose} />);

    const closers = screen.getAllByRole('button', { name: '关闭留言' });
    expect(closers).toHaveLength(2);
    await user.click(closers[0]);
    await user.click(closers[1]);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
