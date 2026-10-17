import { all, ApiError, database, hash, one, type Row } from "./server";

export async function stateContext(request: Request, cid: string) {
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)debate_session=([^;]+)/)?.[1];
  const context = await one(
    "SELECT c.*,u.id AS viewer_id,u.nickname,u.platform_admin,a.username,m.role,r.status AS join_status FROM communities c LEFT JOIN sessions s ON s.token_hash=? AND s.expires_at>? LEFT JOIN users u ON u.id=s.user_id LEFT JOIN account_credentials a ON a.user_id=u.id LEFT JOIN memberships m ON m.community_id=c.id AND m.user_id=u.id LEFT JOIN membership_requests r ON r.community_id=c.id AND r.user_id=u.id WHERE c.id=?",
    token ? await hash(token) : "",
    Date.now(),
    cid,
  );
  if (!context) throw new ApiError(404, "社区不存在");
  return context;
}

// Completed snapshots avoid rereading an unchanged discussion. Never retain
// request-owned pending I/O across handlers. Authorization
// and session expiry are always read afresh before a cache entry is used.
const snapshots = new Map<
  string,
  { value: Row; bytes: number; expires: number }
>();
let cacheBytes = 0;
async function snapshot(
  cid: string,
  revision: number,
  topicId: string,
  moderator: boolean,
) {
  const key = JSON.stringify([cid, revision, topicId, moderator]);
  const hit = snapshots.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) {
    snapshots.delete(key);
    cacheBytes -= hit.bytes;
  }
  const entry = {
    value: {} as Row,
    bytes: 0,
    expires: Date.now() + 60_000,
  };
  const value = await (async () => {
    const topics = await all(
      "SELECT * FROM topics WHERE community_id=? AND (withdrawn=0 OR ?=1) ORDER BY withdrawn,created_at DESC,id DESC",
      cid,
      moderator ? 1 : 0,
    );
    const topic = topicId ? topics.find((t) => t.id === topicId) : topics[0];
    let comments: Row[] = [],
      voters: Row[] = [];
    if (topic) {
      const result = await database().batch<Row>([
        database()
          .prepare(
            "SELECT c.*,u.nickname FROM comments c JOIN users u ON c.user_id=u.id WHERE topic_id=? ORDER BY created_at ASC,id ASC",
          )
          .bind(topic.id),
        database()
          .prepare(
            "SELECT v.user_id,u.nickname,v.side,v.anonymous FROM votes v JOIN users u ON u.id=v.user_id WHERE v.topic_id=? ORDER BY v.anonymous,v.side,CASE WHEN v.anonymous=0 THEN u.nickname ELSE '' END,CASE WHEN v.anonymous=0 THEN u.id ELSE '' END",
          )
          .bind(topic.id),
      ]);
      comments = result[0].results;
      voters = result[1].results;
    }
    const value = { topics, topic, comments, voters };
    entry.value = value;
    entry.bytes = JSON.stringify(value).length * 2;
    // A few large discussions must not fill the Worker's 128 MiB heap.
    if (!snapshots.has(key)) {
      snapshots.set(key, entry);
      cacheBytes += entry.bytes;
      while (snapshots.size > 24 || cacheBytes > 8 * 1024 * 1024) {
        const oldest = snapshots.keys().next().value;
        if (oldest === undefined) break;
        cacheBytes -= snapshots.get(oldest)!.bytes;
        snapshots.delete(oldest);
      }
    }
    return value;
  })();
  entry.value = value;
  return value;
}

export async function stateTag(context: Row, topicId: string, scope = "state") {
  return `"${await hash(JSON.stringify(["v2", scope, context.id, context.revision, topicId, context.viewer_id, context.nickname, context.platform_admin, context.username, context.role, context.join_status]))}"`;
}

export async function readState(c: Row, requested: string) {
  const moderator = ["owner", "admin"].includes(c.role);
  const canRead = c.visibility === "public" || !!c.role;
  const state: Row = {
    community: {
      id: c.id,
      name: c.name,
      description: c.description,
      visibility: c.visibility,
      created_at: c.created_at,
      joinApproval: !!c.join_approval,
      memberCount: canRead ? c.member_count : 0,
    },
    pendingCount: moderator ? c.pending_count : 0,
    viewer: c.viewer_id
      ? {
          id: c.viewer_id,
          nickname: c.nickname,
          role: c.role,
          joinStatus: c.role ? null : c.join_status,
          platformAdmin: !!c.platform_admin,
          username: c.username,
        }
      : null,
    accessible: canRead,
    topics: [],
    topic: null,
    comments: [],
    voters: [],
    stats: { pro: 0, con: 0 },
    mySide: null,
    myVoteAnonymous: false,
  };
  if (!canRead) return state;
  const raw = await snapshot(c.id, c.revision, requested, moderator);
  state.topics = raw.topics.map((t: Row) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    proLabel: t.pro_label,
    conLabel: t.con_label,
    category: t.category,
    status: t.status,
    withdrawn: !!t.withdrawn,
    updatedAt: t.updated_at,
    createdAt: t.created_at,
    voteCount: t.pro_count + t.con_count,
    commentCount: t.comment_count,
  }));
  state.topic = raw.topic
    ? state.topics.find((t: Row) => t.id === raw.topic.id)
    : null;
  if (!state.topic) return state;
  state.stats = { pro: raw.topic.pro_count, con: raw.topic.con_count };
  const mine = raw.voters.find((v: Row) => v.user_id === c.viewer_id);
  state.mySide = mine?.side ?? null;
  state.myVoteAnonymous = !!mine?.anonymous;
  if (c.role)
    state.voters = raw.voters.map((v: Row) => ({
      userId: v.anonymous ? null : v.user_id,
      nickname: v.anonymous ? "匿名成员" : v.nickname,
      side: v.side,
      anonymous: !!v.anonymous,
      isMine: v.user_id === c.viewer_id,
    }));
  state.comments = raw.comments.map((comment: Row) => ({
    id: comment.id,
    parentId: comment.parent_id,
    userId: comment.anonymous ? null : comment.user_id,
    nickname: comment.anonymous ? "匿名辩友" : comment.nickname,
    anonymous: !!comment.anonymous,
    isMine: comment.user_id === c.viewer_id,
    side: comment.side,
    content: comment.deleted ? "此观点已被移除" : comment.content,
    deleted: comment.deleted,
    createdAt: comment.created_at,
  }));
  return state;
}
