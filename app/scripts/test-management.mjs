import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:5173";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))
  throw new Error(
    "Run management tests against a disposable local preview only.",
  );
const { ADMIN_KEY: key } = parseEnv(
  await readFile(new URL("../.dev.vars", import.meta.url), "utf8"),
);
let checks = 0,
  clientId = 0;
function check(value, message) {
  assert.ok(value, message);
  checks++;
  console.log(`PASS ${message}`);
}
function client() {
  let cookie = "";
  const ip = `local-management-${++clientId}`;
  return async (path, body, status = 200) => {
    const response = await fetch(`${origin}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie,
        "cf-connecting-ip": ip,
        ...(body === undefined
          ? {}
          : { Origin: origin, "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json();
    assert.equal(response.status, status, `${path}: ${JSON.stringify(value)}`);
    const next = response.headers.get("set-cookie");
    if (next) cookie = next.split(";")[0];
    return value;
  };
}
const owner = client(),
  admin = client(),
  member = client(),
  applicant = client(),
  accountApplicant = client(),
  accountDevice = client(),
  otherAdmin = client(),
  publicApplicant = client();
const slug = `management-${Date.now().toString(36)}`;
const base = { communityId: slug };
const state = (who, topic) =>
  who(`state?community=${slug}${topic ? `&topic=${topic}` : ""}`);
await owner("admin/login", { key });
await owner(
  "communities/create",
  {
    slug,
    name: "管理功能测试社群",
    description: "Disposable local moderation integration tests",
  },
  201,
);
const ownerId = (await state(owner)).viewer.id;
check(
  !(await state(owner)).community.joinApproval,
  "existing behavior defaults to direct invitation joining",
);
const invite = (await owner("invites/create", base, 201)).token;
const motion = {
  ...base,
  title: "大学课程应当允许完全自主选择",
  description: "测试辩题背景和讨论范围。",
  proLabel: "支持自主选择",
  conLabel: "支持固定课程",
  category: "每周训练",
};
const topicId = (await owner("topics/create", motion, 201)).id;
const direct = await admin("join", { ...base, nickname: "管理员候选", invite });
check(
  direct.joined && !direct.pending,
  "invitations continue to join directly while approval is disabled",
);
const adminId = (await state(admin)).viewer.id;
await owner("members/role", { ...base, userId: adminId, role: "admin" });
await member("join", { ...base, nickname: "普通成员", invite });
const memberId = (await state(member)).viewer.id;
check(
  (await admin(`members?community=${slug}`)).members.length === 3,
  "administrators can view every current member and role",
);
await member(`members?community=${slug}`, undefined, 403);
await member("members/remove", { ...base, userId: adminId }, 403);
await admin("members/role", { ...base, userId: memberId, role: "admin" }, 403);
await admin("settings", { ...base, joinApproval: true }, 403);
await owner("settings", { ...base, joinApproval: true });
const applied = await applicant("join", {
  ...base,
  nickname: "待审核昵称成员",
  invite,
});
const applicantId = (await state(applicant)).viewer.id;
check(
  applied.pending &&
    !applied.joined &&
    !(await state(applicant)).accessible &&
    (await state(applicant)).topics.length === 0,
  "approval mode queues invited nickname members without leaking private topics",
);
await applicant("join", { ...base, nickname: "待审核昵称成员", invite });
check(
  (await admin(`members?community=${slug}`)).requests.length === 1 &&
    (await state(owner)).pendingCount === 1 &&
    (await state(member)).pendingCount === 0,
  "repeated applications are deduplicated and only moderators receive pending counts",
);
const accountName = `申请成员${Date.now().toString(36)}`;
const password = "Testpass10";
const accountResult = await accountApplicant(
  "auth/register",
  {
    ...base,
    username: accountName,
    nickname: "待审核账号成员",
    password,
    passwordConfirm: password,
    invite,
  },
  201,
);
const accountId = (await state(accountApplicant)).viewer.id;
const accountLogin = await accountDevice("auth/login", {
  ...base,
  username: accountName,
  password,
  invite,
});
check(
  accountResult.pending &&
    accountLogin.pending &&
    !(await state(accountDevice)).accessible,
  "registration and password login both enforce approval rather than bypassing it",
);
await applicant("votes", { ...base, topicId, side: "pro" }, 403);
await member(
  "members/review",
  { ...base, userId: applicantId, decision: "approve" },
  403,
);
await admin("members/review", {
  ...base,
  userId: applicantId,
  decision: "approve",
});
await admin(
  "members/review",
  { ...base, userId: applicantId, decision: "approve" },
  409,
);
check(
  (await state(applicant)).accessible &&
    (await state(applicant)).viewer.role === "member",
  "administrator approval immediately unlocks the existing applicant identity exactly once",
);
await admin("members/review", {
  ...base,
  userId: accountId,
  decision: "reject",
});
check(
  (await state(accountApplicant)).viewer.joinStatus === "rejected" &&
    !(await state(accountApplicant)).accessible,
  "rejected applicants remain outside the private community",
);
await owner("settings", { ...base, joinApproval: false });
const retry = await accountDevice("auth/login", {
  ...base,
  username: accountName,
  password,
  invite,
});
check(
  retry.pending && !retry.joined,
  "rejected members still require review after approval is switched off",
);
await owner("members/review", {
  ...base,
  userId: accountId,
  decision: "approve",
});
await otherAdmin("join", { ...base, nickname: "第二位管理员", invite });
const otherAdminId = (await state(otherAdmin)).viewer.id;
await owner("members/role", { ...base, userId: otherAdminId, role: "admin" });
await admin("members/remove", { ...base, userId: otherAdminId }, 403);
await admin("members/remove", { ...base, userId: ownerId }, 403);
check(
  true,
  "administrators cannot remove the owner or another administrator or grant administrator rights",
);
await owner("settings", { ...base, visibility: "public", joinApproval: true });
const publicJoin = await publicApplicant("join", {
  ...base,
  nickname: "公开社区申请者",
});
check(
  publicJoin.pending &&
    (await state(publicApplicant)).accessible &&
    !(await state(publicApplicant)).viewer.role,
  "public readability does not let pending applicants vote or post",
);
await publicApplicant("votes", { ...base, topicId, side: "pro" }, 403);
await owner("settings", {
  ...base,
  visibility: "private",
  joinApproval: false,
});
await admin("topics/update", {
  ...motion,
  topicId,
  title: "修改后的大学自主选课辩题",
  proLabel: "支持自由选课",
  conLabel: "支持培养方案",
});
check(
  (await state(member, topicId)).topic.title === "修改后的大学自主选课辩题",
  "administrators can edit titles, background, categories, and unused stance labels",
);
await member("topics/update", { ...motion, topicId }, 403);
await member("topics/withdraw", { ...base, topicId, withdrawn: true }, 403);
await member("votes", { ...base, topicId, side: "pro", anonymous: true });
await member("comments", {
  ...base,
  topicId,
  content: "原有匿名观点会保留",
  anonymous: true,
});
const commentId = (await state(member, topicId)).comments[0].id;
await admin(
  "topics/update",
  { ...motion, topicId, proLabel: "改变投票含义", conLabel: "支持培养方案" },
  409,
);
await admin("topics/update", {
  ...base,
  topicId,
  title: "再次修改但保留投票含义的辩题",
  description: "更新后的背景和讨论范围。",
  category: "教育讨论",
});
const edited = await state(member, topicId);
check(
  edited.stats.pro === 1 &&
    edited.comments.length === 1 &&
    edited.comments[0].anonymous &&
    edited.comments[0].userId === null,
  "editing preserves votes and anonymous comments and prevents changing used stance labels",
);
await admin("members/remove", { ...base, userId: memberId });
check(
  !(await state(member)).accessible &&
    (await state(member)).viewer.joinStatus === "removed",
  "removing a member immediately revokes private access",
);
const rejoin = await member("join", { ...base, nickname: "普通成员", invite });
check(
  rejoin.pending && !rejoin.joined,
  "removed members cannot re-enter using an old invitation without moderator approval",
);
await owner("members/review", {
  ...base,
  userId: memberId,
  decision: "approve",
});
check(
  (await state(member, topicId)).comments.some(
    (c) => c.id === commentId && c.isMine,
  ) && (await state(member, topicId)).mySide === "pro",
  "removal and approval retain the original identity and historical contributions",
);
const otherSlug = `${slug}-other`;
await owner(
  "communities/create",
  {
    slug: otherSlug,
    name: "隔离的另一个社群",
    description: "Membership and topic actions must remain isolated",
  },
  201,
);
const otherBase = { communityId: otherSlug };
const otherInvite = (await owner("invites/create", otherBase, 201)).token;
await applicant("join", {
  ...otherBase,
  nickname: "跨社区成员",
  invite: otherInvite,
});
const otherTopic = (
  await owner("topics/create", { ...motion, ...otherBase }, 201)
).id;
await admin("topics/update", { ...motion, topicId: otherTopic }, 404);
await admin(
  "topics/withdraw",
  { ...base, topicId: otherTopic, withdrawn: true },
  404,
);
await admin(
  "members/review",
  { ...otherBase, userId: applicantId, decision: "approve" },
  403,
);
await applicant("members/leave", base);
check(
  !(await state(applicant)).accessible &&
    (await applicant(`state?community=${otherSlug}`)).accessible,
  "members can leave one community without losing their account or other memberships",
);
await owner("members/leave", base, 403);
await owner("members/remove", { ...base, userId: otherAdminId });
check(
  !(await state(otherAdmin)).accessible &&
    (await state(owner)).viewer.role === "owner",
  "the owner can remove administrators and cannot accidentally leave the owned community",
);
await admin("topics/status", { ...base, topicId, status: "closed" });
await admin("topics/withdraw", { ...base, topicId, withdrawn: true });
const hidden = await state(member, topicId);
check(
  !hidden.topic &&
    !hidden.topics.some((t) => t.id === topicId) &&
    hidden.comments.length === 0 &&
    hidden.voters.length === 0 &&
    hidden.stats.pro === 0,
  "withdrawn topics and their comments, voters, and statistics disappear from member responses",
);
const adminHidden = await state(admin, topicId);
check(
  adminHidden.topic.withdrawn &&
    adminHidden.comments.length === 1 &&
    adminHidden.stats.pro === 1,
  "moderators retain access to withdrawn discussion records without losing anonymous protections",
);
await member("votes", { ...base, topicId, side: "con" }, 409);
await admin(
  "comments",
  { ...base, topicId, content: "撤回后不能继续发言" },
  409,
);
await member("comments/delete", { ...base, commentId }, 404);
await owner("settings", { ...base, visibility: "public" });
const visitor = client();
check(
  !(await state(visitor, topicId)).topic &&
    (await state(visitor, topicId)).comments.length === 0,
  "withdrawn topics also stay hidden from public visitors",
);
await owner("topics/withdraw", { ...base, topicId, withdrawn: false });
const restored = await state(member, topicId);
check(
  restored.topic.status === "closed" &&
    restored.stats.pro === 1 &&
    restored.comments.length === 1,
  "restoring a topic recovers all discussion and preserves its previous closed state",
);
await owner("topics/status", { ...base, topicId, status: "open" });
await member("votes", { ...base, topicId, side: "con" });
await admin("members/leave", base);
check(
  !(await state(admin)).viewer.role,
  "administrators can leave and immediately lose administrative permissions",
);
console.log(`${checks} management scenarios passed. Local community: ${slug}`);
