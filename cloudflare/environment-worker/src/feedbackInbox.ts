/**
 * 站内留言箱（private feedback inbox）。
 *
 * 为什么是 Durable Object + SQLite 而不是 D1 / 新 KV namespace：DO 的 `new_sqlite_classes`
 * 迁移在 deploy 时自动建库，**零 Dashboard 操作**；D1 与 KV namespace 都得 owner 先手工创建
 * 再把 id 填回 wrangler 配置。留言量级（每天上限 200 条）也完全在单个 DO 实例的舒适区内，
 * 而单实例天然串行正好让限流计数不需要额外的锁。
 *
 * 隐私边界（与 §6.7 的匿名统计同一条线）：**不存 IP 原文、不存 UA 原文**。
 * - `client_key` = SHA-256(salt + IP + 当天 UTC 日期) 取前 16 位。同一个人换一天就换一个 key，
 *   所以它能当日限流用，却不能把两天的留言拼成同一个人。
 * - `ua_family` 只落 iOS / Android / Windows / macOS / other 五个粗粒度值。
 *
 * 这个文件刻意把所有能纯化的判断（校验、派生、限流、Discord payload）做成导出的纯函数，
 * DO 本体只剩「拿仓库、串路由」。SQL 访问收在 `FeedbackRepository` 接口后面，单测注入内存实现。
 */

export type FeedbackKind = 'bug' | 'idea' | 'other';

export const feedbackKinds: readonly FeedbackKind[] = ['bug', 'idea', 'other'];

export const feedbackKindLabels: Record<FeedbackKind, string> = {
  bug: '问题',
  idea: '建议',
  other: '其他',
};

export type FeedbackStatus = 'new' | 'read';

/** 4 KB 够写 1000 字正文加元数据，再多一定不是正常表单。 */
export const MAX_FEEDBACK_BODY_BYTES = 4096;
export const MESSAGE_MIN_LENGTH = 5;
export const MESSAGE_MAX_LENGTH = 1000;
export const CONTACT_MAX_LENGTH = 120;
export const BUILD_MAX_LENGTH = 40;
export const DISCORD_MESSAGE_MAX_LENGTH = 1500;

/** 同一 client_key（≈ 同一 IP + 同一 UTC 日）每天最多 5 条。 */
export const MAX_FEEDBACK_PER_CLIENT_PER_DAY = 5;
/** 全站每 UTC 日最多 200 条——DO 单实例，这个上限是防刷不是防负载。 */
export const MAX_FEEDBACK_PER_DAY = 200;

export const DEFAULT_FEEDBACK_LIST_LIMIT = 50;
export const MAX_FEEDBACK_LIST_LIMIT = 200;

/**
 * client_key 的固定盐。它只是让 hash 不可被「拿一份 IP 表直接撞」，不是密钥：
 * 换掉它只会让当天的限流计数重新开始，没有别的后果，所以刻意写死而不是走 secret。
 */
const CLIENT_KEY_SALT = 'luxraykit-feedback-inbox-v1';

export type FeedbackSubmission = {
  kind: FeedbackKind;
  message: string;
  contact: string;
  route: string;
  appBuild: string;
  dataVersion: string;
};

export type FeedbackParseResult =
  | { ok: true; honeypot: true }
  | { ok: true; honeypot: false; submission: FeedbackSubmission }
  | { ok: false; field: string };

export type FeedbackRecord = FeedbackSubmission & {
  id: string;
  createdAt: string;
  uaFamily: string;
  country: string;
  status: FeedbackStatus;
};

export type FeedbackRow = FeedbackRecord & { clientKey: string };

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

const isFeedbackKind = (value: unknown): value is FeedbackKind =>
  typeof value === 'string' && (feedbackKinds as readonly string[]).includes(value);

/**
 * 解析并校验提交体。`routeAllowlist` 传 `src/lib/hashRoute.ts` 的 `routePatterns`——与
 * `/api/ping` 同一套白名单，前后端共用一份路由表。不在白名单里的 route **置空而不是报错**：
 * 它只是诊断信息，不该让一条真实留言因为版本错配被丢掉。
 */
