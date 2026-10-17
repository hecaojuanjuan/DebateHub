import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";

// Use the WebSocket client already installed with the local Vite test runtime.
const require = createRequire(import.meta.url);
const { WebSocket } = require(
  require.resolve("ws", { paths: [require.resolve("vite")] }),
);
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:5173";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))
  throw new Error("Capacity tests may only target a disposable local preview.");
const count = Number(process.env.TEST_CLIENTS || 100);
assert.ok(Number.isInteger(count) && count >= 2 && count <= 250);
const { ADMIN_KEY: key } = parseEnv(
  await readFile(new URL("../.dev.vars", import.meta.url), "utf8"),
);
const slug = `capacity-${Date.now().toString(36)}`;
const base = { communityId: slug };
const sockets = [];
const refreshTimers = new Map();
const liveReads = new Set();
const liveErrors = [];
let followUpdates = true;
const metrics = [],
  requests = [];
let assertions = 0;
function check(value, description) {
  assert.ok(value, description);
  assertions++;
  console.log(`PASS ${description}`);
}
function client() {
  return {
    cookie: "",
    async request(path, body, expected = 200, headers = {}) {
      const start = performance.now();
      const response = await fetch(`${origin}/api/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          cookie: this.cookie,
          Connection: "close",
          "cf-connecting-ip": "shared-campus-wifi",
          ...(body === undefined
            ? {}
            : { Origin: origin, "Content-Type": "application/json" }),
          ...headers,
        },
        signal: AbortSignal.timeout(60_000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      requests.push({
        path: path.split("?")[0],
        status: response.status,
        ms: performance.now() - start,
        bytes: Buffer.byteLength(text),
      });
      assert.equal(response.status, expected, `${path}: ${text.slice(0, 300)}`);
      const cookie = response.headers.get("set-cookie");
      if (cookie) this.cookie = cookie.split(";")[0];
      return {
        data: text ? JSON.parse(text) : null,
        tag: response.headers.get("ETag"),
        bytes: Buffer.byteLength(text),
      };
    },
  };
}
async function phase(name, work) {
  const offset = requests.length,
    start = performance.now();
  await work();
  const samples = requests
    .slice(offset)
    .map((r) => r.ms)
    .sort((a, b) => a - b);
  const result = {
    name,
    requests: samples.length,
    durationMs: Math.round(performance.now() - start),
    p95Ms: Math.round(
      samples[Math.max(0, Math.ceil(samples.length * 0.95) - 1)] || 0,
    ),
    maxMs: Math.round(samples.at(-1) || 0),
  };
  metrics.push(result);
  console.log(JSON.stringify(result));
}
function openSocket(
  who,
  community = slug,
  requestOrigin = origin,
  rejectedStatus,
) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${origin.replace(/^http/, "ws")}/api/realtime?community=${community}`,
      { headers: { Cookie: who.cookie, Origin: requestOrigin } },
    );
    sockets.push(ws);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("WebSocket handshake timed out"));
    }, 15_000);
    ws.events = [];
    ws.on("message", (message) => {
      const value = message.toString();
      ws.events.push(value);
      if (value === "ready") {
        clearTimeout(timer);
        resolve(ws);
      }
    });
    ws.on("unexpected-response", (_, response) => {
      clearTimeout(timer);
      response.resume();
      ws.terminate();
      if (response.statusCode === rejectedStatus) resolve(null);
      else
        reject(new Error(`Unexpected upgrade status ${response.statusCode}`));
    });
    ws.on("error", (error) => {
      if (!rejectedStatus) {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}
async function until(test, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!test()) {
    if (Date.now() > deadline) throw new Error("Realtime event timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
const owner = client(),
  outsider = client();
const people = Array.from({ length: count }, client);
const statePath = `state?community=${slug}`;
let topicId;
try {
  await owner.request("admin/login", { key });
  await owner.request(
    "communities/create",
    {
      slug,
      name: "本地容量测试",
      description: "Disposable local capacity test",
    },
    201,
  );
  const invite = (await owner.request("invites/create", base, 201)).data.token;
  topicId = (
    await owner.request(
      "topics/create",
      {
        ...base,
        title: "大学应当提供更多自由选择的课程",
        description: "用于验证多人同时投票和发表观点。",
        proLabel: "支持自由选择",
        conLabel: "支持固定课程",
      },
      201,
    )
  ).data.id;
  await phase(`${count} concurrent joins on one campus IP`, async () => {
    await Promise.all(
      people.map((person, i) =>
        person.request("join", { ...base, nickname: `本地成员${i}`, invite }),
      ),
    );
  });
  await phase(`${count} concurrent initial reads`, async () => {
    await Promise.all(people.map((person) => person.request(statePath)));
  });
  check(
    (await owner.request(statePath)).data.community.memberCount === count + 1,
    "atomic member counter matches concurrent joins",
  );
  await openSocket(outsider, slug, origin, 403);
  await openSocket(people[0], slug, "https://attacker.invalid", 403);
  check(
    true,
    "private WebSocket access and cross-origin handshakes are rejected",
  );
  await phase(`${count} simultaneous realtime subscriptions`, () =>
    Promise.all(people.map((person) => openSocket(person))),
  );
  const active = sockets.filter((ws) => ws.readyState === WebSocket.OPEN);
  // Emulate visible phones fetching fresh state after invalidation, with the
  // same two-second minimum spacing used by the browser client.
  active.forEach((ws, index) => {
    let lastRead = 0,
      tag = "";
    ws.on("message", (message) => {
      if (
        !followUpdates ||
        message.toString() !== "invalidate" ||
        refreshTimers.has(ws)
      )
        return;
      refreshTimers.set(
        ws,
        setTimeout(
          () => {
            refreshTimers.delete(ws);
            if (!followUpdates) return;
            lastRead = Date.now();
            const task = (async () => {
              const start = performance.now();
              const response = await fetch(`${origin}/api/${statePath}`, {
                headers: {
                  Cookie: people[index].cookie,
                  Connection: "close",
                  ...(tag ? { "If-None-Match": tag } : {}),
                },
                signal: AbortSignal.timeout(15_000),
              });
              const text = await response.text();
              assert.ok(
                [200, 304].includes(response.status),
                `live refresh returned ${response.status}`,
              );
              tag = response.headers.get("ETag") || tag;
              requests.push({
                path: "state",
                status: response.status,
                ms: performance.now() - start,
                bytes: Buffer.byteLength(text),
              });
            })();
            liveReads.add(task);
            void task.then(
              () => liveReads.delete(task),
              (error) => {
                liveReads.delete(task);
                if (!liveErrors.length)
                  console.error(
                    "First live refresh error:",
                    error,
                    error.cause,
                  );
                liveErrors.push(
                  String(error) + ": " + (error.cause?.stack || error.stack),
                );
              },
            );
          },
          Math.max(250 + Math.random() * 250, lastRead + 2000 - Date.now()),
        ),
      );
    });
  });
  const unrelated = await openSocket(owner, "unnc");
  active[0].send("ping");
  await until(() => active[0].events.includes("pong"));
  check(true, "hibernating WebSockets support automatic heartbeats");
  active.forEach((ws) => (ws.events.length = 0));
  const firstTag = (await people[0].request(statePath)).tag;
  await people[0].request(statePath, undefined, 304, {
    "If-None-Match": firstTag,
  });
  const other = await people[1].request(statePath, undefined, 200, {
    "If-None-Match": firstTag,
  });
  check(
    other.data.viewer.id !==
      (await people[0].request(statePath)).data.viewer.id,
    "conditional responses are scoped to the current identity",
  );
  await phase(`${count} concurrent votes`, () =>
    Promise.all(
      people.map((person, i) =>
        person.request("votes", {
          ...base,
          topicId,
          side: i % 2 ? "con" : "pro",
          anonymous: i % 2 === 0,
        }),
      ),
    ),
  );
  await until(() => active.every((ws) => ws.events.includes("invalidate")));
  const voted = (
    await people[1].request(statePath, undefined, 200, {
      "If-None-Match": firstTag,
    })
  ).data;
  check(
    voted.stats.pro === Math.ceil(count / 2) &&
      voted.stats.con === Math.floor(count / 2) &&
      voted.voters.length === count,
    "concurrent vote totals are exact and invalidate cached responses",
  );
  check(
    voted.voters
      .filter((v) => v.anonymous)
      .every((v) => v.userId === null && v.nickname === "匿名成员"),
    "cached anonymous votes never expose voter identities",
  );
  await phase(`${count} concurrent comments`, () =>
    Promise.all(
      people.map((person, i) =>
        person.request("comments", {
          ...base,
          topicId,
          content: `容量测试观点第${i}条：课程选择应当兼顾自主性和学习基础。`,
          anonymous: i % 2 === 0,
        }),
      ),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));
  followUpdates = false;
  for (const timer of refreshTimers.values()) clearTimeout(timer);
  refreshTimers.clear();
  await Promise.allSettled(liveReads);
  assert.equal(
    liveErrors.length,
    0,
    `live refresh failures: ${liveErrors.length}; first: ${liveErrors[0]}`,
  );
  const discussion = (await people[1].request(statePath)).data;
  check(
    discussion.comments.length === count &&
      discussion.topic.commentCount === count,
    "concurrent comments and stored counters agree",
  );
  check(
    discussion.comments
      .filter((c) => c.anonymous)
      .every((c) => c.userId === null && c.nickname === "匿名辩友"),
    "cached anonymous comments remain private across identities",
  );
  check(
    discussion.comments.filter((c) => c.isMine).length === 1,
    "shared snapshots preserve per-user ownership without cross-user leakage",
  );
  check(
    !unrelated.events.includes("invalidate"),
    "community invalidations do not cross community boundaries",
  );
  const own = discussion.comments.find((c) => c.isMine);
  const beforeDelete = (await people[1].request(statePath)).tag;
  await people[1].request("comments/delete", { ...base, commentId: own.id });
  const removed = await people[1].request(statePath, undefined, 200, {
    "If-None-Match": beforeDelete,
  });
  check(
    removed.data.topic.commentCount === count - 1 &&
      removed.data.comments.find((c) => c.id === own.id).deleted,
    "soft deletion updates counters and invalidates the comment cache",
  );
  await phase(`${count} concurrent reads after discussion`, () =>
    Promise.all(people.map((person) => person.request(statePath))),
  );
  const tags = await Promise.all(
    people.map(async (person) => (await person.request(statePath)).tag),
  );
  await phase(`${count} unchanged conditional reads`, () =>
    Promise.all(
      people.map((person, i) =>
        person.request(statePath, undefined, 304, { "If-None-Match": tags[i] }),
      ),
    ),
  );
  check(
    requests.slice(-count).every((r) => r.bytes === 0),
    "unchanged reads return zero-body 304 responses",
  );
  await owner.request("members/remove", {
    ...base,
    userId: discussion.viewer.id,
  });
  const denied = await people[1].request(statePath, undefined, 200, {
    "If-None-Match": removed.tag,
  });
  check(
    !denied.data.accessible &&
      denied.data.comments.length === 0 &&
      denied.data.voters.length === 0,
    "membership revocation bypasses old cache tags and immediately hides private content",
  );
  const accounts = Array.from({ length: 50 }, client);
  const usernames = accounts.map((_, i) => `capacity${slug.slice(-8)}u${i}`);
  await phase("50 concurrent password registrations on one campus IP", () =>
    Promise.all(
      accounts.map((person, i) =>
        person.request(
          "auth/register",
          {
            ...base,
            username: usernames[i],
            nickname: `账号测试${i}`,
            password: "Testpass10",
            passwordConfirm: "Testpass10",
            invite,
          },
          201,
        ),
      ),
    ),
  );
  const devices = accounts.map(client);
  await phase("50 concurrent password logins on one campus IP", () =>
    Promise.all(
      devices.map((person, i) =>
        person.request("auth/login", {
          ...base,
          username: usernames[i],
          password: "Testpass10",
        }),
      ),
    ),
  );
  check(
    true,
    "shared-campus account bursts succeed without reducing password work factors",
  );
  const report = {
    checkedAt: new Date().toISOString(),
    scope: "local-only; not a production capacity guarantee",
    clients: count,
    requests: requests.length,
    failedRequests: requests.filter((r) => r.status >= 500).length,
    assertions,
    metrics,
    fixture: { community: slug, username: usernames[0] },
  };
  await mkdir(new URL("../test-results/", import.meta.url), {
    recursive: true,
  });
  await writeFile(
    new URL("../test-results/capacity.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  followUpdates = false;
  for (const timer of refreshTimers.values()) clearTimeout(timer);
  await Promise.allSettled(liveReads);
  await Promise.all(
    sockets.map(
      (socket) =>
        new Promise((resolve) => {
          if (socket.readyState === WebSocket.CLOSED) {
            resolve();
            return;
          }
          const timer = setTimeout(() => {
            socket.terminate();
            resolve();
          }, 3000);
          socket.once("close", () => {
            clearTimeout(timer);
            resolve();
          });
          socket.close(1000);
        }),
    ),
  );
}
