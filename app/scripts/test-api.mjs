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
  !locked.accessible &&
    !locked.topic &&
    locked.comments.length === 0 &&
    locked.voters.length === 0,
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
check(
  state.voters.length === 2 &&
    state.voters.some((v) => v.nickname === "测试正方" && v.side === "pro") &&
    state.voters.some((v) => v.nickname === "测试反方" && v.side === "con"),
  "members can see each other's individual stance within the community",
);
await alice("votes", { ...base, topicId, side: "pro", anonymous: true });
let privateVoteView = await bob(`state?community=${slug}&topic=${topicId}`);
check(
  privateVoteView.stats.pro === 1 &&
    privateVoteView.stats.con === 1 &&
    privateVoteView.voters.some(
      (v) =>
        v.anonymous &&
        v.nickname === "匿名成员" &&
        v.userId === null &&
        !v.isMine,
    ) &&
    !privateVoteView.voters.some(
      (v) => v.nickname === "测试正方" || v.userId === aliceId,
    ),
  "anonymous votes retain counts while hiding the voter name and user ID from members",
);
const ownVoteView = await alice(`state?community=${slug}&topic=${topicId}`);
check(
  ownVoteView.myVoteAnonymous &&
    ownVoteView.mySide === "pro" &&
    ownVoteView.voters.some(
      (v) => v.anonymous && v.isMine && v.userId === null,
    ),
  "authors can recover their anonymous vote setting and recognize only their own vote",
);
const ownerVoteView = await admin(`state?community=${slug}&topic=${topicId}`);
check(
  ownerVoteView.voters
    .filter((v) => v.anonymous)
    .every((v) => v.nickname === "匿名成员" && v.userId === null && !v.isMine),
  "anonymous voter identities are also hidden from community owners",
);
await Promise.all(
  Array.from({ length: 5 }, () =>
    alice("votes", { ...base, topicId, side: "pro" }),
  ),
);
check(
  (await alice(`state?community=${slug}&topic=${topicId}`)).myVoteAnonymous &&
    (await bob(`state?community=${slug}&topic=${topicId}`)).voters.length === 2,
  "repeated votes without a privacy flag preserve anonymity and do not add voters",
);
await alice("votes", { ...base, topicId, side: "pro", anonymous: false });
check(
  (await bob(`state?community=${slug}&topic=${topicId}`)).voters.some(
    (v) => v.userId === aliceId && v.nickname === "测试正方" && !v.anonymous,
  ),
  "voters can explicitly switch their own vote back to named display",
);
await alice("votes", { ...base, topicId, side: "pro", anonymous: true });
await bob("votes", { ...base, topicId, side: "con", anonymous: "false" }, 400);
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
await alice("votes", { ...base, topicId: other.id, side: "pro" });
await alice("comments", {
  ...base,
  topicId: other.id,
  content: "这是匿名发表的观点，只有观点和持方会展示。",
  anonymous: true,
});
let anonymousState = await bob(`state?community=${slug}&topic=${other.id}`);
const anonymousId = anonymousState.comments[0].id;
check(
  anonymousState.comments[0].anonymous === true &&
    anonymousState.comments[0].nickname === "匿名辩友" &&
    anonymousState.comments[0].userId === null &&
    anonymousState.comments[0].isMine === false,
  "anonymous comments hide the author's nickname and user ID in another member's API response",
);
const ownerView = await admin(`state?community=${slug}&topic=${other.id}`);
check(
  ownerView.comments[0].userId === null &&
    ownerView.comments[0].nickname === "匿名辩友",
  "owner and administrator views do not reveal anonymous authors",
);
const authorView = await alice(`state?community=${slug}&topic=${other.id}`);
check(
  authorView.comments[0].isMine === true &&
    authorView.comments[0].userId === null,
  "authors can recognize their own anonymous comment without exposing the identity field",
);
await bob("comments", {
  ...base,
  topicId: other.id,
  parentId: anonymousId,
  content: "这条回复也选择匿名发表。",
  anonymous: true,
});
anonymousState = await alice(`state?community=${slug}&topic=${other.id}`);
check(
  anonymousState.comments[1].parentId === anonymousId &&
    anonymousState.comments[1].anonymous &&
    anonymousState.comments[1].nickname === "匿名辩友" &&
    anonymousState.comments[1].userId === null,
  "replies can independently be anonymous and retain their thread and stance",
);
await bob("comments/delete", { ...base, commentId: anonymousId }, 403);
await alice("comments/delete", { ...base, commentId: anonymousId });
check(
  (await bob(`state?community=${slug}&topic=${other.id}`)).comments[0]
    .deleted === 1,
  "anonymous authors can still remove their own comments and others cannot",
);
await alice("comments", {
  ...base,
  topicId: other.id,
  content: "这条恢复为昵称发表。",
  anonymous: false,
});
check(
  (await bob(`state?community=${slug}&topic=${other.id}`)).comments.some(
    (c) => c.nickname === "测试正方" && !c.anonymous,
  ),
  "named posting remains available independently of previous anonymous posts",
);
await alice(
  "comments",
  {
    ...base,
    topicId: other.id,
    content: "不能用字符串伪造匿名选项。",
    anonymous: "false",
  },
  400,
);
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
check(
  (await alice(`state?community=${slug}&topic=${topicId}`)).myVoteAnonymous &&
    state.voters.some(
      (v) => v.anonymous && v.side === "con" && v.userId === null,
    ),
  "switching sides preserves anonymous voting independently of named comments",
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
await alice("votes", { ...base, topicId, side: "con", anonymous: false }, 409);
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
const publicView = await outsider(`state?community=${slug}&topic=${other.id}`);
check(
  publicView.voters.length === 0 &&
    publicView.comments
      .filter((c) => c.anonymous)
      .every(
        (c) => c.nickname === "匿名辩友" && c.userId === null && !c.isMine,
      ),
  "public visitors see discussion content without member voter identities or anonymous author information",
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
