import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:5173";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
  throw new Error(
    "Run this integration suite against a disposable local preview only.",
  );
}
const key = (
  await readFile(new URL("../.dev.vars", import.meta.url), "utf8")
).match(/^ADMIN_KEY=(.+)$/m)?.[1];
assert.ok(key, "Configure ADMIN_KEY in .dev.vars first");
let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks++;
  console.log(`PASS ${message}`);
}
function client() {
  let cookie = "";
  return async (path, body, expected = 200, override = {}) => {
    const response = await fetch(
      `${origin}/api/${path}`,
      body === undefined
        ? { headers: { cookie } }
        : {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              cookie,
              ...override,
            },
            body: JSON.stringify(body),
          },
    );
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { error: raw };
    }
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
    const next = response.headers.get("set-cookie");
    if (next) cookie = next.split(";")[0];
    return data;
  };
}
const admin = client(),
  alice = client(),
  bob = client(),
  outsider = client();
const slug = `qa-${Date.now()}`;
const base = { communityId: slug };
const locked = await outsider("state");
check(
  !locked.accessible && !locked.topic && locked.comments.length === 0,
  "private topics, comments, and statistics are hidden from anonymous visitors",
);
await admin("admin/login", { key: "incorrect", communityId: "unnc" }, 401);
await admin("admin/login", {
  key,
  nickname: "测试管理员",
  communityId: "unnc",
});
await admin(
  "communities/create",
  {
    slug,
    name: "隔离测试社区",
    description: "Temporary local integration test community",
  },
  201,
);
const motion = {
  ...base,
  title: "大学是否应该实行完全自主选课",
  description: "讨论自由选课与培养方案之间的关系。",
  proLabel: "支持自主选课",
  conLabel: "支持固定方案",
  category: "测试辩题",
};
const { id: topicId } = await admin("topics/create", motion, 201);
const other = await admin(
  "topics/create",
  { ...motion, title: "第二道辩题用于验证回复隔离" },
  201,
);
await outsider(
  "join",
  { ...base, nickname: "未受邀请", invite: "invalid" },
  403,
);
const invite = await admin("invites/create", base, 201);
await alice("join", { ...base, nickname: "测试正方", invite: invite.token });
await bob("join", { ...base, nickname: "测试反方", invite: invite.token });
check(
  (await alice(`state?community=${slug}&topic=${topicId}`)).accessible,
  "valid invitations create persistent community memberships",
);
await alice("settings", { ...base, visibility: "public" }, 403);
await alice("topics/create", motion, 403);
await alice(`members?community=${slug}`, undefined, 403);
check(
  true,
  "ordinary members cannot manage visibility, publish topics, or manage members",
);
const list = await admin(`members?community=${slug}`);
const aliceId = list.members.find((m) => m.nickname === "测试正方").id;
const bobId = list.members.find((m) => m.nickname === "测试反方").id;
const ownerId = list.members.find((m) => m.role === "owner").id;
await admin("members/role", { ...base, userId: aliceId, role: "admin" });
check(
  (await alice(`state?community=${slug}`)).viewer.role === "admin",
  "the creator is owner and can appoint a community member as administrator",
);
await alice(
  "topics/create",
  { ...motion, title: "管理员发布的新辩题可以成功保存" },
  201,
);
await alice("invites/create", base, 201);
await alice("members/role", { ...base, userId: bobId, role: "admin" }, 403);
await alice("settings", { ...base, visibility: "public" }, 403);
await alice("topics/create", { ...motion, communityId: "unnc" }, 403);
await admin("members/role", { ...base, userId: ownerId, role: "member" }, 400);
check(
  true,
  "administrators can publish and invite but cannot appoint admins, change owner, or manage another community",
);
await admin("members/role", { ...base, userId: aliceId, role: "member" });
await alice("topics/create", motion, 403);
check(
  (await alice(`state?community=${slug}`)).viewer.role === "member",
  "revoking administrator status immediately removes publishing permission",
);
await alice(
  "communities/create",
  {
    slug: `${slug}-child`,
    name: "成员创建的独立社群",
    description: "Independent community owned by a regular member",
  },
  201,
);
check(
  (await alice(`state?community=${slug}-child`)).viewer.role === "owner" &&
    !(await bob(`state?community=${slug}-child`)).accessible,
  "a member can create a separate private community and becomes its owner",
);
await alice("comments", { ...base, topicId, content: "尚未持方的观点" }, 400);
await alice("votes", { ...base, topicId, side: "invalid" }, 400);
await alice("votes", { ...base, side: "pro" }, 400);
await alice(
  "votes",
  { communityId: "unnc", topicId: "first-motion", side: "pro" },
  403,
);
check(
  true,
  "stance validation and community authorization are enforced on the server",
);
await alice("votes", { ...base, topicId, side: "pro" });
await bob("votes", { ...base, topicId, side: "con" });
await Promise.all(
  Array.from({ length: 5 }, () =>
    alice("votes", { ...base, topicId, side: "pro" }),
  ),
);
let state = await bob(`state?community=${slug}&topic=${topicId}`);
check(
  state.stats.pro === 1 && state.stats.con === 1,
  "concurrent repeated stance requests count each member once",
);
await alice("comments", {
  ...base,
  topicId,
  content: "跨学科的自由选择，有助于发现自己的方向。 <script>alert(1)</script>",
});
state = await bob(`state?community=${slug}&topic=${topicId}`);
const commentId = state.comments[0].id;
check(
  state.comments[0].nickname === "测试正方" && state.comments[0].side === "pro",
  "another session receives the posted comment and its author stance",
);
await bob("comments", {
  ...base,
  topicId,
  parentId: commentId,
  content: "也需要考虑基础课程之间的先修关系。",
});
await bob("votes", { ...base, topicId: other.id, side: "con" });
await bob(
  "comments",
  {
    ...base,
    topicId: other.id,
    parentId: commentId,
    content: "不能跨辩题回复",
  },
  400,
);
await bob("comments/delete", { ...base, commentId }, 403);
check(
  true,
  "replies cannot cross topics and members cannot remove others' comments",
);
await alice("votes", { ...base, topicId, side: "con" });
state = await bob(`state?community=${slug}&topic=${topicId}`);
check(
  state.stats.pro === 0 &&
    state.stats.con === 2 &&
    state.comments[0].side === "pro",
  "changing stance updates ratios while preserving historical comment stance",
);
await alice("comments/delete", { ...base, commentId });
state = await bob(`state?community=${slug}&topic=${topicId}`);
check(
  state.comments[0].deleted === 1 &&
    state.comments[1].parentId === commentId &&
    !state.comments[0].content.includes("script"),
  "removing a comment erases its body and preserves the reply thread",
);
await admin("topics/status", { ...base, topicId, status: "closed" });
await bob("comments", { ...base, topicId, content: "关闭后不能发言" }, 409);
await alice("votes", { ...base, topicId, side: "pro" }, 409);
check(
  (await alice(`state?community=${slug}&topic=${topicId}`)).comments.length ===
    2,
  "closed discussions remain readable and reject new stances and comments",
);
await admin("settings", { ...base, visibility: "public" });
check(
  (await outsider(`state?community=${slug}&topic=${topicId}`)).accessible,
  "public visibility permits anonymous reading",
);
await outsider("votes", { ...base, topicId: other.id, side: "pro" }, 401);
await admin("settings", { ...base, visibility: "private" });
check(
  !(await outsider(`state?community=${slug}&topic=${topicId}`)).accessible,
  "switching back to private immediately blocks anonymous access",
);
await admin("invites/revoke", base);
await outsider(
  "join",
  { ...base, nickname: "旧邀请用户", invite: invite.token },
  403,
);
check(
  (await alice(`state?community=${slug}`)).accessible,
  "revoked invitations cannot be redeemed and existing members retain access",
);
await bob(
  "comments",
  { ...base, topicId: other.id, content: "来源不正确的请求" },
  403,
  { Origin: "https://attacker.invalid" },
);
await bob(
  "comments",
  { ...base, topicId: other.id, content: "x".repeat(17000) },
  413,
);
check(true, "cross-origin writes and oversized payloads are rejected");
await alice("logout", base);
check(
  !(await alice(`state?community=${slug}`)).accessible,
  "logout revokes the server session",
);
console.log(
  `\n${checks} integration scenarios passed. Test community: ${slug}`,
);
