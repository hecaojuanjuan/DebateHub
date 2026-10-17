import {
  ApiError,
  community,
  database,
  hash,
  id,
  limit,
  membership,
  one,
  session,
  text,
  type Row,
} from "./server";
import { hashPassword, verifyPassword } from "./passwords";
import { isValidUsername, normalizeUsername, usernameHint } from "./usernames";
import {
  hasValidInvite,
  membershipJoinStatements,
  membershipState,
  prepareCommunityJoin,
} from "./membership-management";

function username(value: unknown) {
  if (typeof value !== "string")
    throw new ApiError(400, `用户名需为 ${usernameHint}`);
  const name = normalizeUsername(value);
  if (!isValidUsername(name))
    throw new ApiError(400, `用户名需为 ${usernameHint}`);
  return name;
}
function password(value: unknown, confirmation?: unknown) {
  if (typeof value !== "string" || value.length < 10 || value.length > 128)
    throw new ApiError(400, "密码需为 10–128 个字符，可以使用容易记住的长句");
  if (confirmation !== undefined && value !== confirmation)
    throw new ApiError(400, "两次输入的密码不一致");
  return value;
}
export async function accountAction(
  path: string,
  b: Row,
  request: Request,
  user: Row | null,
  ip: string,
  cid: string,
) {
  if (path === "auth/setup-link") {
    const m = await membership("unnc", user?.id);
    if (!user?.platform_admin || m?.role !== "owner")
      throw new ApiError(403, "只有初始群主可以生成账号设置链接");
    if (
      await one(
        "SELECT username FROM account_credentials WHERE user_id=?",
        user.id,
      )
    )
      throw new ApiError(409, "群主账号已设置，请使用用户名和密码登录");
    await limit(`account-setup:${user.id}`, 3);
    const token = id() + id();
    const expiresAt = Date.now() + 86400000;
    await database().batch([
      database()
        .prepare(
          "DELETE FROM account_setup_tokens WHERE user_id=? OR expires_at<?",
        )
        .bind(user.id, Date.now()),
      database()
        .prepare(
          "INSERT INTO account_setup_tokens (token_hash,user_id,expires_at) VALUES (?,?,?)",
        )
        .bind(await hash(token), user.id, expiresAt),
    ]);
    return { data: { token, expiresAt }, status: 201 };
  }
  if (path === "auth/password") {
    if (!user) throw new ApiError(401, "请先登录");
    await limit(`password:${user.id}`, 5);
    const credential = await one(
      "SELECT * FROM account_credentials WHERE user_id=?",
      user.id,
    );
    if (!credential) throw new ApiError(409, "请先设置登录账号");
    const current = password(b.currentPassword);
    if (!(await verifyPassword(current, credential.password_hash)))
      throw new ApiError(401, "当前密码不正确");
    const next = await hashPassword(password(b.password, b.passwordConfirm));
    const changes = await database().batch([
      database()
        .prepare(
          "UPDATE account_credentials SET password_hash=? WHERE user_id=? AND password_hash=?",
        )
        .bind(next, user.id, credential.password_hash),
      database()
        .prepare(
          "DELETE FROM sessions WHERE user_id=? AND EXISTS (SELECT 1 FROM account_credentials WHERE user_id=? AND password_hash=?)",
        )
        .bind(user.id, user.id, next),
    ]);
    if (!changes[0].meta.changes)
      throw new ApiError(409, "密码刚刚发生变化，请重新登录");
    return { data: { ok: true }, cookie: await session(user.id, request) };
  }
  if (!["auth/login", "auth/register"].includes(path))
    throw new ApiError(404, "接口不存在");
  await limit(`account:${ip}`, 30);
  const name = username(b.username);
  await limit(`account-name:${await hash(name)}`, 15);
  const secret = password(
    b.password,
    path === "auth/register" ? b.passwordConfirm : undefined,
  );
  if (path === "auth/login") {
    const credential = await one(
      "SELECT * FROM account_credentials WHERE username=?",
      name,
    );
    const matches = await verifyPassword(secret, credential?.password_hash);
    if (!credential || !matches) throw new ApiError(401, "用户名或密码不正确");
    const c = await community(cid);
    const joined = !!(await membership(cid, credential.user_id));
    if (
      !joined &&
      (c.visibility === "public" || (await hasValidInvite(cid, b.invite)))
    ) {
      await database().batch(
        membershipJoinStatements(
          await prepareCommunityJoin(cid, credential.user_id, b.invite),
        ),
      );
    }
    return {
      data: { ok: true, ...(await membershipState(cid, credential.user_id)) },
      cookie: await session(credential.user_id, request),
    };
  }

  const now = Date.now();
  const setup =
    typeof b.setupToken === "string" && b.setupToken
      ? await one(
          "SELECT * FROM account_setup_tokens WHERE token_hash=? AND expires_at>?",
          await hash(b.setupToken),
          now,
        )
      : null;
  if (b.setupToken && !setup)
    throw new ApiError(403, "群主设置链接已失效或已使用，请重新获取");
  const uid = setup?.user_id || user?.id || id();
  if (
    await one(
      "SELECT username FROM account_credentials WHERE user_id=? OR username=?",
      uid,
      name,
    )
  )
    throw new ApiError(409, "用户名已被使用，或当前身份已设置账号，请直接登录");
  const nickname = text(b.nickname || user?.nickname, "昵称", 2, 20);
  await community(cid);
  const plan =
    !setup && !user ? await prepareCommunityJoin(cid, uid, b.invite) : null;
  const encoded = await hashPassword(secret);
  const db = database();
  const statements = [];
  if (setup) {
    statements.push(
      db
        .prepare(
          "INSERT INTO account_credentials (username,user_id,password_hash,created_at) SELECT ?,user_id,?,? FROM account_setup_tokens WHERE token_hash=? AND user_id=? AND expires_at>?",
        )
        .bind(name, encoded, now, setup.token_hash, uid, Date.now()),
      db
        .prepare(
          "UPDATE users SET nickname=? WHERE id=? AND EXISTS (SELECT 1 FROM account_credentials WHERE user_id=? AND password_hash=?)",
        )
        .bind(nickname, uid, uid, encoded),
      db
        .prepare(
          "DELETE FROM account_setup_tokens WHERE user_id=? AND EXISTS (SELECT 1 FROM account_credentials WHERE user_id=? AND password_hash=?)",
        )
        .bind(uid, uid, encoded),
    );
  } else {
    if (!user)
      statements.push(
        db
          .prepare("INSERT INTO users (id,nickname,created_at) VALUES (?,?,?)")
          .bind(uid, nickname, now),
      );
    statements.push(
      db
        .prepare(
          "INSERT INTO account_credentials (username,user_id,password_hash,created_at) VALUES (?,?,?,?)",
        )
        .bind(name, uid, encoded, now),
    );
    if (user)
      statements.push(
        db
          .prepare("UPDATE users SET nickname=? WHERE id=?")
          .bind(nickname, uid),
      );
    if (plan) statements.push(...membershipJoinStatements(plan));
  }
  try {
    const results = await db.batch(statements);
    if (setup && !results[0].meta.changes)
      throw new ApiError(409, "群主设置链接已失效或已使用，请直接登录");
  } catch (error) {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed/.test(error.message)
    )
      throw new ApiError(
        409,
        "用户名已被使用，或当前身份已设置账号，请直接登录",
      );
    throw error;
  }
  return {
    data: { ok: true, ...(await membershipState(cid, uid)) },
    status: 201,
    cookie: await session(uid, request),
  };
}