export const parseFeedbackBody = (value: unknown, routeAllowlist: ReadonlySet<string>): FeedbackParseResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, field: 'body' };
  const candidate = value as Record<string, unknown>;

  // 蜜罐：真实用户看不见这个字段，填了就是脚本。返回假成功，不给探测者任何信号。
  if (asString(candidate.website).trim().length > 0) return { ok: true, honeypot: true };

  if (!isFeedbackKind(candidate.kind)) return { ok: false, field: 'kind' };
  if (typeof candidate.message !== 'string') return { ok: false, field: 'message' };

  const message = candidate.message.trim();
  if (message.length < MESSAGE_MIN_LENGTH || message.length > MESSAGE_MAX_LENGTH) return { ok: false, field: 'message' };

  const contact = asString(candidate.contact).trim();
  if (contact.length > CONTACT_MAX_LENGTH) return { ok: false, field: 'contact' };

  const appBuild = asString(candidate.appBuild).trim();
  if (appBuild.length > BUILD_MAX_LENGTH) return { ok: false, field: 'appBuild' };

  const dataVersion = asString(candidate.dataVersion).trim();
  if (dataVersion.length > BUILD_MAX_LENGTH) return { ok: false, field: 'dataVersion' };

  const route = asString(candidate.route).trim();

  return {
    ok: true,
    honeypot: false,
    submission: {
      kind: candidate.kind,
      message,
      contact,
      route: routeAllowlist.has(route) ? route : '',
      appBuild,
      dataVersion,
    },
  };
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** 当天 UTC 日期，`YYYY-MM-DD`。client_key 和全站日配额都以它为界。 */
export const utcDayKey = (now: Date) => now.toISOString().slice(0, 10);

/**
 * 每日轮换的客户端指纹。**IP 原文不进数据库、也不进日志**——只有这 16 位十六进制留下来，
 * 而且换一天就换一个值，跨天无法关联。
 */
export const deriveClientKey = async (ip: string, now: Date) =>
  (await sha256Hex(`${CLIENT_KEY_SALT}:${ip}:${utcDayKey(now)}`)).slice(0, 16);

/** UA 原文不落库，只留这五个粗粒度值，够判断「是不是某个平台特有的问题」。 */
export const uaFamily = (userAgent: string | null | undefined): string => {
  const ua = userAgent ?? '';
  if (/iPhone|iPad|iPod|iOS/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  return 'other';
};

export type RateLimitVerdict = 'ok' | 'client' | 'global';

export const rateLimitVerdict = (counts: { clientToday: number; siteToday: number }): RateLimitVerdict => {
  if (counts.clientToday >= MAX_FEEDBACK_PER_CLIENT_PER_DAY) return 'client';
  if (counts.siteToday >= MAX_FEEDBACK_PER_DAY) return 'global';
  return 'ok';
};

export const normalizeListLimit = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_FEEDBACK_LIST_LIMIT;
  return Math.min(Math.floor(parsed), MAX_FEEDBACK_LIST_LIMIT);
};

export const normalizeListStatus = (value: string | null): FeedbackStatus | 'all' => {
  if (value === 'read') return 'read';
  if (value === 'all') return 'all';
  return 'new';
};

/** owner 在 UTC+8 生活，Discord 里读到 UTC 时间等于每次都要心算。 */
export const formatUtc8 = (value: string) => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return value;
  return `${new Date(milliseconds + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC+8`;
};

/** 形如 `cloudflare/build-notifier` 的 `buildDiscordPayload`：一条 embed，禁止 @ 提及。 */
export const buildFeedbackDiscordPayload = (record: FeedbackRecord) => ({
  username: 'LuxrayKit 留言板',
  embeds: [
    {
      title: `📮 新留言 · ${feedbackKindLabels[record.kind]}`,
      description: record.message.slice(0, DISCORD_MESSAGE_MAX_LENGTH),
      color: 0x00a3ff,
      fields: [
        { name: '联系方式', value: record.contact || '未留', inline: true },
        { name: '来源页面', value: record.route || '未知', inline: true },
        { name: '构建', value: record.appBuild || '未知', inline: true },
        { name: '数据版本', value: record.dataVersion || '未知', inline: true },
        { name: '国家/地区', value: record.country || '未知', inline: true },
        { name: '设备', value: record.uaFamily || 'other', inline: true },
        { name: 'ID', value: record.id, inline: false },
      ],
      footer: { text: formatUtc8(record.createdAt) },
    },
  ],
  allowed_mentions: { parse: [] as string[] },
});

