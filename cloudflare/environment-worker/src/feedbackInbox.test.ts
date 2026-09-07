import { describe, expect, it, vi } from 'vitest';
import { routePatterns } from '../../../src/lib/hashRoute';
import {
  buildFeedbackDiscordPayload,
  deriveClientKey,
  FeedbackInboxCore,
  MAX_FEEDBACK_PER_CLIENT_PER_DAY,
  MAX_FEEDBACK_PER_DAY,
  normalizeListLimit,
  normalizeListStatus,
  parseFeedbackBody,
  pushFeedbackToDiscord,
  rateLimitVerdict,
  SqlFeedbackRepository,
  uaFamily,
  type FeedbackRecord,
  type FeedbackRow,
  type SqlLike,
} from './feedbackInbox';

const allowlist = new Set(routePatterns);

/**
 * Minimal in-memory stand-in for `ctx.storage.sql`. It recognizes exactly the statements
 * `SqlFeedbackRepository` issues — enough to exercise binding order and ordering/limit
 * semantics without booting a Durable Object.
 */
const createMemorySql = () => {
  const rows: Array<Record<string, unknown>> = [];
  const result = (values: Array<Record<string, unknown>>) => ({ toArray: () => values });

  const sql: SqlLike = {
    exec(query: string, ...bindings: unknown[]) {
      const statement = query.replace(/\s+/g, ' ').trim();

      if (statement.startsWith('CREATE')) return result([]);

      if (statement.startsWith('SELECT COUNT(*) AS total FROM feedback WHERE client_key = ?')) {
        return result([{ total: rows.filter((row) => row.client_key === bindings[0]).length }]);
      }

      if (statement.startsWith('SELECT COUNT(*) AS total FROM feedback WHERE created_at >= ?')) {
        return result([{ total: rows.filter((row) => String(row.created_at) >= String(bindings[0])).length }]);
      }

      if (statement.startsWith('INSERT INTO feedback')) {
        const columns = [
          'id', 'created_at', 'kind', 'message', 'contact', 'route',
          'app_build', 'data_version', 'ua_family', 'country', 'client_key', 'status',
        ];
        rows.push(Object.fromEntries(columns.map((column, index) => [column, bindings[index]])));
        return result([]);
      }

      if (statement.startsWith('SELECT * FROM feedback WHERE status = ?')) {
        const [status, limit] = bindings as [string, number];
        return result(
          rows.filter((row) => row.status === status)
            .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
            .slice(0, limit),
        );
      }

      if (statement.startsWith('SELECT * FROM feedback ORDER BY')) {
        const [limit] = bindings as [number];
        return result(
          [...rows]
            .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
            .slice(0, limit),
        );
      }

      if (statement.startsWith("UPDATE feedback SET status = 'read'")) {
        const target = rows.find((row) => row.id === bindings[0]);
        if (!target) return result([]);
        target.status = 'read';
        return result([{ id: target.id }]);
      }

      throw new Error(`unexpected statement: ${statement}`);
    },
  };

  return { sql, rows };
};

const createInbox = () => {
  const { sql, rows } = createMemorySql();
  const repository = new SqlFeedbackRepository(sql);
  repository.init();
  let counter = 0;
  const core = new FeedbackInboxCore(repository, () => `fb-${++counter}`);
  return { core, repository, rows };
};

const submit = (
  core: FeedbackInboxCore,
  overrides: Partial<{ message: string; clientKey: string; receivedAt: string }> = {},
) =>
  core.fetch(new Request('https://internal.luxraykit/feedback/submit', {
    method: 'POST',
    body: JSON.stringify({
      submission: {
        kind: 'idea',
        message: overrides.message ?? '希望速度线支持排序',
        contact: '',
        route: '/profile',
        appBuild: 'abc1234',
        dataVersion: 'reg-mb-1',
      },
      clientKey: overrides.clientKey ?? 'client-a',
      uaFamily: 'iOS',
      country: 'JP',
      receivedAt: overrides.receivedAt ?? '2026-09-07T08:00:00.000Z',
    }),
  }));

const sampleRecord = (patch: Partial<FeedbackRecord> = {}): FeedbackRecord => ({
  id: 'fb-1',
  createdAt: '2026-09-07T08:00:00.000Z',
  kind: 'bug',
  message: '速度线页面在 iPhone 上被裁切了',
  contact: 'me@example.com',
  route: '/tools/speed',
  appBuild: 'abc1234',
  dataVersion: 'reg-mb-1',
  uaFamily: 'iOS',
  country: 'JP',
  status: 'new',
  ...patch,
});

