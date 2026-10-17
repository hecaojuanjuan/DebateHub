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
import { accountAction } from "@/lib/accounts";
import {
  manageMembers,
  memberDirectory,
  membershipJoinStatements,
  membershipState,
  prepareCommunityJoin,
} from "@/lib/membership-management";
import { manageTopic } from "@/lib/topic-management";
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
      return json(await memberDirectory(cid, user));
    }
    if (request.method === "GET" && path === "state") {
      const cid = url.searchParams.get("community") || "unnc";
      const c = await community(cid);
      const m = await membership(cid, user?.id);
      const isModerator = ["owner", "admin"].includes(m?.role);
      const review =
        user && !m
          ? await one(
              "SELECT status FROM membership_requests WHERE community_id=? AND user_id=?",
              cid,
              user.id,
            )
          : null;
      const canRead = c.visibility === "public" || !!m;
      const count = await one(
        "SELECT COUNT(*) AS n FROM memberships WHERE community_id=?",
        cid,
      );
      const state: Record<string, any> = {
        community: {
          ...c,
          joinApproval: !!c.join_approval,
          memberCount: canRead ? count?.n : 0,
        },
        pendingCount: isModerator
          ? ((
              await one(
                "SELECT COUNT(*) AS n FROM membership_requests WHERE community_id=? AND status='pending'",
                cid,
              )
            )?.n ?? 0)
          : 0,
        viewer: user
          ? {
              id: user.id,
              nickname: user.nickname,
              role: m?.role ?? null,
              joinStatus: review?.status ?? null,
              platformAdmin: !!user.platform_admin,
              username:
                (
                  await one(
                    "SELECT username FROM account_credentials WHERE user_id=?",
                    user.id,
                  )
                )?.username ?? null,
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
      if (canRead) {
        const rows = await all(
          "SELECT t.*, (SELECT COUNT(*) FROM votes v WHERE v.topic_id=t.id) AS voteCount, (SELECT COUNT(*) FROM comments c WHERE c.topic_id=t.id AND c.deleted=0) AS commentCount FROM topics t WHERE community_id=? AND (t.withdrawn=0 OR ?=1) ORDER BY t.withdrawn,created_at DESC,id DESC",
          cid,
          isModerator ? 1 : 0,
        );
        state.topics = rows.map((t) => ({
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
          if (m)
            state.voters = (
              await all(
                "SELECT v.user_id,u.nickname,v.side,v.anonymous FROM votes v JOIN users u ON u.id=v.user_id WHERE v.topic_id=? ORDER BY v.anonymous,v.side,CASE WHEN v.anonymous=0 THEN u.nickname ELSE '' END,CASE WHEN v.anonymous=0 THEN u.id ELSE '' END",
                tid,
              )
            ).map((v) => ({
              userId: v.anonymous ? null : v.user_id,
              nickname: v.anonymous ? "匿名成员" : v.nickname,
              side: v.side,
              anonymous: !!v.anonymous,
              isMine: v.user_id === user?.id,
            }));
          const myVote = user
            ? await one(
                "SELECT side,anonymous FROM votes WHERE topic_id=? AND user_id=?",
                tid,
                user.id,
              )
            : null;
          state.mySide = myVote?.side ?? null;
          state.myVoteAnonymous = !!myVote?.anonymous;
          state.comments = (
            await all(
              "SELECT c.*,u.nickname FROM comments c JOIN users u ON c.user_id=u.id WHERE topic_id=? ORDER BY created_at ASC,id ASC",
              tid,
            )
          ).map((c) => ({
            id: c.id,
            parentId: c.parent_id,
            userId: c.anonymous ? null : c.user_id,
            nickname: c.anonymous ? "匿名辩友" : c.nickname,
            anonymous: !!c.anonymous,
            isMine: c.user_id === user?.id,
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
    if (path.startsWith("auth/")) {
      const result = await accountAction(path, b, request, user, ip, cid);
      return json(
        result.data,
        result.status ?? 200,
        result.cookie ? { "Set-Cookie": result.cookie } : {},
      );
    }
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
      const initialOwner = await one(
        "SELECT id,nickname FROM users WHERE platform_admin=1 ORDER BY created_at LIMIT 1",
      );
      const uid = initialOwner?.id || "initial-owner";
      await database().batch([
        database()
          .prepare(
            "INSERT INTO users (id,nickname,platform_admin,created_at) VALUES (?,?,1,?) ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname",
          )
          .bind(
            uid,
            text(
              b.nickname || initialOwner?.nickname || "社区管理员",
              "昵称",
              2,
              20,
            ),
            Date.now(),
          ),
        database()
          .prepare(
            "INSERT INTO memberships (community_id,user_id,role,created_at) VALUES (?,?,?,?) ON CONFLICT(community_id,user_id) DO UPDATE SET role='owner'",
          )
          .bind(cid, uid, "owner", Date.now()),
      ]);
      return json(
        {
          ok: true,
          hasAccount: !!(await one(
            "SELECT username FROM account_credentials WHERE user_id=?",
            uid,
          )),
        },
        200,
        {
          "Set-Cookie": await session(uid, request),
        },
      );
    }
    if (path === "join") {
      await limit(`join:${ip}`, 10);
      const nickname = text(b.nickname, "昵称", 2, 20);
      const uid = user?.id ?? id();
      const plan = await prepareCommunityJoin(cid, uid, b.invite);
      const statements = [];
      if (!user)
        statements.push(
          database()
            .prepare(
              "INSERT INTO users (id,nickname,created_at) VALUES (?,?,?)",
            )
            .bind(uid, nickname, Date.now()),
        );
      statements.push(...membershipJoinStatements(plan));
      await database().batch(statements);
      return json(
        { ok: true, ...(await membershipState(cid, uid)) },
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
      "topics/update",
      "topics/withdraw",
      "members/review",
      "members/remove",
    ].includes(path);
    await access(cid, user, true, isAdmin);
    if (["members/review", "members/remove", "members/leave"].includes(path)) {
      await manageMembers(path, cid, user, b);
    } else if (["topics/update", "topics/withdraw"].includes(path)) {
      await manageTopic(path, cid, b);
    } else if (path === "members/role") {
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
      if (b.visibility === undefined && b.joinApproval === undefined)
        throw new ApiError(400, "请提供需要修改的设置");
      if (
        b.visibility !== undefined &&
        !["public", "private"].includes(b.visibility)
      )
        throw new ApiError(400, "可见性无效");
      if (b.joinApproval !== undefined && typeof b.joinApproval !== "boolean")
        throw new ApiError(400, "入群审核设置无效");
      await run(
        "UPDATE communities SET visibility=COALESCE(?,visibility),join_approval=COALESCE(?,join_approval) WHERE id=?",
        b.visibility ?? null,
        b.joinApproval === undefined ? null : b.joinApproval ? 1 : 0,
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
      if (b.anonymous !== undefined && typeof b.anonymous !== "boolean")
        throw new ApiError(400, "匿名选项必须为是或否");
      const votePrivacy =
        b.anonymous === undefined ? null : b.anonymous ? 1 : 0;
      const result = await run(
        "INSERT INTO votes (topic_id,user_id,side,anonymous) SELECT id,?,?,COALESCE(?,0) FROM topics WHERE id=? AND community_id=? AND status='open' AND withdrawn=0 AND EXISTS (SELECT 1 FROM memberships WHERE community_id=? AND user_id=?) ON CONFLICT(topic_id,user_id) DO UPDATE SET side=excluded.side,anonymous=COALESCE(?,votes.anonymous)",
        user.id,
        b.side,
        votePrivacy,
        b.topicId,
        cid,
        cid,
        user.id,
        votePrivacy,
      );
      if (!result.meta.changes)
        throw new ApiError(409, "辩题或成员状态已变化，请刷新后重试");
    } else if (path === "comments") {
      await requireTopic(b.topicId, cid, true);
      if (b.anonymous !== undefined && typeof b.anonymous !== "boolean")
        throw new ApiError(400, "匿名选项必须为是或否");
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
      const result = await run(
        "INSERT INTO comments (id,topic_id,user_id,parent_id,side,content,anonymous,created_at) SELECT ?,id,?,?,?,?,?,? FROM topics WHERE id=? AND community_id=? AND status='open' AND withdrawn=0 AND EXISTS (SELECT 1 FROM memberships WHERE community_id=? AND user_id=?)",
        id(),
        user.id,
        parentId,
        vote.side,
        text(b.content, "观点", 2, 3000),
        b.anonymous === true ? 1 : 0,
        Date.now(),
        b.topicId,
        cid,
        cid,
        user.id,
      );
      if (!result.meta.changes)
        throw new ApiError(409, "辩题或成员状态已变化，请刷新后重试");
    } else if (path === "comments/delete") {
      const comment = await one(
        "SELECT c.* FROM comments c JOIN topics t ON t.id=c.topic_id WHERE c.id=? AND t.community_id=? AND (t.withdrawn=0 OR ?=1)",
        b.commentId,
        cid,
        ["owner", "admin"].includes((await membership(cid, user.id))?.role)
          ? 1
          : 0,
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
