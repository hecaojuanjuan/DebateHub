import {
  access,
  all,
  ApiError,
  community,
  database,
  hash,
  membership,
  one,
  text,
  type Row,
} from "./server";

export async function hasValidInvite(cid: string, token: unknown) {
  return one(
    "SELECT token_hash FROM invites WHERE token_hash=? AND community_id=? AND revoked=0 AND expires_at>?",
    await hash(typeof token === "string" ? token : ""),
    cid,
    Date.now(),
  );
}
export async function prepareCommunityJoin(
  cid: string,
  uid: string,
  token: unknown,
) {
  const c = await community(cid);
  if (
    !(await membership(cid, uid)) &&
    c.visibility !== "public" &&
    !(await hasValidInvite(cid, token))
  )
    throw new ApiError(403, "邀请无效或已过期，请联系管理员获取新邀请");
  return {
    cid,
    uid,
    inviteHash: await hash(typeof token === "string" ? token : ""),
  };
}
export function membershipJoinStatements(plan: {
  cid: string;
  uid: string;
  inviteHash: string;
}) {
  const { cid, uid, inviteHash } = plan;
  const now = Date.now();
  const db = database();
  const eligible =
    "EXISTS (SELECT 1 FROM communities c WHERE c.id=? AND (c.visibility='public' OR EXISTS (SELECT 1 FROM invites i WHERE i.community_id=c.id AND i.token_hash=? AND i.revoked=0 AND i.expires_at>?)))";
  return [
    db
      .prepare(
        `INSERT INTO membership_requests (community_id,user_id,status,created_at) SELECT ?,?,'pending',? WHERE NOT EXISTS (SELECT 1 FROM memberships WHERE community_id=? AND user_id=?) AND ${eligible} AND (EXISTS (SELECT 1 FROM communities WHERE id=? AND join_approval=1) OR EXISTS (SELECT 1 FROM membership_requests WHERE community_id=? AND user_id=? AND status IN ('pending','rejected','removed'))) ON CONFLICT(community_id,user_id) DO UPDATE SET status='pending',created_at=CASE WHEN membership_requests.status='pending' THEN membership_requests.created_at ELSE excluded.created_at END,reviewed_at=NULL,reviewed_by=NULL`,
      )
      .bind(cid, uid, now, cid, uid, cid, inviteHash, now, cid, cid, uid),
    db
      .prepare(
        `INSERT OR IGNORE INTO memberships (community_id,user_id,role,created_at) SELECT ?,?,'member',? WHERE ${eligible} AND EXISTS (SELECT 1 FROM communities WHERE id=? AND join_approval=0) AND NOT EXISTS (SELECT 1 FROM membership_requests WHERE community_id=? AND user_id=? AND status IN ('pending','rejected','removed'))`,
      )
      .bind(cid, uid, now, cid, inviteHash, now, cid, cid, uid),
  ];
}
export async function membershipState(cid: string, uid: string) {
  const joined = !!(await membership(cid, uid));
  const review = joined
    ? null
    : await one(
        "SELECT status FROM membership_requests WHERE community_id=? AND user_id=?",
        cid,
        uid,
      );
  return {
    joined,
    pending: review?.status === "pending",
    joinStatus: review?.status ?? null,
  };
}
export async function memberDirectory(cid: string, user: Row | null) {
  await access(cid, user, true, true);
  return {
    members: (
      await all(
        "SELECT u.id,u.nickname,m.role,m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.community_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,m.created_at",
        cid,
      )
    ).map((m) => ({
      id: m.id,
      nickname: m.nickname,
      role: m.role,
      createdAt: m.created_at,
    })),
    requests: (
      await all(
        "SELECT u.id,u.nickname,r.created_at FROM membership_requests r JOIN users u ON u.id=r.user_id WHERE r.community_id=? AND r.status='pending' ORDER BY r.created_at,u.id",
        cid,
      )
    ).map((r) => ({ id: r.id, nickname: r.nickname, createdAt: r.created_at })),
  };
}
export async function manageMembers(
  path: string,
  cid: string,
  user: Row,
  b: Row,
) {
  const { m } = await access(cid, user, true, path !== "members/leave");
  const db = database();
  if (path === "members/leave") {
    if (m?.role === "owner")
      throw new ApiError(403, "群主暂不能退出自己创建的社群");
    await db.batch([
      db
        .prepare(
          "DELETE FROM membership_requests WHERE community_id=? AND user_id=?",
        )
        .bind(cid, user.id),
      db
        .prepare(
          "DELETE FROM memberships WHERE community_id=? AND user_id=? AND role!='owner'",
        )
        .bind(cid, user.id),
    ]);
    return;
  }
  const targetId = text(b.userId, "成员标识", 1, 80);
  if (path === "members/review") {
    if (!["approve", "reject"].includes(b.decision))
      throw new ApiError(400, "请选择同意或拒绝");
    const statements = [];
    if (b.decision === "approve")
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO memberships (community_id,user_id,role,created_at) SELECT community_id,user_id,'member',? FROM membership_requests WHERE community_id=? AND user_id=? AND status='pending'",
          )
          .bind(Date.now(), cid, targetId),
      );
    statements.push(
      db
        .prepare(
          "UPDATE membership_requests SET status=?,reviewed_at=?,reviewed_by=? WHERE community_id=? AND user_id=? AND status='pending'",
        )
        .bind(
          b.decision === "approve" ? "approved" : "rejected",
          Date.now(),
          user.id,
          cid,
          targetId,
        ),
    );
    const results = await db.batch(statements);
    if (!results[results.length - 1].meta.changes)
      throw new ApiError(409, "这条申请已处理或不存在，请刷新列表");
    return;
  }
  if (path !== "members/remove") throw new ApiError(404, "接口不存在");
  if (targetId === user.id) throw new ApiError(400, "请使用退出社群操作");
  const target = await membership(cid, targetId);
  if (!target) throw new ApiError(404, "该成员不在此社群");
  if (target.role === "owner") throw new ApiError(403, "不能移出群主");
  if (m?.role !== "owner" && target.role !== "member")
    throw new ApiError(403, "管理员只能移出普通成员");
  const allowedRole = m?.role === "owner" ? "role!='owner'" : "role='member'";
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO membership_requests (community_id,user_id,status,created_at,reviewed_at,reviewed_by) SELECT community_id,user_id,'removed',?,?,? FROM memberships WHERE community_id=? AND user_id=? AND ${allowedRole} ON CONFLICT(community_id,user_id) DO UPDATE SET status='removed',created_at=excluded.created_at,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by`,
      )
      .bind(Date.now(), Date.now(), user.id, cid, targetId),
    db
      .prepare(
        `DELETE FROM memberships WHERE community_id=? AND user_id=? AND ${allowedRole} AND EXISTS (SELECT 1 FROM membership_requests WHERE community_id=? AND user_id=? AND status='removed')`,
      )
      .bind(cid, targetId, cid, targetId),
  ]);
  if (!results[0].meta.changes)
    throw new ApiError(409, "成员权限已变化，请刷新列表");
}