describe('parseFeedbackBody', () => {
  it('accepts a well-formed submission and trims every text field', () => {
    const parsed = parseFeedbackBody({
      kind: 'bug',
      message: '  速度线页面被裁切了  ',
      contact: '  me@example.com ',
      route: '/tools/speed',
      appBuild: ' abc1234 ',
      dataVersion: ' reg-mb-1 ',
      website: '',
    }, allowlist);

    expect(parsed).toEqual({
      ok: true,
      honeypot: false,
      submission: {
        kind: 'bug',
        message: '速度线页面被裁切了',
        contact: 'me@example.com',
        route: '/tools/speed',
        appBuild: 'abc1234',
        dataVersion: 'reg-mb-1',
      },
    });
  });

  it('flags the honeypot before any other validation', () => {
    expect(parseFeedbackBody({ website: 'https://spam.example', kind: 'nope', message: '' }, allowlist))
      .toEqual({ ok: true, honeypot: true });
  });

  it.each([
    ['a missing kind', { message: '这是一条足够长的留言' }, 'kind'],
    ['an unknown kind', { kind: 'rant', message: '这是一条足够长的留言' }, 'kind'],
    ['a non-string message', { kind: 'bug', message: 42 }, 'message'],
    ['a message under the minimum', { kind: 'bug', message: '  太短  ' }, 'message'],
    ['a message over the maximum', { kind: 'bug', message: 'x'.repeat(1001) }, 'message'],
    ['an over-long contact', { kind: 'bug', message: '这是一条足够长的留言', contact: 'x'.repeat(121) }, 'contact'],
    ['an over-long build', { kind: 'bug', message: '这是一条足够长的留言', appBuild: 'x'.repeat(41) }, 'appBuild'],
    ['an over-long data version', { kind: 'bug', message: '这是一条足够长的留言', dataVersion: 'x'.repeat(41) }, 'dataVersion'],
    ['an array body', [1, 2, 3], 'body'],
    ['a null body', null, 'body'],
  ])('rejects %s', (_label, body, field) => {
    expect(parseFeedbackBody(body, allowlist)).toEqual({ ok: false, field });
  });

  it('blanks a route outside the shared allowlist instead of failing the submission', () => {
    const parsed = parseFeedbackBody({ kind: 'other', message: '这是一条足够长的留言', route: '/teams/team-secret' }, allowlist);
    expect(parsed).toMatchObject({ ok: true, honeypot: false, submission: { route: '' } });
  });

  it('keeps the new #/profile/feedback pattern, which is where the form itself lives', () => {
    const parsed = parseFeedbackBody({ kind: 'other', message: '这是一条足够长的留言', route: '/profile/feedback' }, allowlist);
    expect(parsed).toMatchObject({ submission: { route: '/profile/feedback' } });
  });
});

describe('deriveClientKey', () => {
  it('is stable within a UTC day and rotates across days, so it cannot join a person across dates', async () => {
    const morning = await deriveClientKey('203.0.113.7', new Date('2026-09-07T00:10:00Z'));
    const evening = await deriveClientKey('203.0.113.7', new Date('2026-09-07T23:50:00Z'));
    const nextDay = await deriveClientKey('203.0.113.7', new Date('2026-09-08T00:10:00Z'));

    expect(morning).toBe(evening);
    expect(morning).not.toBe(nextDay);
    expect(morning).toHaveLength(16);
    expect(morning).toMatch(/^[0-9a-f]{16}$/);
    // The IP must not be recoverable from, or visible in, the stored key.
    expect(morning).not.toContain('203');
  });

  it('separates two addresses on the same day', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    expect(await deriveClientKey('203.0.113.7', now)).not.toBe(await deriveClientKey('203.0.113.8', now));
  });
});

describe('uaFamily', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', 'iOS'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15', 'iOS'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 'Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 'macOS'],
    ['curl/8.4.0', 'other'],
    ['', 'other'],
  ])('reduces %s to a platform family only', (ua, expected) => {
    expect(uaFamily(ua)).toBe(expected);
  });

  it('never returns anything derived from the raw string', () => {
    expect(uaFamily(null)).toBe('other');
  });
});

describe('rateLimitVerdict / list options', () => {
  it('trips the per-client limit before the site-wide one', () => {
    expect(rateLimitVerdict({ clientToday: 0, siteToday: 0 })).toBe('ok');
    expect(rateLimitVerdict({ clientToday: MAX_FEEDBACK_PER_CLIENT_PER_DAY - 1, siteToday: 0 })).toBe('ok');
    expect(rateLimitVerdict({ clientToday: MAX_FEEDBACK_PER_CLIENT_PER_DAY, siteToday: 0 })).toBe('client');
    expect(rateLimitVerdict({ clientToday: 0, siteToday: MAX_FEEDBACK_PER_DAY })).toBe('global');
  });

  it('clamps the admin list options', () => {
    expect(normalizeListLimit(null)).toBe(50);
    expect(normalizeListLimit('')).toBe(50);
    expect(normalizeListLimit('0')).toBe(50);
    expect(normalizeListLimit('-3')).toBe(50);
    expect(normalizeListLimit('abc')).toBe(50);
    expect(normalizeListLimit('10')).toBe(10);
    expect(normalizeListLimit('9999')).toBe(200);
    expect(normalizeListStatus(null)).toBe('new');
    expect(normalizeListStatus('read')).toBe('read');
    expect(normalizeListStatus('all')).toBe('all');
    expect(normalizeListStatus('garbage')).toBe('new');
  });
});

