import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:5173";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))
  throw new Error("Run account tests against a disposable local preview only.");
const { ADMIN_KEY: key } = parseEnv(
  await readFile(new URL("../.dev.vars", import.meta.url), "utf8"),
);
const suffix = Date.now().toString(36);
const password = "Testpass10";
const nextPassword = "Nextpass10";
assert.equal(password.length, 10);
assert.equal(nextPassword.length, 10);
const fields = (username, extra = {}) => ({
  username,
  password,
  passwordConfirm: password,
  nickname: "账号测试辩友",
  ...extra,
});
let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks++;
  console.log(`PASS ${message}`);
}
function client() {
  let cookie = "";
  return async (path, body, status = 200, overrides = {}) => {
    const response = await fetch(`${origin}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie,
        ...(body === undefined
          ? {}
          : { Origin: origin, "Content-Type": "application/json" }),
        ...overrides,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
    const next = response.headers.get("set-cookie");
    if (next) {
      check(
        next.includes("HttpOnly") && next.includes("SameSite=Lax"),
        "account session cookies remain HttpOnly and SameSite=Lax",
      );
      cookie = next.split(";")[0];
    }
    return data;
  };
}
const owner = client(),
  setupClient = client(),
  outsider = client();
await owner("admin/login", { key, nickname: "原群主身份" });
const original = (await owner("state")).viewer;
let ownerName = original.username;
if (!ownerName) {
  const setup = await owner("auth/setup-link", {}, 201);
  await outsider("auth/setup-link", {}, 403);
  await outsider(
    "auth/register",
    fields(`wrong-${suffix}`, { setupToken: "invalid" }),
    403,
  );
  await outsider(
    "auth/register",
    fields(`csrf-${suffix}`, { setupToken: setup.token }),
    403,
    { Origin: "https://other.example" },
  );
  ownerName = `owner-${suffix}`;
  await setupClient(
    "auth/register",
    fields(ownerName, { setupToken: setup.token, nickname: "设置后的群主" }),
    201,
  );
  const state = await setupClient("state");
  check(
    state.viewer.id === original.id && state.viewer.role === "owner",
    "one-time owner setup keeps the exact original owner identity and role",
  );
  await outsider(
    "auth/register",
    fields(`replay-${suffix}`, { setupToken: setup.token }),
    403,
  );
  check(
    true,
    "owner setup rejects invalid tokens, cross-origin use, and replay",
  );
} else {
  await setupClient("admin/login", { key, nickname: "原群主身份" });
}
await setupClient("auth/setup-link", {}, 409);
const communityId = `accounts-${suffix}`;
const base = { communityId };
await setupClient(
  "communities/create",
  {
    slug: communityId,
    name: "账号隔离测试社群",
    description: "Disposable local authentication tests",
  },
  201,
);
const motion = await setupClient(
  "topics/create",
  {
    ...base,
    title: "账号应该如何保留社区身份",
    description: "Local test motion",
    proLabel: "支持",
    conLabel: "反对",
    category: "账号测试",
  },
  201,
);
const invite = await setupClient("invites/create", base, 201);
const name = `member-${suffix}`;
await outsider("auth/register", fields(name, base), 403);
await outsider(
  "auth/register",
  fields(name, {
    ...base,
    invite: invite.token,
    password: "123456789",
    passwordConfirm: "123456789",
  }),
  400,
);
await outsider(
  "auth/register",
  fields(name, {
    ...base,
    invite: invite.token,
    passwordConfirm: "a different password",
  }),
  400,
);
check(
  true,
  "private registration requires an invitation and rejects nine-character passwords and mismatched confirmation",
);
const member = client();
await member(
  "auth/register",
  fields(name, { ...base, invite: invite.token }),
  201,
);
const memberState = await member(`state?community=${communityId}`);
const uid = memberState.viewer.id;
check(
  memberState.viewer.username === name && memberState.viewer.role === "member",
  "registration creates a recoverable ordinary member, never a new owner",
);
await member("auth/setup-link", base, 403);
await member("votes", {
  ...base,
  topicId: motion.id,
  side: "pro",
  anonymous: true,
});
await member(
  "comments",
  {
    ...base,
    topicId: motion.id,
    content: "匿名观点也应随原账号保留",
    anonymous: true,
  },
  200,
);
await setupClient("members/role", { ...base, userId: uid, role: "admin" });
const duplicate = client();
await duplicate(
  "auth/register",
  fields(name.toUpperCase(), { ...base, invite: invite.token }),
  409,
);
const device = client();
await device(
  "auth/login",
  { ...base, username: name, password: "incorrect long password" },
  401,
);
await device(
  "auth/login",
  { ...base, username: `missing-${suffix}`, password },
  401,
);
await device("auth/login", { ...base, username: name.toUpperCase(), password });
const restored = await device(`state?community=${communityId}`);
check(
  restored.viewer.id === uid &&
    restored.viewer.role === "admin" &&
    restored.mySide === "pro" &&
    restored.myVoteAnonymous &&
    restored.comments.some((c) => c.isMine && c.anonymous),
  "another device restores membership, administrator role, anonymous votes, and authored comments",
);
check(
  restored.comments.every(
    (c) => c.userId === null && c.nickname === "匿名辩友",
  ) && !JSON.stringify(restored).includes("password_hash"),
  "account login does not leak credentials or anonymous author identity",
);
await device("auth/register", fields(`replace-${suffix}`, base), 409);
const secondId = `other-${suffix}`;
await setupClient(
  "communities/create",
  {
    slug: secondId,
    name: "另一个私密测试社群",
    description: "Membership must remain isolated",
  },
  201,
);
const otherDevice = client();
const withoutInvite = await otherDevice("auth/login", {
  communityId: secondId,
  username: name,
  password,
  invite: "invalid",
});
check(
  !withoutInvite.joined &&
    !(await otherDevice(`state?community=${secondId}`)).accessible,
  "a valid account does not bypass another private community's invitation requirement",
);
const otherInvite = await setupClient(
  "invites/create",
  { communityId: secondId },
  201,
);
const joined = await otherDevice("auth/login", {
  communityId: secondId,
  username: name,
  password,
  invite: otherInvite.token,
});
check(
  joined.joined &&
    (await otherDevice(`state?community=${secondId}`)).viewer.id === uid,
  "an invited existing account joins another community with the same user identity",
);
await member(
  "auth/password",
  {
    ...base,
    currentPassword: "incorrect long password",
    password: nextPassword,
    passwordConfirm: nextPassword,
  },
  401,
);
await member("auth/password", {
  ...base,
  currentPassword: password,
  password: nextPassword,
  passwordConfirm: nextPassword,
});
check(
  !(await device(`state?community=${communityId}`)).viewer &&
    !(await otherDevice(`state?community=${secondId}`)).viewer,
  "changing a password revokes every previous device session",
);
await device("auth/login", { ...base, username: name, password }, 401);
await device("auth/login", { ...base, username: name, password: nextPassword });
check(
  (await device(`state?community=${communityId}`)).viewer.id === uid,
  "the old password fails and the new password restores the same account",
);
const legacy = client(),
  rebound = client();
await legacy("join", { ...base, nickname: "旧昵称成员", invite: invite.token });
const legacyId = (await legacy(`state?community=${communityId}`)).viewer.id;
await legacy("auth/register", fields(`legacy-${suffix}`, base), 201);
await rebound("auth/login", {
  ...base,
  username: `legacy-${suffix}`,
  password,
});
check(
  (await rebound(`state?community=${communityId}`)).viewer.id === legacyId,
  "existing nickname members bind credentials without creating a second identity",
);
await rebound("logout", base);
check(
  !(await rebound(`state?community=${communityId}`)).viewer,
  "logout invalidates the server session",
);
const chineseName = `测试${Array.from(suffix, (value) => String.fromCodePoint(0x4e00 + parseInt(value, 36))).join("")}`;
const chinese = client(),
  chineseDevice = client();
await chinese(
  "auth/register",
  fields(chineseName, { ...base, invite: invite.token }),
  201,
);
const chineseId = (await chinese(`state?community=${communityId}`)).viewer.id;
await chineseDevice("auth/login", { ...base, username: chineseName, password });
check(
  (await chineseDevice(`state?community=${communityId}`)).viewer.id ===
    chineseId,
  "Chinese usernames register and restore the same member on another device",
);
await outsider(
  "auth/register",
  fields(chineseName, { ...base, invite: invite.token }),
  409,
);
await outsider(
  "auth/register",
  fields(`中文 空格${suffix}`, { ...base, invite: invite.token }),
  400,
);
check(true, "Chinese usernames remain unique and embedded spaces are rejected");
const mixed = client(),
  mixedDevice = client();
const mixedName = `中文${suffix}Ab`;
await mixed(
  "auth/register",
  fields(mixedName, { ...base, invite: invite.token }),
  201,
);
await mixedDevice("auth/login", {
  ...base,
  username: mixedName.toUpperCase(),
  password,
});
check(
  (await mixedDevice(`state?community=${communityId}`)).viewer.username ===
    mixedName.toLowerCase(),
  "mixed Chinese and English usernames retain case-insensitive login",
);
console.log(`${checks} account checks passed.`);
