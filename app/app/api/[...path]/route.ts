import {
  access,
  adminKey,
  all,
  ApiError,
  body,
  community,
  database,
  hash,
  id,
  limit,
  membership,
  one,
  requireTopic,
  run,
  seed,
  session,
  text,
  viewer,
} from "@/lib/server";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const json = (data: unknown, status = 200, extra = {}) =>
  Response.json(data, { status, headers: { ...headers, ...extra } });
async function handle(request: Request) {
  try {
    await seed();
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\//, "");
    const user = await viewer(request);
    if (request.method === "GET" && path === "communities") {
      if (!user) throw new ApiError(401, "请先加入一个社群");
      return json({
        communities: await all(
          "SELECT c.id,c.name,m.role FROM communities c JOIN memberships m ON m.community_id=c.id WHERE m.user_id=? ORDER BY c.created_at",
          user.id,
        ),
      });
    }
    if (request.method === "GET" && path === "members") {
      const cid = url.searchParams.get("community") || "unnc";
      const { m } = await access(cid, user, true, true);
      if (m?.role !== "owner")
        throw new ApiError(403, "只有群主可以管理成员权限");
      return json({
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
      });
    }
    if (request.method === "GET" && path === "state") {
      const cid = url.searchParams.get("community") || "unnc";
      const c = await community(cid);
      const m = await membership(cid, user?.id);
      const canRead = c.visibility === "public" || !!m;
      const count = await one(
        "SELECT COUNT(*) AS n FROM memberships WHERE community_id=?",
        cid,
      );
      const state: Record<string, any> = {
        community: { ...c, memberCount: canRead ? count?.n : 0 },
        viewer: user
          ? {
              id: user.id,
              nickname: user.nickname,
              role: m?.role ?? null,
              platformAdmin: !!user.platform_admin,
            }
          : null,
        accessible: canRead,
        topics: [],
        topic: null,
        comments: [],
        stats: { pro: 0, con: 0 },
        mySide: null,
      };
      if (canRead) {
        const rows = await all(
          "SELECT t.*, (SELECT COUNT(*) FROM votes v WHERE v.topic_id=t.id) AS voteCount, (SELECT COUNT(*) FROM comments c WHERE c.topic_id=t.id AND c.deleted=0) AS commentCount FROM topics t WHERE community_id=? ORDER BY created_at DESC,id DESC",
          cid,
        );
        state.topics = rows.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          proLabel: t.pro_label,
          conLabel: t.con_label,
          category: t.category,
          status: t.status,
          createdAt: t.created_at,
          voteCount: t.voteCount,
          commentCount: t.commentCount,
        }));
        const requested = url.searchParams.get("topic");
        state.topic = requested
          ? (state.topics.find((t: any) => t.id === requested) ?? null)
          : (state.topics[0] ?? null);
        if (state.topic) {
          const tid = state.topic.id;
          const counts = await all(
            "SELECT side,COUNT(*) AS n FROM votes WHERE topic_id=? GROUP BY side",
            tid,
          );
          for (const count of counts) state.stats[count.side] = count.n;
          state.mySide = user
            ? ((
                await one(
                  "SELECT side FROM votes WHERE topic_id=? AND user_id=?",
                  tid,
                  user.id,
                )
              )?.side ?? null)
            : null;
          state.comments = (
            await all(
              "SELECT c.*,u.nickname FROM comments c JOIN users u ON c.user_id=u.id WHERE topic_id=? ORDER BY created_at ASC,id ASC",
              tid,
            )
          ).map((c) => ({
            id: c.id,
            parentId: c.parent_id,
            userId: c.user_id,
            nickname: c.nickname,
            side: c.side,
            content: c.deleted ? "此观点已被移除" : c.content,
            deleted: c.deleted,
            createdAt: c.created_at,
          }));
        }
      }
      return json(state);
    }
    if (request.method !== "POST") throw new ApiError(404, "接口不存在");
    const b = await body(request);
    const cid = text(b.communityId ?? "unnc", "社区标识", 1, 50);
    const ip = request.headers.get("cf-connecting-ip") || "local";
    await limit(`request:${ip}`, 180);
    if (path === "admin/login") {
      await limit(`login:${ip}`, 10);
      const key = adminKey();
      if (!key) throw new ApiError(503, "管理员口令尚未配置，请设置 ADMIN_KEY");
      if (
        typeof b.key !== "string" ||
        (await hash(b.key)) !== (await hash(key))
      )
        throw new ApiError(401, "管理员口令不正确");
      await community(cid);
      if (cid !== "unnc")
        throw new ApiError(
          403,
          "平台初始口令仅用于宁诺例辩；其他社群的管理权由各自群主分配",
        );
      const uid =
        (
          await one(
            "SELECT id FROM users WHERE platform_admin=1 ORDER BY created_at LIMIT 1",
          )
        )?.id || "initial-owner";
      await database().batch([
        database()
          .prepare(
            "INSERT INTO users (id,nickname,platform_admin,created_at) VALUES (?,?,1,?) ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname",
          )
          .bind(
            uid,
            text(b.nickname || "社区管理员", "昵称", 2, 20),
            Date.now(),
          ),
        database()
          .prepare(
            "INSERT INTO memberships (community_id,user_id,role,created_at) VALUES (?,?,?,?) ON CONFLICT(community_id,user_id) DO UPDATE SET role='owner'",
          )
          .bind(cid, uid, "owner", Date.now()),
      ]);
      return json({ ok: true }, 200, {
        "Set-Cookie": await session(uid, request),
      });
    }
    if (path === "join") {
      await limit(`join:${ip}`, 10);
      const c = await community(cid);
      const existing = await membership(cid, user?.id);
      if (!existing && c.visibility !== "public") {
        const invite = await one(
          "SELECT * FROM invites WHERE token_hash=? AND community_id=? AND revoked=0 AND expires_at>?",
          await hash(typeof b.invite === "string" ? b.invite : ""),
          cid,
          Date.now(),
        );
        if (!invite)
          throw new ApiError(403, "邀请无效或已过期，请联系管理员获取新邀请");
      }
      const nickname = text(b.nickname, "昵称", 2, 20);
      const uid = user?.id ?? id();
      const statements = [];
      if (!user)
        statements.push(
          database()
            .prepare(
              "INSERT INTO users (id,nickname,created_at) VALUES (?,?,?)",
            )
            .bind(uid, nickname, Date.now()),
        );
      statements.push(
        database()
          .prepare(
            "INSERT OR IGNORE INTO memberships (community_id,user_id,role,created_at) VALUES (?,?,?,?)",
          )
          .bind(cid, uid, "member", Date.now()),
      );
      await database().batch(statements);
      return json(
        { ok: true },
        200,
        user ? {} : { "Set-Cookie": await session(uid, request) },
      );
    }
    if (path === "logout") {
      const token = request.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)debate_session=([^;]+)/)?.[1];
      if (token)
        await run("DELETE FROM sessions WHERE token_hash=?", await hash(token));
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "debate_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      });
    }
    if (!user) throw new ApiError(401, "请先加入社区");
    if (path === "communities/create") {
      await limit(`create-community:${user.id}`, 5);
      const slug = text(b.slug, "社区标识", 2, 40);
      if (!/^[a-z][a-z0-9-]*$/.test(slug))
        throw new ApiError(400, "社区标识只能包含小写字母、数字和短横线");
      if (await one("SELECT id FROM communities WHERE id=?", slug))
        throw new ApiError(409, "此社区标识已被使用");
      await database().batch([
        database()
          .prepare(
            "INSERT INTO communities (id,name,description,visibility,created_at) VALUES (?,?,?,?,?)",
          )
          .bind(
            slug,
            text(b.name, "社区名称", 2, 40),
            text(
              b.description || "一起交换观点，练习思考。",
              "社区介绍",
              2,
              300,
            ),
            "private",
            Date.now(),
          ),
        database()
          .prepare(
            "INSERT INTO memberships (community_id,user_id,role,created_at) VALUES (?,?,?,?)",
          )
          .bind(slug, user.id, "owner", Date.now()),
      ]);
      return json({ slug }, 201);
    }
    if (["topics/status", "votes", "comments"].includes(path))
      b.topicId = text(b.topicId, "辩题标识", 1, 80);
    if (path === "comments/delete")
      b.commentId = text(b.commentId, "观点标识", 1, 80);
    const isAdmin = [
      "settings",
      "invites/create",
      "invites/revoke",
      "topics/create",
      "topics/status",
    ].includes(path);
    await access(cid, user, true, isAdmin);
    if (path === "members/role") {
      const m = await membership(cid, user.id);
      if (m?.role !== "owner")
        throw new ApiError(403, "只有群主可以添加或撤销管理员");
      const targetId = text(b.userId, "成员标识", 1, 80);
      const target = await membership(cid, targetId);
      if (!target) throw new ApiError(404, "该成员不在此社群");
      if (target.role === "owner")
        throw new ApiError(400, "不能修改群主的角色");
      if (!["admin", "member"].includes(b.role))
        throw new ApiError(400, "只能设置为管理员或普通成员");
      await run(
        "UPDATE memberships SET role=? WHERE community_id=? AND user_id=? AND role!='owner'",
        b.role,
        cid,
        targetId,
      );
    } else if (path === "settings") {
      if ((await membership(cid, user.id))?.role !== "owner")
        throw new ApiError(403, "只有群主可以更改社群可见性");
      if (!["public", "private"].includes(b.visibility))
        throw new ApiError(400, "可见性无效");
      await run(
        "UPDATE communities SET visibility=? WHERE id=?",
        b.visibility,
        cid,
      );
    } else if (path === "invites/create") {
      const token = id() + id();
      const expiresAt = Date.now() + 7 * 86400000;
      await run(
        "INSERT INTO invites (token_hash,community_id,expires_at,created_at) VALUES (?,?,?,?)",
        await hash(token),
        cid,
        expiresAt,
        Date.now(),
      );
      return json({ token, expiresAt }, 201);
    } else if (path === "invites/revoke") {
      await run("UPDATE invites SET revoked=1 WHERE community_id=?", cid);
    } else if (path === "topics/create") {
      const tid = id();
      await run(
        "INSERT INTO topics (id,community_id,title,description,pro_label,con_label,category,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        tid,
        cid,
        text(b.title, "辩题", 5, 120),
        text(b.description, "背景介绍", 5, 3000),
        text(b.proLabel, "正方立场", 2, 80),
        text(b.conLabel, "反方立场", 2, 80),
        text(b.category || "每周训练", "分类", 2, 20),
        "open",
        Date.now(),
      );
      return json({ id: tid }, 201);
    } else if (path === "topics/status") {
      await requireTopic(b.topicId, cid);
      if (!["open", "closed"].includes(b.status))
        throw new ApiError(400, "讨论状态无效");
      await run(
        "UPDATE topics SET status=? WHERE id=? AND community_id=?",
        b.status,
        b.topicId,
        cid,
      );
    } else if (path === "votes") {
      await requireTopic(b.topicId, cid, true);
      if (!["pro", "con"].includes(b.side))
        throw new ApiError(400, "请选择正方或反方");
      await run(
        "INSERT INTO votes (topic_id,user_id,side) VALUES (?,?,?) ON CONFLICT(topic_id,user_id) DO UPDATE SET side=excluded.side",
        b.topicId,
        user.id,
        b.side,
      );
    } else if (path === "comments") {
      await requireTopic(b.topicId, cid, true);
      await limit(`comment:${user.id}`, 15);
      const vote = await one(
        "SELECT side FROM votes WHERE topic_id=? AND user_id=?",
        b.topicId,
        user.id,
      );
      if (!vote) throw new ApiError(400, "请先选择持方，再发表观点");
      let parentId = null;
      if (b.parentId) {
        const parent = await one(
          "SELECT id,parent_id FROM comments WHERE id=? AND topic_id=?",
          b.parentId,
          b.topicId,
        );
        if (!parent) throw new ApiError(400, "回复的观点不存在");
        parentId = parent.parent_id || parent.id;
      }
      await run(
        "INSERT INTO comments (id,topic_id,user_id,parent_id,side,content,created_at) VALUES (?,?,?,?,?,?,?)",
        id(),
        b.topicId,
        user.id,
        parentId,
        vote.side,
        text(b.content, "观点", 2, 3000),
        Date.now(),
      );
    } else if (path === "comments/delete") {
      const comment = await one(
        "SELECT c.* FROM comments c JOIN topics t ON t.id=c.topic_id WHERE c.id=? AND t.community_id=?",
        b.commentId,
        cid,
      );
      if (!comment) throw new ApiError(404, "观点不存在");
      const member = await membership(cid, user.id);
      if (
        comment.user_id !== user.id &&
        !["owner", "admin"].includes(member?.role)
      )
        throw new ApiError(403, "只能移除自己的观点");
      await run(
        "UPDATE comments SET deleted=1,content='' WHERE id=?",
        b.commentId,
      );
    } else throw new ApiError(404, "接口不存在");
    return json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error("DebateHub API error", e);
    return json({ error: "服务暂时不可用，请稍后重试" }, 500);
  }
}
export const GET = handle;
export const POST = handle;
