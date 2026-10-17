import { env } from "cloudflare:workers";

export type Row = Record<string, any>;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function database() {
  if (!env.DB) throw new Error("Missing D1 database binding");
  return env.DB;
}
export const id = () => crypto.randomUUID();
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function one(
  sql: string,
  ...args: (string | number | null)[]
): Promise<Row | null> {
  return database()
    .prepare(sql)
    .bind(...args)
    .first<Row>();
}
export async function all(
  sql: string,
  ...args: (string | number | null)[]
): Promise<Row[]> {
  return (
    await database()
      .prepare(sql)
      .bind(...args)
      .all<Row>()
  ).results;
}
export async function run(sql: string, ...args: (string | number | null)[]) {
  return database()
    .prepare(sql)
    .bind(...args)
    .run();
}
let seeded: Promise<void> | undefined;
export function seed() {
  return (seeded ??= seedDatabase().catch((error) => {
    seeded = undefined;
    throw error;
  }));
}
async function seedDatabase() {
  if (await one("SELECT id FROM communities WHERE id='unnc'")) return;
  const now = Date.now();
  const result = await run(
    "INSERT OR IGNORE INTO communities (id,name,description,visibility,created_at) VALUES (?,?,?,?,?)",
    "unnc",
    "宁诺例辩",
    "在这里，让不同的观点相遇。宁波诺丁汉大学辩论社区，每周一道辩题，一起拓宽思考的边界。",
    "private",
    now,
  );
  if (result.meta.changes)
    await run(
      "INSERT OR IGNORE INTO topics (id,community_id,title,description,pro_label,con_label,category,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      "first-motion",
      "unnc",
      "在人工智能时代，通识教育比专业教育更重要",
      "当人工智能正在重塑知识与工作，我们该如何理解大学教育的价值？请比较两种教育在培养个人能力、应对社会变化方面的作用。\n\n这是一个可替换的初始辩题，管理员可发布本周的正式训练题。",
      "通识教育更重要",
      "专业教育更重要",
      "科技与教育",
      "open",
      now,
    );
}
export async function viewer(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)debate_session=([^;]+)/)?.[1];
  if (!token) return null;
  return one(
    "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",
    await hash(token),
    Date.now(),
  );
}
export async function community(id: string) {
  const row = await one("SELECT * FROM communities WHERE id=?", id);
  if (!row) throw new ApiError(404, "社区不存在");
  return row;
}
export async function membership(communityId: string, userId?: string) {
  return userId
    ? one(
        "SELECT * FROM memberships WHERE community_id=? AND user_id=?",
        communityId,
        userId,
      )
    : null;
}
export async function access(
  communityId: string,
  user: Row | null,
  write = false,
  admin = false,
) {
  const c = await community(communityId);
  const m = await membership(communityId, user?.id);
  if (admin && !["owner", "admin"].includes(m?.role))
    throw new ApiError(403, "此操作需要社群群主或管理员权限");
  if (write && !m) throw new ApiError(403, "请先加入社区");
  if (c.visibility !== "public" && !m)
    throw new ApiError(403, "这是私密社区，请使用有效邀请链接加入");
  return { c, m };
}
export async function requireTopic(
  topicId: string,
  communityId: string,
  open = false,
) {
  const t = await one(
    "SELECT * FROM topics WHERE id=? AND community_id=?",
    topicId,
    communityId,
  );
  if (!t) throw new ApiError(404, "辩题不存在");
  if (open && t.withdrawn) throw new ApiError(409, "该辩题已撤回，暂不能参与");
  if (open && t.status !== "open")
    throw new ApiError(409, "本次讨论已结束，仍可查看全部观点");
  return t;
}
export function text(value: unknown, field: string, min: number, max: number) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new ApiError(400, `${field}需为 ${min}–${max} 个字符`);
  return value.trim();
}
export async function body(request: Request) {
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let raw = "";
  if (reader) {
    // Drain the stream so local Worker proxies can deliver the rejection.
    // Retain at most 16 KiB, including when Content-Length is absent.
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size <= 16384) raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
  }
  if (size > 16384) throw new ApiError(413, "请求内容过长");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(415, "请使用 JSON 请求");
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new ApiError(403, "请求来源无效，请刷新页面重试");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed as Row;
  } catch {
    throw new ApiError(400, "请求格式无效");
  }
}
let lastLimitCleanup = 0;
export async function limit(key: string, max: number) {
  const bucket = `${Math.floor(Date.now() / 60000)}:${key}`;
  const r = await one(
    "INSERT INTO rate_limits (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    bucket,
  );
  if (Number(r?.count) > max)
    throw new ApiError(429, "操作太频繁，请一分钟后重试");
  const minute = Math.floor(Date.now() / 60000);
  if (lastLimitCleanup < minute) {
    lastLimitCleanup = minute;
    await run("DELETE FROM rate_limits WHERE key < ?", `${minute - 2}:`);
  }
}
export async function session(userId: string, request: Request) {
  const token = id() + id();
  await run(
    "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
    await hash(token),
    userId,
    Date.now() + 30 * 86400000,
  );
  return `debate_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function adminKey() {
  return (env as unknown as { ADMIN_KEY?: string }).ADMIN_KEY;
}