describe('FeedbackInboxCore over SqlFeedbackRepository', () => {
  it('stores a submission and lists it back newest-first', async () => {
    const { core, rows } = createInbox();

    const first = await submit(core, { message: '第一条留言', receivedAt: '2026-09-07T08:00:00.000Z' });
    const second = await submit(core, { message: '第二条留言', receivedAt: '2026-09-07T09:00:00.000Z' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ client_key: 'client-a', ua_family: 'iOS', country: 'JP', status: 'new' });

    const listed = await (await core.fetch(new Request('https://internal.luxraykit/feedback/list'))).json() as {
      items: FeedbackRecord[];
    };
    expect(listed.items.map((item) => item.message)).toEqual(['第二条留言', '第一条留言']);
    expect(listed.items[0]).toMatchObject({ id: 'fb-2', kind: 'idea', route: '/profile', status: 'new' });
  });

  it('marks one message read and drops it out of the default new listing', async () => {
    const { core } = createInbox();
    await submit(core, { message: '第一条留言' });

    const patched = await core.fetch(new Request('https://internal.luxraykit/feedback/mark-read', {
      method: 'POST',
      body: JSON.stringify({ id: 'fb-1' }),
    }));
    expect(patched.status).toBe(200);

    const remaining = await (await core.fetch(new Request('https://internal.luxraykit/feedback/list'))).json() as {
      items: FeedbackRecord[];
    };
    expect(remaining.items).toHaveLength(0);

    const all = await (await core.fetch(new Request('https://internal.luxraykit/feedback/list?status=all'))).json() as {
      items: FeedbackRecord[];
    };
    expect(all.items[0].status).toBe('read');
  });

  it('404s a mark-read for an id that is not there', async () => {
    const { core } = createInbox();
    const response = await core.fetch(new Request('https://internal.luxraykit/feedback/mark-read', {
      method: 'POST',
      body: JSON.stringify({ id: 'nope' }),
    }));
    expect(response.status).toBe(404);
  });

  it('stops one client after five messages in a UTC day, and lets it write again the next day', async () => {
    const { core } = createInbox();

    for (let index = 0; index < MAX_FEEDBACK_PER_CLIENT_PER_DAY; index += 1) {
      expect((await submit(core, { message: `留言 ${index}` })).status).toBe(201);
    }

    const blocked = await submit(core, { message: '第六条留言' });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: 'feedback_rate_limited', scope: 'client' });

    // A different client on the same day is unaffected...
    expect((await submit(core, { clientKey: 'client-b' })).status).toBe(201);
    // ...and the original key is day-scoped, so tomorrow's key is a fresh budget.
    expect((await submit(core, { clientKey: 'client-a-day2', receivedAt: '2026-09-08T01:00:00.000Z' })).status).toBe(201);
  });

  it('stops the whole site once the daily cap is reached', async () => {
    const { core, repository } = createInbox();
    for (let index = 0; index < MAX_FEEDBACK_PER_DAY; index += 1) {
      repository.insert({
        id: `seed-${index}`,
        createdAt: '2026-09-07T01:00:00.000Z',
        kind: 'other',
        message: '历史留言',
        contact: '',
        route: '',
        appBuild: '',
        dataVersion: '',
        uaFamily: 'other',
        country: '',
        status: 'new',
        clientKey: `seed-client-${index}`,
      } satisfies FeedbackRow);
    }

    const blocked = await submit(core, { clientKey: 'fresh-client' });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ scope: 'global' });
  });

  it('404s an unknown internal path', async () => {
    const { core } = createInbox();
    expect((await core.fetch(new Request('https://internal.luxraykit/nope'))).status).toBe(404);
  });
});

describe('Discord push', () => {
  it('builds one embed with the message truncated and no mentions', () => {
    const payload = buildFeedbackDiscordPayload(sampleRecord({ message: 'x'.repeat(2000) }));

    expect(payload.embeds[0].title).toBe('📮 新留言 · 问题');
    expect(payload.embeds[0].description).toHaveLength(1500);
    expect(payload.embeds[0].footer.text).toBe('2026-09-07 16:00:00 UTC+8');
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    const fields = Object.fromEntries(payload.embeds[0].fields.map((field) => [field.name, field.value]));
    expect(fields).toMatchObject({
      联系方式: 'me@example.com',
      来源页面: '/tools/speed',
      构建: 'abc1234',
      '国家/地区': 'JP',
      设备: 'iOS',
      ID: 'fb-1',
    });
  });

  it('labels the empty optional fields rather than shipping blanks', () => {
    const fields = Object.fromEntries(
      buildFeedbackDiscordPayload(sampleRecord({ contact: '', route: '', appBuild: '', country: '' }))
        .embeds[0].fields.map((field) => [field.name, field.value]),
    );
    expect(fields).toMatchObject({ 联系方式: '未留', 来源页面: '未知', 构建: '未知' });
  });

  it('swallows a webhook failure and only logs it', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;

    await expect(pushFeedbackToDiscord('https://discord.example/hook', sampleRecord(), fetcher)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('feedback_discord_push_failed');
    log.mockRestore();
  });

  it('swallows a thrown network error too', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    await expect(pushFeedbackToDiscord('https://discord.example/hook', sampleRecord(), fetcher)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