/**
 * 推送失败**只记日志**：留言已经落库，owner 随时能用管理接口捞出来，没有理由让 Discord
 * 的抖动把用户那边的 201 变成红字。
 */
export const pushFeedbackToDiscord = async (
  webhookUrl: string,
  record: FeedbackRecord,
  fetcher: typeof fetch = fetch,
) => {
  try {
    const response = await fetcher(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildFeedbackDiscordPayload(record)),
    });
    if (!response.ok) {
      console.log(JSON.stringify({
        event: 'feedback_discord_push_failed',
        id: record.id,
        status: response.status,
      }));
    }
  } catch (error) {
    console.log(JSON.stringify({
      event: 'feedback_discord_push_failed',
      id: record.id,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
};

/* ------------------------------------------------------------------------- *
 * 存储
 * ------------------------------------------------------------------------- */

export interface FeedbackRepository {
  init(): void;
  countByClientKey(clientKey: string): number;
  countSince(sinceIso: string): number;
  insert(row: FeedbackRow): void;
  list(status: FeedbackStatus | 'all', limit: number): FeedbackRecord[];
  markRead(id: string): boolean;
}

type SqlRow = Record<string, unknown>;

/** `this.ctx.storage.sql` 的最小接口——单测里的假实现只需要满足这一条。 */
export type SqlLike = {
  exec(query: string, ...bindings: unknown[]): { toArray(): SqlRow[] };
};

const toRecord = (row: SqlRow): FeedbackRecord => ({
  id: String(row.id),
  createdAt: String(row.created_at),
  kind: (isFeedbackKind(row.kind) ? row.kind : 'other'),
  message: String(row.message ?? ''),
  contact: String(row.contact ?? ''),
  route: String(row.route ?? ''),
  appBuild: String(row.app_build ?? ''),
  dataVersion: String(row.data_version ?? ''),
  uaFamily: String(row.ua_family ?? ''),
  country: String(row.country ?? ''),
  status: row.status === 'read' ? 'read' : 'new',
});

export class SqlFeedbackRepository implements FeedbackRepository {
  constructor(private readonly sql: SqlLike) {}

  init() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      contact TEXT,
      route TEXT,
      app_build TEXT,
      data_version TEXT,
      ua_family TEXT,
      country TEXT,
      client_key TEXT,
      status TEXT NOT NULL
    )`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS feedback_created_at ON feedback (created_at)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS feedback_client_key ON feedback (client_key)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS feedback_status ON feedback (status)');
  }

  countByClientKey(clientKey: string) {
    const [row] = this.sql.exec('SELECT COUNT(*) AS total FROM feedback WHERE client_key = ?', clientKey).toArray();
    return Number(row?.total ?? 0);
  }

  countSince(sinceIso: string) {
    const [row] = this.sql.exec('SELECT COUNT(*) AS total FROM feedback WHERE created_at >= ?', sinceIso).toArray();
    return Number(row?.total ?? 0);
  }

  insert(row: FeedbackRow) {
    this.sql.exec(
      `INSERT INTO feedback
        (id, created_at, kind, message, contact, route, app_build, data_version, ua_family, country, client_key, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.createdAt,
      row.kind,
      row.message,
      row.contact,
      row.route,
      row.appBuild,
      row.dataVersion,
      row.uaFamily,
      row.country,
      row.clientKey,
      row.status,
    );
  }

  list(status: FeedbackStatus | 'all', limit: number) {
    const rows = status === 'all'
      ? this.sql.exec('SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?', limit).toArray()
      : this.sql.exec('SELECT * FROM feedback WHERE status = ? ORDER BY created_at DESC LIMIT ?', status, limit).toArray();
    return rows.map(toRecord);
  }

  markRead(id: string) {
    const rows = this.sql.exec("UPDATE feedback SET status = 'read' WHERE id = ? RETURNING id", id).toArray();
    return rows.length > 0;
  }
}

/* ------------------------------------------------------------------------- *
 * DO 内部 HTTP 协议（只有本 Worker 调得到，路径固定）
 * ------------------------------------------------------------------------- */

export const FEEDBACK_DURABLE_OBJECT_NAME = 'feedback-inbox';
export const FEEDBACK_SUBMIT_URL = 'https://internal.luxraykit/feedback/submit';
export const FEEDBACK_LIST_URL = 'https://internal.luxraykit/feedback/list';
export const FEEDBACK_MARK_READ_URL = 'https://internal.luxraykit/feedback/mark-read';

export type FeedbackSubmitEnvelope = {
  submission: FeedbackSubmission;
  clientKey: string;
  uaFamily: string;
  country: string;
  receivedAt: string;
};

const internalJson = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

/**
 * DO 里跑的全部业务逻辑，与 `DurableObjectState` 解耦，单测直接 new 一个内存 repository 注入。
 */
export class FeedbackInboxCore {
  constructor(
    private readonly repository: FeedbackRepository,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/feedback/submit') {
      const envelope = await request.json().catch(() => null) as FeedbackSubmitEnvelope | null;
      if (!envelope?.submission) return internalJson({ error: 'invalid_envelope' }, 400);
      return this.submit(envelope);
    }

    if (request.method === 'GET' && url.pathname === '/feedback/list') {
      const status = normalizeListStatus(url.searchParams.get('status'));
      const limit = normalizeListLimit(url.searchParams.get('limit'));
      return internalJson({ items: this.repository.list(status, limit), status, limit }, 200);
    }

    if (request.method === 'POST' && url.pathname === '/feedback/mark-read') {
      const payload = await request.json().catch(() => null) as { id?: unknown } | null;
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return internalJson({ error: 'invalid_feedback_id' }, 400);
      return this.repository.markRead(id)
        ? internalJson({ id, status: 'read' }, 200)
        : internalJson({ error: 'feedback_not_found' }, 404);
    }

    return internalJson({ error: 'not_found' }, 404);
  }

  /**
   * 限流在这里做而不是在外层 Worker：DO 是单实例，请求天然串行，读计数和写入之间不会有
   * 第二个请求插进来，所以不需要任何额外的锁或 CAS。
   */
  private submit(envelope: FeedbackSubmitEnvelope): Response {
    const createdAt = envelope.receivedAt;
    const dayStart = `${utcDayKey(new Date(createdAt))}T00:00:00.000Z`;
    const verdict = rateLimitVerdict({
      clientToday: this.repository.countByClientKey(envelope.clientKey),
      siteToday: this.repository.countSince(dayStart),
    });
    if (verdict !== 'ok') {
      return internalJson({ error: 'feedback_rate_limited', scope: verdict }, 429);
    }

    const record: FeedbackRecord = {
      ...envelope.submission,
      id: this.newId(),
      createdAt,
      uaFamily: envelope.uaFamily,
      country: envelope.country,
      status: 'new',
    };
    this.repository.insert({ ...record, clientKey: envelope.clientKey });
    return internalJson({ record }, 201);
  }
}

/**
 * 单实例 DO（`idFromName('feedback-inbox')`）。建表放在 `blockConcurrencyWhile` 里，
 * 保证第一个请求进来时 schema 已经在了。
 */
export class FeedbackInboxDurableObject implements DurableObject {
  private readonly core: FeedbackInboxCore;

  constructor(state: DurableObjectState, _env: unknown) {
    const repository = new SqlFeedbackRepository(state.storage.sql as unknown as SqlLike);
    state.blockConcurrencyWhile(async () => {
      repository.init();
    });
    this.core = new FeedbackInboxCore(repository);
  }

  fetch(request: Request): Promise<Response> {
    return this.core.fetch(request);
  }
}
